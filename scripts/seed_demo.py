"""Fill XO with made-up data so every screen has something to show.

Run it inside the app container, from the project folder:

    make seed-demo           # add or refresh the demo data
    make seed-demo-remove    # take the demo data out again

The data runs from 61 days before today to 30 days after, in the user's own time zone. Every id and name is made up.
Running it again writes the same ids, so the counts do not grow. Demo items are marked: their ids contain "demo-"
(notes are "note:demo-<n>") or their payload carries "demo": true.

Two things are not marked and overwrite the real ones: check-ins ("checkin:<type>:<day>") and the "plan" singleton.
Run it only on a database where that is acceptable.

No reminders are written. The browser builds them the next time an item is saved.
"""

import argparse
import asyncio
import random
import sys
from collections.abc import Iterator
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import SessionLocal
from app.models import Item, User
from app.text import load_text

BACK_DAYS = 61
AHEAD_DAYS = 30
SEED = 20261128
CHUNK = 400

Row = tuple[str, str, date | None, Any]  # id, kind, day, payload


def _ymd(day: date) -> str:
    return day.isoformat()


def _iso(day: date, hour: int, minute: int, zone: ZoneInfo) -> str:
    """Return a UTC timestamp for a local time on a day."""
    local = datetime.combine(day, time(hour, minute), tzinfo=zone)
    return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _js_weekday(day: date) -> int:
    """Return the weekday the way the browser counts it: Sunday is 0."""
    return (day.weekday() + 1) % 7


# ---- wording ----

APPT_PLAIN = [
    ("GP check-up", "Eastside Medical Centre"),
    ("Counselling session", "Riverside Clinic"),
    ("Dentist", "Smile Dental"),
    ("Coffee with Sam", "Corner Cafe"),
    ("Supervision appointment", "Community Corrections office"),
    ("Job interview", "Harbour Logistics"),
    ("Physio", "Active Health"),
    ("Lunch with Mum", "Her place"),
    ("Haircut", "Tony's Barbers"),
    ("Pick up prescription", "Town Chemist"),
    ("Employment agency", "Jobs Hub"),
    ("Library visit", "Central Library"),
    ("Car service", "Quick Auto"),
    ("Peer support group", "Community Hall"),
    ("Family dinner", "Aunty Lee's"),
    ("Bank appointment", "Main street branch"),
    ("Review with Dr Anika", "Eastside Medical Centre"),
    ("Call with Dylan", ""),
    ("Volunteer shift", "Op shop"),
    ("Work shift", "Harbour Logistics"),
    ("Walk with Mei", "River path"),
    ("Group program", "Community Hall"),
]
APPT_COURT = [
    ("Court mention", "Magistrates Court, level 3"),
    ("Meeting with Priya, legal aid", "Legal Aid office"),
    ("Pre-hearing conference", "Legal Aid office"),
    ("Court-ordered assessment", "Assessment centre"),
    ("Court hearing", "Magistrates Court, level 2"),
]
APPT_NOTES = [
    "Bring ID and the letter.",
    "Ask about the next step.",
    "Wear something comfortable.",
    "Take the folder with the paperwork.",
]

