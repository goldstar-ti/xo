"""API tests. Need a real PostgreSQL: set DATABASE_URL before running pytest."""

import json
import logging
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("COOKIE_SECURE", "false")
os.environ["SCHEDULER_ENABLED"] = "false"

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select

from app import push, text
from app.db import SessionLocal, engine
from app.logging_setup import _JsonFormatter
from app.main import app
from app.models import Base, Reminder

H = {"X-XO": "1"}
PASSWORD = "correct horse battery"


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
    r = await c.post("/api/auth/register", json={"username": "tester", "password": PASSWORD}, headers=H)
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_auth_flow(client):
    assert (await client.get("/api/auth/status")).json() == {"has_user": False, "signed_in": False}
    assert (await client.get("/api/me")).status_code == 401
    await register(client)
    assert (await client.get("/api/me")).json()["username"] == "tester"
    assert (await client.get("/api/auth/status")).json() == {"has_user": True, "signed_in": True}
    # only one account
    r = await client.post("/api/auth/register", json={"username": "x2", "password": PASSWORD}, headers=H)
    assert r.status_code == 403
    assert (await client.get("/api/auth/salt?username=tester")).status_code == 404
    await client.post("/api/auth/logout", headers=H)
    assert (await client.get("/api/me")).status_code == 401
    bad = await client.post("/api/auth/login", json={"username": "tester", "password": "wrong password"}, headers=H)
    assert bad.status_code == 401
    good = await client.post("/api/auth/login", json={"username": "Tester ", "password": PASSWORD}, headers=H)
    assert good.status_code == 200
    assert (await client.get("/api/me")).status_code == 200


@pytest.mark.asyncio
async def test_short_password_refused(client):
    r = await client.post("/api/auth/register", json={"username": "tester", "password": "short"}, headers=H)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_payload_round_trips_as_json(client):
    await register(client)
    for i, value in enumerate([{"title": "GP", "n": 3, "tags": ["a", "b"]}, ["x", 1], "text", 42]):
        r = await client.put(f"/api/items/p{i}", json={"kind": "task", "payload": value}, headers=H)
        assert r.status_code == 200 and r.json()["payload"] == value
        assert (await client.get(f"/api/items/p{i}")).json()["payload"] == value
    await client.put("/api/items/p9", json={"kind": "tick"}, headers=H)
    assert (await client.get("/api/items/p9")).json()["payload"] is None


@pytest.mark.asyncio
async def test_changes_need_header(client):
    r = await client.post("/api/auth/register", json={"username": "tester", "password": PASSWORD})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_items_and_reminders(client):
    await register(client)
    soon = datetime.now(timezone.utc) + timedelta(hours=1)
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    body = {
        "kind": "appointment",
        "day": "2026-11-26",
        "payload": {"title": "GP"},
        "reminders": [
            {"fire_at": soon.isoformat(), "kind": "appt_leave"},
            {"fire_at": past.isoformat(), "kind": "appt_eve"},  # in the past: dropped
        ],
    }
    r = await client.put("/api/items/a1", json=body, headers=H)
    assert r.status_code == 200 and r.json()["payload"] == {"title": "GP"}
    async with SessionLocal() as db:
        rems = (await db.execute(select(Reminder))).scalars().all()
    assert [x.kind for x in rems] == ["appt_leave"]

    # saving again without "reminders" leaves them alone; with a list replaces them
    await client.put("/api/items/a1", json={"kind": "appointment", "payload": {"title": "GP 2"}}, headers=H)
    async with SessionLocal() as db:
        assert len((await db.execute(select(Reminder))).scalars().all()) == 1
    await client.put(
        "/api/items/a1", json={"kind": "appointment", "payload": {"title": "GP 2"}, "reminders": []}, headers=H
    )
    async with SessionLocal() as db:
        assert len((await db.execute(select(Reminder))).scalars().all()) == 0

    # dated filter: old tick is left out, undated items stay
    await client.put("/api/items/tick:r1:2026-01-01", json={"kind": "tick", "day": "2026-01-01"}, headers=H)
    await client.put("/api/items/tick:r1:2026-11-25", json={"kind": "tick", "day": "2026-11-25"}, headers=H)
    await client.put("/api/items/plan", json={"kind": "plan", "payload": {"answers": {}}}, headers=H)
    ids = {i["id"] for i in (await client.get("/api/items?from_day=2026-11-01")).json()}
    assert ids == {"a1", "tick:r1:2026-11-25", "plan"}
    assert {i["id"] for i in (await client.get("/api/items?kinds=plan")).json()} == {"plan"}

    assert (await client.put("/api/items/bad id!", json={"kind": "task"}, headers=H)).status_code == 422
    await client.delete("/api/items/a1", headers=H)
    assert (await client.get("/api/items/a1")).status_code == 404
    # a deleted id can be reused
    assert (
        await client.put("/api/items/a1", json={"kind": "task", "payload": {"title": "x"}}, headers=H)
    ).status_code == 200


