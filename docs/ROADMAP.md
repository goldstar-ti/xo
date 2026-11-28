# Roadmap

What exists: Today, Diary, Tasks (as a list, board or table, with filters and a review of stale tasks), Routine, Bills, Duties, Check-ins, My plan and plan card,
Settings, Canvas, Tracker, Notes (in Markdown), and the full Appearance system (quick Look panel plus the Appearance screen).

What follows are the next features, in build order: Records (the first smaller items), sections 1 to 3, then the Reporting register (4), GTD core (5), and sections 6 to 12 in the order set by D-18. Each is specced from decisions already made.
Build one at a time, with tests, and keep each first version small. Each section gets its own plan session before building.

## Built from the design port (2.29.0 to 2.54.1, D-39 to D-53)

- **Fluid desktop text** (D-39): the text size scales with the window width. Grow text is off by default (2.51.0, D-51); when on, it grows to 1.5 times the base at 5120 px wide.
- **Base size and Text styles** (D-51, D-52): body text is 13 px on a desktop and 16 px on a phone, with size presets. Appearance, Text has one Text styles table: a row per kind of text (19 roles) with its own size, weight, line spacing and letter spacing, and All text shifts them together. Under 36rem each row is a summary that opens on tap.
- **Appearance preview** (2.53.0): every styleable part in five sections (Text, Buttons and fields, Rows and status, Today, Frames and bars), built with the screen controls so the Kit choice restyles it.
- **Compact spacing** (D-53): padding, margins and gaps follow the Spacing setting (default 0.8; Compact 0.65, Regular 0.8, Comfortable 1, Large 1.2). Tap targets stay 2.5rem.
- **Made-up demo data** (`scripts/seed_demo.py`): `make seed-demo` fills XO from 61 days back to 30 days ahead, and `make seed-demo-remove` takes it out. It overwrites check-ins and the plan.
- **Right-split pane** (D-40): Appearance and Settings open beside the screen; `static/js/pane.js`.
- **Bridge widgets and starter layout** (D-44, D-49): 22 Bridge widgets in `static/js/bridgewidgets.js`, and a canvas starter layout of 17 widgets.
- **Design handoff items 1 to 5** (`docs/design/xo-design-handoff.md`, section 8):
  1. Tokens and dials: Ink default, module colours, weight and size tokens, Inter Tight and Google Sans Flex (D-45, D-46).
  2. Controls in `static/js/ui.js`: tick box, play ring, stepped scale, menu and plain link (D-47).
  3. Screens moved onto the controls in batches (D-48).
  4. Bridge canvas layout (D-49).
  5. Phone screens in pattern C (D-50).

## Parked from the design handoff

- Maximal mode (handoff section 8 item 6): an 8-column phone grid with text that resizes to fit.
- Workbook, Life story and Outputs widgets: sections 1 to 3 below are not built, so there is no data for them.
- Swatch strips for colour overrides: the native hex inputs stay.

---

## 1. Workbook in daily sittings

**Goal.** Complete the whole workbook inside the app, a small piece each day.

**Already done**

- `scripts/build_workbook.py` converts the .docx into `content/workbook.json`.
  The v5 document gives 68 chapters and 512 answer boxes.
- `GET /api/workbook` serves it to a signed-in browser.

**Data shape** (`content/workbook.json`)

```
{ version, units: [ {
    id,            // "B13" for a worksheet (from its prompt numbers), "r-concept-13-19-..." for a reading
    part,          // Before you begin | Understanding My Past | Planning My Future |
                   // Relapse Prevention Plan | A Clinician's Framework
    number, title, // "Concept 13•19, worksheet", "Warning Signs and the Safety Plan Card"
    kind,          // reading | worksheet
    reference,     // true for glossary, facilitator and clinician chapters: readable, not scheduled
    blocks: [      // in reading order
      { t: "lead" | "h" | "sub" | "p" | "li" | "cap" | "stem" | "warn" | "check", x },
      { t: "call", tone: "do" | "trap" | "warn" | "note", head, x },
      { t: "prompt", id: "B.13.1.1", x } ],
    checks: [text],          // the unit's "Final check" list
    examples: [ { t: "eg", good, label, x, why } | call | ... ]   // "Worked examples"
} ] }
```