# Each bucket is a list of titles. Titles in COURT get the project "Court".
TASKS_DONE = [
    "Renew library card",
    "Call the dentist",
    "Book the GP",
    "Clear the email inbox",
    "Return the borrowed drill",
    "Wash the car",
    "Sort the pantry",
    "Pay the parking fine",
    "Update my resume",
    "Take the old clothes to the op shop",
    "Fix the bike tyre",
    "Buy a birthday card for Mum",
    "Change the bed sheets",
    "Reply to Dylan",
    "Defrost the freezer",
    "Back up the phone photos",
    "Pick up the parcel",
    "Mow the lawn",
    "Print the lease copy",
    "Charge the power bank",
    "Set up the pill organiser",
    "Cancel the old gym trial",
    "Collect letter from program",
    "Print character references",
    "Fill in legal aid form",
    "Walk to the shops for milk",
    "Clean the bathroom",
    "Sweep the balcony",
    "Order new running shoes",
    "Tidy the desk",
]
TASKS_DOING = [
    "Write the cover letter",
    "Sort the paperwork folder",
    "Plan next week's meals",
    "Clean the oven",
    "Fill in the tax return",
    "Organise the garage shelves",
    "Gather payslips for court",
    "Learn the bus route to the clinic",
]
TASKS_OVERDUE = [
    "Return the library books",
    "Book the car service",
    "Call the council about rates",
    "Reply to the landlord",
    "Post the parcel",
    "Renew the gym card",
    "Write down questions for lawyer",
    "Buy light globes",
    "Check the smoke alarm",
    "Drop off the dry cleaning",
]
TASKS_WEEK = [
    "Buy groceries",
    "Do the washing",
    "Book the dentist check-up",
    "Ring Aunty Lee",
    "Ask Priya about the hearing date",
    "Pay the phone bill",
    "Water the plants",
    "Take out the bins",
    "Check the mail",
    "Clean the kitchen",
    "Go for a walk",
    "Charge the phone",
    "Book transport for court day",
    "Meal prep for the week",
    "Call the employment agency",
    "Refill the prescription",
]
TASKS_MONTH = [
    "Book the eye test",
    "Renew car registration",
    "Declutter the wardrobe",
    "Service the bike",
    "Buy a new mattress cover",
    "Plan the weekend away",
    "Review the budget",
    "Replace the bathroom mirror",
    "Iron court clothes",
    "Call the insurer about the policy",
    "Get a spare key cut",
    "Clear out the storage box",
    "Buy winter boots",
    "Update the emergency contacts",
    "Paint the fence",
    "Sign up for the evening class",
]
TASKS_UNDATED = [
    "Learn a few chords on the guitar",
    "Read the book from the library",
    "Look into a short course",
    "Sort old photos",
    "Find a good local gym",
    "Try the new pie shop",
    "Write a list of films to watch",
    "Research a standing desk",
    "Visit the markets",
    "Make a playlist for walking",
]
COURT = {
    "Collect letter from program",
    "Print character references",
    "Fill in legal aid form",
    "Gather payslips for court",
    "Ask Priya about the hearing date",
    "Book transport for court day",
    "Write down questions for lawyer",
    "Iron court clothes",
}
SUBTASKS = {
    "Write the cover letter": ["Read the job ad", "Draft the first paragraph", "Ask Sam to read it"],
    "Sort the paperwork folder": ["Bin the old bills", "File the lease", "Scan the ID"],
    "Plan next week's meals": ["Check the pantry", "Write the list", "Order online"],
    "Fill in the tax return": ["Find the income statement", "List the deductions", "Lodge it"],
    "Gather payslips for court": ["Ask the employer", "Print the last six", "Put them in the folder"],
    "Clean the oven": ["Soak the racks", "Wipe the walls"],
    "Plan the weekend away": ["Pick a place", "Book the room", "Check the bus times"],
    "Declutter the wardrobe": ["Pull out what does not fit", "Bag it for the op shop"],
    "Buy groceries": ["Check the fridge", "Buy fruit and veg", "Buy bread and milk"],
    "Meal prep for the week": ["Cook rice", "Chop vegetables", "Fill the containers"],
    "Book transport for court day": ["Check the train times", "Book a ride as a backup"],
    "Review the budget": ["List the bills", "Check the bank balance", "Set the weekly amount"],
}
REPEATS = {
    "Do the washing": {"every": "week", "n": 1},
    "Take out the bins": {"every": "week", "n": 1},
    "Water the plants": {"every": "after", "n": 3},
    "Review the budget": {"every": "month", "n": 1},
    "Clean the kitchen": {"every": "week", "n": 2},
    "Check the mail": {"every": "after", "n": 2},
}

ROUTINES = [
    ("Breakfast", "08:00", "meal"),
    ("Morning medication", "08:15", "meds"),
    ("Water", "10:30", "water"),
    ("Lunch", "12:30", "meal"),
    ("Walk", "16:30", "other"),
    ("Dinner", "18:30", "meal"),
    ("Evening medication", "21:00", "meds"),
    ("Bed by 10:30", "22:30", "sleep"),
]

