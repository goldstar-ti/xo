"""Screenshots of every main screen in every kit, for looking at, not for asserting.

python tests/e2e_shots.py [base_url] [out_dir]

Run through `make shots` on the throwaway test stack. It signs up a made-up account, adds a
little made-up data, then for each kit (xo, daisy, wa) and each width (360x800, 1280x900, 1920x1080 and 5120x1440)
saves a full-page PNG of each screen as <out_dir>/<kit>-<screen>-<width>.png. The sign-in
screen is taken once, in the xo kit, before the account exists. It fails on a console error.
"""

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "/out")
OUT.mkdir(parents=True, exist_ok=True)
PASS = "orbit-walnut-ferry-linen-42"
TZ = "Australia/Perth"
now = datetime.now(ZoneInfo(TZ))
tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
SIZES = {
    "360": {"width": 360, "height": 800},
    "1280": {"width": 1280, "height": 900},
    "1920": {"width": 1920, "height": 1080},
    "5120": {"width": 5120, "height": 1440},
}
errors = []
written = []


def set_control(el, value):
    """Fill one form control, whichever kit built it (Web Awesome controls are custom elements)."""
    tag = el.evaluate("e => e.tagName")
    if tag.startswith("WA-"):
        if tag == "WA-SELECT":
            el.evaluate(
                "(e, v) => { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }", str(value)
            )
        else:
            el.locator("input, textarea").fill(str(value))
    elif tag == "SELECT":
        el.select_option(value)
    else:
        el.fill(str(value))


def fill_form(page, values, button="Save"):
    dlg = page.locator("dialog[open]")
    for name, value in values.items():
        set_control(dlg.locator(f"#f-{name}"), value)
    dlg.get_by_role("button", name=button).click()
    expect(dlg).to_have_count(0)


def shot(page, kit, screen, width):
    page.evaluate("document.fonts.ready")
    path = OUT / f"{kit}-{screen}-{width}.png"
    page.screenshot(path=path, full_page=True)
    written.append(path.name)


def ready(page):
    page.locator("#view h1, form.auth h1").first.wait_for()


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"]
    )
    ctx = browser.new_context(viewport=SIZES["1280"], timezone_id=TZ, locale="en-AU", reduced_motion="reduce")
    # This test uses Settings and check-ins as full screens, so the right pane is off (see e2e_pane.py).
    ctx.add_init_script("localStorage.setItem('xo-pane', JSON.stringify({ off: true }))")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "401" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # --- sign-in, before the account exists (xo kit)
    page.goto(BASE)
    expect(page.locator("#a-name")).to_be_visible()
    for width, size in SIZES.items():
        page.set_viewport_size(size)
        shot(page, "xo", "signin", width)

    # --- one account and a little data
    page.set_viewport_size(SIZES["1280"])
    set_control(page.locator("#a-name"), "shotsuser")
    set_control(page.locator("#a-pass"), PASS)
    set_control(page.locator("#a-again"), PASS)
    page.get_by_role("button", name="Create and open").click()
    page.locator(".dayline").wait_for(timeout=20000)
    page.goto(f"{BASE}/#/diary")
    page.get_by_role("button", name="Add appointment").click()
    fill_form(
        page,
        {"title": "Dentist check-up", "date": tomorrow, "time": "10:15", "where": "Clinic", "travel": 20, "prep": 15},
    )
    page.goto(f"{BASE}/#/tasks")
    for title in ["Reply to the accountant", "Tidy the desk"]:
        set_control(page.locator('[data-focus="task"]'), title)
        page.keyboard.press("Enter")
        expect(page.locator(".list li", has_text=title)).to_have_count(1)
    page.goto(f"{BASE}/#/bills")
    page.get_by_role("button", name="Add bill").click()
    fill_form(page, {"name": "Phone", "amount": "45", "due": tomorrow, "repeat": "monthly"})
    page.goto(f"{BASE}/#/routine")
    page.get_by_role("button", name="Add item").click()
    fill_form(page, {"label": "Evening walk", "time": "18:30"})
    page.goto(f"{BASE}/#/plan")
    page.get_by_role("button", name="Plan with internet and device sections").click()
    expect(page.locator(".plan-sec")).to_have_count(13)

    # --- every screen, every kit, every width
    screens = [
        ("today", "today", None),
        ("diary", "diary", None),
        ("tasks", "tasks", None),
        ("bills", "bills", None),
        ("checkin", "checkin/morning", None),
        ("plan", "plan", None),
        ("settings", "settings", None),
        ("appearance", "appearance", None),
    ]
    for kit in ("xo", "daisy", "wa"):
        page.evaluate("k => window.XOLook.change((s, look) => { look.kit = k; })", kit)
        page.goto(BASE)
        page.reload()
        assert page.evaluate("document.documentElement.dataset.kit") == kit
        for width, size in SIZES.items():
            page.set_viewport_size(size)
            for name, route, _ in screens:
                page.goto(f"{BASE}/#/{route}")
                ready(page)
                shot(page, kit, name, width)
            page.goto(f"{BASE}/#/tasks")
            ready(page)
            page.locator(".list li", has_text="Reply to the accountant").locator(".row-main").click()
            expect(page.locator("dialog[open]")).to_have_count(1)
            shot(page, kit, "task-form", width)
            page.keyboard.press("Escape")
            expect(page.locator("dialog[open]")).to_have_count(0)

    # --- the pane on (no xo-pane value), xo kit only, at the two widest sizes
    pane_ctx = browser.new_context(viewport=SIZES["1920"], timezone_id=TZ, locale="en-AU", reduced_motion="reduce")
    pane_page = pane_ctx.new_page()
    pane_page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "401" not in m.text else None)
    pane_page.on("pageerror", lambda e: errors.append(str(e)))
    pane_page.goto(BASE)
    set_control(pane_page.locator("#a-name"), "shotsuser")
    set_control(pane_page.locator("#a-pass"), PASS)
    pane_page.get_by_role("button", name="Sign in").click()
    pane_page.locator(".dayline").wait_for(timeout=20000)
    for width in ("1920", "5120"):
        pane_page.set_viewport_size(SIZES[width])
        for name in ("settings", "appearance"):
            pane_page.goto(f"{BASE}/#/today")
            ready(pane_page)
            pane_page.goto(f"{BASE}/#/{name}")
            pane_page.locator(".pane").wait_for(state="visible")
            shot(pane_page, "xo-pane", name, width)
    browser.close()

print("files written:", len(written))
print("console errors:", errors or "none")
assert not errors
print("SHOTS OK")
