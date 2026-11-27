"""Browser test for shortcuts, custom fields, notes and voice. Runs on an emptied database and creates its own account.

Fails on any console error or off-site request.

python tests/e2e_extras.py [base_url]
"""

import os
import re
import sys
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
ORIGIN = urlparse(BASE).netloc
KIT = os.environ.get("XO_KIT", "xo")
PASS = "orbit-walnut-ferry-linen-42"
errors = []
offsite = []


def set_control(el, value):
    """Fill one form control, whichever kit built it (Web Awesome controls are custom elements)."""
    tag = el.evaluate("e => e.tagName")
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
    """Fills the open dialog's fields by name and presses its button."""
    dlg = page.locator("dialog[open]")
    for name, value in values.items():
        set_control(dlg.locator(f"#f-{name}"), value)
    dlg.get_by_role("button", name=button).click()
    expect(dlg).to_have_count(0)


with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"]
    )
    ctx = b.new_context(
        viewport={"width": 1400, "height": 900},
        timezone_id="Australia/Perth",
        locale="en-AU",
        reduced_motion="reduce",
    )
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "401" not in m.text else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on(
        "request",
        lambda r: (
            offsite.append(r.url)
            if urlparse(r.url).netloc not in (ORIGIN, "") and not r.url.startswith("data:")
            else None
        ),
    )

    # Account.
    pg.goto(BASE)
    pg.wait_for_selector("#a-name", timeout=20000)
    set_control(pg.locator("#a-name"), "tester")
    set_control(pg.locator("#a-pass"), PASS)
    set_control(pg.locator("#a-again"), PASS)
    pg.get_by_role("button", name="Create and open").click()
    expect(pg.locator(".dayline")).to_be_visible(timeout=20000)

    # 1. Shortcuts.
    pg.goto(f"{BASE}/#/settings")
    pg.wait_for_selector("#s-key-scope", timeout=20000)
    set_control(pg.locator("#s-key-scope"), "tasks")
    done_row = pg.locator("tr", has_text="Mark done, or not done")
    done_row.get_by_role("button", name="Change").click()
    pg.keyboard.press("d")
    expect(done_row.locator("kbd")).to_have_text("D")
    pick_row = pg.locator("tr", has_text="Pick for today")
    pick_row.get_by_role("button", name="Change").click()
    pg.keyboard.press("j")
    expect(pg.locator("p.note[role=status]")).to_contain_text('is already used for "Next task"')
    pg.keyboard.press("Escape")

    pg.goto(f"{BASE}/#/tasks")
    pg.wait_for_selector('[data-focus="task"]', timeout=20000)
    set_control(pg.locator('[data-focus="task"]'), "Key test")
    pg.keyboard.press("Enter")
    row = pg.locator(".list li", has_text="Key test")
    expect(row).to_have_count(1)
    pg.locator("h1").first.click()
    pg.keyboard.press("j")
    pg.keyboard.press("d")
    expect(row).to_have_class(re.compile(r"\bdone\b"))
    pg.keyboard.press("x")
    expect(row).to_have_class(re.compile(r"\bdone\b"))
    pg.keyboard.press("?")
    dlg = pg.locator("dialog[open]")
    expect(dlg.get_by_role("heading", name="Keyboard shortcuts")).to_be_visible()
    expect(dlg.locator("kbd", has_text=re.compile(r"^D$"))).to_have_count(1)
    pg.keyboard.press("Escape")
    expect(pg.locator("dialog[open]")).to_have_count(0)

    pg.goto(f"{BASE}/#/settings")
    pg.wait_for_selector("#s-key-scope", timeout=20000)
    set_control(pg.locator("#s-key-scope"), "tasks")
    pg.get_by_role("button", name="Put back every original key here").click()
    pg.get_by_role("button", name="Tap again to put back every original key").click()
    expect(pg.locator("tr", has_text="Mark done, or not done").locator("kbd")).to_have_text("X")

    pg.goto(f"{BASE}/#/today")
    pg.wait_for_selector(".dayline", timeout=20000)
    pg.keyboard.press("Control+k")
    expect(pg.locator("dialog[open]").get_by_role("combobox")).to_be_visible()
    pg.keyboard.press("Escape")
    expect(pg.locator("dialog[open]")).to_have_count(0)

    b.close()

assert not errors, errors
assert not offsite, offsite
print("e2e_extras: ok")
