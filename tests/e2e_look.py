"""Appearance smoke test. Run straight after tests/e2e.py, against the same database.

python tests/e2e_look.py [base_url] [screenshot_dir]
"""

import os
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
SHOTS = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/xo-shots")
SHOTS.mkdir(parents=True, exist_ok=True)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"]
    )
    ctx = b.new_context(
        viewport={"width": 412, "height": 880}, device_scale_factor=2, timezone_id="Australia/Perth", locale="en-AU"
    )
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "401" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE)
    pg.fill("#a-name", "tester")
    pg.fill("#a-pass", "orbit-walnut-ferry-linen-42")
    pg.get_by_role("button", name="Sign in").click()
    pg.wait_for_selector(".dayline", timeout=20000)
    # quick panel
    pg.locator(".top .look-btn").click()
    d = pg.locator("dialog[open]")
    d.get_by_role("button", name="Deep Space").click()
    expect(d.locator(".swatch.on")).to_have_text("Deep Space")
    d.get_by_role("button", name="Dark", exact=True).click()
    assert pg.evaluate("document.documentElement.dataset.scheme") == "dark"
    pg.screenshot(path=SHOTS / "look-panel.png")
    d.get_by_role("link", name="All appearance options").click()
    expect(pg.locator("h1")).to_have_text("Appearance")
    # Standard hides the advanced sections; Advanced shows them
    assert pg.evaluate("XOLook.prefs.view") == "standard"
    expect(pg.get_by_role("heading", name="Text sizes")).to_be_hidden()
    pg.locator('[data-fk="view:advanced"]').click()
    expect(pg.get_by_role("heading", name="Text sizes")).to_be_visible()
    # full screen: a few dials
    pg.get_by_role("button", name="Banner").click()
    pg.get_by_role("button", name="Cards", exact=True).click()
    pg.select_option("#f-head", "fraunces")
    pg.select_option("#f-num", "mono")
    pg.get_by_role("button", name="Grid paper").click()
    pg.get_by_role("button", name="24-hour (14:30)").click()
    pg.fill("#p-call", "Captain")
    pg.locator("#p-call").blur()
    pg.locator("#d-size").fill("110")
    pg.locator("#d-size").dispatch_event("change")
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert (
        st["base"]["hero"] == "banner"
        and st["base"]["dayline"] == "cards"
        and st["prefs"]["clock24"]
        and st["prefs"]["callMe"] == "Captain"
        and st["base"]["size"] == 110
    ), st
    # slider controls: - and + buttons, number box, reset (size is 110 here)
    pg.locator('[data-fk="d-size-more"]').click()
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")["base"]["size"] == 111
    pg.locator('[data-fk="d-size-num"]').fill("120")
    pg.locator('[data-fk="d-size-num"]').dispatch_event("change")
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")["base"]["size"] == 120
    pg.locator('[data-fk="d-size-reset"]').click()
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")["base"]["size"] == 100
    pg.locator("#d-size").fill("110")
    pg.locator("#d-size").dispatch_event("change")
    # my theme + look code round trip
    pg.locator("#c-ah").fill("200")
    pg.locator("#c-ah").dispatch_event("change")
    pg.fill('[data-fk="mytheme-name"]', "Tuesday Brain")
    pg.get_by_role("button", name="Save current colours").click()
    expect(pg.locator(".swatch.on")).to_have_text("Tuesday Brain")
    code = pg.locator("textarea.code").input_value()
    assert code.startswith("XO2-")
    pg.get_by_role("button", name="Undo", exact=True).click()
    pg.get_by_role("button", name="Undo", exact=True).click()
    pg.fill('[data-fk="paste"]', code)
    pg.get_by_role("button", name="Apply code").click()
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look')).base.c.ah") == 200
    pg.fill('[data-fk="paste"]', "XO1-nope")
    pg.get_by_role("button", name="Apply code").click()
    expect(pg.locator("#toast")).to_contain_text("look code is incomplete")
    # tabs: put Bills in position 2 (swaps with wherever it was)
    pg.select_option("#tab-1", "bills")
    assert pg.locator(".tabs a").nth(1).inner_text() == "Bills"
    # hide a Today block and move one
    pg.locator('[data-fk="blk:coming"]').uncheck()
    pg.locator('[data-fk="up:day"]').click()
    pg.screenshot(path=SHOTS / "look-appearance.png", full_page=True)
    pg.goto(BASE + "/#/today")
    pg.wait_for_selector(".dayline")
    assert pg.locator(".greet").inner_text().endswith("Captain.")
    assert pg.get_by_role("heading", name="Coming up").count() == 0
    assert (
        ":" in pg.locator(".dayline .t").first.inner_text() and "m" not in pg.locator(".dayline .t").first.inner_text()
    )
    pg.screenshot(path=SHOTS / "look-today-space.png", full_page=False)
    # reload: applied before paint from this device's storage
    pg.reload()
    pg.wait_for_selector(".dayline")
    assert pg.evaluate("document.documentElement.dataset.hero") == "banner"
    # scheduled look covering now
    pg.goto(BASE + "/#/appearance")
    pg.fill("#sch-name", "Night")
    pg.fill("#sch-from", "00:00")
    pg.fill("#sch-to", "23:59")
    pg.get_by_role("button", name="Add scheduled look").click()
    expect(pg.locator(".banner")).to_contain_text("Night")
    pg.get_by_role("button", name="Wasabi").click()
    pg.get_by_role("button", name="Light", exact=True).click()
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert st["scheduled"][0]["look"]["theme"] == "wasabi" and st["base"]["theme"] != "wasabi"
    pg.goto(BASE + "/#/today")
    pg.wait_for_selector(".dayline")
    pg.screenshot(path=SHOTS / "look-today-wasabi.png")
    # surprise and reset
    pg.goto(BASE + "/#/appearance")
    pg.get_by_role("button", name="Surprise me").click()
    pg.get_by_role("button", name="Reset everything").click()
    pg.get_by_role("button", name="Tap again to reset").click()
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert (
        st["base"]["theme"] == "foliage"
        and st["scheduled"] == []
        and st["myThemes"] == []
        and st["prefs"]["title"] == "XO"
    ), st
    # engine: text-size roles, colour overrides, catalogue fonts, look code, reload
    css = "getComputedStyle(document.documentElement).getPropertyValue"
    before = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('h2')).fontSize)")
    pg.evaluate("XOLook.change((s, lk) => { lk.fs.section = 1.5; lk.mode = 'light'; })")
    assert pg.evaluate(css + "('--fs-section')") == "1.5rem"
    assert pg.evaluate("parseFloat(getComputedStyle(document.querySelector('h2')).fontSize)") > before
    pg.evaluate("XOLook.change((s, lk) => { lk.colours.light.leaf = '#ff0000'; })")
    assert pg.evaluate(css + "('--leaf')").strip() == "#ff0000"
    pg.evaluate("XOLook.change((s, lk) => { lk.mode = 'dark'; })")
    assert pg.evaluate(css + "('--leaf')").strip() != "#ff0000"
    pg.evaluate("XOLook.change((s, lk) => { lk.mode = 'light'; lk.body = 'g:lora|Lora'; })")
    assert pg.locator('link[data-xo-font="lora"]').count() == 1
    assert "Lora" in pg.evaluate(css + "('--font-body')")
    pg.evaluate("XOLook.change((s, lk) => { lk.zoom = 110; lk.glassAlpha = 30; lk.figure = 'tint'; })")
    assert pg.evaluate("document.documentElement.dataset.figure") == "tint"
    assert pg.evaluate(css + "('--glass-alpha')").strip() == "0.3"
    pg.evaluate("XOLook.change((s, lk) => { lk.zoom = 100; lk.glassAlpha = 0; lk.figure = 'plain'; })")
    same = pg.evaluate(
        "(() => { const l = XOLook.active().look;"
        " return JSON.stringify(XOLook.decode(XOLook.encode(l))) === JSON.stringify(l); })()"
    )
    assert same
    old = pg.evaluate("XOLook.encode(XOLook.defaultLook())")
    assert old.startswith("XO2-")
    v1 = "XO1-foliage.150.6.165.75.75.42.80.965.100.0.0.0.100.400.150.20.2.0.0.0.0.0.0.1.0.0"
    assert pg.evaluate("(c) => XOLook.decode(c)", v1)["space"] == 0.7
    assert pg.evaluate("XOLook.decode('XO2-@@@')") is None
    pg.evaluate(
        "XOLook.change((s, lk) => { lk.fs.section = 1.5; lk.colours.light.leaf = '#ff0000'; lk.mode = 'light'; })"
    )
    pg.reload()
    pg.wait_for_selector("h1")
    assert pg.evaluate(css + "('--fs-section')") == "1.5rem"
    assert pg.evaluate(css + "('--leaf')").strip() == "#ff0000"
    pg.evaluate("XOLook.reset()")
    assert pg.evaluate(css + "('--fs-section')") == ""
    # screen: Standard and Advanced
    pg.goto(BASE + "/#/appearance")
    pg.wait_for_selector("h1")
    expect(pg.get_by_role("heading", name="Text sizes")).to_be_hidden()
    pg.locator('[data-fk="view:advanced"]').click()
    expect(pg.get_by_role("heading", name="Text sizes")).to_be_visible()
    pg.locator("#fs-section").select_option("1.5")
    assert pg.evaluate("XOLook.active().look.fs.section") == 1.5
    pg.locator('[data-fk="view:standard"]').click()
    expect(pg.locator("#fs-section")).to_be_visible()
    expect(pg.locator("#fs-page")).to_be_hidden()
    expect(pg.locator('[data-fk="view:advanced"]')).to_have_text("Advanced (1 changed)")
    pg.locator('[data-fk="view:advanced"]').click()
    pg.get_by_role("button", name="Reset text sizes").click()
    assert pg.evaluate("XOLook.active().look.fs") == {}
    # size presets: Large sets three fields; moving the Text size dial makes it Custom
    pg.locator('[data-fk="size:large"]').click()
    assert pg.evaluate("XOLook.active().look.size") == 114
    expect(pg.locator('[data-fk="size:custom"]')).to_have_attribute("aria-pressed", "false")
    pg.locator("#d-size").fill("110")
    pg.locator("#d-size").dispatch_event("change")
    expect(pg.locator('[data-fk="size:custom"]')).to_have_attribute("aria-pressed", "true")
    pg.locator('[data-fk="size:regular"]').click()
    assert pg.evaluate("XOLook.presetOf(XOLook.active().look)") == "regular"
    # a catalogue font from the grouped select
    pg.locator("#f-body").select_option("g:lora|Lora")
    expect(pg.locator('link[data-xo-font="lora"]')).to_have_count(1)
    fam = pg.evaluate("getComputedStyle(document.body).fontFamily").replace("'", "").replace('"', "")
    assert fam.startswith("Lora"), fam
    pg.locator("#f-mono option").nth(1).wait_for(state="attached")
    assert pg.locator("#f-mono option").count() > 7
    pg.get_by_role("button", name="Reset type").click()
    assert pg.evaluate("XOLook.active().look.body") == "atkinson"
    # colour overrides from the table
    pg.locator('[data-fk="mode:light"]').click()
    pg.locator('[data-fk="col-leaf-light"]').fill("#aa0000")
    assert pg.evaluate(css + "('--leaf')").strip() == "#aa0000"
    pg.get_by_role("button", name="Reset light colours").click()
    assert pg.evaluate(css + "('--leaf')").strip() != "#aa0000"
    assert pg.evaluate("XOLook.active().look.colours.light") == {}
    # desktop width
    pg.set_viewport_size({"width": 1280, "height": 900})
    pg.goto(BASE + "/#/appearance")
    expect(pg.get_by_role("heading", name="Colours", exact=True)).to_be_visible()
    expect(pg.locator(".colour-table")).to_be_visible()
    pg.screenshot(path=SHOTS / "look-advanced-desktop.png", full_page=True)
    # widget and tab colours: pick a palette for a widget on the screen, tune it, reset
    pg.locator('[data-fk="view:advanced"]').click()
    expect(pg.get_by_role("heading", name="Widget and tab colours")).to_be_visible()
    pg.locator('[data-fk="ident-w-tasks-none"]').click()
    pg.locator('[data-fk="ident-pick-raspberry-tart"]').click()
    ident = pg.evaluate("XOLook.active().look.ident.widgets.tasks")
    assert ident["swatch"] == "raspberry-tart" and ident["light"] == "#e63965" and ident["dark"] == "#f18fa8", ident
    pg.locator('[data-fk="d-ident-w-tasks-num"]').fill("60")
    pg.locator('[data-fk="d-ident-w-tasks-num"]').dispatch_event("change")
    assert pg.evaluate("XOLook.active().look.ident.widgets.tasks.op") == 60
    pg.locator('[data-fk="ident-title-tasks"]').check()
    assert pg.evaluate("XOLook.active().look.ident.widgets.tasks.title") is True
    assert pg.locator("#xo-ident").evaluate("e => e.textContent").count("tasks") >= 2
    pg.get_by_role("button", name="Reset widget and tab colours").click()
    assert pg.evaluate("XOLook.active().look.ident") == {"widgets": {}, "tabs": {}}
    pg.get_by_role("button", name="Reset everything").click()
    pg.get_by_role("button", name="Tap again to reset").click()
    assert pg.evaluate("XOLook.prefs.view") == "standard"
    expect(pg.get_by_role("heading", name="Text sizes")).to_be_hidden()
    b.close()
print("errors:", errs or "none")
assert not errs
print("LOOK OK")
