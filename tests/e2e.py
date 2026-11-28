"""Browser smoke test. Needs the app running (default http://localhost:8010) on an EMPTY database.

python tests/e2e.py [base_url] [screenshot_dir]

XO_KIT (xo, daisy or wa; default xo) picks the component kit the whole flow runs in.
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
KIT = os.environ.get("XO_KIT", "xo")
errors = []


def set_control(el, value):
    """Fill one form control, whichever kit built it (Web Awesome controls are custom elements)."""
    tag = el.evaluate("e => e.tagName")
    if el.evaluate("e => e.classList.contains('md-text')"):
        # A long text box is the Markdown editor: its real text area is hidden, so type through CodeMirror.
        ed = el.locator("xpath=ancestor::div[contains(@class,'md-editor')]")
        expect(ed.locator(".CodeMirror")).to_be_visible(timeout=15000)
        ed.locator(".CodeMirror").evaluate("(e, v) => e.CodeMirror.setValue(v)", str(value))
        return
    if tag.startswith("WA-"):
        if tag == "WA-CHECKBOX":
            el.evaluate("(e, v) => { e.checked = v; e.dispatchEvent(new Event('change', { bubbles: true })); }", value)
        elif tag == "WA-SELECT":
            el.evaluate(
                "(e, v) => { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }", str(value)
            )
        else:
            el.locator("input, textarea").fill(str(value))
    elif isinstance(value, bool):
        el.set_checked(value)
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


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"]
    )
    ctx = browser.new_context(
        viewport={"width": 412, "height": 915}, device_scale_factor=2, timezone_id=TZ, locale="en-AU"
    )
    # Headless Chromium reports notifications as denied; a real first visit has not been asked yet.
    ctx.add_init_script("Object.defineProperty(Notification, 'permission', { get: () => 'default' })")
    # This test uses Settings and check-ins as full screens, so the right pane is off (see e2e_pane.py).
    ctx.add_init_script("localStorage.setItem('xo-pane', JSON.stringify({ off: true }))")
    page = ctx.new_page()
    # A refused sign-in logs a 401 "Failed to load resource"; that one is expected below.
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "401" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # --- pick the kit before anything is drawn, then reload so it applies from the start
    page.goto(BASE)
    expect(page.locator("#a-name")).to_be_visible()  # the app has booted, so the reload below cuts nothing short
    page.evaluate("k => window.XOLook.change((s, look) => { look.kit = k; })", KIT)
    page.reload()
    assert page.evaluate("document.documentElement.dataset.kit") == KIT

    # --- create the account
    set_control(page.locator("#a-name"), "tester")
    set_control(page.locator("#a-pass"), PASS)
    set_control(page.locator("#a-again"), PASS)
    page.screenshot(path=SHOTS / "00-create.png")
    page.get_by_role("button", name="Create and open").click()
    expect(page.locator("h1")).to_contain_text(now.strftime("%-d %B"), timeout=20000)
    expect(page.locator(".dayline .entry")).to_have_count(8)  # 6 routine items + 2 check-ins

    # --- first run: nothing ticked yet, so Today offers to turn notifications on
    expect(page.locator(".callout-slot")).to_contain_text("Reminders only reach this phone once notifications are on.")
    expect(page.get_by_role("button", name="Turn on notifications")).to_be_visible()

    # --- offline: Today says so and will not take a tick; back online it clears
    breakfast = page.locator(".dayline .entry", has_text="Breakfast").get_by_role("checkbox")
    page.context.set_offline(True)
    expect(page.locator(".callout-slot", has_text="No connection")).to_be_visible()
    expect(breakfast).to_be_disabled()
    page.context.set_offline(False)
    expect(page.locator(".callout-slot", has_text="No connection")).to_have_count(0)
    expect(breakfast).to_be_enabled()

    # --- appointments
    page.goto(f"{BASE}/#/diary")
    page.get_by_role("button", name="Add appointment").click()
    late_today = now.hour >= 21
    fill_form(
        page,
        {
            "title": "GP appointment",
            "date": tomorrow if late_today else today,
            "time": "10:15" if late_today else soon,
            "where": "Medical centre",
            "travel": 25,
            "prep": 20,
        },
    )
    page.goto(f"{BASE}/#/obligations")
    page.get_by_role("button", name="Add court date").click()
    fill_form(
        page,
        {
            "title": "Hearing",
            "date": tomorrow,
            "time": "09:30",
            "where": "Court, level 2",
            "notes": "Photo ID\nLetter from lawyer",
        },
    )
    expect(page.locator(".tag")).to_have_text("Court")
    page.goto(f"{BASE}/#/diary")
    page.locator(".list li").first.get_by_role("button", name="Appointment actions").click()
    expect(page.get_by_role("menuitem", name="Copy to Google Calendar")).to_be_visible()
    page.keyboard.press("Escape")
    assert "false" not in page.locator("#view").inner_text() and "[object" not in page.locator("#view").inner_text()
    page.goto(f"{BASE}/#/obligations")

    # --- court task, condition, reporting record
    set_control(page.locator('[data-focus="court"]'), "Send documents to lawyer")
    page.keyboard.press("Enter")
    expect(page.locator(".list li", has_text="Send documents to lawyer")).to_have_count(1)
    expect(page.locator('[data-focus="court"]')).to_be_focused()
    page.get_by_role("button", name="Add condition").click()
    fill_form(
        page,
        {
            "title": "Report in person",
            "detail": "Front counter",
            "contact": "Reporting officer 08 5550 0100",
            "schedule": "weekly",
            "weekday": str((now.weekday() + 1) % 7),
            "time": "10:00",
        },
    )
    page.get_by_role("button", name="Add record").click()
    fill_form(page, {"what": "New phone number", "who": "Reporting officer"})
    page.screenshot(path=SHOTS / "05-obligations.png", full_page=True)

    # --- tasks
    page.goto(f"{BASE}/#/tasks")
    for title in ["Reply to accountant", "Book dentist", "Renew car registration", "Tidy desk"]:
        set_control(page.locator('[data-focus="task"]'), title)
        page.keyboard.press("Enter")
        expect(page.locator(".list li", has_text=title)).to_have_count(1)
    page.locator(".list li", has_text="Reply to accountant").locator(".row-main").click()
    fill_form(page, {"step": "Open the email and read it once", "est": 20, "due": tomorrow})
    for title in ["Reply to accountant", "Book dentist", "Send documents to lawyer"]:
        page.locator(".list li", has_text=title).get_by_role("button", name="Pick").click()
        expect(page.locator(".list li", has_text=title).get_by_role("button", name="Today")).to_have_count(1)
    page.locator(".list li", has_text="Tidy desk").get_by_role("button", name="Pick").click()  # fourth: refused
    expect(page.locator("#toast")).to_contain_text("Three is the limit")
    set_control(
        page.locator(".list li", has_text="Book dentist").locator("wa-checkbox, input[type=checkbox]").first, True
    )
    expect(page.locator(".list li.done", has_text="Book dentist")).to_have_count(1)
    page.screenshot(path=SHOTS / "03-tasks.png", full_page=True)

    # --- bills
    page.goto(f"{BASE}/#/bills")
    page.get_by_role("button", name="Add bill").click()
    fill_form(page, {"name": "Phone", "amount": "45", "due": today, "repeat": "monthly"})
    page.get_by_role("button", name="Add bill").click()
    fill_form(page, {"name": "Strata levy", "amount": "612.50", "due": tomorrow, "repeat": "quarterly"})
    page.locator(".list li", has_text="Phone").get_by_role("checkbox").evaluate("el => el.click()")
    expect(page.locator(".list li", has_text="Phone")).to_contain_text("monthly")
    expect(page.locator(".figure")).to_contain_text("due in the next 30 days")
    page.screenshot(path=SHOTS / "04-bills.png", full_page=True)

    # --- plan: choose a version, write boxes, open the card
    page.goto(f"{BASE}/#/plan")
    page.get_by_role("button", name="Plan with internet and device sections").click()
    expect(page.locator(".plan-sec")).to_have_count(13)
    set_control(page.locator("#box-good_matters"), "Being someone my family can rely on.")
    set_control(
        page.locator("#box-signs"), "Three nights in a row awake past 2 am.\nCancelling on a friend twice in one week."
    )
    set_control(page.locator("#box-instead"), "Message Sam the same day. Put the phone on charge in the lounge.")
    set_control(page.locator("#box-team"), "Sam 0400 000 000\nDr Lee 08 5550 0111")
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
    if KIT == "wa":
        page.locator("wa-checkbox", has_text="went outside").click()
    else:
        page.get_by_role("checkbox", name="went outside").click()
    page.get_by_role("radio", name="yes", exact=True).click()
    expect(page.locator(".reveal")).to_contain_text("Message Sam")
    page.screenshot(path=SHOTS / "08-evening.png", full_page=True)
    set_control(page.locator(".reveal .md-text").first, "Messaged Sam at 8 pm.")
    page.get_by_role("button", name="Save check-in").click()
    expect(page.locator(".dayline .k-checkin.done")).to_have_count(2)

    # --- today: tick a routine item
    page.locator(".dayline .entry", has_text="Breakfast").get_by_role("checkbox").evaluate("el => el.click()")
    expect(page.locator(".dayline .entry.done", has_text="Breakfast")).to_have_count(1)
    expect(page.locator(".next-head")).not_to_be_empty()
    page.screenshot(path=SHOTS / "01-today-phone.png", full_page=True)

    # --- reload: still signed in, session still valid
    page.reload()
    expect(page.locator(".dayline .entry.done", has_text="Breakfast")).to_have_count(1, timeout=20000)

    # --- settings render, export is readable
    page.goto(f"{BASE}/#/settings")
    expect(page.locator("h1")).to_have_text("Settings")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download everything").click()
    exported = Path(dl.value.path()).read_text()
    assert "GP appointment" in exported and "Being someone my family can rely on." in exported
    page.screenshot(path=SHOTS / "09-settings.png", full_page=True)
    # every kind of control on the screen: a time, a choice, a tick box and a text box
    set_control(page.locator("#s-morningAt"), "07:30")
    expect(page.locator("#toast")).to_contain_text("Saved")
    set_control(page.locator("#s-weeklyDay"), "3")
    set_control(page.locator("#s-showGuard"), False)
    set_control(page.locator("#view textarea, #view wa-textarea").first, "A line of my own")
    page.keyboard.press("Tab")  # a text box saves when it loses focus
    expect(page.locator("#toast")).to_contain_text("Saved")
    page.reload()
    expect(page.locator("#s-weeklyDay")).to_have_js_property("value", "3", timeout=20000)
    expect(page.locator("#s-morningAt")).to_have_js_property("value", "07:30")
    expect(page.locator("#s-showGuard")).to_have_js_property("checked", False)
    expect(page.locator("#view textarea, #view wa-textarea").first).to_have_js_property("value", "A line of my own")

    # --- check-in choices: grouped chips, then an edited list reaches the check-in, then back to the original
    def settings_saved():
        return page.expect_response(lambda r: r.url.endswith("/api/items/settings") and r.request.method == "PUT")

    page.goto(f"{BASE}/#/checkin/evening")
    expect(page.locator(".chip-group h3", has_text="Negative").first).to_be_visible()
    page.goto(f"{BASE}/#/settings")
    rows = page.locator(".lookup-table tbody tr")
    with settings_saved():
        rows.first.locator(".lk-remove").click()
    page.get_by_role("button", name="Add a choice").click()
    with settings_saved():
        set_control(rows.last.locator("input, wa-input").first, "fed the cat")
        page.keyboard.press("Tab")
    expect(page.locator("#view")).to_contain_text("You are using your own version of this list.")
    page.goto(f"{BASE}/#/checkin/evening")
    expect(page.get_by_role("checkbox", name="fed the cat", exact=True)).to_have_count(1)
    expect(page.get_by_role("checkbox", name="moved my body or went for a walk", exact=True)).to_have_count(0)
    page.goto(f"{BASE}/#/settings")
    page.get_by_role("button", name="Go back to the original list").click()
    with settings_saved():
        page.get_by_role("button", name="Tap again to go back to the original list").click()
    expect(page.locator("#view")).to_contain_text("You are using the original list.")

    # --- appearance: a chip, a choice, a text box, then the quick Look panel
    page.goto(f"{BASE}/#/appearance")
    expect(page.locator("h1")).to_have_text("Appearance")
    page.locator('[data-fk="view:advanced"]').click()
    # a setting is found through the search box, whichever group or accordion it sits in
    set_control(page.locator("#look-search"), "next-up")
    page.locator('[data-fk="hero:banner"]').click()
    assert page.evaluate("document.documentElement.dataset.hero") == "banner"
    set_control(page.locator("#look-search"), "what xo calls you")
    set_control(page.locator("#p-call"), "Captain")
    page.locator("#p-call").blur()
    page.wait_for_timeout(400)  # the change redraws the screen; type in the new search box
    set_control(page.locator("#look-search"), "scheduled")
    set_control(page.locator("#sch-name"), "Evening")
    set_control(page.locator("#look-search"), "next-up")
    page.locator('[data-fk="hero:plain"]').click()
    assert page.evaluate("document.documentElement.dataset.hero") == "plain"
    page.screenshot(path=SHOTS / "10-appearance.png", full_page=True)
    page.locator(".top .look-btn").click()
    look = page.locator("dialog[open]")
    look.get_by_role("button", name="Surprise me").click()
    look.get_by_role("button", name="Undo", exact=True).click()
    look.get_by_role("button", name="Close").click()
    expect(look).to_have_count(0)
    page.goto(f"{BASE}/#/settings")

    # --- sign out, wrong password, right password
    page.get_by_role("button", name="Sign out of this device").click()
    set_control(page.locator("#a-name"), "tester")
    set_control(page.locator("#a-pass"), "not the password")
    page.get_by_role("button", name="Sign in").click()
    expect(page.locator(".form-error")).to_contain_text("do not match", timeout=20000)
    set_control(page.locator("#a-pass"), PASS)
    page.get_by_role("button", name="Sign in").click()
    expect(page.locator(".dayline .entry.done", has_text="Breakfast")).to_have_count(1, timeout=20000)

    # --- phone rhythm at 390 px: slim header, 14 px tab labels, 26 px page title, no header overflow
    page.set_viewport_size({"width": 390, "height": 844})
    expect(page.locator(".top")).to_be_visible()
    rhythm = page.evaluate(
        """() => ({
            top: document.querySelector('.top').getBoundingClientRect().height,
            tab: parseFloat(getComputedStyle(document.querySelector('.tabs a')).fontSize),
            h1: parseFloat(getComputedStyle(document.querySelector('#view h1')).fontSize),
            over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        })"""
    )
    assert rhythm["top"] <= 57, rhythm
    assert 13 <= rhythm["tab"] <= 15, rhythm
    assert 27 <= rhythm["h1"] <= 29, rhythm
    assert rhythm["over"] <= 0, rhythm
    # a form is a full-screen sheet on a phone: its Save button sits at the bottom edge, above the footer padding
    page.goto(f"{BASE}/#/diary")
    page.get_by_role("button", name="Add appointment").click()
    form = page.locator("dialog[open]")
    expect(form.get_by_role("button", name="Save")).to_be_visible()
    page.evaluate("Promise.all(document.getAnimations().map((a) => a.finished))")  # the sheet fades in first
    sheet = page.evaluate(
        """() => {
            const d = document.querySelector('dialog[open]').getBoundingClientRect();
            const s = document.querySelector('dialog[open] .form-actions').lastElementChild.getBoundingClientRect();
            return { top: d.top, height: d.height, vh: innerHeight, below: innerHeight - s.bottom };
        }"""
    )
    assert sheet["top"] == 0 and abs(sheet["height"] - sheet["vh"]) <= 1, sheet
    assert abs(sheet["below"] - 16) <= 20, sheet
    form.get_by_role("button", name="Cancel").click()
    expect(form).to_have_count(0)
    page.set_viewport_size({"width": 412, "height": 915})

    # --- desktop layout, light and dark
    page.set_viewport_size({"width": 1280, "height": 900})
    expect(page.locator(".side")).to_be_visible()
    page.screenshot(path=SHOTS / "02-today-desktop.png", full_page=True)
    page.emulate_media(color_scheme="dark")
    page.screenshot(path=SHOTS / "02-today-desktop-dark.png", full_page=True)

    sw = page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r)")
    browser.close()

print("kit:", KIT)
print("service worker registered:", sw)
print("console errors:", errors or "none")
assert not errors
print("E2E OK")
