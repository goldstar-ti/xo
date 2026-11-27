"""Side bar test: icons, collapse, resize, the icon picker and section spacing, at desktop width.

Run after tests/e2e.py, against the same database (it signs in as that test's account).

python tests/e2e_rail.py [base_url]
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
    pg.evaluate("XOLook.reset()")
    side = pg.locator("aside.side")
    today = side.locator('nav a[data-nav="today"]')

    # every screen in the side bar has an icon, drawn at once from the core set
    expect(side.locator("nav a .ico svg")).to_have_count(13)
    assert today.locator(".ico").get_attribute("data-icon") == "tabler/sun"

    # Settings: lines in a section are spaced apart (the push buttons are hidden here: no push service)
    pg.goto(BASE + "/#/settings")
    pg.wait_for_selector("#view > section")

    def gap(sec, upper, lower):
        a, z = sec.locator(upper).bounding_box(), sec.locator(lower).bounding_box()
        return z["y"] - (a["y"] + a["height"])

    notif, voice = pg.locator("#view > section").nth(0), pg.locator("#view > section").nth(1)
    assert gap(notif, "> p.note", "> .field.check") >= 8
    assert gap(voice, "> .field.check", "> .field:not(.check)") >= 8

    # collapse to icons, kept after a reload, names as tooltips; then open again
    pg.locator(".side-toggle").click()
    assert pg.evaluate("document.documentElement.dataset.side") == "icons"
    pg.wait_for_function("document.querySelector('aside.side').getBoundingClientRect().width < 90")
    pg.reload()
    pg.wait_for_selector("#view > section")
    assert pg.evaluate("XOLook.prefs.side") == "icons"
    assert today.get_attribute("title") == "Today"
    expect(pg.locator(".side-toggle")).to_have_attribute("aria-expanded", "false")
    pg.locator(".side-toggle").click()
    pg.wait_for_function("document.querySelector('aside.side').getBoundingClientRect().width > 200")
    assert today.get_attribute("title") is None

    # resize: arrow keys, a drag, and double-click to reset
    grip = pg.locator(".side-grip")
    grip.focus()
    pg.keyboard.press("ArrowRight")
    pg.keyboard.press("ArrowRight")
    assert pg.evaluate("XOLook.prefs.sideW") == 272
    pg.wait_for_function("Math.abs(document.querySelector('aside.side').getBoundingClientRect().width - 272) < 2")
    box = grip.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + 200
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.mouse.move(x + 60, y, steps=5)
    pg.mouse.up()
    assert 325 <= pg.evaluate("XOLook.prefs.sideW") <= 340
    grip.dblclick()
    assert pg.evaluate("XOLook.prefs.sideW") == 240

    # the picker from Appearance: Phosphor search, then Tabler, then back to the default
    pg.goto(BASE + "/#/appearance")
    pg.wait_for_selector(".look-screen")
    pg.locator('[data-key="screens"]').click()
    acc = pg.locator("#acc-icons")
    if acc.get_attribute("open") is None:
        acc.locator("summary").first.click()
    pg.locator('[data-fk="icon-today"]').click()
    pop = pg.locator(".icon-pop")
    expect(pop).to_be_visible()
    pop.get_by_role("radio", name="Phosphor").click()  # the default is a Tabler icon now, so the picker opens on Tabler
    pop.locator("#ip-search").fill("rocket")
    pop.locator('.ip-cell[data-name="rocket"]').click()
    expect(today.locator(".ico")).to_have_attribute("data-icon", "rocket")
    pop.get_by_role("radio", name="Tabler").click()
    expect(pop.locator(".ip-grid")).to_have_attribute("data-set", "tabler-outline")
    pop.locator('.ip-cell[data-name="rocket"]').click()
    expect(today.locator(".ico")).to_have_attribute("data-icon", "tabler/rocket")
    expect(today.locator(".ico svg")).to_have_count(1)
    assert pg.evaluate("XOLook.prefs.icons.today") == "tabler/rocket"
    pg.keyboard.press("Escape")
    expect(pop).to_have_count(0)
    pg.reload()
    pg.wait_for_selector(".look-screen")
    expect(today.locator(".ico svg")).to_have_count(1)
    assert today.locator(".ico").get_attribute("data-icon") == "tabler/rocket"
    today.click(button="right")
    expect(pop).to_be_visible()
    pop.get_by_role("button", name="Use the default").click()
    expect(today.locator(".ico")).to_have_attribute("data-icon", "tabler/sun")
    assert pg.evaluate("XOLook.prefs.icons.today === undefined")
    pg.keyboard.press("Escape")
    expect(pop).to_have_count(0)

    # icons can be turned off; a collapsed bar still shows them
    pg.evaluate("XOLook.change((s) => { s.prefs.navIcons = false; })")
    assert today.locator(".ico").evaluate("e => getComputedStyle(e).display") == "none"
    pg.evaluate("XOLook.change((s) => { s.prefs.side = 'icons'; })")
    assert today.locator(".ico").evaluate("e => getComputedStyle(e).display") != "none"
    pg.evaluate("XOLook.reset()")
    b.close()
print("errors:", errs or "none")
assert not errs
print("RAIL OK")