**Storage**

- One item per unit: id `wb:<unitId>`, kind `wb`, payload
  `{ answers: { "<promptId>": text }, at: { "<promptId>": ISO time of last edit }, read: [blockIndex of each section heading read], checks: [index], skipped: [promptId] }`.
- Track progress at block level, never by sitting number, so changing the sitting size keeps progress intact.
- **The plan boxes are shared.** Units `D3` and `D4` are the two versions of "My Plan", and the My plan screen already stores those answers in the `plan` item under named keys.
  Read and write D.3.x and D.4.x through the `plan` item so there is one copy. Mapping:
  - D.3: 1.1 `good_matters`, 1.2 `good_ways`, 2.1 `strengths`, 2.2 `lean`, 3.1 `around`, 3.2 `feeling`, 3.3 `online_part`, 4.1 `risk`, 5.1 `device_plan`, 6.1 `signs`, 7.1 `instead`, 8.1 `harm`, 9.1 `team`, 10.1 `conditions`, 11.1 `slip`, 12.1 to 12.7 `online_before`, `online_now`, `online_gave`, `online_avoid`, `online_filled`, `online_unfilled`, `online_add`, 13.1 `signed`.
  - D.4: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2 as above, 4.1 `risk`, 5.1 `safety_plan`, 6.1 `signs`, 7.1 `instead`, 8.1 `harm`, 9.1 `team`, 10.1 `conditions`, 11.1 `slip`, 12.1 `signed`.
  - Schedule only the version chosen on the My plan screen. If none is chosen, ask at that point.

**Sittings**

- Computed in the browser from the units, in document order, skipping `reference` units unless a setting includes them.
- A reading unit is one sitting up to about 600 words; longer ones split at `h` blocks.
- A worksheet unit splits at `h` blocks, grouped until the sitting holds the chosen number of prompts.
- Setting, sitting size: Small (2 prompts), Medium (4), Large (8). Setting, sittings per day: 1 to 3.
- A sitting is finished when its sections are marked read and each prompt is answered or skipped. Skipped prompts come back in a "Skipped" list.
- The unit's worked examples sit behind a "Worked examples" disclosure on every sitting of that unit. The final check list shows on the unit's last sitting.

**Screens**

- `#/workbook`: contents by part, each unit with boxes answered out of total, and a "Continue" button for the next sitting. Any unit can be opened directly.
- `#/workbook/<unitId>/<n>`: one sitting. Breadcrumb (part, number, title, "sitting 2 of 3"), the blocks, autosaving text boxes, then "Done for today" and "Next sitting".
- Today: a "Workbook" block showing the next sitting and its size, and a day-line entry at the workbook reminder time. Add `workbook` to `BLOCKS` in `boot.js` so it can be hidden and reordered.
- Reminder: daily at a time set in Settings (suggest 4:30 pm). Reminder kind `workbook`, neutral wording "Today's sitting is ready". Completing a sitting sets `tick:workbook:<day>`.
- The writing reminder (`settings().showGuard`) shows once at the top of a worksheet sitting when switched on.

**Tests.** A unit test for the sitting splitter (pure function). Browser test: open the first sitting, answer, finish, reload, confirm the answer and progress survived and the payload is stored as JSON.

---

## 2. Outputs for named readers

**Goal.** Produce a document for a particular reader from what is in the app. The app builds it; the user saves and sends it. Nothing is transmitted by the app.

**Readers**

- Stored in an item (`outputs`, kind `outputs`): `{ readers: [ { id, name, role, title, note, include: {...} } ] }`.
- Seed four on first open with generic names: "Me", "My lawyer", "Psychologist 1", "Psychologist 2". The user renames them. Real names stay out of the code.
- Readers can be added, renamed, duplicated and removed.

**What a reader's output can include** (each saved per reader)