# name, amount, repeat, autopay, due offset in days from today, paid offset in days (negative: days ago), or None.
BILLS = [
    ("Rent", 460.00, "fortnightly", False, 4, -10),
    ("Phone", 55.00, "monthly", True, 9, -21),
    ("Phone handset repayment", 32.00, "monthly", True, 9, -21),
    ("Power", 310.50, "quarterly", False, 17, None),
    ("Gas", 120.25, "quarterly", False, 23, None),
    ("Water", 182.00, "quarterly", False, 29, None),
    ("Council rates", 410.00, "quarterly", False, -3, None),
    ("Internet", 79.00, "monthly", True, 12, -18),
    ("Gym", 22.50, "fortnightly", True, 2, -12),
    ("Streaming, films", 16.99, "monthly", True, 6, -24),
    ("Streaming, shows", 12.99, "monthly", True, 15, -15),
    ("Music", 13.99, "monthly", True, 20, -10),
    ("Cloud storage", 4.49, "monthly", True, 25, -5),
    ("Car registration", 892.00, "yearly", False, 28, None),
    ("Car insurance", 68.00, "monthly", True, 7, -23),
    ("Contents insurance", 24.00, "monthly", True, 11, -19),
    ("Health insurance", 143.00, "monthly", True, 3, -27),
    ("Credit card", 150.00, "monthly", False, -1, -29),
    ("Licence renewal", 85.00, "yearly", False, 26, None),
    ("Buy now pay later instalment", 47.50, "fortnightly", True, 1, -13),
]

DUTIES = [
    {
        "title": "Weekly report to community corrections",
        "detail": "Report in person on Tuesdays. Bring the diary.",
        "contact": "Officer Jordan",
        "schedule": "weekly",
        "weekday": "2",
        "time": "10:00",
    },
    {
        "title": "Curfew",
        "detail": "At home between 9 pm and 6 am.",
        "contact": "",
        "schedule": "daily",
        "weekday": "1",
        "time": "20:45",
    },
    {
        "title": "Group program",
        "detail": "Thursday evening session. Tell Mei if I cannot make it.",
        "contact": "Mei, facilitator",
        "schedule": "weekly",
        "weekday": "4",
        "time": "18:00",
    },
    {
        "title": "No contact condition",
        "detail": "No contact with the people named in the order. Ask Priya if I am unsure about a situation.",
        "contact": "Priya, legal aid",
        "schedule": "none",
        "weekday": "1",
        "time": "09:00",
    },
]
REPORT_LINES = [
    "Reported in. Talked about work and the walk routine.",
    "Reported in. Handed over the diary pages.",
    "Reported in. Officer Jordan asked about the new job.",
    "Reported in. Nothing new to add.",
    "Reported in. Booked the next appointment.",
    "Reported in. Talked about sleep and how the week went.",
    "Reported in. Showed the bus pass and the shift roster.",
    "Reported in. Quiet week, kept to the plan.",
    "Reported in. Talked about the court date.",
]
REPORT_EXTRA = [
    ("Rang Mei to say I would miss group. Shift ran late.", "Mei"),
    ("Told Officer Jordan about the change of address for the mail.", "Officer Jordan"),
    ("Told Priya I got the letter about the hearing.", "Priya"),
]

