"""Browser test for the Canvas screen: canvas tabs, widgets, widget management and side tabs.

Run after tests/e2e.py, against the same database (it signs in to the account that test created).
Covers adding, rolling, keyboard move and resize, the More menu (fit, zoom, focus, reset size,
move to another canvas, side tab), undo, canvases, reload, every registered widget, phone width
and the generic tab set. Fails on any console error and on any request that leaves the origin.

python tests/e2e_canvas.py [base_url] [screenshot_dir]
"""

import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
SHOTS = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/xo-shots")
SHOTS.mkdir(parents=True, exist_ok=True)
ORIGIN = urlparse(BASE).netloc
errors = []
offsite = []


def node(pg, wid):
    """GridStack geometry of one widget on the board."""
    return pg.evaluate(
        "id => { const n = document.querySelector(`.xo-board [data-widget='${id}']`).gridstackNode;"
        " return { x: n.x, y: n.y, w: n.w, h: n.h }; }",
        wid,
    )


def widget(pg, wid):
    """The widget on the board (not its tick in the Widgets popover)."""
    return pg.locator(f".xo-board [data-widget='{wid}']")


def tool(pg, wid, name):
    """Runs a title bar tool: its icon button when the bar shows it, else the same item in More."""
    w = widget(pg, wid)
    w.hover()
    btn = w.locator(".xo-w-tools").get_by_role("button", name=name, exact=True)
    if btn.count() and btn.is_visible():
        btn.click()
        return
    w.locator(".xo-w-more").click()
    pg.get_by_role("menu").get_by_role("menuitem", name=name, exact=True).click()


def more(pg, wid, item):
    """Picks an item that only lives in the More menu (Move to canvas)."""
    widget(pg, wid).locator(".xo-w-more").click()
    pg.get_by_role("menu").get_by_role("menuitem", name=item, exact=True).click()


def pop(pg):
    """The open popover."""
    return pg.locator("dialog.xo-pop[open]")


def add(pg, name):
    """Puts a widget on the canvas by ticking it in the Widgets popover."""
    pg.get_by_role("button", name="Widgets", exact=True).click()
    pop(pg).get_by_role("checkbox", name=name, exact=True).check()
    pop(pg).get_by_role("button", name="Close", exact=True).click()
    expect(pop(pg)).to_have_count(0)


