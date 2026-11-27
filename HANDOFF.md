# XO handoff

## Current state

- Deployed on gs-sv-008 at `https://xo.tifunction.com`, behind Cloudflare Access. The Access policy allows only the owner's email.
- Private repository `goldstar-ti/xo`, branch `main`.
- Stack: Docker Compose project `xo` (`xo-app`, `xo-db`), app published on `172.17.0.1:8010` behind NOBBIE's nginx. See `docs/RUNBOOK.md`.
- Both component kits are served locally from `static/vendor/` and `static/tw.css`: daisyUI 5 (Tailwind plugin, `tw:` prefix) and Web Awesome 3 (`static/js/kit.js`). Forms, dialogs and toasts follow the Kit choice in Appearance (`ui.js`); screens do not yet.
- Canvas screen `#/canvas` (D-9, 2.4.0): `static/js/views/canvas.js` mounts `static/js/canvas.js` (`mountCanvas(root)`; widget management in the More menu and the canvas bar, side tabs, undo), `static/js/tabs.js` (`tabStrip`, `tabSet`), registry `static/js/widgets.js` (every screen is a widget; 24 columns of 28px rows), styles `static/canvas.css`, text `content/text/canvas.yaml`, GridStack in `static/vendor/gridstack`. Covered by `tests/e2e_canvas.py`.
- Tracker screen `#/tracker` (D-10, 2.5.0): `static/js/views/tracker.js` and `static/js/tracker/` (model, list, detail, board, reports, projects, keys, widgets, nobbie). NOBBIE's tracker shows read-only once `NOBBIE_URL`, `NOBBIE_USER` and `NOBBIE_PASSWORD` are in `.env` (`app/nobbie.py`). Covered by `tests/e2e_tracker.py` and two API tests.
- Tasks (2.8.0 to 2.11.0, D-19 to D-22): priority, categories, subtasks, repeats, dependencies, board and table views, filters, stale review, time blocks, pacing, close the day, command palette. Logic in `static/js/tasks.js`, data in `static/js/taskdata.js`, screen in `static/js/views/tasks.js`, palette in `static/js/palette.js`. Covered by `tests/e2e_tasks.py`.
- Shortcuts, custom fields, Notes and dictation (2.12.0 to 2.17.0, D-24 and D-26 to D-29): every keyboard shortcut is configurable in Settings (`static/js/keymap.js`); custom fields on every kind of record (`static/js/customfields.js`); a Notes screen in Markdown with a toolbar and preview (`static/js/views/notes.js`, `mdeditor.js`, `markdown.js`, marked 18.2.0 vendored); dictation through the browser's speech service (`static/js/voice.js`). Covered by `tests/e2e_extras.py`.
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
5. Tasks, parked: manual card order on the board; subtasks as full tasks. Out of scope by the owner's decision: local-first sync and webhooks. OS-wide hotkeys are parked (D-29): a PWA cannot register them.

## Icons, side bar and section spacing (2.20.0)