GOODLIFE = [
    "A walk before lunch.",
    "Call Mum tonight.",
    "Finish the cover letter.",
    "Cook a proper dinner.",
    "Get to the shift on time.",
    "Tidy the desk.",
    "Go to the library.",
    "Text Sam back.",
    "Do the washing.",
    "Drink enough water.",
    "Be at the clinic early.",
    "Read for twenty minutes.",
]
OK_LINES = [
    "Made a proper lunch.",
    "Got out for a walk.",
    "Cleared the inbox.",
    "Caught up with Sam.",
    "Finished a task I was avoiding.",
    "Slept better than last night.",
    "The bus was on time.",
    "Cooked dinner instead of ordering.",
    "Called Mum.",
    "Kept to the routine.",
]
FIRST_LINES = [
    "Make breakfast and take my tablets.",
    "Walk to the shops.",
    "Answer the emails.",
    "Ring the clinic.",
    "Get the washing on.",
    "Go through the paperwork folder.",
    "Leave early for the appointment.",
]
SIGNS_ACTION = [
    "Rang Sam and went for a walk.",
    "Stepped away from the screen and made tea.",
    "Told Mei at group.",
]
WEEKLY = {
    "working": [
        "The morning walk and keeping the routine. Sleeping better.",
        "Meal times and the diary. Checking in with Sam helps.",
        "Going to bed on time. The phone stays out of the bedroom.",
    ],
    "slipping": [
        "Water, I keep forgetting until the afternoon.",
        "Staying up late on the weekend.",
        "Not answering messages for a few days.",
    ],
    "changed": [
        "New shifts at work. The plan does not cover the late finish yet.",
        "Mum has been unwell, so I am visiting more.",
        "A new neighbour moved in. Nothing to add yet.",
    ],
    "signs": [
        "None this week.",
        "One quiet evening where I felt flat. I called Sam.",
        "A bit more time alone than usual. I went to the library instead.",
    ],
    "change": [
        "Phone off at ten each night.",
        "Walk every day, even a short one.",
        "Plan the evenings ahead.",
    ],
}

PLAN_ANSWERS = {
    "good_matters": "Steady work, a place of my own, and being someone Mum can rely on.",
    "good_ways": "Keep working, see Sam and Mei each week, stay active and eat properly.",
    "strengths": "I am reliable, I can cook, and I am good at sticking to a routine once it is set.",
    "lean": "Sam, Mum, Mei at group and Priya at legal aid.",
    "around": "I was out of work, living alone and not sleeping. Days had no shape.",
    "feeling": "Flat and cut off. I wanted to feel like part of something and did not know how.",
    "online_part": "I spent most nights online with nobody checking in. It filled the hours.",
    "risk": "Feeling low or alone, long evenings with nothing planned, being awake late on my own.",
    "device_plan": "Devices stay in the lounge at night. The router has a schedule and Sam knows the password.",
    "safety_plan": "I keep to places where other adults are around and tell Sam where I will be.",
    "signs": "Staying in more. Skipping the walk. Going to bed after midnight. Not replying to Sam.",
    "instead": "Ring Sam first, then go for a walk. If it is late, text Mei and go to bed anyway.",
    "harm": "Real people are hurt. I want to be part of the solution, so I keep to the plan and the program.",
    "team": "Sam 0400 000 101\nMei 0400 000 102\nPriya, legal aid 0400 000 103\nMum 0400 000 104",
    "conditions": "Report to Officer Jordan on Tuesdays, curfew 9 pm to 6 am, group on Thursdays.",
    "slip": "Stop, tell Sam straight away, ring Mei, and write down what happened in the diary.",
    "online_before": "Most evenings online until late, with little sleep.",
    "online_now": "Work in the day, a walk, cooking, and a call with Sam. Screens off by ten.",
    "online_gave": "Company and something to do when the evenings were empty.",
    "online_avoid": "Feeling lonely and not knowing what to do with myself.",
    "online_filled": "Walks, cooking, library visits and the weekly group.",
    "online_unfilled": "Weekends still feel long.",
    "online_add": "Join the Saturday running group.",
    "signed": "Signed and dated.",
    "contact_extra": "Written in my own words.",
}

NOTES = [
    ("Shopping list", "- Milk\n- Bread\n- Eggs\n- Bananas\n- Rice\n- **Tablets** from the chemist\n"),
    (
        "Questions for Dr Anika",
        "1. Is the dose still right?\n2. Can I have the blood test results?\n3. Sleep: what else can I try?\n",
    ),
    (
        "Meal ideas",
        "## Quick dinners\n\n- Fried rice\n- Pasta with tomato and tuna\n- Omelette and salad\n"
        "- Soup from the freezer\n",
    ),
    (
        "Job interview notes",
        "**Harbour Logistics**\n\nAsk about the roster. Bring the resume and ID. Arrive ten minutes early.\n",
    ),
    (
        "Things that help",
        "- A walk, even a short one\n- Ring Sam\n- Make tea and sit outside\n- Music on the way to work\n",
    ),
    ("Budget plan", "## Each fortnight\n\n- Rent first\n- Bills on autopay\n- Groceries: $120\n- The rest is for me\n"),
    ("Books to read", "- The one Mum recommended\n- Something about birds\n- A cookbook from the library\n"),
    (
        "Court day checklist",
        "- [ ] ID\n- [ ] Letter from the program\n- [ ] Payslips\n- [ ] Clean shirt\n- [ ] Leave by 8:15\n",
    ),
    ("Garden jobs", "Water the tomatoes in the morning. Prune the lemon tree in winter. Buy pots for the herbs.\n"),
    ("Gift ideas for Mum", "A good umbrella. A voucher for the bookshop. Lunch out at the cafe she likes.\n"),
    (
        "Walking routes",
        "1. **River path:** 30 minutes, flat.\n2. **Hill loop:** 50 minutes, steep start.\n"
        "3. **Shops and back:** 20 minutes.\n",
    ),
    ("Weekly rhythm", "| Day | What |\n| --- | --- |\n| Tue | Report in |\n| Thu | Group |\n| Sat | Walk with Mei |\n"),
]
PINNED = {1, 7}