def open_canvas(pg):
    """Goes to the Canvas screen and waits for the board."""
    pg.locator(".side").get_by_role("link", name="Canvas").click()
    pg.wait_for_selector(".xo-canvas .xo-board", timeout=20000)


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
    pg.goto(BASE)
    pg.fill("#a-name", "tester")
    pg.fill("#a-pass", "orbit-walnut-ferry-linen-42")
    pg.get_by_role("button", name="Sign in").click()
    pg.wait_for_selector(".dayline", timeout=20000)

    # The Canvas screen: one unsaved canvas called Main, nothing on it.
    open_canvas(pg)
    tabs = pg.get_by_role("tablist", name="Canvases")
    expect(tabs.get_by_role("tab")).to_have_count(1)
    expect(tabs.get_by_role("tab", name="Main")).to_have_attribute("aria-selected", "true")
    expect(pg.locator(".xo-canvas-empty")).to_be_visible()
    expect(pg.get_by_role("button", name="Undo")).to_be_disabled()

    # Add two screens as widgets.
    for name, wid in (("Tasks", "tasks"), ("Bills", "bills")):
        add(pg, name)
        expect(widget(pg, wid).locator(".xo-w-body .page-head h1")).to_have_text(name)
    expect(pg.locator(".xo-canvas-empty")).to_be_hidden()
    assert node(pg, "tasks")["w"] == 8

    # Widget and tab colours: a chosen palette tints the frame and the active tab's underline; reset clears it.
    frame = "document.querySelector('[data-widget=\"tasks\"] > .xo-w')"
    top = f"getComputedStyle({frame}).borderTopColor"
    plain = pg.evaluate(top)
    plain_underline = tabs.locator(".xo-tab").first.evaluate("e => getComputedStyle(e).borderBottomColor")
    tab_id = tabs.get_by_role("tab").first.get_attribute("data-tid")
    pg.evaluate(
        "(tid) => XOLook.change((s, lk) => {"
        " lk.ident.widgets.tasks = {"
        " swatch: 'raspberry-tart', light: '#e63965', dark: '#f18fa8', op: 100, title: true };"
        " lk.ident.tabs[tid] = {"
        " swatch: 'raspberry-tart', light: '#e63965', dark: '#f18fa8', op: 100, title: false }; }, { quiet: true })",
        tab_id,
    )
    pg.wait_for_function(f"{frame} && {top} != {plain!r}")
    assert pg.evaluate(f"getComputedStyle({frame}.querySelector('.xo-w-title')).color") == "rgb(230, 57, 101)"
    underline = tabs.locator(".xo-tab").first.evaluate("e => getComputedStyle(e).borderBottomColor")
    assert underline != plain_underline
    pg.evaluate("XOLook.change((s, lk) => { lk.ident = { widgets: {}, tabs: {} }; }, { quiet: true })")
    pg.wait_for_function(f"{frame} && {top} == {plain!r}")

    # Roll Tasks up: two rows high, body hidden.
    widget(pg, "tasks").get_by_role("button", name="Roll up").click()
    expect(widget(pg, "tasks").locator(".xo-w-body")).to_be_hidden()
    assert node(pg, "tasks")["h"] == 2

    # Keyboard: Alt+Shift+Right widens Bills from its grip, Alt+Down moves it down.
    grip = widget(pg, "bills").locator(".xo-w-grip")
    grip.focus()
    before = node(pg, "bills")
    pg.keyboard.press("Alt+Shift+ArrowRight")
    pg.keyboard.press("Alt+ArrowDown")
    after = node(pg, "bills")
    assert after["w"] == before["w"] + 1, (before, after)
    expect(grip).to_be_focused()

    # Fit to content: the whole body shows without a scroll bar. Ctrl+Z puts the old height back.
    tall = node(pg, "bills")["h"]
    tool(pg, "bills", "Fit to content")
    pg.wait_for_function(
        "() => { const b = document.querySelector(\".xo-board [data-widget='bills'] .xo-w-body\");"
        " return b.scrollHeight <= b.clientHeight + 1; }"
    )
    assert node(pg, "bills")["h"] != tall
    pg.keyboard.press("Control+z")
    expect(pg.locator("#toast")).to_contain_text("Undone: fitting a widget.")
    assert node(pg, "bills")["h"] == tall

    # Zoom: Bills alone until Esc.
    tool(pg, "bills", "Zoom: this widget only")
    expect(widget(pg, "tasks")).to_be_hidden()
    expect(pg.locator(".xo-canvas-tools").get_by_role("button", name="Leave zoom")).to_be_visible()
    pg.keyboard.press("Escape")
    expect(widget(pg, "tasks")).to_be_visible()
    expect(pg.locator(".xo-canvas-tools").get_by_role("button", name="Leave zoom")).to_be_hidden()

    # Focus on Tasks: it rolls down and Bills rolls up; Leave focus rolls Bills down again.
    tool(pg, "tasks", "Focus: roll up the others")
    expect(widget(pg, "tasks").locator(".xo-w-body")).to_be_visible()
    expect(widget(pg, "bills")).to_have_class(re.compile(r"\bxo-w-rolled\b"))
    pg.locator(".xo-canvas-tools").get_by_role("button", name="Leave focus").click()
    expect(widget(pg, "bills")).not_to_have_class(re.compile(r"\bxo-w-rolled\b"))

    # Reset size: back to the registry's default.
    tool(pg, "bills", "Reset size")
    assert node(pg, "bills")["w"] == 8 and node(pg, "bills")["h"] == 16, node(pg, "bills")
    pg.screenshot(path=SHOTS / "canvas-desktop.png")

    # Icons: the canvas bar's buttons hold an svg once the icon sets have loaded.
    expect(pg.get_by_role("button", name="Fit all").locator("svg")).to_have_count(1)

    # Redo: Undo puts the height back, Redo (Ctrl+Shift+Z) takes it forward again.
    assert node(pg, "bills")["h"] == 16
    tool(pg, "bills", "Fit to content")
    fitted = node(pg, "bills")["h"]
    assert fitted != 16
    expect(pg.get_by_role("button", name="Redo")).to_be_disabled()
    pg.get_by_role("button", name="Undo").click()
    assert node(pg, "bills")["h"] == 16
    expect(pg.get_by_role("button", name="Redo")).to_be_enabled()
    pg.keyboard.press("Control+Shift+Z")
    expect(pg.locator("#toast")).to_contain_text("Redone: fitting a widget.")
    assert node(pg, "bills")["h"] == fitted
    pg.keyboard.press("Control+z")
    assert node(pg, "bills")["h"] == 16

    # The Widgets popover: unticking takes a widget off but leaves its row; search filters the rows.
    pg.get_by_role("button", name="Widgets", exact=True).click()
    w = pop(pg)
    expect(w.get_by_role("searchbox", name="Find a widget")).to_be_focused()
    expect(w.get_by_role("checkbox", name="Bills", exact=True)).to_be_checked()
    w.get_by_role("checkbox", name="Bills", exact=True).uncheck()
    expect(widget(pg, "bills")).to_have_count(0)
    expect(w.get_by_role("checkbox", name="Bills", exact=True)).not_to_be_checked()
    w.get_by_role("checkbox", name="Bills", exact=True).check()
    expect(widget(pg, "bills")).to_have_count(1)
    assert w.get_by_role("searchbox", name="Find a widget").evaluate("e => getComputedStyle(e).borderTopWidth") != "0px"
    w.get_by_role("searchbox", name="Find a widget").fill("zzzz")
    expect(w.get_by_text("No widget matches.")).to_be_visible()
    expect(w.locator(".xo-wlist li:visible")).to_have_count(0)
    w.get_by_role("searchbox", name="Find a widget").fill("bill")
    expect(w.locator(".xo-wlist li:visible")).to_have_count(1)
    pg.get_by_role("button", name="Widgets", exact=True).click()
    expect(pop(pg)).to_have_count(0)
    assert node(pg, "bills")["h"] == 16

    # A form popover (New canvas) stays open through a click on the board and closes on Escape.
    pg.get_by_role("button", name="New canvas").click()
    expect(pop(pg)).to_have_count(1)
    pg.locator(".xo-board").click(position={"x": 4, "y": 4})
    expect(pop(pg)).to_have_count(1)
    pop(pg).locator("#f-title").focus()
    pg.keyboard.press("Escape")
    expect(pop(pg)).to_have_count(0)

    # A second canvas: created with an icon from the picker, selected and empty; the arrow keys switch back.
    pg.get_by_role("button", name="New canvas").click()
    pop(pg).get_by_role("button", name=re.compile(r"^Icon: No icon")).click()
    pg.locator("#ip-search").fill("house")
    pg.locator('.icon-pop [data-name="house"]').first.click()
    pg.keyboard.press("Escape")
    expect(pg.locator(".icon-pop")).to_be_hidden()
    expect(pop(pg)).to_have_count(1)
    pop(pg).locator("#f-title").fill("Second")
    pop(pg).get_by_role("button", name="Create canvas").click()
    expect(tabs.get_by_role("tab", name="Second").locator("svg")).to_have_count(1)
    expect(tabs.get_by_role("tab")).to_have_count(2)
    expect(tabs.get_by_role("tab", name="Second")).to_have_attribute("aria-selected", "true")
    expect(pg.locator(".xo-canvas-empty")).to_be_visible()
    tabs.get_by_role("tab", name="Second").focus()
    pg.keyboard.press("ArrowLeft")
    expect(tabs.get_by_role("tab", name="Main")).to_be_focused()
    expect(widget(pg, "tasks")).to_have_count(1)

    # Move Bills to Second, check it arrived, then undo the move.
    more(pg, "bills", "Second")
    expect(widget(pg, "bills")).to_have_count(0)
    expect(pg.locator("#toast")).to_contain_text("Bills is now on Second.")
    tabs.get_by_role("tab", name="Second").click()
    expect(widget(pg, "bills")).to_have_count(1)
    pg.get_by_role("button", name="Undo").click()
    expect(widget(pg, "bills")).to_have_count(0)
    tabs.get_by_role("tab", name="Main").click()
    expect(widget(pg, "bills")).to_have_count(1)

    # Side tab: Tasks leaves the board for the side pane, and comes back.
    side = pg.get_by_role("complementary", name="Side tabs")
    tool(pg, "tasks", "Open in side tab")
    expect(side).to_be_visible()
    expect(side.get_by_role("tab", name="Tasks")).to_have_attribute("aria-selected", "true")
    expect(side.locator(".page-head h1")).to_have_text("Tasks")
    expect(widget(pg, "tasks")).to_have_count(0)
    side.get_by_role("button", name="Put back on canvas").click()
    expect(widget(pg, "tasks")).to_have_count(1)
    expect(side).to_be_hidden()

    # Side tabs survive leaving the screen; the close button shuts one.
    tool(pg, "bills", "Open in side tab")
    pg.locator(".side").get_by_role("link", name="Today").click()
    pg.wait_for_selector(".dayline")
    open_canvas(pg)
    expect(side.get_by_role("tab", name="Bills")).to_be_visible()
    side.get_by_role("button", name="Close Bills").click()
    expect(side).to_be_hidden()
    add(pg, "Bills")

    # Rename shows the chosen icon; No icon clears it.
    tabs.get_by_role("tab", name="Second").click()
    pg.get_by_role("button", name="Rename canvas").click()
    expect(pop(pg).get_by_role("button", name=re.compile(r"^Icon: house"))).to_be_visible()
    pop(pg).get_by_role("button", name="No icon", exact=True).click()
    pop(pg).get_by_role("button", name="Save").click()
    expect(tabs.get_by_role("tab", name="Second").locator("svg")).to_have_count(0)
    tabs.get_by_role("tab", name="Main").click()

    # Rename Main, reload: both canvases and the layout come back from the server.
    pg.get_by_role("button", name="Rename canvas").click()
    pop(pg).locator("#f-title").fill("Home base")
    pop(pg).get_by_role("button", name="Save").click()
    expect(tabs.get_by_role("tab", name="Home base")).to_be_visible()
    widget(pg, "bills").get_by_role("button", name="Roll up").click()
    # Leaving the screen saves straight away; wait for that save before reloading.
    with pg.expect_response(lambda r: r.request.method == "PUT" and "/api/items/canvas" in r.url):
        pg.locator(".side").get_by_role("link", name="Today").click()
    pg.wait_for_selector(".dayline")
    pg.reload()
    pg.wait_for_selector(".dayline", timeout=20000)
    open_canvas(pg)
    expect(tabs.get_by_role("tab")).to_have_count(2)
    expect(tabs.get_by_role("tab", name="Home base")).to_have_attribute("aria-selected", "true")
    expect(widget(pg, "bills")).to_have_class(re.compile(r"\bxo-w-rolled\b"))
    assert node(pg, "bills")["h"] == 2
    widget(pg, "bills").get_by_role("button", name="Roll down").click()
    assert node(pg, "bills")["h"] == 16

    # Delete the second canvas through Rename: two presses on Delete.
    tabs.get_by_role("tab", name="Second").click()
    pg.get_by_role("button", name="Rename canvas").click()
    dlg = pop(pg)
    dlg.get_by_role("button", name="Delete").click()
    dlg.get_by_role("button", name="Tap again to delete").click()
    expect(tabs.get_by_role("tab")).to_have_count(1)

    # Every widget in the registry renders on one canvas without an error; Fit all and Reset layout run.
    pg.get_by_role("button", name="New canvas").click()
    pop(pg).locator("#f-title").fill("Everything")
    pop(pg).get_by_role("button", name="Create canvas").click()
    ids = pg.evaluate("async () => Object.keys((await import('/js/widgets.js')).WIDGETS)")
    assert len(ids) >= 13, ids
    for wid in ids:
        pg.get_by_role("button", name="Widgets", exact=True).click()
        pop(pg).locator(f"[data-widget='{wid}']").check()
        expect(pg.locator(f".xo-board [data-widget='{wid}'] .xo-w-body > *").first).to_be_attached()
        if pop(pg).count():
            pop(pg).get_by_role("button", name="Close", exact=True).click()
    expect(pg.locator(".xo-w-body .empty", has_text="could not be shown")).to_have_count(0)
    pg.get_by_role("button", name="Fit all").click()
    pg.get_by_role("button", name="Reset layout").click()
    assert node(pg, "today")["w"] == 12 and node(pg, "today")["h"] == 24
    pg.screenshot(path=SHOTS / "canvas-everything.png", full_page=True)

    # A check-in saved inside its widget stays on the canvas.
    widget(pg, "checkin-weekly").get_by_role("button", name="Save check-in").click()
    expect(pg.locator("#toast")).to_be_visible()
    assert pg.evaluate("location.hash") == "#/canvas"
    tabs.get_by_role("tab", name="Home base").click()

    # Phone width: a plain list, nothing to drag, no Widgets button and no side pane.
    pg.set_viewport_size({"width": 390, "height": 860})
    expect(pg.locator(".xo-board")).to_have_class(re.compile(r"\bxo-board-list\b"))
    expect(widget(pg, "tasks").locator(".xo-w-body .page-head h1")).to_have_text("Tasks")
    expect(pg.get_by_role("button", name="Widgets", exact=True)).to_be_hidden()
    expect(widget(pg, "tasks").locator(".xo-w-grip")).to_have_count(0)
    pg.screenshot(path=SHOTS / "canvas-phone.png")
    pg.set_viewport_size({"width": 1400, "height": 900})
    expect(pg.locator(".xo-board.grid-stack")).to_have_count(1)

    # tabSet on its own: panels built on first show and kept; Delete closes the focused tab.
    result = pg.evaluate("""async () => {
      const { tabSet } = await import('/js/tabs.js');
      const host = document.createElement('div');
      host.id = 'pane-host';
      document.body.append(host);
      const built = [];
      const pane = tabSet(host, { label: 'Open things' });
      const make = (k) => (body) => {
        built.push(k);
        body.append(Object.assign(document.createElement('input'), { id: 'in-' + k }));
      };
      pane.open('a', 'Alpha', make('a'));
      document.getElementById('in-a').value = 'kept';
      pane.open('b', 'Beta', make('b'));
      pane.select('a');
      return { built, kept: document.getElementById('in-a').value, active: pane.active() };
    }""")
    assert result == {"built": ["a", "b"], "kept": "kept", "active": "a"}, result
    pane = pg.get_by_role("tablist", name="Open things")
    pane.get_by_role("tab", name="Alpha").focus()
    pg.keyboard.press("Delete")
    expect(pane.get_by_role("tab")).to_have_count(1)
    expect(pane.get_by_role("tab", name="Beta")).to_have_attribute("aria-selected", "true")
    expect(pg.locator("#in-b")).to_be_visible()
    pg.get_by_role("button", name="Close Beta").click()
    expect(pg.locator("#pane-host .xo-tabs-empty")).to_be_visible()

    b.close()

assert not errors, errors
assert not offsite, offsite
print("canvas ok")
