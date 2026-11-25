"""XO: API and static file server."""
import asyncio
import hashlib
import hmac
import base64
import secrets
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo, available_timezones

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Cookie, Depends, FastAPI, HTTPException, Path as PathParam, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import config
from .db import engine, get_db
from .models import Base, Item, PushSub, Reminder, Session, User
from .push import scheduler_loop, send_push

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
WORKBOOK_FILE = Path(__file__).resolve().parent.parent / "content" / "workbook.json"
ITEM_ID = r"^[A-Za-z0-9:_-]{1,90}$"
hasher = PasswordHasher()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    task = asyncio.create_task(scheduler_loop()) if config.SCHEDULER_ENABLED else None
    yield
    if task:
        task.cancel()
    await engine.dispose()


app = FastAPI(title="XO", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    # Browsers attach cookies to cross-site form posts. Requiring a custom header on
    # every change blocks those, because another site cannot set it.
    if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get("x-xo") != "1":
            return Response('{"detail":"Missing X-XO header"}', status_code=403, media_type="application/json")
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
        "connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; "
        "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    path = request.url.path
    if path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    elif path.startswith("/fonts/") or path.startswith("/icons/"):
        response.headers["Cache-Control"] = "public, max-age=2592000"
    else:
        response.headers["Cache-Control"] = "no-cache"  # always revalidate app files
    return response


# ---------------------------------------------------------------- auth

_failures: dict[str, list[float]] = {}
MAX_FAILURES, FAILURE_WINDOW = 8, 15 * 60


def _too_many_failures(username: str) -> bool:
    now = time.time()
    recent = [t for t in _failures.get(username, []) if now - t < FAILURE_WINDOW]
    _failures[username] = recent
    return len(recent) >= MAX_FAILURES


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def current_user(sid: str | None = Cookie(default=None), db: AsyncSession = Depends(get_db)) -> User:
    if not sid:
        raise HTTPException(401, "Not signed in")
    row = (
        await db.execute(
            select(User)
            .join(Session, Session.user_id == User.id)
            .where(Session.token_hash == _hash_token(sid), Session.expires_at > datetime.now(timezone.utc))
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(401, "Not signed in")
    return row


class RegisterIn(BaseModel):
    username: str = Field(pattern=r"^[a-z0-9._-]{2,40}$")
    salt: str = Field(min_length=16, max_length=64)
    auth_key: str = Field(pattern=r"^[0-9a-f]{64}$")
    tz: str = "Australia/Perth"


class LoginIn(BaseModel):
    username: str = Field(max_length=40)
    auth_key: str = Field(pattern=r"^[0-9a-f]{64}$")


async def _start_session(db: AsyncSession, user: User, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    db.add(
        Session(
            token_hash=_hash_token(token),
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=config.SESSION_DAYS),
        )
    )
    await db.execute(delete(Session).where(Session.expires_at < datetime.now(timezone.utc)))
    await db.commit()
    response.set_cookie(
        "sid",
        token,
        max_age=config.SESSION_DAYS * 86400,
        httponly=True,
        secure=config.COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/auth/status")
async def auth_status(sid: str | None = Cookie(default=None), db: AsyncSession = Depends(get_db)):
    """Tells the sign-in screen whether an account exists yet (this app holds one account)
    and whether this browser is signed in."""
    count = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    signed_in = False
    if sid:
        row = await db.get(Session, _hash_token(sid))
        signed_in = row is not None and row.expires_at > datetime.now(timezone.utc)
    return {"has_user": count > 0, "signed_in": signed_in}


@app.get("/api/auth/salt")
async def auth_salt(username: str, db: AsyncSession = Depends(get_db)):
    username = username.strip().lower()
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if user:
        return {"salt": user.kdf_salt}
    # Unknown name: return a stable made-up salt so the reply looks the same either way.
    fake = hmac.new(config.SECRET_KEY.encode(), username.encode(), hashlib.sha256).digest()[:16]
    return {"salt": base64.b64encode(fake).decode()}


@app.post("/api/auth/register")
async def register(body: RegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    count = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    if count > 0:
        raise HTTPException(403, "An account already exists. Sign in instead.")
    tz = body.tz if body.tz in available_timezones() else "Australia/Perth"
    user = User(username=body.username, auth_hash=hasher.hash(body.auth_key), kdf_salt=body.salt, tz=tz)
    db.add(user)
    await db.flush()
    await _start_session(db, user, response)
    return {"username": user.username, "tz": user.tz}


@app.post("/api/auth/login")
async def login(body: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    username = body.username.strip().lower()
    if _too_many_failures(username):
        raise HTTPException(429, "Too many attempts. Wait 15 minutes and try again.")
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    ok = False
    if user:
        try:
            ok = hasher.verify(user.auth_hash, body.auth_key)
        except VerifyMismatchError:
            ok = False
    if not ok:
        _failures.setdefault(username, []).append(time.time())
        raise HTTPException(401, "That name and passphrase do not match.")
    _failures.pop(username, None)
    await _start_session(db, user, response)
    return {"username": user.username, "tz": user.tz}


@app.post("/api/auth/logout")
async def logout(response: Response, sid: str | None = Cookie(default=None), db: AsyncSession = Depends(get_db)):
    if sid:
        await db.execute(delete(Session).where(Session.token_hash == _hash_token(sid)))
        await db.commit()
    response.delete_cookie("sid", path="/")
    return {"ok": True}


@app.get("/api/me")
async def me(user: User = Depends(current_user)):
    return {"username": user.username, "tz": user.tz}


# ---------------------------------------------------------------- items


class ReminderIn(BaseModel):
    fire_at: datetime
    repeat: Literal["none", "daily", "weekly"] = "none"
    kind: str = Field(pattern=r"^[a-z_]{1,30}$")


class ItemIn(BaseModel):
    kind: str = Field(pattern=r"^[a-z_]{1,20}$")
    day: date | None = None
    payload: str | None = Field(default=None, max_length=400_000)
    # None leaves existing reminders alone; a list (even empty) replaces them.
    reminders: list[ReminderIn] | None = Field(default=None, max_length=30)


def _item_out(item: Item) -> dict:
    return {
        "id": item.id,
        "kind": item.kind,
        "day": item.day.isoformat() if item.day else None,
        "payload": item.payload,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@app.get("/api/items")
async def list_items(
    kinds: str | None = None,
    from_day: date | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Item).where(Item.user_id == user.id, Item.deleted.is_(False))
    if kinds:
        query = query.where(Item.kind.in_([k for k in kinds.split(",") if k]))
    if from_day:
        # Dated items (ticks, check-ins) older than from_day are left out; undated items always come back.
        query = query.where(or_(Item.day.is_(None), Item.day >= from_day))
    rows = (await db.execute(query.order_by(Item.kind, Item.day, Item.id))).scalars().all()
    return [_item_out(r) for r in rows]


@app.get("/api/items/{item_id}")
async def get_item(
    item_id: str = PathParam(pattern=ITEM_ID),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(Item, (user.id, item_id))
    if item is None or item.deleted:
        raise HTTPException(404, "Not found")
    return _item_out(item)


@app.put("/api/items/{item_id}")
async def put_item(
    body: ItemIn,
    item_id: str = PathParam(pattern=ITEM_ID),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(Item, (user.id, item_id))
    if item is None:
        item = Item(user_id=user.id, id=item_id)
        db.add(item)
    item.kind, item.day, item.payload, item.deleted = body.kind, body.day, body.payload, False
    item.updated_at = datetime.now(timezone.utc)
    if body.reminders is not None:
        await db.execute(delete(Reminder).where(Reminder.user_id == user.id, Reminder.item_id == item_id))
        now = datetime.now(timezone.utc)
        for rem in body.reminders:
            if rem.fire_at.tzinfo is None:
                raise HTTPException(422, "Reminder times need a timezone")
            if rem.repeat == "none" and rem.fire_at <= now:
                continue  # already in the past
            db.add(Reminder(user_id=user.id, item_id=item_id, kind=rem.kind, fire_at=rem.fire_at, repeat=rem.repeat))
    await db.commit()
    await db.refresh(item)
    return _item_out(item)


@app.delete("/api/items/{item_id}")
async def delete_item(
    item_id: str = PathParam(pattern=ITEM_ID),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(Item, (user.id, item_id))
    if item is not None:
        # Keep the row as a tombstone but drop the content.
        item.deleted, item.payload = True, None
        item.updated_at = datetime.now(timezone.utc)
    await db.execute(delete(Reminder).where(Reminder.user_id == user.id, Reminder.item_id == item_id))
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- reminders and push


class SnoozeIn(BaseModel):
    minutes: int = Field(ge=5, le=180)


@app.post("/api/reminders/{reminder_id}/snooze")
async def snooze(
    reminder_id: int, body: SnoozeIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    rem = await db.get(Reminder, reminder_id)
    if rem is None or rem.user_id != user.id:
        raise HTTPException(404, "Not found")
    again = Reminder(
        user_id=user.id,
        item_id=rem.item_id,
        kind=rem.kind,
        fire_at=datetime.now(timezone.utc) + timedelta(minutes=body.minutes),
        repeat="none",
    )
    db.add(again)
    await db.commit()
    return {"ok": True, "fire_at": again.fire_at.isoformat()}


class PushKeys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class PushSubIn(BaseModel):
    endpoint: str = Field(pattern=r"^https://", max_length=2000)
    keys: PushKeys


class EndpointIn(BaseModel):
    endpoint: str = Field(max_length=2000)


@app.get("/api/push/key")
async def push_key(user: User = Depends(current_user)):
    return {"key": config.VAPID_PUBLIC_KEY}


@app.post("/api/push/subscribe")
async def push_subscribe(body: PushSubIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    sub = (await db.execute(select(PushSub).where(PushSub.endpoint == body.endpoint))).scalar_one_or_none()
    if sub is None:
        sub = PushSub(endpoint=body.endpoint)
        db.add(sub)
    sub.user_id, sub.p256dh, sub.auth = user.id, body.keys.p256dh, body.keys.auth
    await db.commit()
    return {"ok": True}


@app.post("/api/push/unsubscribe")
async def push_unsubscribe(body: EndpointIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(PushSub).where(PushSub.user_id == user.id, PushSub.endpoint == body.endpoint))
    await db.commit()
    return {"ok": True}


@app.post("/api/push/test")
async def push_test(user: User = Depends(current_user)):
    if not config.VAPID_PUBLIC_KEY:
        raise HTTPException(503, "Notifications are not set up on the server yet (VAPID keys missing).")
    reached = await send_push(user.id, {"rid": None, "item": None, "kind": "test"})
    return {"devices": reached}


@app.post("/api/tz")
async def set_tz(body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    tz = str(body.get("tz", ""))
    if tz not in available_timezones():
        raise HTTPException(422, "Unknown timezone")
    ZoneInfo(tz)
    row = await db.get(User, user.id)
    row.tz = tz
    await db.commit()
    return {"tz": tz}


@app.get("/api/workbook")
async def workbook(user: User = Depends(current_user)):
    """The workbook's chapters and prompts (built by scripts/build_workbook.py).
    Served only to a signed-in browser, because the text is unpublished material."""
    if not WORKBOOK_FILE.exists():
        raise HTTPException(404, "No workbook has been built yet. Run scripts/build_workbook.py.")
    return FileResponse(WORKBOOK_FILE, media_type="application/json")


# Static files last, so /api routes win.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