| Source | Choices |
| --- | --- |
| Workbook, per part and per unit | Full answers / Progress only / Leave out |
| My plan | Full / Leave out |
| Life story | All / chosen tags / Leave out; aliases only, or real names |
| Check-ins | Summary for a date range / Leave out |
| Conditions and reporting record | Include / Leave out |
| Cover note | Free text at the top |

- "Progress only" lists each unit with boxes answered out of total and the first and last edit dates. It shows no answers.
- "Full answers" prints each prompt followed by the answer. Unanswered prompts print as "Not answered yet" or are left out (a per-reader switch).

**Defaults**

- Me: everything, full, real names.
- Psychologist 1 and 2: workbook and plan in full for ticked parts (all ticked to start), check-in summary on, life story on with aliases, conditions off.
- My lawyer: workbook progress only, everything else off until ticked. Header line: "Prepared for my lawyer, for the purpose of obtaining legal advice. Please talk to me before passing this on."

**Building the document**

- All in the browser, from the loaded items.
- `#/outputs`: the reader list. `#/outputs/<readerId>`: that reader's choices with a live count ("14 units, 96 answers").
- "Build" renders a clean print view (`#/print/<readerId>`) with its own print stylesheet: title, reader, date, contents, then sections. Buttons: "Print or save as PDF" (`window.print()`), "Download as HTML" (self-contained file, styles in a `<style>` tag inside the downloaded file only), "Download as text" (Markdown).
- Every page footer: the date built and "Built by the owner from their own notes".
- A built output is not stored. Building again reflects the current answers.

**Tests.** Browser test: answer two prompts, build a "progress only" output and confirm no answer text appears in it; build a "full" output and confirm both answers appear.

---

## 3. Life story

**Goal.** A timeline of the owner's life in their own words: dates, places, people under aliases, events, including hard ones.

**Data**

- One item per entry: kind `life`, payload
  `{ title, body, year, month, age, whenText, place, people: [aliasId], tags: [tag], updated }`.
  `year`, `month`, `age` and `whenText` are all optional. Sort by `year` (+ `month`); if only `age` is given, use `birthYear + age`; entries with neither go under "Undated".
- One singleton `lifemeta`: `{ birthYear, tags: [custom tag] }`. People come from the `person` kind (section 7), not from `lifemeta`.
  A person's `who` is the private real identity. `alias` and `relation` are what other readers see.
- Starting tags: family, home and moves, school, work, friends, health, good times, loss, trauma. The user can add tags.

**Screens**

- `#/life`: the timeline, grouped by year (decade headers when long), each entry showing when, place, title and tags. Filter chips by tag and by person. A plain "Add entry" button.
- Entry editor (a dialog or its own route; the body needs room): when fields, place, people as chips chosen from the alias list with "add a new person" inline, tags as chips, title, body.
- `#/life/people`: the alias list, read from the `person` kind. Each row: alias, relation, and the private "who" field.
- Optional setting, off unless the user turns it on: after saving an entry tagged trauma or loss, show a short pause note with a button to the plan card.

**Outputs.** Life story feeds the Outputs screen (see above). With "aliases only", print `alias (relation)` and never `who`.

**Reminders.** None. This section is never pushed at the user.

**Tests.** Browser test: add two people, add three entries (one with a year, one with only an age, one undated), confirm order; build an aliases-only output and confirm the `who` text is absent.

---

## 4. Reporting register

**Goal.** Track every detail reported to the Registry, what is due next, and each monthly reporting visit. The owner's notes from the public FAQ drive the deadlines (`content/rules/ro.yaml`); the Act, the Registry and the owner's lawyer are the authority (D-12).

**Data**

