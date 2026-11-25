"""Web Push delivery and the reminder loop."""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select

from . import config
from .db import SessionLocal
from .models import PushSub, Reminder, User

log = logging.getLogger("xo.push")

# A reminder that is this late (server was off, for example) is skipped, not sent.
STALE_AFTER = timedelta(hours=2)


def _send_one(sub: dict, data: str) -> int:
    """Blocking send. Returns the HTTP status from the push service (0 on other errors)."""
    try:
        webpush(
            subscription_info=sub,
            data=data,
            vapid_private_key=config.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": config.VAPID_SUBJECT},  # fresh dict: the library adds to it
            ttl=3600,
            headers={"Urgency": "high"},
        )
        return 201
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else 0
        log.warning("push failed (%s): %s", status, exc)
        return status
    except Exception:  # network trouble and the like must never kill the loop
        log.exception("push failed")
        return 0


async def send_push(user_id: int, payload: dict) -> int:
    """Send one notification to every device the user has subscribed. Returns devices reached."""
    if not (config.VAPID_PRIVATE_KEY and config.VAPID_PUBLIC_KEY):
        log.warning("VAPID keys not set; notification not sent")
        return 0
    async with SessionLocal() as db:
        subs = (await db.execute(select(PushSub).where(PushSub.user_id == user_id))).scalars().all()
    data = json.dumps(payload)
    reached, gone = 0, []
    for sub in subs:
        info = {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}}
        status = await asyncio.to_thread(_send_one, info, data)
        if status in (404, 410):  # the browser has dropped this subscription
            gone.append(sub.id)
        elif 200 <= status < 300:
            reached += 1
    if gone:
        async with SessionLocal() as db:
            await db.execute(delete(PushSub).where(PushSub.id.in_(gone)))
            await db.commit()
    return reached


def next_fire(fire_at: datetime, repeat: str, tz_name: str, now: datetime) -> datetime:
    """Next occurrence after `now`, keeping the same local clock time."""
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("Australia/Perth")
    step = timedelta(days=7 if repeat == "weekly" else 1)
    local = fire_at.astimezone(tz)
    day, clock = local.date(), local.time()
    while True:
        day = day + step
        candidate = datetime.combine(day, clock, tzinfo=tz)
        if candidate > now:
            return candidate.astimezone(timezone.utc)


async def process_due(now: datetime | None = None, sender=send_push) -> int:
    """Send every reminder that is due. Returns how many were handed to `sender`."""
    now = now or datetime.now(timezone.utc)
    outbox: list[tuple[int, dict]] = []
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(Reminder, User.tz)
                .join(User, User.id == Reminder.user_id)
                .where(Reminder.sent_at.is_(None), Reminder.fire_at <= now)
                .order_by(Reminder.fire_at)
                .limit(200)
                .with_for_update(of=Reminder, skip_locked=True)
            )
        ).all()
        for rem, tz_name in rows:
            if now - rem.fire_at <= STALE_AFTER:
                outbox.append((rem.user_id, {"rid": rem.id, "item": rem.item_id, "kind": rem.kind}))
            if rem.repeat in ("daily", "weekly"):
                rem.fire_at = next_fire(rem.fire_at, rem.repeat, tz_name, now)
            else:
                rem.sent_at = now
        # One-off reminders that fired more than a week ago are no longer needed.
        await db.execute(
            delete(Reminder).where(Reminder.sent_at.is_not(None), Reminder.sent_at < now - timedelta(days=7))
        )
        await db.commit()
    for user_id, payload in outbox:
        await sender(user_id, payload)
    return len(outbox)


async def scheduler_loop():
    while True:
        try:
            await process_due()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("reminder loop error")
        await asyncio.sleep(config.SCHEDULER_INTERVAL)
