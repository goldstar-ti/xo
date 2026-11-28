"""Appearance smoke test. Run straight after tests/e2e.py, against the same database.

python tests/e2e_look.py [base_url] [screenshot_dir]
"""

import os
import re
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
    # This test uses Settings and check-ins as full screens, so the right pane is off (see e2e_pane.py).
    ctx.add_init_script("localStorage.setItem('xo-pane', JSON.stringify({ off: true }))")
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "401" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE)
    pg.fill("#a-name", "tester")
    pg.fill("#a-pass", "orbit-walnut-ferry-linen-42")
    pg.get_by_role("button", name="Sign in").click()
    pg.wait_for_selector(".dayline", timeout=20000)

    # a fresh look uses Google Sans Flex for the body and Inter Tight for headings, both from the app's own origin
    body_fam = pg.evaluate("getComputedStyle(document.body).fontFamily").replace("'", "").replace('"', "")
    assert body_fam.startswith("Google Sans Flex"), body_fam
    head_fam = pg.evaluate("getComputedStyle(document.querySelector('h1')).fontFamily")
    head_fam = head_fam.replace("'", "").replace('"', "")
    assert head_fam.startswith("Inter Tight"), head_fam

    # quick panel
    def tab(key):
        pg.locator(f'[data-key="{key}"]').click()

    def acc(key):
        """Open an accordion (xo kit) if it is closed."""
        box = pg.locator(f"#acc-{key}")
        expect(box).to_be_visible()
        if box.get_attribute("open") is None:
            box.locator("summary").first.click()

    def fresh():
        pg.goto(BASE + "/#/appearance")
        pg.wait_for_selector(".look-screen")

    def step_to(sel, value):
        """Click one step of a stepped scale (the step carries its value)."""
        pg.locator(f'{sel} .xo-step[data-value="{value}"]').click()

    pg.locator(".top .look-btn").click()
    d = pg.locator("dialog[open]")
    d.get_by_role("button", name="Deep Space").click()
    expect(d.locator(".swatch.on")).to_have_text("Deep Space")
    d.locator('[data-fk="mode:dark"]').click()
    assert pg.evaluate("document.documentElement.dataset.scheme") == "dark"
    pg.screenshot(path=SHOTS / "look-panel.png")
    d.get_by_role("link", name="All appearance options").click()
    expect(pg.locator("h1")).to_have_text("Appearance")
    # opens on the Colour group in Standard; Text sizes is an Advanced accordion
    assert pg.evaluate("XOLook.prefs.view") == "standard"
    assert pg.evaluate("XOLook.prefs.lookTab") == "theme"
    # Zoom keys: . zooms in, , zooms out, m resets (global shortcuts, outside any text box).
    pg.evaluate("document.activeElement.blur()")
    z0 = pg.evaluate("XOLook.active().look.zoom")
    pg.keyboard.press(".")
    assert pg.evaluate("XOLook.active().look.zoom") == z0 + 10
    pg.keyboard.press(",")
    pg.keyboard.press(",")
    assert pg.evaluate("XOLook.active().look.zoom") == z0 - 10
    pg.keyboard.press("m")
    assert pg.evaluate("XOLook.active().look.zoom") == 100
    expect(pg.locator('[data-key="theme"]')).to_have_attribute("aria-selected", "true")
    tab("text")
    assert pg.evaluate("XOLook.prefs.lookTab") == "text"
    expect(pg.locator("#acc-type")).to_have_count(0)
    pg.locator('[data-fk="view:advanced"]').click()
    expect(pg.locator("#acc-type")).to_be_visible()
    pg.wait_for_selector('.look-screen[data-fonts="ready"]')
    # full screen: choices, fonts, dials
    tab("layout")
    acc("today_layout")
    pg.locator('[data-fk="hero:banner"]').click()
    pg.locator('[data-fk="dayline:cards"]').click()
    acc("lines_texture")
    pg.locator('[data-fk="texture:grid"]').click()
    tab("text")
    acc("fonts")
    pg.locator("#f-head").fill("Fraunces")
    pg.locator("#f-head").press("Enter")
    pg.locator("#f-num").fill("JetBrains")
    pg.locator("#f-num").press("Enter")
    tab("screens")
    pg.locator('[data-fk="clock:24"]').click()
    pg.fill("#p-call", "Captain")
    pg.locator("#p-call").blur()
    tab("layout")
    acc("spacing_size")
    step_to("#d-size", 14)
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert (
        st["base"]["hero"] == "banner"
        and st["base"]["dayline"] == "cards"
        and st["base"]["head"] == "fraunces"
        and st["base"]["num"] == "mono"
        and st["base"]["texture"] == "grid"
        and st["prefs"]["clock24"]
        and st["prefs"]["callMe"] == "Captain"
        and st["base"]["base"] == 14
    ), st
    # stepped scale: an arrow key moves one step, a preset chip sets a value, reset goes back to auto (base 14 here)
    pg.locator("#d-size").focus()
    pg.keyboard.press("ArrowLeft")
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")["base"]["base"] < 14
    pg.locator('[data-fk="d-size-preset-3"]').click()
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")["base"]["base"] == 20
    pg.locator('[data-fk="d-size-reset"]').click()
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")["base"]["base"] is None
    step_to("#d-size", 14)
    # my theme + look code round trip
    tab("theme")
    acc("fine_tune")
    pg.locator("#c-ah").focus()
    pg.keyboard.press("End")
    acc("my_themes")
    pg.fill('[data-fk="mytheme-name"]', "Tuesday Brain")
    pg.get_by_role("button", name="Save current colours").click()
    expect(pg.locator(".swatches .swatch.on")).to_have_text("Tuesday Brain")
    tab("share")
    code = pg.locator("textarea[readonly]").input_value()
    assert code.startswith("XO2-")
    pg.locator('[data-fk="undo"]').click()
    pg.locator('[data-fk="undo"]').click()
    tab("share")  # Undo restores the group that was showing then
    pg.fill('[data-fk="paste"]', code)
    pg.get_by_role("button", name="Apply code").click()
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look')).base.c.ah") == 360
    pg.fill('[data-fk="paste"]', "XO1-nope")
    pg.get_by_role("button", name="Apply code").click()
    expect(pg.locator("#toast")).to_contain_text("look code is incomplete")
    # tabs: put Bills in position 2 (swaps with wherever it was)
    tab("screens")
    acc("bottom_tabs")
    pg.select_option("#tab-1", "bills")
    assert pg.locator(".tabs a").nth(1).inner_text() == "Bills"
    # hide a Today block and move one
    acc("blocks")
    pg.locator('[data-fk="blk:coming"]').uncheck()
    pg.locator(".xo-sort-row", has_text="The day").locator(".xo-sort-up").click()
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
    fresh()
    tab("theme")
    acc("scheduled")
    pg.fill("#sch-name", "Night")
    pg.fill("#sch-from", "00:00")
    pg.fill("#sch-to", "23:59")
    pg.get_by_role("button", name="Add scheduled look").click()
    expect(pg.locator(".banner")).to_contain_text("Night")
    pg.locator('[data-fk="theme:wasabi"]').click()
    pg.locator('[data-fk="mode:light"]').click()
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert st["scheduled"][0]["look"]["theme"] == "wasabi" and st["base"]["theme"] != "wasabi"
    pg.goto(BASE + "/#/today")
    pg.wait_for_selector(".dayline")
    pg.screenshot(path=SHOTS / "look-today-wasabi.png")
    # surprise and reset (through the confirm dialog)
    fresh()
    tab("share")
    pg.locator('[data-fk="surprise"]').click()
    pg.locator('[data-fk="reset-all"]').click()
    expect(pg.locator("dialog[open]")).to_contain_text("Reset every appearance setting on this device?")
    pg.locator('[data-fk="reset-confirm"]').click()
    expect(pg.locator("dialog[open]")).to_have_count(0)
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert (
        st["base"]["theme"] == "ink"
        and st["scheduled"] == []
        and st["myThemes"] == []
        and st["prefs"]["title"] == "XO"
        and st["prefs"]["lookTab"] == "theme"
    ), st
    # engine: text-size roles, colour overrides, catalogue fonts, look code, reload
    css = "getComputedStyle(document.documentElement).getPropertyValue"
    pg.evaluate("document.body.insertAdjacentHTML('beforeend', '<section><h2 id=\"h2-probe\">x</h2></section>')")
    before = pg.evaluate("parseFloat(getComputedStyle(document.getElementById('h2-probe')).fontSize)")
    pg.evaluate("XOLook.change((s, lk) => { lk.fs.section = { size: 1.5 }; lk.mode = 'light'; })")
    assert pg.evaluate(css + "('--fs-section')") == "1.5rem"
    assert pg.evaluate("parseFloat(getComputedStyle(document.getElementById('h2-probe')).fontSize)") > before
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
    # a fresh look is Ink and a stored theme is kept; Today colour round-trips and junk cleans to Module colour
    assert pg.evaluate("XOLook.defaultLook().theme") == "ink"
    roundtrip = "XOLook.decode(XOLook.encode({ ...XOLook.defaultLook(), %s })).%s"
    assert pg.evaluate(roundtrip % ("theme: 'foliage'", "theme")) == "foliage"
    assert pg.evaluate("XOLook.defaultLook().todayColour") == "module"
    assert pg.evaluate(roundtrip % ("todayColour: 'ink'", "todayColour")) == "ink"
    assert pg.evaluate(roundtrip % ("todayColour: 'junk'", "todayColour")) == "module"
    pg.evaluate("XOLook.change((s, lk) => { lk.todayColour = 'ink'; })")
    assert pg.evaluate("document.documentElement.dataset.todayColour") == "ink"
    pg.evaluate("XOLook.change((s, lk) => { lk.todayColour = 'module'; })")
    assert pg.evaluate("document.documentElement.dataset.todayColour") == "module"
    v1 = "XO1-foliage.150.6.165.75.75.42.80.965.100.0.0.0.100.400.150.20.2.0.0.0.0.0.0.1.0.0"
    assert pg.evaluate("(c) => XOLook.decode(c)", v1)["space"] == 0.7
    assert pg.evaluate("XOLook.decode('XO2-@@@')") is None
    pg.evaluate(
        "XOLook.change((s, lk) => {"
        " lk.fs.section = { size: 1.5 }; lk.colours.light.leaf = '#ff0000'; lk.mode = 'light'; })"
    )
    pg.reload()
    pg.wait_for_selector("h1")
    assert pg.evaluate(css + "('--fs-section')") == "1.5rem"
    assert pg.evaluate(css + "('--leaf')").strip() == "#ff0000"
    pg.evaluate("XOLook.reset()")
    assert pg.evaluate(css + "('--fs-section')") == "0.9375rem"
    # component colours: derived from the base tokens until overridden
    pg.goto(BASE + "/#/today")
    pg.wait_for_selector("h1")
    pg.evaluate("XOLook.change((s, lk) => { lk.mode = 'light'; })")
    assert pg.evaluate("XOLook.COLOUR_GROUPS.length") == 13
    assert pg.evaluate("new Set(XOLook.COLOUR_TOKENS).size") == pg.evaluate("XOLook.COLOUR_TOKENS.length") == 68
    leaf = pg.evaluate(css + "('--leaf')").strip()
    assert leaf and pg.evaluate(css + "('--c-primary-bg')").strip() == leaf
    pg.evaluate(
        "document.body.insertAdjacentHTML('beforeend',"
        ' \'<button id="c-probe" class="primary" type="button">x</button>\')'
    )
    pg.evaluate("XOLook.change((s, lk) => { lk.colours.light['c-primary-bg'] = '#123456'; })")
    assert pg.evaluate("getComputedStyle(document.getElementById('c-probe')).backgroundColor") == "rgb(18, 52, 86)"
    assert pg.evaluate(css + "('--leaf')").strip() == leaf
    pg.evaluate("document.getElementById('c-probe').remove(); XOLook.reset()")
    # screen: Standard and Advanced
    fresh()
    expect(pg.locator('[data-key="theme"]')).to_have_attribute("aria-selected", "true")
    tab("text")
    expect(pg.locator("#acc-type")).to_have_count(0)
    pg.locator('[data-fk="view:advanced"]').click()
    pg.wait_for_selector('.look-screen[data-fonts="ready"]')
    acc("type")
    pg.locator('[data-fk="ts-group-headings"]').click()

    def open_row(rid):
        """In the narrow form (side pane, phone) a row's steppers show after a tap on its name."""
        if not pg.locator(f"#ts-{rid} .ts-cell").first.is_visible():
            pg.locator(f'[data-fk="ts-open-{rid}"]').click()

    open_row("section")
    row = pg.locator("#ts-section")
    expect(row).to_be_visible()
    # Size: base is 13 px, section is 0.9375 rem (12 px); one step up is 13 px and is stored as rem = px / base
    expect(row.locator(".xo-num").first).to_have_class(re.compile("inherited"))
    row.get_by_role("button", name="Increase Section titles, Size").click()
    assert pg.evaluate("XOLook.active().look.fs.section.size") == 1
    expect(pg.locator('[data-key="text"] .badge')).to_have_text("1")
    # Weight: Labels at 600, then a computed weight on a .xo-ctl-label
    open_row("label")
    pg.locator("#ts-label").get_by_role("button", name="Decrease Labels, Weight").click()
    assert pg.evaluate("XOLook.active().look.fs.label.weight") == 500
    pg.locator("#ts-label").get_by_role("button", name="Increase Labels, Weight").click()
    pg.locator("#ts-label").get_by_role("button", name="Increase Labels, Weight").click()
    assert pg.evaluate("XOLook.active().look.fs.label.weight") == 700
    pg.locator("#ts-label .xo-num-in").nth(1).fill("600")
    pg.locator("#ts-label .xo-num-in").nth(1).blur()
    assert pg.evaluate("XOLook.active().look.fs.label") is None, "typing the default weight drops it"
    pg.evaluate(
        "document.body.insertAdjacentHTML('beforeend', '<span id=\"lab-probe\" class=\"xo-ctl-label\">x</span>')"
    )
    pg.evaluate("XOLook.change((s, lk) => { lk.fs.label = { weight: 600 }; })")
    assert pg.evaluate("getComputedStyle(document.getElementById('lab-probe')).fontWeight") == "600"
    pg.evaluate("XOLook.change((s, lk) => { lk.fs.label = { weight: 300 }; })")
    assert pg.evaluate("getComputedStyle(document.getElementById('lab-probe')).fontWeight") == "300"
    pg.evaluate("document.getElementById('lab-probe').remove(); XOLook.change((s, lk) => { delete lk.fs.label; })")
    # a row reset appears only on changed rows
    expect(pg.locator('[data-fk="ts-reset-label"]')).to_have_count(0)
    expect(pg.locator('[data-fk="ts-reset-section"]')).to_have_count(1)
    pg.locator('[data-fk="view:standard"]').click()
    expect(pg.locator("#ts-section")).to_be_visible()
    expect(pg.locator('[data-fk="view:advanced"]')).to_have_text("Advanced (1 changed)")
    pg.locator('[data-fk="view:advanced"]').click()
    pg.get_by_role("button", name="Reset Text styles").click()
    assert pg.evaluate("XOLook.active().look.fs") == {}
    expect(pg.locator('[data-key="text"] .badge')).to_have_count(0)
    # All text: Size 15 px makes body 15 px, and a heading scales by the same ratio
    h1 = "parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)"
    before_h1 = pg.evaluate(h1)
    before_body = pg.evaluate("parseFloat(getComputedStyle(document.body).fontSize)")
    b0 = pg.evaluate("XOLook.active().look.base ?? XOLook.autoBase()")
    for n in (1, 2):
        open_row("all")
        pg.locator("#ts-all").get_by_role("button", name="Increase All text, Size").click()
        pg.wait_for_function(f"XOLook.active().look.base === {b0 + n}")
    assert pg.evaluate("getComputedStyle(document.body).fontSize") == f"{b0 + 2}px"
    ratio = pg.evaluate(h1) / before_h1
    assert abs(ratio - (b0 + 2) / before_body) < 0.02, ratio
    pg.evaluate("XOLook.change((s, lk) => { lk.base = null; })")
    # an older look: one weight, one fs number and the code size convert once
    old = pg.evaluate(
        "XOLook.decode('XO2-' + btoa(JSON.stringify({ v: 2, fs: { body: 1.0625 }, weight: 500, monoSize: 120 }))"
        ".replace(/=+$/, ''))"
    )
    assert old["fs"]["body"] == {"size": 1.0625} and old["wShift"] == 100, old
    assert old["fs"]["code"] == {"size": 1.2}, old
    assert "weight" not in old and "monoSize" not in old
    # the narrow form (side pane, phone): a summary under each name and one row open at a time
    pg.set_viewport_size({"width": 390, "height": 800})
    pg.reload()
    fresh()
    tab("text")
    acc("type")
    pg.wait_for_selector("#ts-all")
    expect(pg.locator(".ts-head")).to_be_hidden()
    expect(pg.locator("#ts-all .ts-sum")).to_be_visible()
    expect(pg.locator("#ts-all .ts-cells")).to_be_hidden()
    pg.locator('[data-fk="ts-open-all"]').click()
    expect(pg.locator("#ts-all .ts-cells")).to_be_visible()
    pg.locator('[data-fk="ts-open-body"]').click()
    expect(pg.locator("#ts-all .ts-cells")).to_be_hidden()
    expect(pg.locator("#ts-body .ts-cells")).to_be_visible()
    expect(pg.locator("#ts-body .ts-sum")).to_have_text("16 px, 400, 1.5, 0")  # auto base on a phone
    pg.set_viewport_size({"width": 1280, "height": 900})
    # size presets: Large sets three fields; moving the Text size dial makes it Custom
    pg.locator('[data-fk="size:large"]').click()
    assert pg.evaluate("XOLook.active().look.base") == 16
    expect(pg.locator('[data-fk="size:custom"]')).to_have_count(0)
    tab("layout")
    acc("spacing_size")
    step_to("#d-size", 14)
    tab("text")
    expect(pg.locator('[data-fk="size:custom"]')).to_have_attribute("aria-checked", "true")
    pg.locator('[data-fk="size:regular"]').click()
    assert pg.evaluate("XOLook.presetOf(XOLook.active().look)") == "regular"
    # a catalogue font from the font picker
    pg.locator("#f-body").fill("lora")
    pg.locator("#f-body").press("Enter")
    expect(pg.locator('link[data-xo-font="lora"]')).to_have_count(1)
    assert pg.evaluate("XOLook.active().look.body") == "g:lora|Lora"
    fam = pg.evaluate("getComputedStyle(document.body).fontFamily").replace("'", "").replace('"', "")
    assert fam.startswith("Lora"), fam
    acc("fonts")
    pg.locator("#f-mono").focus()
    expect(pg.locator("#f-mono ~ ul li[role=option]").first).to_be_visible()
    assert pg.locator("#f-mono ~ ul li[role=option]").count() > 7
    pg.locator("#f-mono").press("Escape")
    pg.evaluate("XOLook.change((s, lk) => { lk.body = 'atkinson'; })")
    # search: the Glass item is found under Effects; Clear returns to the group
    pg.locator("#look-search").fill("glass")
    expect(pg.locator(".look-panel h3", has_text="Effects")).to_be_visible()
    expect(pg.locator('[data-fk="glass-on"]')).to_be_visible()
    expect(pg.locator('[data-key="text"]')).not_to_have_attribute("aria-selected", "true")
    pg.locator(".xo-search-x").click()
    expect(pg.locator('[data-fk="glass-on"]')).to_have_count(0)
    expect(pg.locator('[data-key="text"]')).to_have_attribute("aria-selected", "true")
    pg.locator("#look-search").fill("zzzz")
    expect(pg.locator(".look-panel")).to_contain_text("Nothing matches.")
    pg.locator("#look-search").press("Escape")
    expect(pg.locator(".look-panel")).not_to_contain_text("Nothing matches.")
    # colour overrides: one token, in its own accordion; the preview follows
    tab("theme")
    pg.locator('[data-fk="mode:light"]').click()
    acc("colours-buttons")
    pg.locator('[data-fk="col-c-primary-bg-light"] input.xo-hex').fill("#aa0000")
    pg.locator('[data-fk="col-c-primary-bg-light"] input.xo-hex').press("Enter")
    assert pg.evaluate("XOLook.active().look.colours.light['c-primary-bg']") == "#aa0000"
    assert (
        pg.evaluate("getComputedStyle(document.querySelector('.look-preview-body .primary')).backgroundColor")
        == "rgb(170, 0, 0)"
    )
    expect(pg.locator('[data-key="theme"] .badge')).to_have_text("2")  # Mode (light) and the colour
    pg.get_by_role("button", name="Reset Colours: Buttons").click()
    assert pg.evaluate("XOLook.active().look.colours.light") == {}
    # my themes: save, export to a file, delete, import it back, then a bad paste
    acc("my_themes")
    pg.fill('[data-fk="mytheme-name"]', "e2e theme")
    pg.get_by_role("button", name="Save current colours").click()
    expect(pg.locator(".theme-list li")).to_have_count(1)
    with pg.expect_download() as dl:
        pg.locator('.theme-list [data-fk^="theme-menu-"]').click()
        pg.get_by_role("menuitem", name="Export").evaluate("el => el.click()")
    saved = Path(dl.value.path())
    assert dl.value.suggested_filename == "e2e-theme.xo-theme.json"
    import json

    file = json.loads(saved.read_text())
    assert file["xo"] == "colour-themes" and len(file["themes"]) == 1 and file["themes"][0]["name"] == "e2e theme"
    pg.locator('.theme-list [data-fk^="theme-menu-"]').click()
    pg.get_by_role("menuitem", name="Delete").evaluate("el => el.click()")
    expect(pg.locator(".theme-list li")).to_have_count(0)
    pg.set_input_files('[data-fk="theme-file"]', str(saved))
    expect(pg.locator("#toast")).to_contain_text("1 imported, 0 skipped.")
    expect(pg.locator(".theme-list li")).to_have_count(1)
    pg.locator("#acc-paste-theme summary").click()
    pg.fill('[data-fk="theme-paste"]', "{}")
    pg.locator('[data-fk="theme-import"]').click()
    expect(pg.locator("#toast")).to_contain_text("not an XO colour theme")
    expect(pg.locator(".theme-list li")).to_have_count(1)
    pg.evaluate("XOLook.change((s, l) => { s.myThemes = []; })")
    # desktop width: three columns, with the preview beside the settings
    pg.set_viewport_size({"width": 1280, "height": 900})
    fresh()
    expect(pg.locator(".xo-tabs-v")).to_be_visible()
    expect(pg.locator("aside.look-preview")).to_be_visible()
    cols = pg.evaluate("getComputedStyle(document.querySelector('.look-cols')).gridTemplateColumns.split(' ').length")
    assert cols == 3, cols
    pg.screenshot(path=SHOTS / "look-theme-desktop.png", full_page=True)
    # widget and tab colours: pick a palette for a widget on the screen, tune it, reset
    tab("screens")
    acc("ident")
    pg.locator('[data-fk="ident-w-tasks-none"]').click()
    pg.locator('[data-fk="ident-pick-raspberry-tart"]').click()
    ident = pg.evaluate("XOLook.active().look.ident.widgets.tasks")
    assert ident["swatch"] == "raspberry-tart" and ident["light"] == "#e63965" and ident["dark"] == "#f18fa8", ident
    step_to("#d-ident-w-tasks", 60)
    assert pg.evaluate("XOLook.active().look.ident.widgets.tasks.op") == 60
    pg.locator('[data-fk="ident-title-tasks"]').check()
    assert pg.evaluate("XOLook.active().look.ident.widgets.tasks.title") is True
    assert pg.locator("#xo-ident").evaluate("e => e.textContent").count("tasks") >= 2
    pg.get_by_role("button", name="Reset Widget and tab colours").click()
    assert pg.evaluate("XOLook.active().look.ident") == {"widgets": {}, "tabs": {}}
    # theme families: 30 families, 151 themes, every number inside the look's ranges
    fam = pg.evaluate("""import('/js/family-themes.js').then(m => {
      const r = XOLook.COLOUR_RANGE, themes = m.FAMILIES.flatMap(f => f.themes);
      const bad = themes.filter(t => Object.keys(r).some(k => !(t.c[k] >= r[k][0] && t.c[k] <= r[k][1])));
      return { families: m.FAMILIES.length, themes: themes.length, bad: bad.length, hues: m.FAMILY_HUES };
    })""")
    assert fam == {"families": 30, "themes": 151, "bad": 0, "hues": ["Red", "Green", "Blue"]}, fam
    # choose one through the picker (it sits in the Theme families accordion)
    tab("theme")
    acc("families")
    pg.locator('[data-fk="theme:fam:raspberry-tart"]').click()
    lk = pg.evaluate("XOLook.active().look")
    assert lk["theme"] == "fam:raspberry-tart" and (0 <= lk["c"]["ah"] <= 40 or lk["c"]["ah"] >= 340), lk
    assert pg.evaluate(css + "('--ah')").strip() == str(lk["c"]["ah"])
    expect(pg.locator('[data-fk="theme:fam:raspberry-tart"]')).to_have_attribute("aria-pressed", "true")
    # family tiles carry their name inside and sit two to a row on a phone
    first = pg.locator(".family-picker .swatch").first
    assert first.inner_text().strip() == first.get_attribute("aria-label")
    pg.set_viewport_size({"width": 390, "height": 880})
    cols = pg.evaluate(
        "getComputedStyle(document.querySelector('.family-picker .swatches')).gridTemplateColumns.split(' ').length"
    )
    assert cols == 2, cols
    pg.set_viewport_size({"width": 1280, "height": 900})
    # complete colour themes: export with one override, reset, import, apply
    pg.locator('[data-fk="mode:light"]').click()
    pg.evaluate("XOLook.change((s, l) => { l.colours.light.leaf = '#aa0000'; l.strength = 1.3; })")
    file = pg.evaluate("XOLook.exportThemes([])")
    assert file["xo"] == "colour-themes" and file["version"] == 1 and len(file["themes"]) == 1, file
    assert file["themes"][0]["colours"]["light"] == {"leaf": "#aa0000"} and file["themes"][0]["strength"] == 1.3
    pg.evaluate("XOLook.change((s, l) => { l.colours = { light: {}, dark: {} }; l.strength = 1; })")
    before = pg.evaluate("XOLook.state.myThemes.length")
    r = pg.evaluate("f => XOLook.importThemes(f)", file)
    assert r == {"added": 1, "skipped": 0}, r
    assert pg.evaluate("XOLook.state.myThemes.length") == before + 1
    mine = pg.evaluate("XOLook.state.myThemes[XOLook.state.myThemes.length - 1]")
    pg.evaluate(
        "id => XOLook.change((s, l) => { const m = s.myThemes.find(x => x.id === id);"
        " l.theme = 'my:' + id; l.c = m.c; l.strength = m.strength; l.colours = m.colours; })",
        mine["id"],
    )
    got = pg.evaluate("XOLook.active().look")
    assert (
        got["strength"] == 1.3 and got["colours"]["light"] == {"leaf": "#aa0000"} and got["c"] == file["themes"][0]["c"]
    ), got
    bad = pg.evaluate("XOLook.importThemes({ xo: 'other' })")
    assert bad["error"] is True and bad["added"] == 0 and pg.evaluate("XOLook.state.myThemes.length") == before + 1
    pg.evaluate("f => XOLook.importThemes(f)", file)
    names = pg.evaluate("XOLook.state.myThemes.map(m => m.name)")
    assert names[-1] == names[-2] + " (2)", names
    pg.evaluate("XOLook.change((s, l) => { s.myThemes = []; l.colours = { light: {}, dark: {} }; l.strength = 1; })")
    # screenshots for a look at layout: 1280 and 412 wide, light and dark, Advanced
    for width, height in ((1280, 900), (412, 880)):
        pg.set_viewport_size({"width": width, "height": height})
        fresh()
        for mode in ("light", "dark"):
            pg.evaluate("m => XOLook.change((s, l) => { l.mode = m; })", mode)
            for key in ("theme", "text", "layout", "screens"):
                tab(key)
                pg.screenshot(path=SHOTS / f"s3c-{width}-{mode}-{key}.png", full_page=True)
    # a phone-width strip scrolls and the preview starts closed
    pg.set_viewport_size({"width": 360, "height": 800})
    fresh()
    assert pg.evaluate("getComputedStyle(document.querySelector('.look-cols > .xo-tabs')).overflowX") == "auto"
    assert pg.locator("aside.look-preview").count() == 0
    assert pg.evaluate("document.querySelector('#acc-preview').open") is False
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
    pg.evaluate("XOLook.change((s, l) => { l.mode = 'auto'; })")
    # background pattern: per device, kept over a reload, cleared by None and by strength 0; look codes carry it
    pg.set_viewport_size({"width": 1280, "height": 900})
    fresh()
    pattern_var = "document.documentElement.style.getPropertyValue('--xo-pattern')"
    assert pg.evaluate(pattern_var) == "" and pg.evaluate("document.documentElement.dataset.pattern") == "off"
    tab("layout")
    acc("pattern")
    pg.locator('[data-fk="pattern:hexagons"]').click()
    pg.wait_for_function(f"{pattern_var}.startsWith('url(')")
    assert pg.evaluate("document.documentElement.dataset.pattern") == "on"
    assert pg.evaluate("XOLook.active().look.pattern.kind") == "hexagons"
    assert pg.evaluate("/^[a-z0-9]{4,32}$/.test(XOLook.active().look.pattern.seed)")
    assert pg.evaluate("getComputedStyle(document.body).backgroundImage").startswith("url(")
    uri = pg.evaluate(pattern_var)
    pg.reload()
    pg.wait_for_selector(".look-screen")
    pg.wait_for_function(f"{pattern_var}.startsWith('url(')")
    assert pg.evaluate(pattern_var) == uri  # the same seed draws the same pattern
    # a palette swatch changes the drawing; the strength dial at 0 clears it
    pg.evaluate(
        "XOLook.change((s, l) => { Object.assign(l.pattern, {"
        " swatch: 'raspberry-tart', light: '#e63965', dark: '#f18fa8' }); })"
    )
    pg.wait_for_function(f"{pattern_var}.startsWith('url(') && {pattern_var} !== {uri!r}")
    fresh()
    tab("layout")
    acc("pattern")
    step_to("#d-patpct", 0)
    pg.wait_for_function(f"{pattern_var} === ''")
    assert pg.evaluate("document.documentElement.dataset.pattern") == "off"
    pg.evaluate("XOLook.change((s, l) => { l.pattern.pct = 20; })")
    pg.wait_for_function(f"{pattern_var}.startsWith('url(')")
    pg.locator('[data-fk="pattern:none"]').click()
    pg.wait_for_function(f"{pattern_var} === ''")
    assert pg.evaluate("document.documentElement.dataset.pattern") == "off"
    # look codes round-trip the new fields; junk is cleaned to the defaults
    got = pg.evaluate(
        """() => {
          XOLook.change((s, l) => {
            l.pattern = { kind: 'plaid', swatch: 'raspberry-tart', light: '#e63965',
              dark: '#f18fa8', pct: 25, seed: 'abc12345' };
            l.motion = 'reduce';
          });
          const back = XOLook.decode(XOLook.encode(XOLook.active().look));
          return { pattern: back.pattern, motion: back.motion };
        }"""
    )
    assert got["motion"] == "reduce", got
    assert got["pattern"] == {
        "kind": "plaid",
        "swatch": "raspberry-tart",
        "light": "#e63965",
        "dark": "#f18fa8",
        "pct": 25,
        "seed": "abc12345",
    }, got
    junk = pg.evaluate(
        """() => {
          const raw = { motion: 'sideways',
            pattern: { kind: 'zigzag', swatch: 'Bad Slug', light: 'red', dark: '#12', pct: 'lots', seed: '!!' } };
          const bin = String.fromCharCode(...new TextEncoder().encode(JSON.stringify(raw)));
          const code = 'XO2-' + btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
          const back = XOLook.decode(code);
          return { pattern: back.pattern, motion: back.motion };
        }"""
    )
    assert junk["motion"] == "system", junk
    assert junk["pattern"] == {"kind": "none", "swatch": "", "light": "", "dark": "", "pct": 12, "seed": ""}, junk
    # Motion: Reduce and Full win over the device; Follow device follows it, live
    motion = "document.documentElement.dataset.xoMotion"
    pg.emulate_media(reduced_motion="reduce")
    for choice, want in (("system", "still"), ("full", "full"), ("reduce", "still")):
        pg.evaluate("c => XOLook.change((s, l) => { l.motion = c; })", choice)
        assert pg.evaluate(motion) == want, (choice, pg.evaluate(motion))
    pg.emulate_media(reduced_motion="no-preference")
    assert pg.evaluate(motion) == "still"  # Reduce stays Reduce
    pg.evaluate("XOLook.change((s, l) => { l.motion = 'system'; })")
    assert pg.evaluate(motion) == "full"
    pg.emulate_media(reduced_motion="reduce")
    pg.wait_for_function(f"{motion} === 'still'")  # the device changed while Follow device was on
    # Fluid text: the root size grows with the window on a wide screen, and Off keeps the laptop size
    root_px = "parseFloat(getComputedStyle(document.documentElement).fontSize)"
    pg.evaluate("XOLook.change((s, l) => { l.fluid = 'on'; l.base = null; })")
    sizes = {}
    for width in (1280, 1920, 3000, 5120):
        pg.set_viewport_size({"width": width, "height": 1400})
        sizes[width] = pg.evaluate(root_px)
    print("root font size, fluid on:", sizes)
    pg.evaluate("XOLook.change((s, l) => { l.fluid = 'off'; })")
    assert pg.evaluate("document.documentElement.dataset.fluid") == "off"
    pg.set_viewport_size({"width": 3000, "height": 1400})
    off_3000 = pg.evaluate(root_px)
    pg.set_viewport_size({"width": 1280, "height": 1400})
    off_1280 = pg.evaluate(root_px)
    assert sizes[3000] > off_3000, (sizes, off_3000)
    assert off_3000 == off_1280 == 13, (off_3000, off_1280)
    assert sizes[1280] == 13 and abs(sizes[5120] - 19.5) < 0.6 and sizes[5120] > sizes[1920], sizes
    back = pg.evaluate("XOLook.decode(XOLook.encode(XOLook.active().look)).fluid")
    assert back == "off", back
    code = pg.evaluate(
        """() => {
          const bin = String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ fluid: 'sideways' })));
          const code = 'XO2-' + btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
          return XOLook.decode(code).fluid;
        }"""
    )
    assert code == "off", code
    pg.evaluate("XOLook.change((s, l) => { l.fluid = 'on'; })")
    pg.set_viewport_size({"width": 1280, "height": 900})
    # Canvas widget dials: attributes and --w-scale follow the look, survive an XO2- code, and junk cleans to defaults
    root_attr = "(n) => document.documentElement.getAttribute(n)"
    pg.evaluate(
        "XOLook.change((s, l) => { Object.assign(l, { wChrome: 'stripe', wHead: 'slim', wTitleFont: 'num',"
        " wInner: 'show', wScale: 120 }); })"
    )
    assert pg.evaluate(root_attr, "data-w-chrome") == "stripe"
    assert pg.evaluate(root_attr, "data-w-head") == "slim"
    assert pg.evaluate(root_attr, "data-w-title-font") == "num"
    assert pg.evaluate(root_attr, "data-w-inner") == "show"
    assert pg.evaluate("document.documentElement.style.getPropertyValue('--w-scale')") == "1.2"
    back = pg.evaluate(
        "() => { const b = XOLook.decode(XOLook.encode(XOLook.active().look));"
        " return [b.wChrome, b.wHead, b.wTitleFont, b.wInner, b.wScale]; }"
    )
    assert back == ["stripe", "slim", "num", "show", 120], back
    junk = pg.evaluate(
        """() => {
          const raw = { wChrome: 'neon', wHead: 7, wTitleFont: 'comic', wInner: null, wScale: 'big' };
          const bin = String.fromCharCode(...new TextEncoder().encode(JSON.stringify(raw)));
          const code = 'XO2-' + btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
          const b = XOLook.decode(code);
          const hi = XOLook.decode('XO2-eyJ3U2NhbGUiOjkwMH0');
          return [b.wChrome, b.wHead, b.wTitleFont, b.wInner, b.wScale, hi.wScale];
        }"""
    )
    assert junk == ["card", "full", "head", "hide", 100, 150], junk
    # the controls in Appearance: Layout, Canvas widgets
    tab("layout")
    acc("canvas_widgets")
    pg.locator('[data-fk="wChrome:outline"]').click()
    assert pg.evaluate("XOLook.active().look.wChrome") == "outline"
    assert pg.evaluate(root_attr, "data-w-chrome") == "outline"
    pg.evaluate(
        "XOLook.change((s, l) => { Object.assign(l, { wChrome: 'card', wHead: 'full',"
        " wTitleFont: 'head', wInner: 'hide', wScale: 100 }); })"
    )
    # the opening screen pref is cleaned and set in Appearance, Screens
    assert pg.evaluate("XOLook.state.prefs.start") == "auto"
    tab("screens")
    pg.locator('[data-fk="start:canvas"]').click()
    assert pg.evaluate("XOLook.state.prefs.start") == "canvas"
    pg.evaluate("XOLook.change((s) => { s.prefs.start = 'sideways'; })")
    assert pg.evaluate("XOLook.state.prefs.start") == "auto"
    # the control in Appearance sets it
    tab("effects")
    pg.locator('[data-fk="motion:full"]').click()
    assert pg.evaluate("XOLook.active().look.motion") == "full" and pg.evaluate(motion) == "full"
    # a dialog fades and rises in with Full, and runs no animation at all with Reduce
    tab("share")
    pg.locator('[data-fk="reset-all"]').click()
    expect(pg.locator("dialog[open]")).to_have_count(1)
    pg.keyboard.press("Escape")
    expect(pg.locator("dialog[open]")).to_have_count(0)
    n_full = pg.evaluate(
        "() => { document.querySelector('[data-fk=\"reset-all\"]').click();"
        " return document.querySelector('dialog[open]').getAnimations().length; }"
    )
    assert n_full >= 1, n_full
    pg.keyboard.press("Escape")
    expect(pg.locator("dialog[open]")).to_have_count(0)
    pg.evaluate("XOLook.change((s, l) => { l.motion = 'reduce'; })")
    pg.locator('[data-fk="reset-all"]').click()
    expect(pg.locator("dialog[open]")).to_have_count(1)
    assert pg.evaluate("document.getAnimations().length") == 0, pg.evaluate(
        "document.getAnimations().map(a => a.animationName)"
    )
    pg.keyboard.press("Escape")
    expect(pg.locator("dialog[open]")).to_have_count(0)
    pg.emulate_media(reduced_motion="no-preference")
    pg.evaluate("XOLook.change((s, l) => { l.motion = 'system'; l.pattern.kind = 'none'; })")
    # reset everything through the confirm dialog; the view goes back to Standard
    tab("share")
    pg.locator('[data-fk="reset-all"]').click()
    pg.locator('[data-fk="reset-confirm"]').click()
    expect(pg.locator("dialog[open]")).to_have_count(0)
    assert pg.evaluate("XOLook.prefs.view") == "standard"
    tab("text")
    expect(pg.locator("#acc-type")).to_have_count(0)
    # body text is 13 px on a desktop at base auto, and 16 px at phone width
    pg.set_viewport_size({"width": 1280, "height": 900})
    assert pg.evaluate("getComputedStyle(document.body).fontSize") == "13px"
    # one-time move of a saved look onto Design 2: Ink, the new fonts, fluid off, auto base; other settings are kept
    pg.evaluate(
        """() => {
          const f = XOLook.colourOf('foliage');
          localStorage.setItem('xo-look', JSON.stringify({ v: 1, base: { theme: 'foliage', c: f, body: 'atkinson',
            head: 'same', fluid: 'on', size: 100 }, prefs: { clock24: true } }));
        }"""
    )
    pg.reload()
    pg.wait_for_selector(".dayline")
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert st["v"] == 2 and st["prefs"]["clock24"] is True, st
    assert st["base"]["theme"] == "ink" and st["base"]["body"] == "gsflex" and st["base"]["head"] == "intertight", st
    assert st["base"]["fluid"] == "off" and st["base"]["base"] is None, st
    assert pg.evaluate("document.documentElement.dataset.fluid") == "off"
    # picking Foliage afterwards stays Foliage through a reload (the move runs once)
    fresh()
    tab("theme")
    pg.locator('[data-fk="theme:foliage"]').click()
    pg.reload()
    pg.wait_for_selector(".look-screen")
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look')).base.theme") == "foliage"
    # an old percent size converts to a base size, and fluid on at 5120 wide grows the root to about 19.5 px
    assert pg.evaluate("XOLook.decode(XOLook.encode({ ...XOLook.defaultLook(), size: 114 })).base") == 15
    pg.evaluate("XOLook.change((s, l) => { l.fluid = 'on'; l.base = null; })")
    pg.set_viewport_size({"width": 5120, "height": 1400})
    root_5k = pg.evaluate("parseFloat(getComputedStyle(document.documentElement).fontSize)")
    assert abs(root_5k - 19.5) < 0.6, root_5k
    pg.set_viewport_size({"width": 1280, "height": 900})
    b.close()
print("errors:", errs or "none")
assert not errs
print("LOOK OK")