- `rdetail`: one per reported detail. `category`, `fields{}`, `status` (current or ended), `since`, `until`, `password`, `notes`, `held` (the last accepted values). The password is stored as reported, as plain JSON like every item (D-7).
- `rchange`: `category`, `detailId`, `change` (add, update or end), `happened`, `due` (worked out from `ro.yaml`), `reported`, `method` (portal, in person or phone), `receipt` (`APP...`), `status` (to report, reported, accepted or queried), `notes`.
- `rday`: id `rday:<subject>:<date>`; the subject is a vehicle rego, an address or a workplace. Used for the 3-day count.
- `visit`: monthly visit. `date`, `time`, `place`, `officer`, `prep[]`, `topics[]`, `actions[]` (each with owner and due date), `feeling` 1 to 5, `minutes`, `confirmed[]` (rdetail ids).
- `trip`: dates, each address, outside WA or outside Australia, and whether approval was needed and got.

**Screens**

- `#/register`: "Due now" (overdue first, with a countdown), "What police hold" by category, and "History" (every `rchange`, newest first, with receipt numbers). Old `report` rows show as "Earlier notes" in History.
- Quick actions: "I changed a password", "Contact with a child" (the 24-hour form), "New vehicle, address or workplace", "Plan a trip".
- `#/visits`: schedule (monthly repeat), prep list, after-visit form, and actions carried to the next visit.
- The 3-day prompt is a daily question in the evening check-in: "Any other vehicle, address or workplace today?" Each yes adds an `rday`. The second day in 12 months warns; the third creates an `rchange` due in 3 days.
- Cross-links: the People child flag opens the 24-hour form. Life admin vehicle, ID and subscription (internet account) entries offer "Add to register". Trips feed the Diary.
- Today: a `register` block in `BLOCKS` (due items and the next visit).

**Reminders.** When a change is created, 1 day before it is due, and on the morning it is due. Wording follows the per-kind setting (D-16).

**Outputs.** A reader "Reporting visit": the details currently held, and the changes since the last visit.

**Tests.** Unit test for the due-date maths from `ro.yaml`. Browser test: log a password change, mark it reported with a receipt, then confirm the history shows it and it has left "Due now".

---

## 5. GTD core

**Goal.** Capture anything in a few seconds, then sort it later into the right place. Covers inbox and capture, contexts and energy, waiting for, someday, tickler, and areas > goals > projects.

**Data**

- `inbox`: a captured line of text, saved with its time.
- Tasks gain `context` (@phone, @home, @computer, @out, @work), `energy` (low, medium, high), `waiting` (who, since, chase date), `someday`, and `deferUntil` (the tickler).
- Areas come from My plan's good-life goals plus Work. Work tasks live in XO as a Work area with its own projects, contexts and next actions. The chain is area > goal > project > task.

**Screens**

- A capture box in the header of every screen. Ways in: the `Ctrl+K` or `/` shortcut, an Android share target (`share_target` in the manifest, a POST to `/share` that saves an inbox row), and manifest `shortcuts` (Capture, Log mood, Register, Today).
- Rule-based natural-language dates: today, tomorrow, weekday names, "12 Dec", "3pm". No AI is needed here (section 12 adds it later).
- Process view: one entry at a time, sent to a task, appointment, project, note, someday, waiting for, register change or the bin.
- Daily plan (morning): inbox count, pick 3, time-block them onto the day line. Shutdown (evening): close open loops and set tomorrow's first step.
- Weekly review: folded into the weekly check-in as a checklist. It flags projects with no next action.

**Reminders.** Daily plan and shutdown at times set in Settings. A tickler task appears on its `deferUntil` date.

**Tests.** Unit test for the date parser. Browser test: capture a line, process it into a task with a context, and confirm it shows under that context.

---

## 6. Health and mood

**Goal.** A daily record of mood, sleep and urges, and a log of high-risk situations, kept in the owner's own words.

**Data**

- `mood`, one per day: mood and energy 1 to 5, activity tags, sleep (bed, wake, quality), exercise (kind, minutes), optional weight and steps, and urges (0 to 10, trigger, what I did instead).
- `risk`, the high-risk situation log: when, where, who, feeling, warning sign (chosen from My plan `signs`), what I did (from `instead`), outcome.

**Screens**

- A daily mood form, one tap from Today.
- Charts: mood by activity, sleep against mood, urges by time of day.
- The plan card is one tap away from the mood form and the risk log.

