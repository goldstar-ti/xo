# XO handoff

## Current state

- Deployed on gs-sv-008 at `https://xo.tifunction.com`, behind Cloudflare Access. The Access policy allows only the owner's email.
- Private repository `goldstar-ti/xo`, branch `main`.
- Stack: Docker Compose project `xo` (`xo-app`, `xo-db`), app published on `172.17.0.1:8010` behind NOBBIE's nginx. See `docs/RUNBOOK.md`.
- Both component kits are served locally from `static/vendor/` and `static/tw.css`: daisyUI 5 (Tailwind plugin, `tw:` prefix) and Web Awesome 3 (`static/js/kit.js`). Forms, dialogs and toasts follow the Kit choice in Appearance (`ui.js`); screens do not yet.
- Canvas screen `#/canvas` (D-9, 2.4.0): `static/js/views/canvas.js` mounts `static/js/canvas.js` (`mountCanvas(root)`; widget management in the More menu and the canvas bar, side tabs, undo), `static/js/tabs.js` (`tabStrip`, `tabSet`), registry `static/js/widgets.js` (every screen is a widget; 24 columns of 28px rows), styles `static/canvas.css`, text `content/text/canvas.yaml`, GridStack in `static/vendor/gridstack`. Covered by `tests/e2e_canvas.py`.
- Tracker screen `#/tracker` (D-10, 2.5.0): `static/js/views/tracker.js` and `static/js/tracker/` (model, list, detail, board, reports, projects, keys, widgets, nobbie). NOBBIE's tracker shows read-only once `NOBBIE_URL`, `NOBBIE_USER` and `NOBBIE_PASSWORD` are in `.env` (`app/nobbie.py`). Covered by `tests/e2e_tracker.py` and two API tests.
- Tasks (2.8.0 to 2.11.0, D-19 to D-22): priority, categories, subtasks, repeats, dependencies, board and table views, filters, stale review, time blocks, pacing, close the day, command palette. Logic in `static/js/tasks.js`, data in `static/js/taskdata.js`, screen in `static/js/views/tasks.js`, palette in `static/js/palette.js`. Covered by `tests/e2e_tasks.py`.
- Version 1 screens are built (Today, Diary, Tasks, Routine, Bills, Obligations, Check-ins, My plan, Appearance). Specs for the rest are in `docs/ROADMAP.md`.
- House style brought in from the owner's other project: `ruff.toml`, `docs/voice.md`, the Code style section of `CLAUDE.md`, `.claude/` skills, commands and guides, and `docs/decisions.md`.

## Next steps

1. Logging, `app/version.py` with `docs/version-history.md`, and a ruff lint and format pass (no behaviour change). Add `make lint` when ruff is in the image.
2. Convert the screens to `static/js/ui.js` controls and `t()` text, in three batches: (a) Today and the lists (diary, tasks, obligations, routine, bills); (b) check-ins and My plan; (c) settings, appearance and the app shell with sign-in. Each batch moves its inline strings into `content/text/*.yaml` and runs the browser flow under all three kits. Existing screens stay on `app.css` until the owner approves each conversion.
3. Build from `docs/ROADMAP.md` in this order (D-12, D-17, D-18). Each section gets its own plan session before building.
   1. R Records: change history, nightly backup, export everything.
   2. Section 1 Workbook sittings.
   3. Section 2 Outputs.
   4. Section 3 Life story.
   5. Section 4 Reporting register.
   6. Section 5 GTD core.
   7. Sections 6 to 12 in the D-18 order: Health and mood (6), People and life admin (7), Legal and sessions (8), Goals and reviews (9), Money (10), Google Calendar (11), AI (12: 12a assisted writing under D-15, 12b the agent under D-23).
4. Canvas, parked: a resizable side pane, undo that survives a reload, and saved layout presets.
5. Tasks, parked: manual card order on the board; subtasks as full tasks. Out of scope by the owner's decision: custom fields, Markdown backing, local-first sync, webhooks, voice capture and OS-wide hotkeys (rule 2; a PWA cannot register global hotkeys).

## Owner to-do

0. To see NOBBIE's tracker in XO: create a NOBBIE reader account (`docker compose exec app python -m app.auth.cli create xo.reader@goldstartransport.com.au --role executive` in the NOBBIE folder, then set its password at first sign-in; executive and hseq are the roles that can open the tracker), add `NOBBIE_URL=https://nobbie.lan.tifunction.com/nobbie`, `NOBBIE_USER` and `NOBBIE_PASSWORD` to XO's `.env`, then `make up`.

1. Create the XO account straight after the first sign-in at `https://xo.tifunction.com`. The first sign-in creates the only account, and sign in with a name and a password of at least 8 characters.
2. Run `make db-backup` before every update. Nothing runs it on a schedule yet.
3. Before production: reinstate CLAUDE.md rule 5 (no personal names or details) and remove every personal detail added while it was paused (decision D-8).
4. Security is handled outside the codebase (decision D-6): the app sends no CSP or security headers.
5. `content/workbook.json` now comes from glm branch `prose-revision-2026-11-20` (fe9f0dc6), `build/docx/relapse_prevention_workbook_complete.docx`. After the next glm change, rebuild with `python scripts/build_workbook.py --version "WORKBOOK / glm <sha> / <date>" <docx>`, then `make db-backup` and `docker compose up -d --build app`.
6. Decide whether `plan.yaml`, `checkin.yaml` and `defaults.yaml` should follow the glm changes to `src/rp/03` to `06`. They were left as they were.
7. Open `https://xo.tifunction.com/#/tasks`, switch to Board, drag a card, and press Ctrl+K. Nothing here was checked on a phone or by a person in a browser, only by the Playwright tests.
8. Rename or replace the seed categories and places: Tasks, `Categories and places`.
9. Decide whether to keep the evening `Close the day` step on: Settings, Tasks.
10. `tests/e2e_tracker.py` is flaky: it failed twice out of five full runs on 2026-11-27 with `Checklist: N of 2 ticked` and passed on rerun. The cause is not diagnosed; fix the wait before relying on the suite as a gate.

## What worked

- Throwaway test stack (`xo-test`): API and browser tests cannot touch `xo-db`.
- Serving both kits locally means no request leaves the origin, so XO works offline.
- A server block in NOBBIE's nginx plus a tunnel route gave XO its own origin.

## What did not work

- Folders at mode 0700 on the build host gave 401s from `StaticFiles`; the Dockerfile now sets `chmod -R a+rX`.
- Loading Web Awesome's `webawesome.css` restyled every plain button; only the default theme file is loaded.
- A new Cloudflare hostname was negatively cached by the server's resolver; test with `curl --resolve`.

More in `.claude/COMMON_MISTAKES.md`. Decisions are in `docs/decisions.md`.