def _chunks(rows: list[dict[str, Any]]) -> Iterator[list[dict[str, Any]]]:
    for start in range(0, len(rows), CHUNK):
        yield rows[start : start + CHUNK]


# ---- builders ----


def build_appointments(rng: random.Random, today: date) -> list[Row]:
    """Return 8 to 12 appointments a week, about one in six marked as court."""
    rows: list[Row] = []
    first = today - timedelta(days=BACK_DAYS)
    last = today + timedelta(days=AHEAD_DAYS)
    n = 0
    week = first
    while week <= last:
        span = min(7, (last - week).days + 1)
        count = round(rng.randint(8, 12) * span / 7)
        for _ in range(count):
            day = week + timedelta(days=rng.randrange(span))
            court = n % 6 == 3
            title, where = rng.choice(APPT_COURT if court else APPT_PLAIN)
            if court:
                hour, minute = rng.choice([(9, 0), (9, 30), (10, 0), (13, 30)])
            else:
                hour, minute = rng.choice([(8, 30), (9, 0), (10, 30), (11, 0), (12, 30), (14, 0), (15, 30), (17, 0)])
            payload: dict[str, Any] = {
                "title": title,
                "date": _ymd(day),
                "time": f"{hour:02d}:{minute:02d}",
                "where": where,
                "travel": 45 if court else rng.choice([10, 15, 20, 30, 40]),
                "prep": 45 if court else rng.choice([10, 15, 20, 30]),
                "notes": rng.choice(APPT_NOTES) if court or rng.random() < 0.2 else "",
                "court": court,
                "custom": {},
                "demo": True,
            }
            n += 1
            rows.append((f"demo-appointment-{n}", "appointment", day, payload))
        week += timedelta(days=7)
    return rows