**Reminders.** A daily mood prompt at a time set in Settings.

**Tests.** Browser test: log a mood entry and a risk entry, then confirm both appear and the warning sign list matches My plan.

---

## 7. People and life admin

**Goal.** One list of people, and the ID, vehicle, subscription and home paperwork that has dates attached.

**Data**

- `person`: name, alias, private "who", relation, role tags (support team, lawyer, psychologist, work, family), phone, has-child flag and exemption note, birthday and dates, keep-in-touch interval, catch-up notes. People, Life story, the plan card team and the register's child-contact reports all read this one kind (D-13).
- Life admin `asset` kinds: ID or licence (expiry), vehicle (rego, insurance, service by date or km), subscription (cost, renewal, cancel-by; feeds spending), and home (lease end, inspections, bond, utilities, jobs).

**Screens**

- A People list with keep-in-touch and birthdays.
- A Life admin list by asset kind, each with its dates.
- Register links as in section 4.

**Reminders.** Each dated field reminds ahead of its date. Keep-in-touch reminds when the interval has passed.

**Tests.** Browser test: add a person with a birthday and an ID with an expiry date, then confirm both reminders are scheduled.

---

## 8. Legal and sessions

**Goal.** Keep a legal matter, each psychologist's sessions and the owner's compliance evidence in one place.

**Data**

- `matter`: timeline (hearings, outcomes, orders, conditions linked to Duties), an "ask my lawyer" list, costs and payments, and a documents list (what, where kept, date).
- `session`, one per psychologist visit: prep list ("raise at session"), notes, homework as tasks, fees.
- `compliance`, the evidence log: condition, date, time, place, who saw it. It feeds Outputs.

**Screens**

- A matter page with its timeline and lists.
- A session page with prep, notes and homework.
- A compliance log filtered by condition.

**Reminders.** Hearing dates and session times remind ahead of the day.

**Tests.** Browser test: add a matter with a hearing, a session with homework and a compliance entry, then confirm the homework appears as a task.

---

## 9. Goals and reviews

**Goal.** Set goals in the style that suits, and look back each month and year.

**Data**

- `goal` with a style: SMART (five prompts), free (a rule-based SMART check lists what is missing), or OKR (2 to 4 key results scored 0 to 100). Each has an area, measure, target, date and linked projects.
- Reviews: a daily plan and shutdown (section 5), the GTD weekly review (section 5), a monthly review (goals, spending, mood trends, register health, visit actions) and a year in review (highlights and stats, which feed Life story).

**Screens**

- A goals list by area, with the style shown on each.
- A monthly review form that pulls in the figures. A year in review page.

**Reminders.** Monthly review on the first of the month. Year in review in December.

**Tests.** Unit test for the SMART check. Browser test: add one goal in each style and complete a monthly review.

---

## 10. Money

**Goal.** A simple spending log, nothing more for now.

**Data.** `spend`: amount, category, note, date. Subscriptions and fees from section 7 feed it.

**Screens.** A log with weekly and monthly totals, and an entry form.

**Reminders.** None by default.

**Tests.** Browser test: add two spends and confirm the weekly total.

---

## 11. Google Calendar two-way

**Goal.** Every entry with a time appears in Google Calendar, and edits there come back to the Diary (D-14).

**Data.** The server holds the OAuth refresh token in `.env`. XO keeps one calendar in Google. Each timed entry stores its Google event id.

**Screens.** A Google Calendar section in Settings with the on and off switch for writing to Google. It is off until the owner switches it on.

**Behaviour.** Push every timed entry. Pull edits and new events into the Diary. The last edit wins, and the change shows in the entry's history.

**Reminders.** None of its own.

**Tests.** Unit test for the last-edit-wins merge. Browser test with a stubbed Google API: push an appointment and pull an edit back.

---

## 12. AI

### 12a. Assisted writing (D-15)

**Goal.** Help with capture parsing, SMART coaching and review drafts, only when the owner turns each use on (D-15).

