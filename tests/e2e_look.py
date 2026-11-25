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
    b = p.chromium.launch(executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 412, "height": 880}, device_scale_factor=2, timezone_id="Australia/Perth", locale="en-AU")
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "401" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE)
    pg.fill("#a-name", "tester"); pg.fill("#a-pass", "orbit-walnut-ferry-linen-42"); pg.get_by_role("button", name="Sign in").click()
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
    # full screen: a few dials
    pg.get_by_role("button", name="Banner").click()
    pg.get_by_role("button", name="Cards").click()
    pg.select_option("#f-head", "fraunces"); pg.select_option("#f-num", "mono")
    pg.get_by_role("button", name="Grid paper").click()
    pg.get_by_role("button", name="24-hour (14:30)").click()
    pg.fill("#p-call", "Captain"); pg.locator("#p-call").blur()
    pg.locator("#d-size").fill("110"); pg.locator("#d-size").dispatch_event("change")
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert st["base"]["hero"] == "banner" and st["base"]["dayline"] == "cards" and st["prefs"]["clock24"] and st["prefs"]["callMe"] == "Captain" and st["base"]["size"] == 110, st
    # my theme + look code round trip
    pg.locator("#c-ah").fill("200"); pg.locator("#c-ah").dispatch_event("change")
    pg.fill('[data-fk="mytheme-name"]', "Tuesday Brain"); pg.get_by_role("button", name="Save current colours").click()
    expect(pg.locator(".swatch.on")).to_have_text("Tuesday Brain")
    code = pg.locator("textarea.code").input_value(); assert code.startswith("XO1-")
    pg.get_by_role("button", name="Undo", exact=True).click(); pg.get_by_role("button", name="Undo", exact=True).click()
    pg.fill('[data-fk="paste"]', code); pg.get_by_role("button", name="Apply code").click()
    assert pg.evaluate("JSON.parse(localStorage.getItem('xo-look')).base.c.ah") == 200
    pg.fill('[data-fk="paste"]', "XO1-nope"); pg.get_by_role("button", name="Apply code").click()
    expect(pg.locator("#toast")).to_contain_text("not a complete look code")
    # tabs: put Bills in position 2 (swaps with wherever it was)
    pg.select_option("#tab-1", "bills")
    assert pg.locator(".tabs a").nth(1).inner_text() == "Bills"
    # hide a Today block and move one
    pg.locator('[data-fk="blk:coming"]').uncheck(); pg.locator('[data-fk="up:day"]').click()
    pg.screenshot(path=SHOTS / "look-appearance.png", full_page=True)
    pg.goto(BASE + "/#/today"); pg.wait_for_selector(".dayline")
    assert pg.locator(".greet").inner_text().endswith("Captain.")
    assert pg.get_by_role("heading", name="Coming up").count() == 0
    assert ":" in pg.locator(".dayline .t").first.inner_text() and "m" not in pg.locator(".dayline .t").first.inner_text()
    pg.screenshot(path=SHOTS / "look-today-space.png", full_page=False)
    # reload: applied before paint from this device's storage
    pg.reload(); pg.wait_for_selector(".dayline"); assert pg.evaluate("document.documentElement.dataset.hero") == "banner"
    # scheduled look covering now
    pg.goto(BASE + "/#/appearance")
    pg.fill("#sch-name", "Night"); pg.fill("#sch-from", "00:00"); pg.fill("#sch-to", "23:59"); pg.get_by_role("button", name="Add scheduled look").click()
    expect(pg.locator(".banner")).to_contain_text("Night")
    pg.get_by_role("button", name="Wasabi").click(); pg.get_by_role("button", name="Light", exact=True).click()
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert st["scheduled"][0]["look"]["theme"] == "wasabi" and st["base"]["theme"] != "wasabi"
    pg.goto(BASE + "/#/today"); pg.wait_for_selector(".dayline"); pg.screenshot(path=SHOTS / "look-today-wasabi.png")
    # surprise and reset
    pg.goto(BASE + "/#/appearance"); pg.get_by_role("button", name="Surprise me").click()
    pg.get_by_role("button", name="Reset everything").click(); pg.get_by_role("button", name="Tap again to reset").click()
    st = pg.evaluate("JSON.parse(localStorage.getItem('xo-look'))")
    assert st["base"]["theme"] == "foliage" and st["scheduled"] == [] and st["myThemes"] == [] and st["prefs"]["title"] == "XO", st
    b.close()
print("errors:", errs or "none"); assert not errs; print("LOOK OK")
