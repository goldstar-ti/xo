"""Browser test for the Tracker screen.

Covers projects, items, the list, details, board, reports, keys, project lists, Today and the
tracker widgets.

Run after tests/e2e.py, against the same database (it signs in to the account that test created).
Fails on any console error (a missing text key logs one) and on any request that leaves the origin.

python tests/e2e_tracker.py [base_url] [screenshot_dir]
"""

import os
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
SHOTS = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/xo-shots")
SHOTS.mkdir(parents=True, exist_ok=True)
ORIGIN = urlparse(BASE).netloc
errors = []
offsite = []
yesterday = (date.today() - timedelta(days=1)).isoformat()
in_three = (date.today() + timedelta(days=3)).isoformat()


def dialog(pg):
    """The open dialog."""
    return pg.locator("dialog[open]")


def new_item(pg, title, due=""):
    """Creates an item in the current project through New item."""
    pg.get_by_role("button", name="New item").click()
    dialog(pg).locator("#f-title").fill(title)
    if due:
        dialog(pg).locator("#f-due").fill(due)
    dialog(pg).get_by_role("button", name="Create item").click()
    expect(dialog(pg)).to_have_count(0)


with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=os.environ.get("XO_CHROME", "/usr/bin/google-chrome") or None, args=["--no-sandbox"]
    )
    ctx = b.new_context(viewport={"width": 1400, "height": 900}, timezone_id="Australia/Perth", locale="en-AU")
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

    # The Tracker screen starts with no projects.
    pg.locator(".side").get_by_role("link", name="Tracker").click()
    expect(pg.locator("h1")).to_have_text("Tracker")
    expect(pg.get_by_text("No projects yet")).to_be_visible()

    # A project; a bad key is refused first.
    pg.get_by_role("button", name="New project").click()
    dialog(pg).locator("#f-name").fill("Home office")
    dialog(pg).locator("#f-key").fill("9X")
    dialog(pg).get_by_role("button", name="Create project").click()
    expect(dialog(pg).locator(".form-error")).to_contain_text("starting with a letter")
    dialog(pg).locator("#f-key").fill("HO")
    dialog(pg).get_by_role("button", name="Create project").click()
    projects = pg.get_by_role("tablist", name="Projects")
    expect(projects.get_by_role("tab", name="Home office")).to_have_attribute("aria-selected", "true")

    # Items: the first is overdue, the second due in three days.
    new_item(pg, "Fix the printer", yesterday)
    detail = pg.get_by_role("complementary", name="Item details")
    expect(detail.locator("[data-focus='title']")).to_have_value("Fix the printer")
    expect(detail).to_contain_text("HO-1")
    assert pg.evaluate("location.hash") == "#/tracker/HO-1"
    new_item(pg, "Order toner", in_three)
    expect(detail).to_contain_text("HO-2")

    # Fields, labels, checklist, comment, link.
    detail.locator("[data-field='status']").select_option("in progress")
    expect(detail).to_contain_text("Status changed from new to in progress.")
    detail.locator("#tr-f-labels").fill("hardware, Urgent")
    detail.locator("#tr-f-labels").press("Tab")
    expect(detail.locator("#tr-f-labels")).to_have_value("hardware, urgent")
    step = detail.locator("[data-focus='check']")
    step.fill("Check the cartridge model")
    step.press("Enter")
    expect(detail).to_contain_text("Checklist: 0 of 1 ticked")
    step = detail.locator("[data-focus='check']")
    step.fill("Place the order")
    step.press("Enter")
    expect(detail).to_contain_text("Checklist: 0 of 2 ticked")
    detail.get_by_role("checkbox", name="Check the cartridge model").check()
    expect(detail).to_contain_text("Checklist: 1 of 2 ticked")
    detail.locator("[data-focus='comment']").fill("Asked for a quote.")
    detail.get_by_role("button", name="Add comment").click()
    expect(detail).to_contain_text("Asked for a quote.")
    detail.get_by_label("Link type").select_option("blocks")
    detail.get_by_label("Item reference, such as XO-3").fill("HO-1")
    detail.get_by_role("button", name="Add link").click()
    expect(detail).to_contain_text("HO-1 Fix the printer")
    # The other end shows the inverse.
    detail.get_by_role("button", name="HO-1 Fix the printer").click()
    expect(detail).to_contain_text("blocked by")
    expect(detail).to_contain_text("HO-2 Order toner")

    # List: both open items; the overdue due date is marked; search narrows it.
    detail.get_by_role("button", name="Back to the list").click()
    rows = pg.locator("table[aria-label='Items'] tbody tr")
    expect(rows).to_have_count(2)
    expect(rows.filter(has_text="Fix the printer").locator("td.tw\\:text-danger")).to_have_count(1)
    pg.locator("[data-focus='search']").fill("toner")
    expect(rows).to_have_count(1)
    pg.locator("[data-focus='search']").fill("")
    expect(rows).to_have_count(2)
    pg.get_by_label("Saved view").select_option("overdue")
    expect(rows).to_have_count(1)
    pg.get_by_role("button", name="Save view").click()
    dialog(pg).locator("#f-name").fill("Late ones")
    dialog(pg).get_by_role("button", name="Save").click()
    expect(pg.get_by_label("Saved view").locator("option", has_text="Late ones")).to_have_count(1)
    pg.get_by_role("button", name="Clear filters").click()
    expect(rows).to_have_count(2)

    # Bulk: tick both, set priority high.
    pg.get_by_role("checkbox", name="Tick HO-1").check()
    pg.get_by_role("checkbox", name="Tick HO-2").check()
    pg.get_by_label("Set priority").select_option("high")
    expect(pg.locator("#toast")).to_contain_text("2 items changed.")
    expect(rows.filter(has_text="high")).to_have_count(2)

    # Keys: j opens the first row, j again the next, ? lists the keys.
    pg.locator("h1").click()
    pg.keyboard.press("j")
    expect(detail).to_be_visible()
    first = detail.locator("[data-focus='title']").input_value()
    pg.locator("h1").click()
    pg.keyboard.press("j")
    expect(detail.locator("[data-focus='title']")).not_to_have_value(first)
    pg.locator("h1").click()
    pg.keyboard.press("?")
    expect(dialog(pg)).to_contain_text("Tracker keys")
    dialog(pg).get_by_role("button", name="Close").click()
    pg.keyboard.press("Escape")

    # Board: a column per status; dragging a card changes its status.
    pg.get_by_role("tab", name="Board").click()
    board = pg.get_by_role("list", name="Board")
    expect(board.locator("[data-status='needs test']")).to_be_visible()
    card = board.locator("[data-id]", has_text="Order toner")
    card.drag_to(board.locator("[data-status='needs test']"))
    expect(board.locator("[data-status='needs test'] [data-id]", has_text="Order toner")).to_have_count(1)
    pg.screenshot(path=SHOTS / "tracker-board.png")

    # Needs test: Passed moves it to verified, which closes it.
    pg.get_by_role("tab", name="Needs test").click()
    expect(pg.locator("article", has_text="Order toner")).to_be_visible()
    pg.get_by_role("button", name="Passed").click()
    expect(pg.get_by_text("Nothing is waiting for a test.")).to_be_visible()

    # Pivot: a count opens the List with that filter.
    pg.get_by_role("tab", name="Pivot").click()
    pivot = pg.get_by_role("table", name="Pivot")
    expect(pivot).to_contain_text("verified")
    pivot.locator("tr", has_text="verified").get_by_role("button").first.click()
    expect(pg.get_by_role("tab", name="List")).to_have_attribute("aria-selected", "true")
    expect(rows).to_have_count(1)
    pg.get_by_role("button", name="Clear filters").click()

    # History and Activity.
    pg.get_by_role("tab", name="History").click()
    expect(pg.locator(".tr")).to_contain_text("Status changed from needs test to verified.")
    pg.get_by_role("tab", name="Activity").click()
    expect(pg.get_by_role("table", name="Activity by week")).to_be_visible()
    expect(pg.locator(".tr")).to_contain_text("1 open now, 1 overdue.")
    pg.get_by_role("tab", name="Handover").click()
    expect(pg.get_by_text("No handover items.")).to_be_visible()

    # Project settings: rename a status; the item using it follows.
    pg.get_by_role("tab", name="List").click()
    pg.get_by_role("button", name="Project settings").click()
    dialog(pg).locator("summary", has_text="Statuses").click()
    dialog(pg).get_by_label("Statuses, value 1").fill("to do")
    dialog(pg).get_by_label("Statuses, value 1").press("Tab")
    dialog(pg).get_by_role("button", name="Save").click()
    expect(dialog(pg)).to_have_count(0)
    expect(rows.filter(has_text="Fix the printer")).to_contain_text("to do")

    # A second project with its own key; All projects shows both.
    pg.get_by_role("button", name="New project").click()
    dialog(pg).locator("#f-name").fill("Garden")
    dialog(pg).locator("#f-key").fill("GA")
    dialog(pg).get_by_role("button", name="Create project").click()
    new_item(pg, "Prune the lemon tree")
    expect(detail).to_contain_text("GA-1")
    detail.get_by_role("button", name="Back to the list").click()
    projects.get_by_role("tab", name="All projects").click()
    pg.get_by_role("checkbox", name="Open only").uncheck()
    expect(rows).to_have_count(3)
    pg.screenshot(path=SHOTS / "tracker-list.png")

    # A reference in the address opens the item.
    pg.goto(f"{BASE}/#/tracker/HO-1")
    expect(detail.locator("[data-focus='title']")).to_have_value("Fix the printer")

    # Today lists the overdue tracker item under Coming up.
    pg.locator(".side").get_by_role("link", name="Today").click()
    expect(pg.locator(".list li", has_text="Fix the printer")).to_contain_text("Tracker HO-1")

    # The tracker widgets render on the canvas.
    pg.locator(".side").get_by_role("link", name="Canvas").click()
    pg.wait_for_selector(".xo-canvas .xo-board", timeout=20000)
    for wid in ("tracker-due", "tracker-summary", "tracker-board", "tracker"):
        pg.get_by_role("button", name="Widgets", exact=True).click()
        pg.locator(f"dialog.xo-pop[open] [data-widget='{wid}']").check()
        pg.locator("dialog.xo-pop[open]").get_by_role("button", name="Close", exact=True).click()
        expect(pg.locator(f".xo-board [data-widget='{wid}'] .xo-w-body > *").first).to_be_attached()
    expect(pg.locator(".xo-board [data-widget='tracker-due']")).to_contain_text("Fix the printer")
    expect(pg.locator(".xo-board [data-widget='tracker-summary']")).to_contain_text("Home office")
    assert pg.evaluate("location.hash") == "#/canvas"
    pg.locator(".xo-board [data-widget='tracker-due']").get_by_role("button", name="Fix the printer").click()
    expect(pg).to_have_url(f"{BASE}/#/tracker/HO-1")

    # NOBBIE's tracker, served here by a stand-in for XO's server route: a read-only project.
    nobbie_doc = {
        "enabled": True,
        "url": "https://nobbie.example/nobbie",
        "fetched_at": 1764100000,
        "vocab": {
            "status": [{"value": "new"}, {"value": "verified", "meta": {"closed": True}}],
            "kind": [{"value": "bug"}],
            "priority": [{"value": "high"}],
        },
        "items": [
            {
                "id": 7,
                "title": "Rotate the backup key",
                "status": "new",
                "kind": "bug",
                "priority": "high",
                "body": "Key is old.",
                "created_at": "2026-11-20T01:00:00+00:00",
                "updated_at": "2026-11-21T01:00:00+00:00",
            },
        ],
    }
    nobbie_item = {
        "id": 7,
        "events": [
            {
                "event_type": "comment",
                "note": "Waiting on Theiva.",
                "actor": "pj",
                "created_at": "2026-11-21T01:00:00+00:00",
            },
        ],
    }
    pg.route("**/api/tracker/nobbie", lambda route: route.fulfill(json=nobbie_doc))
    pg.route("**/api/tracker/nobbie?*", lambda route: route.fulfill(json=nobbie_doc))
    pg.route("**/api/tracker/nobbie/items/7", lambda route: route.fulfill(json=nobbie_item))
    pg.goto(f"{BASE}/#/tracker")
    pg.reload()
    projects.get_by_role("tab", name="NOBBIE").click()
    expect(pg.get_by_text("Fetched from NOBBIE at")).to_be_visible()
    expect(rows).to_have_count(1)
    expect(rows.first.get_by_role("checkbox")).to_have_count(0)
    expect(pg.get_by_role("button", name="Project settings")).to_be_hidden()
    rows.first.get_by_role("button", name="Rotate the backup key").click()
    expect(detail).to_contain_text("NOB-7")
    expect(detail).to_contain_text("XO shows it but cannot change it.")
    expect(detail).to_contain_text("Waiting on Theiva.")
    expect(detail.locator("input, textarea, select")).to_have_count(0)
    expect(detail.get_by_role("link", name="Open in NOBBIE")).to_have_attribute(
        "href", "https://nobbie.example/nobbie/pm?item=7"
    )
    pg.get_by_role("tab", name="Board").click()
    expect(pg.get_by_role("list", name="Board").locator("[data-id='nob:7']")).not_to_have_attribute("draggable", "true")

    b.close()

assert not errors, errors
assert not offsite, offsite
print("tracker ok")