**Data.** The Claude API (`claude-sonnet-5-5`), with the key in `.env`. One switch per use in Settings, all off by default.

**Screens.** Before anything is sent, a dialog shows the exact text. The owner sends or cancels.

**Reminders.** None.

**Tests.** Unit test that nothing is sent while a switch is off. Browser test with a stubbed API: the dialog shows the text and cancel sends nothing.

### 12b. Agent (D-23)

**Goal.** A Claude agent that keeps notes about the owner, finds patterns across XO and prompts the owner, once the owner switches it on (D-23).

**Data.**

- Claude API through the official `anthropic` Python SDK (`AsyncAnthropic`), model `claude-sonnet-5-5`. `ANTHROPIC_API_KEY` goes in `.env` and is read in `app/config.py` next to the `NOBBIE_*` keys.
- New module `app/claude.py`, built like `app/nobbie.py`: an `enabled()` check, a lazy client, a `ClaudeError` that routes turn into a 502, and an injectable client for tests.
- The settings singleton gains `ai: { enabled: false, reviewAt: "21:00", nudgesPerDay: 2, monthlyTokenCap: 2000000 }`.
- New kinds (no migration, the items table is generic):
  - `ai_memory` (`ai_memory:<uuid>`): `{ text, source: "agent" | "owner", updated }`. Notes about the owner, which the owner can read, edit and delete.
  - `ai_insight` (`ai_insight:<day>:<n>`, `day` set): `{ title, body, evidence: [item ids], type: "pattern" | "question" }`.
  - `ai_nudge` (`ai_nudge:<day>:<n>`): `{ text, at }`, with one one-off reminder of kind `ai_nudge`.
  - `ai_chat` (`ai_chat:<uuid>`): `{ title, messages: [{ role, text, at }] }`.
  - `ai_log` (`ai_log:<YYYY-MM>`): `{ calls: [{ at, use: "review" | "chat", input, output, cache_read, kinds, stop }] }`. The cap reads this.
- Daily review: `scheduler_loop` in `app/push.py` calls `ai_review_due()` on each tick. The review runs once per local day, after `reviewAt` in the user's `tz`, when the agent is on and under the cap.
  - One request. The system prompt and the memory notes come first, behind a `cache_control` breakpoint.
  - Then the last 14 days of every kind as compact JSON, plus `plan`, `settings` (without `ai`) and open tracker items.
  - Structured output (`output_config.format`) with the JSON schema `{ memory: [{ op: add | update | remove, id?, text? }], insights: [...], nudges: [{ time: "HH:MM", text }] }`, at effort `medium`.
  - The server applies the result as item writes and writes nudge reminders straight into `reminders`. Nudges must fall later the same day, at most `nudgesPerDay` of them.
- Chat: `POST /api/ai/chat { chat, text }` runs a tool loop of at most 8 rounds at effort `low`. Tools, all with strict schemas: `find_items(kinds, from_day, to_day, text)`, `get_item(id)`, `save_memory(text, id?)`, `forget_memory(id)`. The reply is stored on the `ai_chat` item.
- `GET /api/ai/preview` returns the exact request body the next review would send. `GET /api/ai/log` returns this month's calls and the total against the cap.
- Every request sends `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) and checks `stop_reason` before reading content. A refusal is logged and skipped, never retried in a loop.
- Every new route goes through `current_user`. Calls are made only from the server, so the browser makes no off-site requests (`tests/e2e_kits.py`).

**Screens.**

- Insights `#/insights`: recent insights, each linking to its evidence items, and an "About you" list of memory notes with Edit and Delete.
- Chat `#/chat`: one conversation per `ai_chat` item, and a New chat button.
- Settings, Claude agent section:
  - the on and off switch;
  - review time, nudges per day and monthly cap;
  - "Show what the next review sends" (a dialog with the preview);
  - "This month" (the log and the total against the cap).
