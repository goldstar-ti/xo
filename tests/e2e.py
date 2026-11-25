"""Browser smoke test. Needs the app running (default http://localhost:8010) on an EMPTY database.

    python tests/e2e.py [base_url] [screenshot_dir]
"""
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
SHOTS = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/xo-shots")
SHOTS.mkdir(parents=True, exist_ok=True)
PASS = "orbit-walnut-ferry-linen-42"
TZ = "Australia/Perth"
now = datetime.now(ZoneInfo(TZ))
today = now.strftime("%Y-%m-%d")
tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
soon = (now + timedelta(hours=2)).strftime("%H:%M")
errors = []


def fill_form(page, values, button="Save"):
    dlg = page.locator("dialog[open]")
    for name, value in values.items():
        el = dlg.locator(f"#f-{name}")
        if isinstance(value, bool):
            el.set_checked(value)
        elif el.evaluate("e => e.tagName") == "SELECT":
            el.select_option(value)
        else:
            el.fill(str(value))
    dlg.get_by_role("button", name=button).click()
    expect(dlg).to_have_count(0)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, timezone_id=TZ, locale="en-AU")
    page = ctx.new_page()
    # A refused sign-in logs a 401 "Failed to load resource"; that one is expected below.
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "401" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # --- create the account
    page.goto(BASE)
    page.fill("#a-name", "pj")
    page.fill("#a-pass", PASS)
    page.fill("#a-again", PASS)
    page.screenshot(path=SHOTS / "00-create.png")
    page.get_by_role("button", name="Create and open").click()
    expect(page.locator("h1")).to_contain_text(now.strftime("%-d %B"), timeout=20000)
    expect(page.locator(".dayline .entry")).to_have_count(8)  # 6 routine items + 2 check-ins

    # --- appointments
    page.goto(f"{BASE}/#/diary")
    page.get_by_role("button", name="Add appointment").click()
    late_today = now.hour >= 21
    fill_form(page, {"title": "GP appointment", "date": tomorrow if late_today else today, "time": "10:15" if late_today else soon,
                     "where": "Medical centre", "travel": 25, "prep": 20})
    page.goto(f"{BASE}/#/obligations")
    page.get_by_role("button", name="Add court date").click()
    fill_form(page, {"title": "Hearing", "date": tomorrow, "time": "09:30", "where": "Court, level 2", "notes": "Photo ID\nLetter from lawyer"})
    expect(page.locator(".tag")).to_have_text("Court")
    page.goto(f"{BASE}/#/diary")
    assert "false" not in page.locator("#view").inner_text() and "[object" not in page.locator("#view").inner_text()
    page.goto(f"{BASE}/#/obligations")

    # --- court task, condition, reporting record
    page.fill('[data-focus="court"]', "Send documents to lawyer")
    page.keyboard.press("Enter")
    expect(page.locator(".list li", has_text="Send documents to lawyer")).to_have_count(1)
    expect(page.locator('[data-focus="court"]')).to_be_focused()
    page.get_by_role("button", name="Add condition").click()
    fill_form(page, {"title": "Report in person", "detail": "Front counter", "contact": "Reporting officer 08 5550 0100", "schedule": "weekly", "weekday": str((now.weekday() + 1) % 7), "time": "10:00"})
    page.get_by_role("button", name="Add record").click()
    fill_form(page, {"what": "New phone number", "who": "Reporting officer"})
    page.screenshot(path=SHOTS / "05-obligations.png", full_page=True)

    # --- tasks
    page.goto(f"{BASE}/#/tasks")
    for title in ["Reply to accountant", "Book dentist", "Renew car registration", "Tidy desk"]:
        page.fill('[data-focus="task"]', title)
        page.keyboard.press("Enter")
        expect(page.locator(".list li", has_text=title)).to_have_count(1)
    page.locator(".list li", has_text="Reply to accountant").locator(".row-main").click()
    fill_form(page, {"step": "Open the email and read it once", "est": 20, "due": tomorrow})
    for title in ["Reply to accountant", "Book dentist", "Send documents to lawyer"]:
        page.locator(".list li", has_text=title).get_by_role("button", name="Pick").click()
        expect(page.locator(".list li", has_text=title).get_by_role("button", name="Today")).to_have_count(1)
    page.locator(".list li", has_text="Tidy desk").get_by_role("button", name="Pick").click()  # fourth: refused
    expect(page.locator("#toast")).to_contain_text("Three is the limit")
    page.locator(".list li", has_text="Book dentist").locator("input[type=checkbox]").check()
    expect(page.locator(".list li.done", has_text="Book dentist")).to_have_count(1)
    page.screenshot(path=SHOTS / "03-tasks.png", full_page=True)

    # --- bills
    page.goto(f"{BASE}/#/bills")
    page.get_by_role("button", name="Add bill").click()
    fill_form(page, {"name": "Phone", "amount": "45", "due": today, "repeat": "monthly"})
    page.get_by_role("button", name="Add bill").click()
    fill_form(page, {"name": "Strata levy", "amount": "612.50", "due": tomorrow, "repeat": "quarterly"})
    page.locator(".list li", has_text="Phone").get_by_role("button", name="Paid").click()
    expect(page.locator(".list li", has_text="Phone")).to_contain_text("monthly")
    expect(page.locator(".figure")).to_contain_text("due in the next 30 days")
    page.screenshot(path=SHOTS / "04-bills.png", full_page=True)

    # --- plan: choose a version, write boxes, open the card
    page.goto(f"{BASE}/#/plan")
    page.get_by_role("button", name="Plan with internet and device sections").click()
    expect(page.locator(".plan-sec")).to_have_count(13)
    page.fill("#box-good_matters", "Being someone my family can rely on.")
    page.fill("#box-signs", "Three nights in a row awake past 2 am.\nCancelling on a friend twice in one week.")
    page.fill("#box-instead", "Message Sam the same day. Put the phone on charge in the lounge.")
    page.fill("#box-team", "Sam 0400 000 000\nDr Lee 08 5550 0111")
    expect(page.locator(".page-head [role=status]")).to_have_text("Saved", timeout=5000)
    page.screenshot(path=SHOTS / "06-plan.png")
    page.locator(".top .plan-btn").click()
    card = page.locator("dialog[open]")
    expect(card).to_contain_text("Three nights in a row")
    expect(card.locator('a[href="tel:0400000000"]')).to_have_count(1)
    expect(card.locator('a[href="tel:131114"]')).to_have_count(1)
    page.screenshot(path=SHOTS / "07-plan-card.png")
    card.get_by_role("button", name="Close").click()

    # --- check-ins
    page.goto(f"{BASE}/#/checkin/morning")
    page.get_by_role("button", name="6 to 7").click()
    page.get_by_role("button", name="tired", exact=True).click()
    page.get_by_role("button", name="one of them").click()
    page.get_by_role("button", name="Save check-in").click()
    expect(page.locator("h1")).to_contain_text(now.strftime("%-d %B"))
    page.goto(f"{BASE}/#/checkin/evening")
    page.get_by_role("button", name="went outside").click()
    page.get_by_role("button", name="yes", exact=True).click()
    expect(page.locator(".reveal")).to_contain_text("Message Sam")
    page.screenshot(path=SHOTS / "08-evening.png", full_page=True)
    page.locator(".reveal textarea").fill("Messaged Sam at 8 pm.")
    page.get_by_role("button", name="Save check-in").click()
    expect(page.locator(".dayline .k-checkin.done")).to_have_count(2)

    # --- today: tick a routine item
    page.locator(".dayline .entry", has_text="Breakfast").get_by_role("button").click()
    expect(page.locator(".dayline .entry.done", has_text="Breakfast")).to_have_count(1)
    expect(page.locator(".next-head")).not_to_be_empty()
    page.screenshot(path=SHOTS / "01-today-phone.png", full_page=True)

    # --- reload: still signed in, key still on the device
    page.reload()
    expect(page.locator(".dayline .entry.done", has_text="Breakfast")).to_have_count(1, timeout=20000)

    # --- settings render, export decrypts
    page.goto(f"{BASE}/#/settings")
    expect(page.locator("h1")).to_have_text("Settings")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download everything, unencrypted").click()
    exported = Path(dl.value.path()).read_text()
    assert "GP appointment" in exported and "Being someone my family can rely on." in exported
    page.screenshot(path=SHOTS / "09-settings.png", full_page=True)

    # --- sign out, wrong passphrase, right passphrase
    page.get_by_role("button", name="Sign out of this device").click()
    page.fill("#a-name", "pj")
    page.fill("#a-pass", "not the passphrase")
    page.get_by_role("button", name="Sign in").click()
    expect(page.locator(".form-error")).to_contain_text("do not match", timeout=20000)
    page.fill("#a-pass", PASS)
    page.get_by_role("button", name="Sign in").click()
    expect(page.locator(".dayline .entry.done", has_text="Breakfast")).to_have_count(1, timeout=20000)

    # --- desktop layout, light and dark
    page.set_viewport_size({"width": 1280, "height": 900})
    expect(page.locator(".side")).to_be_visible()
    page.screenshot(path=SHOTS / "02-today-desktop.png", full_page=True)
    page.emulate_media(color_scheme="dark")
    page.screenshot(path=SHOTS / "02-today-desktop-dark.png", full_page=True)

    sw = page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r)")
    browser.close()

print("service worker registered:", sw)
print("console errors:", errors or "none")
assert not errors
print("E2E OK")