- Shipped: Phosphor and Tabler icons on every screen link (side bar, phone tabs, More), a picker popover (Appearance, Screens, Icons, or right-click a screen in the side bar), a side bar that collapses to icons and resizes by drag or arrow keys, spacing between lines inside sections, and a fix for Today's three rows squeezed by the time box at phone width. Decision D-31. Covered by `tests/e2e_rail.py`.
- Icon packages are pinned in `tailwind/package.json`; the image build makes `static/vendor/icons/`. To change the default icons, edit `CORE` in `scripts/build_icons.py` and `DEFAULT_ICONS` in `static/js/icons.js`, run `make icons` (reads NOBBIE's `frontend/node_modules`) to regenerate the committed `static/js/icon-core.js`, and bump `CACHE` in `static/sw.js`.
- Defaults worth vetoing: default icons per screen (`DEFAULT_ICONS` in `static/js/icons.js`); Phosphor thin, light, bold and duotone left out; side bar width 180 to 420 px, default 240; right-click on a side bar link opens the picker (Shift+right-click for the browser menu); Look and My plan card buttons show icons only when the side bar is collapsed.

## Appearance: NOBBIE options (2.19.0)

- Shipped: Standard and Advanced views, six groups, 151 family themes in 30 families, 493 catalogue fonts plus a code font, 18 text roles, 57 colour tokens in 12 groups, component kits' colours, spacing, header size, zoom, radius, glass, figure style, widget and tab colours, theme export and import as XO JSON, `XO2-` JSON look codes. Decision D-30; future options in `docs/ROADMAP.md`.
- Commits: S1 `59f83b9` fonts, S2 `0073981` engine, S3 `0739e34` Standard/Advanced, S4 `cc830cb` widget and tab colours, S3a `e3d4ff1` components, S3b `3b203ed` component colour tokens, S3b2 `149ba73` family themes and export/import, S3c `348ae01` six groups, fix `7c1513a`.
- Defaults worth vetoing:
  1. Density chips removed; Spacing dial plus Size preset replace them.
  2. Colourful style not copied; Colour strength covers it.
  3. 18 XO text roles, not NOBBIE's 23.
  4. Colour overrides are hex only (native colour input, no alpha).
  5. Radius is per device, not shared.
  6. Look codes are JSON `XO2-`; `XO1-` still decodes.
  7. Catalogue fonts are not in the offline shell; offline before first use falls back to system-ui.
  8. Glass and figure style default off, so the default look is unchanged.
  9. Widget and tab colours use NOBBIE's palettes (step 500 light, 300 dark).
  10. Family themes map each palette onto XO's colour numbers, so the fine-tune dials still work; Surprise me picks from them too.
  11. Theme files are XO's own JSON; NOBBIE's `ng-colours` export is not read; import adds to My themes without switching and renames on a clash.
  12. Advanced items show in Standard once changed, with a dot.
  13. 57 colour tokens (not NOBBIE's 98), one per XO element with its own colour.
  14. Six groups instead of NOBBIE's General and iCandy tabs; the chosen group is remembered per device. Web Awesome's colour picker in the wa kit, native input elsewhere; the font picker is a filterable list that loads fonts only on focus or choice.
- PJ to-do: (1) open Appearance at desktop and phone width and try Standard and Advanced; (2) veto any default above.

### Orchestrator final report (2026-11-27)

- Outcome: the whole plan is committed; S3a to S4 were done by a parallel run, this run did S5, S6 and two fixes.
- Live: the app serves HEAD after a page reload (no build step; `sw.js` cache `xo-v19`). Not pushed.
- Commits (this run): S5 `ef41097` docs, version 2.19.0, D-30, roadmap; `cbd4af0` lint wrap in browser tests; `6f05a93` daisyUI segmented and accordion arrow fix.
- Tests passed: `make test-api` 15; `make test-e2e` full (e2e per kit, look, canvas, tracker, kits, tasks, extras, data per kit); `make lint` clean.
- Flaky: `tests/e2e_tracker.py:104` "Checklist: 0 of 2 ticked" failed twice (load 17; once on a reverted tree), passed on rerun. Second checklist step lost; likely Enter racing the redraw. Not caused by this plan.
- Test clashes: two sessions share the `xo-test` compose project; runs collided. This run used `COMPOSE_PROJECT_NAME=xo-s6`.
- Deviations: version 2.19.0 and D-30 (plan said 2.8.0); 57 tokens, not 55; the daisyUI fix is folded into 2.19.0 with no patch bump.
- Defaults worth vetoing (new): daisyUI fix folded into 2.19.0; disclosure uses the xo chevron in all kits (dropped `tw:collapse-arrow`).
- Screenshots checked by eye: Appearance in xo, daisy and wa at 1280 and 390 px; Today at 390 px. Not checked: dark mode, Advanced view, every group tab, the family picker, export and import.
- PJ to-do:
  1. Open Appearance, switch to Advanced, walk all six groups in light and dark.
  2. Try My themes: Export, then Import from file.
  3. Decide whether to fix the tracker checklist flake (`tests/e2e_tracker.py:104`).
  4. Consider a unique `COMPOSE_PROJECT_NAME` per run in the Makefile test targets, so parallel sessions stop colliding.

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
10. `tests/e2e_tracker.py` is flaky: it fails now and then with `Checklist: 0 of 2 ticked` (the page shows "0 of 1 ticked") and passes on rerun. It failed in 3 of the 5 build steps on 2026-11-27. Fix the wait before relying on the suite as a gate.
11. Open `https://xo.tifunction.com/#/settings`, change a key under Keyboard shortcuts, then press `?` on Tasks to see it.
12. Add a custom field in Settings, Custom fields, and fill it in on a task.
13. Open `https://xo.tifunction.com/#/notes`, write a note with a list, and check Preview.
14. On your phone and desktop, tap Dictate once and allow the microphone. Nothing here was checked on a phone or with a real microphone; the tests use a fake speech engine.
15. `tests/e2e_look.py` line 116 (the banner should read "Night") failed once on 2026-11-27 and passed on rerun. Not diagnosed.
16. Another session's Settings, My data, "Review and delete entries" button (it claims 2.13.0 and D-25) was uncommitted at deploy time and is not in the deployed app. Commit it and run `make db-backup` then `docker compose up -d --build app` when that work is finished.
17. Open `https://xo.tifunction.com/#/settings` on desktop: collapse the side bar with the arrows at the top, drag its right edge, and right-click Diary to pick a new icon. Checked only in headless Chromium screenshots and `tests/e2e_rail.py`.

## What worked

- Throwaway test stack (`xo-test`): API and browser tests cannot touch `xo-db`.
- Serving both kits locally means no request leaves the origin, so XO works offline.
- A server block in NOBBIE's nginx plus a tunnel route gave XO its own origin.

## What did not work

- Folders at mode 0700 on the build host gave 401s from `StaticFiles`; the Dockerfile now sets `chmod -R a+rX`.
- Loading Web Awesome's `webawesome.css` restyled every plain button; only the default theme file is loaded.
- A new Cloudflare hostname was negatively cached by the server's resolver; test with `curl --resolve`.

More in `.claude/COMMON_MISTAKES.md`. Decisions are in `docs/decisions.md`.
