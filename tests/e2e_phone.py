"""Phone test: the screens in pattern C at 390 px (lead card, chip ribbon, fold-ups, FAB and bottom sheet).

Run after tests/e2e.py, against the same database (it signs in as that test's account).
Each phone screen adds a block below, built from the helpers here.

python tests/e2e_phone.py [base_url]
"""

import os
import sys

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
errs = []


def check_ribbon(pg, selector=".ribbon"):
    """The chip ribbon is one row: it does not wrap and does not grow taller than a chip."""
    info = pg.evaluate(
        """(sel) => {
          const r = document.querySelector(sel);
          const tops = [...r.children].map((c) => Math.round(c.getBoundingClientRect().top));
          return { tops: [...new Set(tops)], sh: r.scrollHeight, ch: r.clientHeight, n: r.children.length };
        }""",
        selector,
    )
    assert info["n"] >= 2, info
    assert len(info["tops"]) == 1, info
    assert info["sh"] <= info["ch"] + 1, info


def check_sheet(pg, tab_names, other_tab, other_marker):
    """The FAB opens the sheet; a tab switch changes the body; Esc closes it and focus returns to the FAB."""
    fab = pg.locator(".fab")
    expect(fab).to_be_visible()
    fab.click()
    sheet = pg.locator("dialog.fab-sheet")
    expect(sheet).to_be_visible()
    for name in tab_names:
        expect(sheet.get_by_role("tab", name=name)).to_be_visible()
    first = sheet.locator(".fab-body").inner_html()
    sheet.get_by_role("tab", name=other_tab).click()
    expect(sheet.locator(".fab-body").locator(other_marker).first).to_be_visible()
    assert sheet.locator(".fab-body").inner_html() != first
    pg.keyboard.press("Escape")
    expect(sheet).to_have_count(0)
    expect(fab).to_be_focused()
    # The scrim closes it too.
    fab.click()
    expect(sheet).to_be_visible()
    pg.mouse.click(190, 20)
    expect(sheet).to_have_count(0)


