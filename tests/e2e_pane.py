"""Pane test: on a wide window Settings, Appearance and the Look panel open as tabs in the right pane.

Run after tests/e2e.py, against the same database (it signs in as that test's account).

python tests/e2e_pane.py [base_url]
"""

import os
import sys

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
errs = []
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
    tabs = pg.locator(".pane-tab")
    expect(pg.locator(".pane")).to_be_hidden()

    # Settings opens as a tab and Today stays the main screen
    pg.goto(BASE + "/#/settings")
    expect(tabs).to_have_count(1)
    expect(pg.locator(".pane-body h1")).to_have_text("Settings")
    assert pg.evaluate("document.body.dataset.view") == "today"
    assert pg.evaluate("location.hash") == "#/today"
    expect(pg.locator("#view .dayline")).to_be_visible()

    # Appearance is a second tab
    pg.goto(BASE + "/#/appearance")
    expect(tabs).to_have_count(2)
    expect(pg.locator(".pane-tab[aria-selected=true]")).to_have_text("Appearance")
    expect(pg.locator(".pane-body:not([hidden]) h1")).to_have_text("Appearance")
    assert pg.evaluate("document.body.dataset.view") == "today"

    # Escape does not close a page tab
    pg.locator(".pane-tab[aria-selected=true]").focus()
    pg.keyboard.press("Escape")
    expect(tabs).to_have_count(2)

    # The Look panel opens in the pane, not a dialog, then closes with Escape
    pg.locator(".side .look-btn").click()
    expect(tabs).to_have_count(3)
    expect(pg.locator(".pane-tab[aria-selected=true]")).to_have_text("Look")
    expect(pg.locator("dialog[open]")).to_have_count(0)
    pg.locator(".pane-tab[aria-selected=true]").focus()
    pg.keyboard.press("Escape")
    expect(tabs).to_have_count(2)

    # An add or edit form stays a popover
    pg.evaluate(
        """async () => {
          const u = await import('/js/util.js');
          u.openForm({ title: 'Pane probe', fields: [{ name: 'a', label: 'Probe field', type: 'text' }],
            onSave() {}, anchor: document.querySelector('.side .look-btn') });
        }"""
    )
    expect(pg.locator("dialog.xo-pop[open]")).to_have_count(1)
    expect(tabs).to_have_count(2)
    pg.keyboard.press("Escape")
    expect(pg.locator("dialog.xo-pop[open]")).to_have_count(0)

    # Close one tab with its button
    pg.get_by_role("button", name="Close Appearance").click()
    expect(tabs).to_have_count(1)
    expect(pg.locator(".pane-tab")).to_have_text("Settings")

    # Width: drag the handle left, then use the keyboard; the width is kept after a reload
    w0 = pg.locator(".pane").bounding_box()["width"]
    g = pg.locator(".pane-grip").bounding_box()
    x, y = g["x"] + g["width"] / 2, g["y"] + 200
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.mouse.move(x - 120, y, steps=6)
    pg.mouse.up()
    w1 = pg.locator(".pane").bounding_box()["width"]
    assert w1 > w0 + 100, (w0, w1)
    pg.locator(".pane-grip").focus()
    pg.keyboard.press("ArrowLeft")
    w2 = pg.locator(".pane").bounding_box()["width"]
    assert w2 > w1, (w1, w2)
    kept = pg.evaluate("JSON.parse(localStorage.getItem('xo-pane')).width")
    pg.reload()
    pg.wait_for_selector(".dayline", timeout=20000)
    pg.goto(BASE + "/#/settings")
    expect(tabs).to_have_count(1)
    w3 = pg.locator(".pane").bounding_box()["width"]
    assert abs(w3 - w2) < 2, (w2, w3)
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-pane')).width") == kept

    # A phone-width window has no pane: Settings is a full screen
    pg.set_viewport_size({"width": 412, "height": 900})
    pg.reload()
    pg.wait_for_selector(".dayline", timeout=20000)
    pg.goto(BASE + "/#/settings")
    expect(pg.locator("#view h1")).to_have_text("Settings")
    assert pg.evaluate("document.body.dataset.view") == "settings"
    expect(pg.locator(".pane")).to_be_hidden()
    b.close()
print("errors:", errs or "none")
assert not errs