- Text in `content/text/ai.yaml`. Both screens are registered in `NAV` (`app.yaml`), `VIEWS` (`app.js`) and `SECTIONS` (`boot.js`). Both views go in `SHELL` in `sw.js`, and `CACHE` is bumped.
- The agent's prompt applies `docs/voice.md` to what it writes:
  - Australian English, no praise and no verdicts;
  - patterns are reported as what the entries show, with dates;
  - it asks rather than tells.

**Reminders.** Kind `ai_nudge`. Discreet wording is "A note from XO" with the body "Tap to read.", and it opens `#/insights`. Detailed wording is the nudge text. Discreet is the default (D-16).

**Tests.**

- Unit tests with a fake client:
  - nothing is sent while the switch is off, or once the cap is reached;
  - a review writes memory, insights and nudge reminders, and drops nudges already in the past;
  - the chat tool loop stops after 8 rounds;
  - a refusal is logged and writes nothing.
- Browser test with the fake client, switched on by `AI_FAKE=true` in `docker-compose.test.yml`:
  - turn the agent on and open the preview;
  - run a review through `POST /api/ai/review`, which exists only while `AI_FAKE` is set;
  - see an insight, edit a memory note and send a chat message.

**Cost.** Sonnet 5.5 is $2 per million input tokens and $10 per million output, with cache reads at $0.10.

- A review of about 25,000 tokens in and 3,000 out costs about 8 cents, so about $2.50 a month.
- A chat message costs about 1 to 3 cents.
- The default cap of 2,000,000 tokens is roughly $5 to $8 a month.

**Defaults worth vetoing.**

1. The Messages API, with XO running the loop, rather than Managed Agents. The data stays in XO's database, and the loop is small.
2. Effort `medium` for the review and `low` for chat.
3. 14 days of history per review. The memory notes carry the longer view.
4. Review at 21:00, at most 2 nudges a day, and a cap of 2,000,000 tokens a month.
5. Agent text appears only on Insights, Chat and in nudges, never on Today or the check-ins.

---

## Smaller items

- **Change history** (build before section 4): a table `item_versions (user_id, item_id, kind, payload, saved_at)`, written by the server on every save of kinds `rdetail`, `rchange`, `visit`, `compliance`, `matter` and `report`. Shown as "History" on those entries. Created by `create_all`.
- **Nightly backup** (build before section 4): a host cron job or systemd timer runs `make db-backup` at 02:30 and keeps 30 days.
- **Export everything** (build before section 4): a Settings button that downloads all items as JSON plus a readable HTML file.
- Password change (one request that replaces the password hash).
- Offline edits with a queue.
- A re-nudge when a routine item is still unticked 20 minutes after its reminder.
- Alembic, before the first schema change.
- More themes, typefaces and layout variants as wanted. See "Styling" in `CLAUDE.md` for what a new dial needs.

## Future Appearance options

NOBBIE's Appearance options that XO has no element for yet. Each needs the element built first; the last column says where XO would use it.

| NOBBIE option | Element XO would need | Suggested use in XO |
|---|---|---|
| Help icons (show, style, size, click or hover) | `?` help popovers | Explain check-in, plan and tracker fields |
| Tooltip delay, rich tooltips and popovers | A tooltip component | Hover detail on tracker items and dayline entries |
| Right-click menu, item order by use | A context menu | Quick actions on entries, tasks and tracker rows |
| KPI tile status tone | KPI tiles with a status | Bills due, check-in streaks, tracker counts on Today |
| Task button colour | Launcher action cards | A Today launcher for frequent actions |
| Open-in-tab, object type and label icons | Icons on those elements (the icon set exists: `static/js/icons.js`, D-31) | Side-tab links and icons beside list kinds |
| Record tabs limit | A tab cap in `tabs.js` | Limit open side tabs |
| Filter zoom, JSON size | Filter bars, JSON views | Tracker filters; a raw item view |
| Month palette | Month colours | Diary and calendar months |
| Discover page | A home page of widgets | A start screen |
| Iconography | Icon overrides beyond the screen icons | Screen icons are built (D-31); next, icons on widgets and list kinds |
| Identity colours for tiles and pages | Tiles; per-page colours | Nav items and Today blocks |