def build_tasks(rng: random.Random, today: date, zone: ZoneInfo, tag_ids: list[str], place_ids: list[str]) -> list[Row]:
    """Return 90 tasks: 30 done, 8 doing, 10 overdue, 16 due this week, 16 next month and 10 undated."""
    rows: list[Row] = []
    n = 0
    plan = (
        [("done", t) for t in TASKS_DONE]
        + [("doing", t) for t in TASKS_DOING]
        + [("overdue", t) for t in TASKS_OVERDUE]
        + [("week", t) for t in TASKS_WEEK]
        + [("month", t) for t in TASKS_MONTH]
        + [("undated", t) for t in TASKS_UNDATED]
    )
    doing_seen = 0
    for bucket, title in plan:
        n += 1
        status = "done" if bucket == "done" else "doing" if bucket == "doing" else "todo"
        due = ""
        done_at = ""
        if bucket == "done":
            done_day = today - timedelta(days=rng.randint(1, BACK_DAYS - 3))
            due = _ymd(done_day + timedelta(days=rng.randint(-2, 3))) if rng.random() < 0.7 else ""
            done_at = _iso(done_day, rng.randint(9, 19), rng.randint(0, 59), zone)
            created = _iso(done_day - timedelta(days=rng.randint(1, 10)), 9, 0, zone)
            touched = done_at
        else:
            if bucket == "doing":
                due = _ymd(today + timedelta(days=rng.randint(-1, 9))) if rng.random() < 0.7 else ""
            elif bucket == "overdue":
                due = _ymd(today - timedelta(days=rng.randint(1, 12)))
            elif bucket == "week":
                due = _ymd(today + timedelta(days=rng.randint(0, 6)))
            elif bucket == "month":
                due = _ymd(today + timedelta(days=rng.randint(8, AHEAD_DAYS)))
            created = _iso(today - timedelta(days=rng.randint(8, 40)), 9, 0, zone)
            touched = _iso(today - timedelta(days=rng.randint(0, 6)), rng.randint(8, 20), rng.randint(0, 59), zone)
        picked = ""
        if bucket == "doing":
            doing_seen += 1
            if doing_seen <= 3:
                picked = _ymd(today)
        subs = [
            {"id": f"demo-sub-{n}-{i + 1}", "title": s, "done": status == "done" or (status == "doing" and i == 0)}
            for i, s in enumerate(SUBTASKS.get(title, []))
        ]
        repeat = REPEATS.get(title) if bucket in ("overdue", "week", "month") and due else None
        priority = rng.choices(["high", "normal", "low"], [2, 6, 2])[0]
        payload = {
            "title": title,
            "step": "",
            "est": rng.choice([10, 15, 20, 30, 45, 60]),
            "due": due,
            "priority": priority,
            "tags": rng.sample(tag_ids, rng.randint(0, min(2, len(tag_ids)))) if tag_ids else [],
            "places": rng.sample(place_ids, rng.randint(0, 1)) if place_ids else [],
            "subtasks": subs,
            "energy": rng.choice(["", "low", "medium", "high"]),
            "project": "Court" if title in COURT else "",
            "notes": "",
            "status": status,
            "done": status == "done",
            "doneAt": done_at,
            "today": picked,
            "created": created,
            "touched": touched,
            "custom": {},
            "demo": True,
        }
        if repeat:
            payload["repeat"] = {"every": "none", "n": 1, "weekday": 1, "nth": 1, **repeat}
        rows.append((f"demo-task-{n}", "task", None, payload))
    return rows


def build_routines(rng: random.Random, today: date) -> list[Row]:
    """Return the routine items and their ticks on about 80% of past days."""
    rows: list[Row] = []
    for i, (label, at, kind) in enumerate(ROUTINES, start=1):
        rid = f"demo-routine-{i}"
        rows.append(
            (
                rid,
                "routine",
                None,
                {"label": label, "time": at, "type": kind, "active": True, "custom": {}, "demo": True},
            )
        )
        for back in range(1, BACK_DAYS + 1):
            if rng.random() < 0.8:
                day = today - timedelta(days=back)
                rows.append((f"tick:{rid}:{_ymd(day)}", "tick", day, None))
    return rows


def build_bills(today: date) -> list[Row]:
    """Return 20 bills with a mix of due dates, some overdue and some paid recently."""
    rows: list[Row] = []
    for i, (name, amount, repeat, auto, due_off, paid_off) in enumerate(BILLS, start=1):
        payload: dict[str, Any] = {
            "name": name,
            "amount": amount,
            "due": _ymd(today + timedelta(days=due_off)),
            "repeat": repeat,
            "autopay": auto,
            "notes": "",
            "finished": False,
            "custom": {},
            "demo": True,
        }
        if paid_off is not None:
            payload["lastPaid"] = _ymd(today + timedelta(days=paid_off))
        rows.append((f"demo-bill-{i}", "bill", None, payload))
    return rows


