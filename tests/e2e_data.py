"""Browser test for Delete entries (Settings, My data). Runs on an emptied database and creates its own account.

Fails on any console error. XO_KIT (xo, daisy or wa; default xo) picks the component kit.

python tests/e2e_data.py [base_url]
"""

import os
import sys
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
ORIGIN = urlparse(BASE).netloc
KIT = os.environ.get("XO_KIT", "xo")
PASS = "orbit-walnut-ferry-linen-42"
errors = []
offsite = []

SEED_JS = """
async () => {
  const put = (id, body) => fetch(`/api/items/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-XO': '1' }, body: JSON.stringify(body),
  });
  await put('e2e-t1', { kind: 'task', payload: { title: 'Keep this task' } });
  await put('e2e-t2', { kind: 'task', payload: { title: 'Scratch task one' } });
  await put('e2e-t3', { kind: 'task', payload: { title: 'Scratch task two' } });
  await put('tick:e2e:2025-01-01', { kind: 'tick', day: '2025-01-01', payload: null });
}
"""


def set_control(el, value):
    """Set one control, whichever kit built it (Web Awesome controls are custom elements)."""
    tag = el.evaluate("e => e.tagName")
    if tag == "WA-CHECKBOX":
        el.evaluate("(e, v) => { e.checked = v; e.dispatchEvent(new Event('change', { bubbles: true })); }", value)
    elif tag == "WA-SELECT":
        el.evaluate("(e, v) => { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }", value)
    elif tag == "WA-INPUT":
        el.locator("input").fill(value)
    elif isinstance(value, bool):
        el.set_checked(value)
    elif tag == "SELECT":
        el.select_option(value)
    else:
        el.fill(value)


def ids(pg):
    return pg.locator(".cleanup-table tbody tr[data-id]").evaluate_all("rs => rs.map(r => r.dataset.id)")


with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"]
    )
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, locale="en-AU", reduced_motion="reduce")
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
    pg.wait_for_selector("#a-name", timeout=20000)
    set_control(pg.locator("#a-name"), "tester")
    set_control(pg.locator("#a-pass"), PASS)
    set_control(pg.locator("#a-again"), PASS)
    pg.get_by_role("button", name="Create and open").click()
    expect(pg.locator(".dayline")).to_be_visible(timeout=20000)
    pg.evaluate("k => window.XOLook.change((s, look) => { look.kit = k; })", KIT)
    pg.evaluate(SEED_JS)

    # The list shows every entry, old ticks included, and filters by kind and search.
    pg.goto(f"{BASE}/#/settings")
    pg.get_by_role("button", name="Review and delete entries").click()
    dlg = pg.locator("dialog[open]")
    expect(dlg.get_by_role("heading", name="Delete entries")).to_be_visible()
    expect(dlg.locator("tr[data-id='tick:e2e:2025-01-01']")).to_have_count(1)
    set_control(dlg.locator("#cleanup-kind"), "task")
    expect(dlg.locator(".cleanup-table tbody tr[data-id]")).to_have_count(3)
    set_control(dlg.locator("#cleanup-search"), "scratch")
    expect(dlg.locator(".cleanup-table tbody tr[data-id]")).to_have_count(2)
    assert set(ids(pg)) == {"e2e-t2", "e2e-t3"}, ids(pg)

    # Select all shown, then two taps delete them.
    delete = dlg.locator("#cleanup-delete")
    assert delete.evaluate("e => e.disabled") is True  # A property, so it works on a Web Awesome button too.
    set_control(dlg.locator("#cleanup-all"), True)
    expect(delete).to_have_text("Delete 2 selected")
    delete.click()
    expect(delete).to_have_text("Tap again to delete 2")
    delete.click()
    expect(pg.locator("#toast")).to_contain_text("Deleted 2 entries.")
    expect(dlg.locator(".cleanup-table tbody tr[data-id]")).to_have_count(0)

    # The kept task is still there, on the server and on the Tasks screen.
    left = pg.evaluate("async () => (await (await fetch('/api/items?kinds=task')).json()).map(i => i.id)")
    assert left == ["e2e-t1"], left
    pg.keyboard.press("Escape")
    pg.goto(f"{BASE}/#/tasks")
    pg.reload()  # The seed went straight to the server, so load the store again.
    expect(pg.get_by_text("Keep this task").first).to_be_visible()
    expect(pg.get_by_text("Scratch task one")).to_have_count(0)

    b.close()

assert not errors, errors
assert not offsite, offsite
print("e2e_data: ok", KIT)