with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"]
    )
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="Australia/Perth", locale="en-AU")
    ctx.add_init_script("localStorage.setItem('xo-pane', JSON.stringify({ off: true }))")
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "401" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE)
    pg.fill("#a-name", "tester")
    pg.fill("#a-pass", "orbit-walnut-ferry-linen-42")
    pg.get_by_role("button", name="Sign in").click()
    pg.wait_for_selector(".dayline", timeout=20000)

    # --- Today: lead card, ribbon, fold-ups, FAB and sheet
    expect(pg.locator("#view > .next")).to_be_visible()
    expect(pg.locator(".dayline")).to_be_visible()
    check_ribbon(pg)
    expect(pg.locator(".ribbon")).to_contain_text("The day")
    expect(pg.locator("#view")).not_to_contain_text("today.")  # no missing wording keys
    folds = pg.locator("details.today-fold")
    assert folds.count() >= 2
    assert pg.locator("details.today-fold[open]").count() == 1  # only the first fold-up starts open
    pg.locator(".ribbon").get_by_text("Coming up").click()  # a chip opens its fold-up
    expect(pg.locator("#today-coming")).to_have_attribute("open", "")
    check_sheet(pg, ["Add", "Check in"], "Check in", ".xo-play")
    # The Add tab opens the existing form and closes the sheet.
    pg.locator(".fab").click()
    pg.locator("dialog.fab-sheet").get_by_role("button", name="New task").click()
    expect(pg.locator("dialog.fab-sheet")).to_have_count(0)
    form = pg.locator("dialog[open]")
    expect(form).to_be_visible()
    form.get_by_role("button", name="Cancel").click()
    expect(form).to_have_count(0)

    # A wider window has no FAB and the old layout.
    pg.set_viewport_size({"width": 1280, "height": 900})
    expect(pg.locator(".fab")).to_have_count(0)
    expect(pg.locator(".ribbon")).to_have_count(0)
    expect(pg.locator(".dayline")).to_be_visible()
    pg.set_viewport_size({"width": 390, "height": 844})
    expect(pg.locator(".fab")).to_be_visible()

    # --- Diary: view switch, ribbon, lead card, fold-ups, FAB and sheet
    pg.goto(BASE + "/#/diary")
    pg.wait_for_selector(".diary-lead")
    expect(pg.locator(".diary-lead")).to_be_visible()
    expect(pg.get_by_role("radio", name="Week")).to_be_visible()
    check_ribbon(pg)
    expect(pg.locator(".ribbon")).to_contain_text("This week")
    expect(pg.locator("#view")).not_to_contain_text("lists.")  # no missing wording keys
    assert pg.locator("details.diary-fold[open]").count() <= 1
    pg.get_by_role("radio", name="Week").click()
    expect(pg.locator(".diary-lead")).to_be_visible()
    pg.get_by_role("radio", name="Agenda").click()
    check_sheet(pg, ["New appointment", "Copy"], "Copy", ".diary-copy")
    pg.locator(".fab").click()
    pg.locator("dialog.fab-sheet").get_by_role("button", name="Add appointment").click()
    expect(pg.locator("dialog.fab-sheet")).to_have_count(0)
    form = pg.locator("dialog[open]")
    expect(form).to_be_visible()
    form.get_by_role("button", name="Cancel").click()
    expect(form).to_have_count(0)
    pg.set_viewport_size({"width": 1280, "height": 900})
    expect(pg.locator(".fab")).to_have_count(0)
    expect(pg.locator(".ribbon")).to_have_count(0)
    expect(pg.locator(".page-head .add-btn")).to_be_visible()
    pg.set_viewport_size({"width": 390, "height": 844})
    expect(pg.locator(".fab")).to_be_visible()

    # --- Tasks: view switch, filter ribbon, lead card, fold-ups, FAB and the two-tab New task sheet
    pg.goto(BASE + "/#/tasks")
    pg.wait_for_selector(".tasks-lead")
    expect(pg.locator(".tasks-lead")).to_be_visible()
    expect(pg.locator(".tasks-lead")).to_contain_text("Do this now")
    for name in ("List", "Board", "Table"):
        expect(pg.get_by_role("radio", name=name)).to_be_visible()
    check_ribbon(pg)
    expect(pg.locator(".ribbon")).to_contain_text("Focus I have now")
    expect(pg.locator("#view")).not_to_contain_text("lists.")  # no missing wording keys
    expect(pg.locator('[data-focus="task"]')).to_have_count(0)  # the quick add lives in the sheet
    assert pg.locator("details.tasks-fold").count() >= 2
    assert pg.locator("details.tasks-fold[open]").count() == 1  # only the first fold-up starts open
    pg.locator(".ribbon").get_by_role("button", name="Full").click()  # a filter chip is a toggle
    expect(pg.locator(".ribbon").get_by_role("button", name="Full")).to_have_attribute("aria-pressed", "true")
    pg.locator(".ribbon").get_by_role("button", name="Full").click()
    expect(pg.locator(".ribbon").get_by_role("button", name="Full")).to_have_attribute("aria-pressed", "false")
    pg.get_by_role("radio", name="Board").click()
    expect(pg.locator("details.tasks-fold")).to_have_count(3)
    pg.get_by_role("radio", name="Table").click()
    expect(pg.locator(".task-table")).to_be_visible()
    pg.get_by_role("radio", name="List").click()
    pg.wait_for_selector(".tasks-lead")
    check_sheet(pg, ["Category", "Right now"], "Right now", "form[data-tab='now']")
    # Add a task from the sheet: a title, a category chip and the main button.
    pg.locator(".fab").click()
    sheet = pg.locator("dialog.fab-sheet")
    sheet.locator("input[data-focus='task']").fill("Phone sheet task")
    sheet.get_by_role("tab", name="Right now").click()
    # The draft is shared by both tabs.
    expect(sheet.locator("input[data-focus='task']")).to_have_value("Phone sheet task")
    sheet.get_by_role("button", name="Some focus").click()
    sheet.get_by_role("button", name="Add task").click()
    expect(sheet).to_have_count(0)
    expect(pg.locator("li[data-task-id]", has_text="Phone sheet task")).to_have_count(1)
    pg.set_viewport_size({"width": 1280, "height": 900})
    expect(pg.locator(".fab")).to_have_count(0)
    expect(pg.locator(".ribbon")).to_have_count(0)
    expect(pg.locator('[data-focus="task"]')).to_be_visible()
    pg.set_viewport_size({"width": 390, "height": 844})
    expect(pg.locator(".fab")).to_be_visible()

    # Leaving a screen takes the FAB with it.
    pg.goto(BASE + "/#/settings")
    expect(pg.locator(".fab")).to_have_count(0)
    b.close()
print("errors:", errs or "none")
assert not errs