def build_duties(rng: random.Random, today: date) -> list[Row]:
    """Return the four duties, their ticks on scheduled days and the weekly reports."""
    rows: list[Row] = []
    for i, duty in enumerate(DUTIES, start=1):
        oid = f"demo-obligation-{i}"
        rows.append((oid, "obligation", None, {**duty, "custom": {}, "demo": True}))
        if duty["schedule"] == "none":
            continue
        for back in range(1, BACK_DAYS + 1):
            day = today - timedelta(days=back)
            if duty["schedule"] == "weekly" and str(_js_weekday(day)) != duty["weekday"]:
                continue
            if rng.random() < (0.93 if duty["schedule"] == "daily" else 0.9):
                rows.append((f"tick:{oid}:{_ymd(day)}", "tick", day, None))
    n = 0
    for back in range(1, BACK_DAYS + 1):
        day = today - timedelta(days=back)
        if _js_weekday(day) == 2:
            line = REPORT_LINES[n % len(REPORT_LINES)]
            n += 1
            rows.append(
                (
                    f"demo-report-{n}",
                    "report",
                    None,
                    {"date": _ymd(day), "what": line, "who": "Officer Jordan", "custom": {}, "demo": True},
                )
            )
    for what, who in REPORT_EXTRA:
        n += 1
        day = today - timedelta(days=rng.randint(3, BACK_DAYS - 3))
        rows.append(
            (
                f"demo-report-{n}",
                "report",
                None,
                {"date": _ymd(day), "what": what, "who": who, "custom": {}, "demo": True},
            )
        )
    return rows


def _pick_group(rng: random.Random, groups: dict[str, list[str]], mood: str, count: int) -> list[str]:
    weights = {"good": ("positive", "neutral"), "ok": ("neutral", "positive"), "low": ("negative", "neutral")}[mood]
    pool: list[str] = []
    for key, share in zip(weights, (3, 2)):
        pool += list(groups.get(key, [])) * share
    chosen: list[str] = []
    while pool and len(chosen) < count:
        pick = rng.choice(pool)
        if pick not in chosen:
            chosen.append(pick)
    return chosen


def build_checkins(rng: random.Random, today: date, zone: ZoneInfo) -> list[Row]:
    """Return morning and evening check-ins on about 85% of past days, and a weekly review each Sunday."""
    words = load_text()["checkin"]
    body = words["body_chips"]
    did = words["day_chips"]
    sleep = words["sleep_chips"]
    fuel = words["fuel_chips"]
    signs = words["signs_chips"]
    rows: list[Row] = []
    for back in range(BACK_DAYS, 0, -1):
        day = today - timedelta(days=back)
        mood = rng.choices(["good", "ok", "low"], [5, 4, 1])[0]
        if rng.random() < 0.85:
            rows.append(
                (
                    f"checkin:morning:{_ymd(day)}",
                    "checkin",
                    day,
                    {
                        "sleep": rng.choice(sleep[1:] if mood != "low" else sleep[:3]),
                        "body": _pick_group(rng, body, mood, rng.randint(1, 3)),
                        "fuel": rng.choice(fuel),
                        "goodlife": rng.choice(GOODLIFE),
                        "type": "morning",
                        "at": _iso(day, 7, rng.randint(0, 50), zone),
                        "demo": True,
                    },
                )
            )
        if rng.random() < 0.85:
            sign = signs[0] if rng.random() < 0.9 else signs[2] if rng.random() < 0.7 else signs[1]
            payload: dict[str, Any] = {
                "did": _pick_group(rng, did, mood, rng.randint(2, 5)),
                "body": _pick_group(rng, body, mood, rng.randint(1, 3)),
                "signs": sign,
                "ok": rng.choice(OK_LINES),
                "first": rng.choice(FIRST_LINES),
                "type": "evening",
                "at": _iso(day, 21, rng.randint(0, 40), zone),
                "demo": True,
            }
            if sign != signs[0]:
                payload["signsAction"] = rng.choice(SIGNS_ACTION)
            rows.append((f"checkin:evening:{_ymd(day)}", "checkin", day, payload))
        if _js_weekday(day) == 0:
            weekly: dict[str, Any] = {k: rng.choice(v) for k, v in WEEKLY.items()}
            weekly.update({"type": "weekly", "at": _iso(day, 18, 30, zone), "demo": True})
            rows.append((f"checkin:weekly:{_ymd(day)}", "checkin", day, weekly))
    return rows


def build_plan() -> list[Row]:
    """Return the plan with every box of the online variant written."""
    sections = load_text()["plan"]["sections"]["online"]
    answers: dict[str, str] = {}
    for section in sections:
        for box in section["boxes"]:
            answers[box["k"]] = PLAN_ANSWERS.get(box["k"], "Written in my own words.")
    return [("plan", "plan", None, {"variant": "online", "answers": answers})]


