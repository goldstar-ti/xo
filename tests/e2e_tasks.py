"""Browser test for the task features. Runs on an emptied database and creates its own account.

Fails on any console error.

python tests/e2e_tasks.py [base_url]
"""

import os
import sys
from datetime import datetime, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
ORIGIN = urlparse(BASE).netloc
KIT = os.environ.get("XO_KIT", "xo")
PASS = "orbit-walnut-ferry-linen-42"
TOMORROW = (datetime.now(ZoneInfo("Australia/Perth")) + timedelta(days=1)).strftime("%Y-%m-%d")
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


LOGIC_JS = """
async () => {
  const m = await import('/js/tasks.js');
  const today = '2026-11-26';
  const tags = [{ id: 'court', name: 'Court' }];
  const q = (text) => m.parseQuick(text, { today, tags, places: [] });
  const task = (id, blockedBy, status = 'todo') => m.normaliseTask({ id, blockedBy, status });
  const map = new Map([['A', task('A', ['B'])], ['B', task('B', [])], ['C', task('C', [])]]);
  const done = (ratio, i) =>
    m.normaliseTask({ status: 'done', est: 10, actual: 10 * ratio, doneAt: `2026-11-0${i}T10:00` });
  const base = m.normaliseTask({ status: 'todo', touched: '2026-10-17T10:00:00' });
  return {
    quick: q('Call lawyer tomorrow !high #court 30m'),
    friday: q('x friday').due,
    monday: q('x monday').due,
    thursday: q('x thursday').due,
    nextWeek: q('x next week').due,
    inDays: q('x in 3 days').due,
    dm: q('x 1/12').due,
    dueIso: q('x due 2026-12-24'),
    hm: q('x 1h30').est,
    newTag: q('x #newthing').newTags,
    after: m.nextRepeat({ every: 'after', n: 3 }, '', '2026-11-26'),
    week: m.nextRepeat({ every: 'week', n: 1 }, '2026-11-20', '2026-11-26'),
    month: m.nextRepeat({ every: 'month' }, '2026-01-31', '2026-01-31'),
    monthNth: m.nextRepeat({ every: 'month_nth', nth: 1, weekday: 1 }, '2026-11-26', '2026-11-26'),
    quarterNth: m.nextRepeat({ every: 'quarter_nth', nth: 1, weekday: 1 }, '2026-11-26', '2026-11-26'),
    lastFri: m.nextRepeat({ every: 'month_nth', nth: -1, weekday: 5 }, '2026-11-26', '2026-11-26'),
    none: m.nextRepeat({ every: 'none' }, '', '2026-11-26'),
    cycleBA: m.wouldCycle(map, 'B', 'A'),
    cycleCA: m.wouldCycle(map, 'C', 'A'),
    blocked: m.isBlocked(map.get('A'), map),
    pace4: m.pace([1, 2, 1, 2].map((r, i) => done(r, i + 1))).ratio,
    pace5: m.pace([1, 1, 2, 2, 2].map((r, i) => done(r, i + 1))).ratio,
    stale: m.isStale(base, { today, staleDays: 30 }),
    staleToday: m.isStale({ ...base, today }, { today, staleDays: 30 }),
    staleOff: m.isStale(base, { today, staleDays: 0 }),
    staleNone: m.isStale({ ...base, touched: '' }, { today, staleDays: 30 }),
    fz: [
      m.fuzzyScore('tsk', 'Tasks') > 0,
      m.fuzzyScore('xyz', 'Tasks'),
      m.fuzzyScore('ta', 'Tasks') > m.fuzzyScore('ta', 'Start'),
    ],
    order: [m.compareTasks(m.normaliseTask({ title: 'b', priority: 'high' }), m.normaliseTask({ title: 'a' })) < 0],
  };
}
"""

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

    # 1. Pure logic.
    pg.goto(BASE)
    pg.wait_for_selector("#a-name", timeout=20000)
    r = pg.evaluate(LOGIC_JS)
    quick = r["quick"]
    assert quick["title"] == "Call lawyer", quick
    assert quick["due"] == "2026-11-27", quick
    assert quick["priority"] == "high", quick
    assert quick["tags"] == ["court"], quick
    assert quick["est"] == 30, quick
    assert r["friday"] == "2026-11-27", r
    assert r["monday"] == "2026-11-30", r
    assert r["thursday"] == "2026-12-03", r
    assert r["nextWeek"] == "2026-11-30", r
    assert r["inDays"] == "2026-11-29", r
    assert r["dm"] == "2026-12-01", r
    assert r["dueIso"]["due"] == "2026-12-24" and r["dueIso"]["title"] == "x", r
    assert r["hm"] == 90, r
    assert r["newTag"] == ["newthing"], r
    assert r["after"] == "2026-11-29", r
    assert r["week"] == "2026-11-27", r
    assert r["month"] == "2026-02-28", r
    assert r["monthNth"] == "2026-12-07", r
    assert r["quarterNth"] == "2027-01-04", r
    assert r["lastFri"] == "2026-12-25", r
    assert r["none"] is None, r
    assert r["cycleBA"] is True and r["cycleCA"] is False, r
    assert r["blocked"] is True, r
    assert r["pace4"] == 1.5 and r["pace5"] == 2, r
    assert r["stale"] is True and r["staleToday"] is False, r
    assert r["staleOff"] is False and r["staleNone"] is False, r
    assert r["fz"] == [True, 0, True], r
    assert r["order"] == [True], r

    # 2. Account and the task form.
    set_control(pg.locator("#a-name"), "tester")
    set_control(pg.locator("#a-pass"), PASS)
    set_control(pg.locator("#a-again"), PASS)
    pg.get_by_role("button", name="Create and open").click()
    expect(pg.locator(".dayline")).to_be_visible(timeout=20000)
    pg.goto(f"{BASE}/#/tasks")

    def quick_add(text):
        set_control(pg.locator('[data-focus="task"]'), text)
        pg.keyboard.press("Enter")

    def open_row(title):
        pg.locator(".list li", has_text=title).locator(".row-main").first.click()
        dlg = pg.locator("dialog[open]")
        expect(dlg).to_have_count(1)
        return dlg

    quick_add("Plan the week !high #home 45m tomorrow")
    expect(pg.locator(".list li", has_text="Plan the week")).to_have_count(1)
    dlg = open_row("Plan the week")
    expect(dlg.get_by_role("button", name="High", exact=True)).to_have_attribute("aria-pressed", "true")
    cats = dlg.locator("fieldset", has_text="Categories")
    expect(cats.get_by_role("button", name="Home", exact=True)).to_have_attribute("aria-pressed", "true")
    expect(dlg.locator("#f-est")).to_have_value("45")
    expect(dlg.locator("#f-due")).to_have_value(TOMORROW)
    for _ in range(2):
        dlg.get_by_role("button", name="Add subtask").click()
    texts = dlg.locator('.subtasks input[type="text"]')
    texts.nth(0).fill("Make a list")
    texts.nth(1).fill("Check the diary")
    set_control(dlg.locator('.subtasks input[type="checkbox"]').first, True)
    dlg.get_by_role("button", name="Save").click()
    expect(pg.locator("dialog[open]")).to_have_count(0)

    dlg = open_row("Plan the week")
    texts = dlg.locator('.subtasks input[type="text"]')
    expect(texts).to_have_count(2)
    expect(texts.nth(0)).to_have_value("Make a list")
    expect(texts.nth(1)).to_have_value("Check the diary")
    expect(dlg.locator('.subtasks input[type="checkbox"]').nth(0)).to_be_checked()
    expect(dlg.locator('.subtasks input[type="checkbox"]').nth(1)).not_to_be_checked()

    # Repeat: the next task appears when this one is done.
    dlg.locator("summary").click()
    set_control(dlg.locator("#f-repeat-every"), "after")
    set_control(dlg.locator("#f-repeat-n"), 3)
    dlg.get_by_role("button", name="Save").click()
    expect(pg.locator("dialog[open]")).to_have_count(0)
    set_control(pg.locator(".list li", has_text="Plan the week").locator("input[type=checkbox]").first, True)
    expect(pg.locator("#toast")).to_contain_text("The next one is due")
    expect(pg.locator(".list li", has_text="Plan the week")).to_have_count(2)
    expect(pg.locator(".list li.done", has_text="Plan the week")).to_have_count(1)

    # Waiting on another task.
    quick_add("First thing")
    quick_add("Second thing")
    expect(pg.locator(".list li", has_text="Second thing")).to_have_count(1)
    dlg = open_row("Second thing")
    dlg.locator("summary").click()
    dlg.locator(".blocked select").select_option(label="First thing")
    dlg.locator(".blocked").get_by_role("button", name="Add", exact=True).click()
    expect(dlg.locator(".blocked li", has_text="First thing")).to_have_count(1)
    dlg.get_by_role("button", name="Save").click()
    expect(pg.locator("dialog[open]")).to_have_count(0)
    set_control(pg.locator(".list li", has_text="First thing").locator("input[type=checkbox]").first, True)
    expect(pg.locator("#toast")).to_contain_text("Ready now: Second thing")

    b.close()

assert not errors, errors
assert not offsite, offsite
print("e2e_tasks: ok")
