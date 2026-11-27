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

    # 2. Custom fields.
    def commit(ctrl, value):
        set_control(ctrl, value)
        pg.keyboard.press("Tab")

    def add_field(kind, name, kind_type, choices=None):
        pg.goto(f"{BASE}/#/settings")
        pg.wait_for_selector("#s-field-kind", timeout=20000)
        set_control(pg.locator("#s-field-kind"), kind)
        rows = pg.locator("table.fields-table tbody tr")
        before = rows.count()
        pg.get_by_role("button", name="Add field").click()
        expect(rows).to_have_count(before + 1)
        row = rows.nth(before)
        commit(row.locator('[data-f^="name-"]'), name)
        set_control(row.locator('[data-f^="type-"]'), kind_type)
        if choices:
            commit(row.locator("td").nth(2).locator("> *").first, choices)

    add_field("task", "Cost", "number")
    add_field("task", "Who", "choice", "Me, Partner")
    task_defs = pg.evaluate("async () => (await import('/js/store.js')).get('fields').data.task")
    ids = {d["name"]: d["id"] for d in task_defs}
    assert set(ids) == {"Cost", "Who"}, ids

    pg.goto(f"{BASE}/#/tasks")
    pg.wait_for_selector('[data-focus="task"]', timeout=20000)
    for title in ("Field test", "Other field task"):
        set_control(pg.locator('[data-focus="task"]'), title)
        pg.keyboard.press("Enter")
        expect(pg.locator(".list li", has_text=title)).to_have_count(1)
    pg.locator(".list li", has_text="Field test").locator(".row-main").first.click()
    dlg = pg.locator("dialog[open]")
    expect(dlg.get_by_text("Cost", exact=True).first).to_be_visible()
    expect(dlg.get_by_text("Who", exact=True).first).to_be_visible()
    set_control(dlg.locator(f"#f-cf_{ids['Cost']}"), 12)
    set_control(dlg.locator(f"#f-cf_{ids['Who']}"), "Partner")
    dlg.get_by_role("button", name="Save").click()
    expect(dlg).to_have_count(0)
    row = pg.locator(".list li", has_text="Field test")
    expect(row).to_contain_text("Cost: 12")
    expect(row).to_contain_text("Who: Partner")

    views = pg.locator('[role="group"][aria-label="Show tasks as"]')
    views.get_by_role("button", name="Table", exact=True).click()
    expect(pg.get_by_role("button", name="Sort by Cost", exact=True)).to_be_visible()
    views.get_by_role("button", name="List", exact=True).click()
    pg.get_by_role("group", name="Who").get_by_role("button", name="Partner", exact=True).click()
    expect(pg.locator(".list li", has_text="Field test")).to_have_count(1)
    expect(pg.locator(".list li", has_text="Other field task")).to_have_count(0)
    pg.get_by_role("button", name="Clear filters").click()
    expect(pg.locator(".list li", has_text="Other field task")).to_have_count(1)

    add_field("bill", "Shared", "yesno")
    shared = pg.evaluate("async () => (await import('/js/store.js')).get('fields').data.bill[0].id")
    pg.goto(f"{BASE}/#/bills")
    pg.get_by_role("button", name="Add bill").first.click()
    dlg = pg.locator("dialog[open]")
    set_control(dlg.locator("#f-name"), "Rent test")
    set_control(dlg.locator(f"#f-cf_{shared}"), True)
    dlg.get_by_role("button", name="Save").click()
    expect(dlg).to_have_count(0)
    expect(pg.locator(".list li", has_text="Rent test")).to_contain_text("Shared")

    # 3. Custom fields on tracker items and check-ins.
    add_field("pm_item", "Sprint", "text")
    sprint = pg.evaluate("async () => (await import('/js/store.js')).get('fields').data.pm_item[0].id")
    add_field("checkin", "Weight", "number")
    weight = pg.evaluate("async () => (await import('/js/store.js')).get('fields').data.checkin[0].id")

    pg.goto(f"{BASE}/#/tracker")
    pg.get_by_role("button", name="New project").click()
    dlg = pg.locator("dialog[open]")
    dlg.locator("#f-name").fill("Field project")
    dlg.locator("#f-key").fill("FP")
    dlg.get_by_role("button", name="Create project").click()
    expect(dlg).to_have_count(0)
    pg.get_by_role("button", name="New item").click()
    dlg.locator("#f-title").fill("Field item")
    dlg.get_by_role("button", name="Create item").click()
    expect(dlg).to_have_count(0)
    detail = pg.get_by_role("complementary", name="Item details")
    detail.locator(f"#cf-{sprint}").fill("S1")
    detail.locator(f"#cf-{sprint}").press("Tab")
    expect(detail).to_contain_text("Custom fields")
    pg.reload()
    pg.wait_for_selector(".dayline, h1", timeout=20000)
    detail = pg.get_by_role("complementary", name="Item details")
    expect(detail.locator(f"#cf-{sprint}")).to_have_value("S1")
    expect(detail).to_contain_text("Custom fields")

    pg.goto(f"{BASE}/#/checkin/morning")
    pg.wait_for_selector(f"#cf-{weight}", timeout=20000)
    set_control(pg.locator(f"#cf-{weight}"), 80)
    pg.keyboard.press("Tab")
    pg.get_by_role("button", name="Save check-in").click()
    pg.wait_for_selector(".dayline", timeout=20000)
    pg.goto(f"{BASE}/#/checkin/morning")
    pg.wait_for_selector(f"#cf-{weight}", timeout=20000)
    expect(pg.locator(f"#cf-{weight}")).to_have_value("80")

    # 4. Notes.
    pg.goto(f"{BASE}/#/notes")
    pg.wait_for_selector('[data-focus="notes-search"]', timeout=20000)
    pg.get_by_role("button", name="New note", exact=True).click()
    note_title = pg.locator('[data-focus="note-title"]')
    set_control(note_title, "Shopping")
    body = pg.locator(".md-text")
    set_control(body, "- eggs")
    pg.get_by_role("button", name="Bold", exact=True).click()
    pg.keyboard.type("milk")
    pg.get_by_role("tab", name="Preview").click()
    expect(pg.locator(".md li")).to_contain_text("eggs")
    expect(pg.locator(".md li strong")).to_have_text("milk")
    expect(pg.locator("p.hint[role=status]")).to_have_text("Saved")
    pg.reload()
    expect(pg.locator(".list li", has_text="Shopping")).to_have_count(1)

    search = pg.locator('[data-focus="notes-search"]')
    set_control(search, "zzz")
    expect(pg.get_by_text("No notes match that search.")).to_be_visible()
    set_control(search, "")
    expect(pg.locator(".list li", has_text="Shopping")).to_have_count(1)

    pg.get_by_role("tab", name="Write").click()
    set_control(pg.locator(".md-text"), "- eggs\n<b>x</b>")
    pg.get_by_role("tab", name="Preview").click()
    expect(pg.locator(".md")).to_contain_text("<b>x</b>")
    expect(pg.locator(".md b")).to_have_count(0)

    pg.get_by_role("button", name="Pin to the top").click()
    expect(pg.locator(".list li", has_text="Shopping")).to_contain_text("Pinned")
    expect(pg.locator("p.hint[role=status]")).to_have_text("Saved")

    pg.goto(f"{BASE}/#/today")
    pg.wait_for_selector(".dayline", timeout=20000)
    pg.keyboard.press("Control+k")
    expect(pg.locator("dialog[open]").get_by_role("combobox")).to_be_visible()
    pg.keyboard.type("Open note: Shopping")
    pg.keyboard.press("Enter")
    expect(pg.locator('[data-focus="note-title"]')).to_have_value("Shopping")

    pg.goto(f"{BASE}/#/tasks")
    pg.wait_for_selector('[data-focus="task"]', timeout=20000)
    pg.locator(".list li", has_text="Field test").locator(".row-main").first.click()
    dlg = pg.locator("dialog[open]")
    dlg.get_by_text("More options").click()
    set_control(dlg.locator(".md-text"), "**bold**")
    dlg.get_by_role("button", name="Save").click()
    expect(dlg).to_have_count(0)
    expect(pg.locator(".list li", has_text="Field test")).to_contain_text("Notes")

    pg.goto(f"{BASE}/#/notes")
    pg.wait_for_selector('[data-focus="notes-search"]', timeout=20000)
    pg.locator(".list li", has_text="Shopping").locator(".row-main").click()
    pg.get_by_role("button", name="Delete note").click()
    pg.get_by_role("button", name="Tap again to delete this note").click()
    expect(pg.get_by_text("No notes yet.")).to_be_visible()

    b.close()

assert not errors, errors
assert not offsite, offsite
print("e2e_extras: ok")