def build_notes(rng: random.Random, today: date, zone: ZoneInfo) -> list[Row]:
    """Return 12 Markdown notes, two of them pinned."""
    rows: list[Row] = []
    for i, (title, body) in enumerate(NOTES):
        made = today - timedelta(days=rng.randint(15, BACK_DAYS))
        edited = made + timedelta(days=rng.randint(0, (today - made).days))
        payload = {
            "title": title,
            "body": body,
            "pinned": i in PINNED,
            "custom": {},
            "created": _iso(made, 10, 0, zone),
            "updated": _iso(edited, 14, 0, zone),
            "demo": True,
        }
        rows.append((f"note:demo-{i + 1}", "note", None, payload))
    return rows


# ---- database ----


async def _one_user(session: Any) -> User:
    users = (await session.execute(select(User))).scalars().all()
    if len(users) != 1:
        raise SystemExit(f"Expected one user, found {len(users)}")
    return users[0]


async def seed() -> None:
    """Upsert all demo items for the single user."""
    rng = random.Random(SEED)
    async with SessionLocal() as session:
        user = await _one_user(session)
        zone = ZoneInfo(user.tz)
        today = datetime.now(zone).date()
        meta = await session.get(Item, (user.id, "taskmeta"))
        data = meta.payload if meta is not None and not meta.deleted and isinstance(meta.payload, dict) else {}
        tag_ids = [x["id"] for x in data.get("tags", []) if isinstance(x, dict) and "id" in x]
        place_ids = [x["id"] for x in data.get("places", []) if isinstance(x, dict) and "id" in x]
        rows: list[Row] = [
            *build_appointments(rng, today),
            *build_tasks(rng, today, zone, tag_ids, place_ids),
            *build_routines(rng, today),
            *build_bills(today),
            *build_duties(rng, today),
            *build_checkins(rng, today, zone),
            *build_plan(),
            *build_notes(rng, today, zone),
        ]
        now = datetime.now(timezone.utc)
        values = [
            {"user_id": user.id, "id": i, "kind": k, "day": d, "payload": p, "deleted": False, "updated_at": now}
            for i, k, d, p in rows
        ]
        stmt = pg_insert(Item)
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id", "id"],
            set_={c: getattr(stmt.excluded, c) for c in ("kind", "day", "payload", "deleted", "updated_at")},
        )
        for chunk in _chunks(values):
            await session.execute(stmt, chunk)
        await session.commit()
        counts = (
            await session.execute(
                select(Item.kind, func.count())
                .where(Item.user_id == user.id, Item.deleted.is_(False))
                .group_by(Item.kind)
            )
        ).all()
    print(f"Seeded {len(rows)} items for {today}. Live items per kind:")
    for kind, count in sorted(counts):
        print(f"  {kind}: {count}")


async def remove() -> None:
    """Soft-delete every demo item except the plan."""
    async with SessionLocal() as session:
        user = await _one_user(session)
        stmt = (
            update(Item)
            .where(
                Item.user_id == user.id,
                Item.id != "plan",
                Item.deleted.is_(False),
                or_(Item.id.like("%demo-%"), Item.payload["demo"].astext == "true"),
            )
            .values(deleted=True, payload=None, updated_at=datetime.now(timezone.utc))
        )
        result = await session.execute(stmt)
        await session.commit()
    print(f"Removed {result.rowcount} demo items. The plan is kept.")


def main(argv: list[str]) -> None:
    """Parse the arguments and run the seed or the removal.

    Args:
        argv: The command-line arguments after the program name.
    """
    parser = argparse.ArgumentParser(
        prog="seed_demo.py",
        description=(
            "Fill XO with made-up data from 61 days back to 30 days ahead. Safe to run again: the same ids are "
            "written. Check-ins and the plan overwrite the real ones. No reminders are written; the browser builds "
            "them the next time an item is saved."
        ),
    )
    parser.add_argument(
        "--remove",
        action="store_true",
        help="soft-delete the demo items (ids containing 'demo-', or payload demo true), except the plan",
    )
    args = parser.parse_args(argv)
    asyncio.run(remove() if args.remove else seed())


if __name__ == "__main__":
    main(sys.argv[1:])
