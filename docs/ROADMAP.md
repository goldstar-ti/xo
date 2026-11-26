# Roadmap

What exists: Today, Diary, Tasks, Routine, Bills, Obligations, Check-ins, My plan and plan card,
Settings, and the full Appearance system (quick Look panel plus the Appearance screen).

What follows are the next three features, in build order. Each is specced from decisions already made.
Build one at a time, with tests, and keep each first version small.

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
- Bridge: a `workbook` widget in `static/js/widgets.js` showing the next sitting, with a "Continue" button that opens it.
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
- One singleton `lifemeta`: `{ birthYear, people: [ { id, alias, who, relation } ], tags: [custom tag] }`.
  `who` is the private real identity. `alias` and `relation` are what other readers see.
- Starting tags: family, home and moves, school, work, friends, health, good times, loss, trauma. The user can add tags.

**Screens**

- `#/life`: the timeline, grouped by year (decade headers when long), each entry showing when, place, title and tags. Filter chips by tag and by person. A plain "Add entry" button.
- Entry editor (a dialog or its own route; the body needs room): when fields, place, people as chips chosen from the alias list with "add a new person" inline, tags as chips, title, body.
- `#/life/people`: the alias list. Each row: alias, relation, and the private "who" field.
- Optional setting, off unless the user turns it on: after saving an entry tagged trauma or loss, show a short pause note with a button to the plan card.

**Outputs.** Life story feeds the Outputs screen (see above). With "aliases only", print `alias (relation)` and never `who`.

**Reminders.** None. This section is never pushed at the user.

**Tests.** Browser test: add two people, add three entries (one with a year, one with only an age, one undated), confirm order; build an aliases-only output and confirm the `who` text is absent.

---

## Smaller items

- Password change (one request that replaces the password hash).
- Offline edits with a queue.
- A re-nudge when a routine item is still unticked 20 minutes after its reminder.
- Alembic, before the first schema change.
- More themes, typefaces and layout variants as wanted. See "Styling" in `CLAUDE.md` for what a new dial needs.
