"""Modules test: switching a module off hides it everywhere, stops its reminders and keeps its data.

Run after tests/e2e.py, against the same database (it signs in as that test's account).

python tests/e2e_modules.py [base_url]
"""

import asyncio
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import asyncpg
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
errs = []


def reminders(kind_like):
    async def count():
        url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(url)
        n = await conn.fetchval("SELECT count(*) FROM reminders WHERE kind LIKE $1", kind_like)
        await conn.close()
        return n

    # Playwright's sync API keeps an event loop running in this thread, so the query runs in another.
    with ThreadPoolExecutor(1) as pool:
        return pool.submit(lambda: asyncio.run(count())).result()


with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"]
    )
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Australia/Perth", locale="en-AU")
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "401" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE)
    pg.fill("#a-name", "tester")
    pg.fill("#a-pass", "orbit-walnut-ferry-linen-42")
    pg.get_by_role("button", name="Sign in").click()
    pg.wait_for_selector(".dayline", timeout=20000)
    side = pg.locator("aside.side nav")
    expect(side.locator("a")).to_have_count(13)

    # a bill due in ten days has reminders
    pg.evaluate(
        """async () => {
          const s = await import('/js/store.js');
          const d = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
          await s.save('bill', 'bill-mod-test', { name: 'Module test', amount: '10', due: d });
        }"""
    )
    assert reminders("bill_%") > 0

    # switch Bills off: gone from the side bar and More, its route lands on Today, its reminders stop
    pg.evaluate("async () => (await import('/js/modules.js')).setModule('bills', false)")
    expect(side.locator('a[data-nav="bills"]')).to_have_count(0)
    expect(side.locator("a")).to_have_count(12)
    assert reminders("bill_%") == 0
    pg.goto(BASE + "/#/bills")
    pg.wait_for_selector(".dayline")
    assert pg.evaluate("document.body.dataset.view") == "today"
    expect(pg.locator("#view")).not_to_contain_text("Module test")

    # the state is on the server, so a reload keeps it, and the data is still there
    pg.reload()
    pg.wait_for_selector(".dayline")
    expect(side.locator('a[data-nav="bills"]')).to_have_count(0)
    assert pg.evaluate("async () => (await import('/js/store.js')).get('bill-mod-test').data.name") == "Module test"

    # Appearance and Settings cannot be switched off
    err = pg.evaluate(
        "async () => (await import('/js/modules.js')).setModule('settings', false).then(() => '', (e) => e.message)"
    )
    assert "cannot be switched" in err

    # switch it on again: back in the side bar, reminders return
    pg.evaluate("async () => (await import('/js/modules.js')).setModule('bills', true)")
    expect(side.locator('a[data-nav="bills"]')).to_have_count(1)
    assert reminders("bill_%") > 0

    # Today off: Today leaves the side bar and the first screen left takes its place
    pg.evaluate("async () => (await import('/js/modules.js')).setModule('today', false)")
    expect(side.locator('a[data-nav="today"]')).to_have_count(0)
    pg.goto(BASE + "/#/today")
    pg.wait_for_selector("#view")
    assert pg.evaluate("document.body.dataset.view") == "diary"
    pg.evaluate("async () => (await import('/js/modules.js')).setModule('today', true)")
    # the Modules tab: a switch per module, kept on the server, and the colour tint on the screen icons
    pg.goto(BASE + "/#/appearance")
    pg.wait_for_selector(".look-screen")
    pg.locator('[data-key="modules"]').click()
    pg.locator('[data-fk="mod:bills"]').click()
    expect(side.locator('a[data-nav="bills"]')).to_have_count(0)
    expect(pg.locator('[data-fk="mod:settings"]')).to_be_disabled()
    pg.locator('[data-fk="mod:bills"]').click()
    expect(side.locator('a[data-nav="bills"]')).to_have_count(1)
    icon_colour = "e => [getComputedStyle(e.querySelector('.ico')).color, getComputedStyle(e).color]"
    ico, link = side.locator('a[data-nav="diary"]').evaluate(icon_colour)
    assert ico != link, "the module colour tints the icon"
    pg.locator('[data-fk="p-conceptnav"]').click()
    ico, link = side.locator('a[data-nav="diary"]').evaluate(icon_colour)
    assert ico == link, "no tint when the setting is off"
    pg.locator('[data-fk="p-conceptnav"]').click()
    pg.evaluate("async () => (await (await import('/js/store.js')).remove('bill-mod-test'))")
    b.close()
print("errors:", errs or "none")
assert not errs
