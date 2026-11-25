"""API tests. Need a real PostgreSQL: set DATABASE_URL before running pytest."""
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("COOKIE_SECURE", "false")
os.environ["SCHEDULER_ENABLED"] = "false"

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select

from app import push
from app.db import SessionLocal, engine
from app.main import app
from app.models import Base, Reminder

H = {"X-XO": "1"}
KEY = "ab" * 32
SALT = "c2FsdHNhbHRzYWx0c2FsdA=="


@pytest_asyncio.fixture
async def client():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await engine.dispose()


async def register(c):
    r = await c.post("/api/auth/register", json={"username": "tester", "salt": SALT, "auth_key": KEY}, headers=H)
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_auth_flow(client):
    assert (await client.get("/api/auth/status")).json() == {"has_user": False, "signed_in": False}
    assert (await client.get("/api/me")).status_code == 401
    await register(client)
    assert (await client.get("/api/me")).json()["username"] == "tester"
    assert (await client.get("/api/auth/status")).json() == {"has_user": True, "signed_in": True}
    # only one account
    r = await client.post("/api/auth/register", json={"username": "x2", "salt": SALT, "auth_key": KEY}, headers=H)
    assert r.status_code == 403
    # real salt for a real user, a stable fake for anyone else
    assert (await client.get("/api/auth/salt?username=tester")).json()["salt"] == SALT
    a = (await client.get("/api/auth/salt?username=nobody")).json()["salt"]
    assert a == (await client.get("/api/auth/salt?username=nobody")).json()["salt"] != SALT
    await client.post("/api/auth/logout", headers=H)
    assert (await client.get("/api/me")).status_code == 401
    bad = await client.post("/api/auth/login", json={"username": "tester", "auth_key": "00" * 32}, headers=H)
    assert bad.status_code == 401
    good = await client.post("/api/auth/login", json={"username": "Tester ", "auth_key": KEY}, headers=H)
    assert good.status_code == 200
    assert (await client.get("/api/me")).status_code == 200


@pytest.mark.asyncio
async def test_changes_need_header(client):
    r = await client.post("/api/auth/register", json={"username": "tester", "salt": SALT, "auth_key": KEY})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_items_and_reminders(client):
    await register(client)
    soon = datetime.now(timezone.utc) + timedelta(hours=1)
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    body = {
        "kind": "appointment",
        "day": "2026-11-26",
        "payload": "v1.abc",
        "reminders": [
            {"fire_at": soon.isoformat(), "kind": "appt_leave"},
            {"fire_at": past.isoformat(), "kind": "appt_eve"},  # in the past: dropped
        ],
    }
    r = await client.put("/api/items/a1", json=body, headers=H)
    assert r.status_code == 200 and r.json()["payload"] == "v1.abc"
    async with SessionLocal() as db:
        rems = (await db.execute(select(Reminder))).scalars().all()
    assert [x.kind for x in rems] == ["appt_leave"]

    # saving again without "reminders" leaves them alone; with a list replaces them
    await client.put("/api/items/a1", json={"kind": "appointment", "payload": "v1.def"}, headers=H)
    async with SessionLocal() as db:
        assert len((await db.execute(select(Reminder))).scalars().all()) == 1
    await client.put("/api/items/a1", json={"kind": "appointment", "payload": "v1.def", "reminders": []}, headers=H)
    async with SessionLocal() as db:
        assert len((await db.execute(select(Reminder))).scalars().all()) == 0

    # dated filter: old tick is left out, undated items stay
    await client.put("/api/items/tick:r1:2026-01-01", json={"kind": "tick", "day": "2026-01-01"}, headers=H)
    await client.put("/api/items/tick:r1:2026-11-25", json={"kind": "tick", "day": "2026-11-25"}, headers=H)
    await client.put("/api/items/plan", json={"kind": "plan", "payload": "v1.p"}, headers=H)
    ids = {i["id"] for i in (await client.get("/api/items?from_day=2026-11-01")).json()}
    assert ids == {"a1", "tick:r1:2026-11-25", "plan"}
    assert {i["id"] for i in (await client.get("/api/items?kinds=plan")).json()} == {"plan"}

    assert (await client.put("/api/items/bad id!", json={"kind": "task"}, headers=H)).status_code == 422
    await client.delete("/api/items/a1", headers=H)
    assert (await client.get("/api/items/a1")).status_code == 404
    # a deleted id can be reused
    assert (await client.put("/api/items/a1", json={"kind": "task", "payload": "v1.x"}, headers=H)).status_code == 200


@pytest.mark.asyncio
async def test_scheduler_sends_and_repeats(client):
    await register(client)
    now = datetime.now(timezone.utc)
    body = {
        "kind": "routine",
        "payload": "v1.r",
        "reminders": [
            {"fire_at": (now + timedelta(seconds=1)).isoformat(), "kind": "routine", "repeat": "daily"},
            {"fire_at": (now + timedelta(seconds=1)).isoformat(), "kind": "task_due"},
        ],
    }
    await client.put("/api/items/r1", json=body, headers=H)
    sent = []

    async def fake(user_id, payload):
        sent.append(payload)

    later = now + timedelta(minutes=1)
    assert await push.process_due(later, sender=fake) == 2
    assert {p["kind"] for p in sent} == {"routine", "task_due"} and all(p["item"] == "r1" for p in sent)
    assert await push.process_due(later, sender=fake) == 0  # nothing sent twice

    async with SessionLocal() as db:
        rems = {r.kind: r for r in (await db.execute(select(Reminder))).scalars().all()}
    assert rems["task_due"].sent_at is not None
    # the daily one moved forward one day, same clock time
    assert abs((rems["routine"].fire_at - (now + timedelta(days=1, seconds=1))).total_seconds()) < 1

    # snooze makes a one-off copy
    r = await client.post(f"/api/reminders/{rems['routine'].id}/snooze", json={"minutes": 15}, headers=H)
    assert r.status_code == 200
    assert await push.process_due(now + timedelta(minutes=20), sender=fake) == 1

    # a reminder found very late (server was off) is skipped, and a daily one still moves on
    sent.clear()
    assert await push.process_due(now + timedelta(days=3), sender=fake) == 0
    async with SessionLocal() as db:
        daily = (await db.execute(select(Reminder).where(Reminder.repeat == "daily"))).scalar_one()
    assert daily.fire_at > now + timedelta(days=3)


@pytest.mark.asyncio
async def test_push_subscription(client):
    await register(client)
    sub = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "k", "auth": "a"}}
    assert (await client.post("/api/push/subscribe", json=sub, headers=H)).status_code == 200
    assert (await client.post("/api/push/subscribe", json=sub, headers=H)).status_code == 200  # same device twice
    bad = {"endpoint": "http://insecure", "keys": {"p256dh": "k", "auth": "a"}}
    assert (await client.post("/api/push/subscribe", json=bad, headers=H)).status_code == 422
    assert (await client.post("/api/push/unsubscribe", json={"endpoint": sub["endpoint"]}, headers=H)).status_code == 200


@pytest.mark.asyncio
async def test_workbook_needs_sign_in(client):
    assert (await client.get("/api/workbook")).status_code == 401
    await register(client)
    r = await client.get("/api/workbook")
    assert r.status_code in (200, 404)  # 404 only if content/workbook.json has not been built
    if r.status_code == 200:
        assert r.json()["units"]
