"""Browser test for the widget canvas and tabs (static/js/canvas.js, static/js/tabs.js).

The canvas is on no screen yet, so the test mounts it into the page itself and uses the screen
widgets from static/js/widgets.js, then puts every registered widget on one canvas. Run after
tests/e2e.py, against the same database (it signs in to the account that test created).
Fails on any console error and on any request that leaves the origin.

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

# Mounts the canvas outside #view: Today is a live view and would redraw over it when the store changes.
MOUNT = """async () => {
  const { mountCanvas } = await import('/js/canvas.js');
  const host = document.createElement('div');
  host.id = 'canvas-host';
  document.body.append(host);
  window.__canvas = await mountCanvas(host);
}"""


def node(pg, wid):
    """GridStack geometry of one widget on the board."""
    return pg.evaluate(
        "id => { const n = document.querySelector(`[data-widget='${id}']`).gridstackNode;"
        " return { x: n.x, y: n.y, w: n.w, h: n.h }; }",
        wid,
    )


with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"]
    )
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Australia/Perth", locale="en-AU")
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

    # First mount: one unsaved canvas called Main, nothing on it.
    pg.evaluate(MOUNT)
    tabs = pg.get_by_role("tablist", name="Canvases")
    expect(tabs.get_by_role("tab")).to_have_count(1)
    expect(tabs.get_by_role("tab", name="Main")).to_have_attribute("aria-selected", "true")
    expect(pg.locator(".xo-canvas-empty")).to_be_visible()
    assert pg.evaluate("typeof window.GridStack") == "function"

    # Add both widgets from the Add widget list.
    for name, wid in (("Tasks", "tasks"), ("Bills", "bills")):
        pg.get_by_role("button", name="Add widget").click()
        pg.locator("dialog[open]").get_by_role("button", name=name, exact=True).click()
        expect(pg.locator(f"[data-widget='{wid}'] .xo-w-body .page-head h1")).to_have_text(name)
    expect(pg.locator(".xo-canvas-empty")).to_be_hidden()
    assert node(pg, "tasks")["w"] == 8

    # Roll the first up: one row high, body hidden.
    pg.locator("[data-widget='tasks']").get_by_role("button", name="Roll up").click()
    expect(pg.locator("[data-widget='tasks'] .xo-w-body")).to_be_hidden()
    assert node(pg, "tasks")["h"] == 2

    # Keyboard: Alt+Shift+Right widens the second widget from its grip, Alt+Down moves it down.
    grip = pg.locator("[data-widget='bills'] .xo-w-grip")
    grip.focus()
    before = node(pg, "bills")
    pg.keyboard.press("Alt+Shift+ArrowRight")
    pg.keyboard.press("Alt+ArrowDown")
    after = node(pg, "bills")
    assert after["w"] == before["w"] + 1, (before, after)
    assert after["y"] >= before["y"], (before, after)
    expect(grip).to_be_focused()
    pg.screenshot(path=SHOTS / "canvas-desktop.png")

    # Take the second off; it is offered again, at its size.
    pg.locator("[data-widget='bills']").get_by_role("button", name="Take Bills off this canvas").click()
    expect(pg.locator("[data-widget='bills']")).to_have_count(0)
    expect(pg.locator("#toast")).to_contain_text("Add widget brings it back")
    pg.get_by_role("button", name="Add widget").click()
    dlg = pg.locator("dialog[open]")
    expect(dlg.get_by_role("button", name="Bills", exact=True)).to_be_visible()
    expect(dlg.get_by_role("button", name="Tasks", exact=True)).to_have_count(0)
    dlg.get_by_role("button", name="Close").click()

    # A second canvas: created, selected and empty; the arrow keys switch back.
    pg.get_by_role("button", name="New canvas").click()
    pg.locator("dialog[open] #f-title").fill("Second")
    pg.locator("dialog[open]").get_by_role("button", name="Create canvas").click()
    expect(tabs.get_by_role("tab")).to_have_count(2)
    expect(tabs.get_by_role("tab", name="Second")).to_have_attribute("aria-selected", "true")
    expect(pg.locator(".xo-canvas-empty")).to_be_visible()
    tabs.get_by_role("tab", name="Second").focus()
    pg.keyboard.press("ArrowLeft")
    expect(tabs.get_by_role("tab", name="Main")).to_have_attribute("aria-selected", "true")
    expect(tabs.get_by_role("tab", name="Main")).to_be_focused()
    expect(pg.locator("[data-widget='tasks']")).to_have_count(1)

    # Rename Main, then let the save land and reload: both canvases and the rolled widget come back.
    pg.get_by_role("button", name="Rename canvas").click()
    pg.locator("dialog[open] #f-title").fill("Home base")
    pg.locator("dialog[open]").get_by_role("button", name="Save").click()
    expect(tabs.get_by_role("tab", name="Home base")).to_be_visible()
    pg.evaluate("() => window.__canvas.destroy()")
    pg.reload()
    pg.wait_for_selector(".dayline", timeout=20000)
    pg.evaluate(MOUNT)
    expect(tabs.get_by_role("tab")).to_have_count(2)
    expect(tabs.get_by_role("tab", name="Home base")).to_have_attribute("aria-selected", "true")
    expect(pg.locator("[data-widget='tasks']")).to_have_class(re.compile(r"\bxo-w-rolled\b"))
    assert node(pg, "tasks")["h"] == 2
    pg.locator("[data-widget='tasks']").get_by_role("button", name="Roll down").click()
    assert node(pg, "tasks")["h"] == 16

    # Delete the second canvas through Rename: two presses on Delete.
    tabs.get_by_role("tab", name="Second").click()
    pg.get_by_role("button", name="Rename canvas").click()
    dlg = pg.locator("dialog[open]")
    dlg.get_by_role("button", name="Delete").click()
    dlg.get_by_role("button", name="Tap again to delete").click()
    expect(tabs.get_by_role("tab")).to_have_count(1)

    # Every widget in the registry renders on one canvas without an error.
    pg.get_by_role("button", name="New canvas").click()
    pg.locator("dialog[open] #f-title").fill("Everything")
    pg.locator("dialog[open]").get_by_role("button", name="Create canvas").click()
    ids = pg.evaluate("async () => Object.keys((await import('/js/widgets.js')).WIDGETS)")
    assert len(ids) >= 13, ids
    for wid in ids:
        pg.get_by_role("button", name="Add widget").click()
        pg.locator(f"dialog[open] [data-widget='{wid}']").click()
        expect(pg.locator(f".xo-board [data-widget='{wid}'] .xo-w-body > *").first).to_be_attached()
    expect(pg.locator(".xo-w-body .empty", has_text="could not be shown")).to_have_count(0)
    pg.screenshot(path=SHOTS / "canvas-everything.png", full_page=True)
    tabs.get_by_role("tab", name="Home base").click()

    # Phone width: a plain list, nothing to drag, no Add widget.
    pg.set_viewport_size({"width": 390, "height": 860})
    expect(pg.locator(".xo-board")).to_have_class(re.compile(r"\bxo-board-list\b"))
    expect(pg.locator("[data-widget='tasks'] .xo-w-body .page-head h1")).to_have_text("Tasks")
    expect(pg.get_by_role("button", name="Add widget")).to_be_hidden()
    expect(pg.locator("[data-widget='tasks'] .xo-w-grip")).to_have_count(0)
    pg.screenshot(path=SHOTS / "canvas-phone.png")
    pg.set_viewport_size({"width": 1280, "height": 900})
    expect(pg.locator(".xo-board.grid-stack")).to_have_count(1)
    pg.evaluate("() => window.__canvas.destroy()")

    # tabSet: panels built on first show and kept; Delete closes the focused tab.
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
    expect(pane.get_by_role("tab", name="Alpha")).to_have_attribute("aria-selected", "true")
    pane.get_by_role("tab", name="Alpha").focus()
    pg.keyboard.press("Delete")
    expect(pane.get_by_role("tab")).to_have_count(1)
    expect(pane.get_by_role("tab", name="Beta")).to_have_attribute("aria-selected", "true")
    expect(pg.locator("#in-b")).to_be_visible()
    pg.get_by_role("button", name="Close Beta").click()
    expect(pg.locator(".xo-tabs-empty")).to_be_visible()

    b.close()

assert not errors, errors
assert not offsite, offsite
print("canvas ok")