@pytest.mark.asyncio
async def test_bulk_delete(client):
    await register(client)
    soon = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    for i in ("t1", "t2", "t3"):
        body = {"kind": "task", "payload": {"title": i}, "reminders": [{"fire_at": soon, "kind": "task_due"}]}
        await client.put(f"/api/items/{i}", json=body, headers=H)
    await client.delete("/api/items/t3", headers=H)

    r = await client.post("/api/items/bulk-delete", json={"ids": ["t1", "t3", "missing"]}, headers=H)
    assert r.status_code == 200 and r.json() == {"deleted": 1}
    assert {i["id"] for i in (await client.get("/api/items")).json()} == {"t2"}
    async with SessionLocal() as db:
        assert {x.item_id for x in (await db.execute(select(Reminder))).scalars().all()} == {"t2"}

    assert (await client.post("/api/items/bulk-delete", json={"ids": []}, headers=H)).status_code == 422
    assert (await client.post("/api/items/bulk-delete", json={"ids": ["bad id!"]}, headers=H)).status_code == 422
    assert (await client.post("/api/items/bulk-delete", json={"ids": ["t2"]})).status_code == 403


@pytest.mark.asyncio
async def test_scheduler_sends_and_repeats(client):
    await register(client)
    now = datetime.now(timezone.utc)
    body = {
        "kind": "routine",
        "payload": {"label": "r"},
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
    assert (
        await client.post("/api/push/unsubscribe", json={"endpoint": sub["endpoint"]}, headers=H)
    ).status_code == 200


@pytest.mark.asyncio
async def test_workbook_needs_sign_in(client):
    assert (await client.get("/api/workbook")).status_code == 401
    await register(client)
    r = await client.get("/api/workbook")
    assert r.status_code in (200, 404)  # 404 only if content/workbook.json has not been built
    if r.status_code == 200:
        assert r.json()["units"]


def test_json_log_line_has_extra_keys():
    record = logging.LogRecord("xo.test", logging.INFO, __file__, 1, "saved %s", ("item",), None)
    record.item_kind = "task"
    out = json.loads(_JsonFormatter().format(record))
    assert out["msg"] == "saved item"
    assert out["level"] == "INFO"
    assert out["item_kind"] == "task"


@pytest.mark.asyncio
async def test_text_served_without_sign_in(client):
    r = await client.get("/api/text")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache"
    body = r.json()
    assert body["common"]["save"] == "Save"
    assert isinstance(body["plan"]["sections"]["online"], list)


@pytest.mark.asyncio
async def test_text_has_no_boolean_keys(client):
    """An unquoted on, off, yes or no key reads as a YAML boolean and loses its label."""
    r = await client.get("/api/text")
    assert r.status_code == 200
    bad = []

    def walk(node, path):
        if isinstance(node, dict):
            for key, value in node.items():
                here = f"{path}.{key}" if path else str(key)
                if key in ("True", "False"):
                    bad.append(here)
                walk(value, here)
        elif isinstance(node, list):
            for i, value in enumerate(node):
                walk(value, f"{path}[{i}]")

    walk(r.json(), "")
    assert not bad, f"boolean keys in text: {bad}"


def test_every_text_file_parses_and_is_keyed_by_its_name():
    import yaml

    files = sorted(text.TEXT_DIR.glob("*.yaml"))
    assert files
    for path in files:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        assert isinstance(data, dict) and list(data) == [path.stem], path.name


def test_broken_text_file_keeps_last_good_version(tmp_path):
    f = tmp_path / "sample.yaml"
    f.write_text("sample:\n  word: first\n", encoding="utf-8")
    assert text.load_text(tmp_path)["sample"]["word"] == "first"
    f.write_text("sample:\n  word: [unclosed\n", encoding="utf-8")
    os.utime(f, ns=(1, 1))  # a different modification time, as an edit would give
    assert text.load_text(tmp_path)["sample"]["word"] == "first"
    f.write_text("sample:\n  word: second\n", encoding="utf-8")
    os.utime(f, ns=(2, 2))
    assert text.load_text(tmp_path)["sample"]["word"] == "second"


async def test_nobbie_tracker_off_by_default(client):
    """With no NOBBIE settings, the tracker view says it is off."""
    await register(client)
    r = await client.get("/api/tracker/nobbie")
    assert r.status_code == 200
    assert r.json() == {"enabled": False}


async def test_nobbie_reader_signs_in_pages_and_only_reads():
    """The reader signs in when NOBBIE sends the sign-in form, pages through items, and never writes."""
    from app.nobbie import NobbieReader

    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path, dict(request.url.params)))
        signed = "sid=abc" in request.headers.get("cookie", "")
        if request.url.path == "/nobbie/login":
            return httpx.Response(303, headers={"location": "/nobbie/", "set-cookie": "sid=abc; Path=/"})
        if not signed:
            return httpx.Response(200, text="<form>sign in</form>", headers={"content-type": "text/html"})
        if request.url.path == "/nobbie/pm/vocab.json":
            return httpx.Response(200, json={"status": [{"value": "new"}]})
        if request.url.path == "/nobbie/pm/items.json":
            page = int(request.url.params["page"])
            return httpx.Response(200, json={"data": [{"id": page, "title": f"Item {page}"}], "last_page": 2})
        return httpx.Response(404)

    r = NobbieReader("https://nobbie.test/nobbie", "reader", "secret", transport=httpx.MockTransport(handler))
    try:
        doc = await r.tracker()
    finally:
        await r.aclose()
    assert [i["id"] for i in doc["items"]] == [1, 2]
    assert doc["vocab"] == {"status": [{"value": "new"}]}
    methods = {(m, p) for m, p, _ in seen if m != "GET"}
    assert methods == {("POST", "/nobbie/login")}, "only the sign-in is a POST"
