# XO handoff

## Current state

### Design port run (2026-11-28, branch design-port)

- Outcome: all steps A0 to B6e and C0 are committed on `design-port`. Draft PR #2 "XO design port" (https://github.com/goldstar-ti/xo/pull/2). Not merged, not deployed. Versions 2.29.0 to 2.50.0, decisions D-39 to D-50.
- Plan sources: `docs/design/xo-design-handoff.md` (the design) and `docs/design/gap-list.md` (the gaps).
- Commits per step:
  - A0 `752a0ae` handoff doc, gap list, shot sizes.
  - A1 `92d7f52` screen parts (2.29.0).
  - A2 `238623d` fluid text (D-39, 2.30.0).
  - A3 `d6d08c7` right-split pane (D-40, 2.31.0).
  - A4 `9c06a9a` + `eee530a` Diary columns, wider time column (D-43, 2.32.0).
  - A5 `2bcb206` widget options, names, copies (D-41, 2.33.0).
  - A6 `6680712` 22 Bridge widgets (D-44, 2.34.0).
  - A7 `17230d2` widget dials, starter layout, phone order, layout codes (D-42, 2.35.0).
  - Orchestrator `20d9740` lint wrap.
  - B1 `92cee79` + `72caddd` Ink default, module colours, Today colour, weight tokens (D-45, 2.36.0).
  - B2 `2e452d5` Inter Tight, Google Sans Flex (D-46, 2.37.0).
  - B3 `6f0ef9e` tickBox, playRing, stepScale, menu, plainLink (D-47, 2.38.0).
  - B4a `5825a2f` Today (D-48, 2.39.0).
  - B4b `8183587` Diary, Routine (2.40.0).
  - B4c `38aa24e` Tasks (2.41.0).
  - B4d `14d7895` Duties, Bills (2.42.0).
  - B4e `bb101f9` Check-ins, My plan (2.43.0).
  - B4f `a0ed11c` + `d6c1659` Settings, Appearance, Appearance fits the pane (2.44.0).
  - B5 `c7cc439` + `0b4b439` Bridge starter layout, 17 widgets, Board and Focus, rail dot, narrow widgets (D-49, 2.45.0).
  - B6a `0304bfe` phone pattern C: shared round button and sheet, Today (D-50, 2.46.0).
  - B6b `3d5c64d` Diary (2.47.0).
  - B6c `baf7727` Tasks (2.48.0).
  - B6d `274025e` Duties, Bills (2.49.0).
  - B6e `1a7cd0f` Check-ins, My plan, Routine, More (2.50.0).
  - C0 `8019870` dark Ink and light Foliage shots.
- New files: `static/js/pane.js`, `content/text/pane.yaml`, `static/js/bridgewidgets.js`, `static/js/morewidgets.js`, `static/js/sheet.js`, `static/fonts/inter-tight.woff2`, `static/fonts/google-sans-flex.woff2` (with their licences), `tests/e2e_pane.py`, `tests/e2e_phone.py`, `docs/design/xo-design-handoff.md`, `docs/design/gap-list.md`.
- Parked:
  - Maximal mode (handoff section 8 item 6).
  - Workbook, Life story and Outputs widgets (ROADMAP sections 1 to 3 are not built and have no data).
  - Swatch strips for colour overrides (native hex inputs kept).
- Tests: `make test-api`, `make lint` and `make test-e2e` pass on every step. New: `tests/e2e_pane.py`, `tests/e2e_phone.py`.
- Flakes seen:
  - `tests/e2e_look.py` "Reset Colours: Buttons" after the wa run (known, item 18 below); cleared on rerun after `docker compose -f docker-compose.test.yml down -v`.
  - `tests/e2e.py` Settings download through the "Data actions" menu, once (menus close on scroll).
- Not checked by a person in a browser: everything. Checked only through Playwright tests and screenshots (360, 1280, 1920 and 5120 px; dark Ink and light Foliage at 360 and 1920 px).
- Defaults worth vetoing (most consequential first):
  1. Ink is the default theme for new looks only; old XO2 look codes that left out the theme (because it was Foliage) now decode as Ink.
  2. The Bridge layout lives on a canvas, and canvases sync to every device, so a Bridge canvas opened on a laptop squeezes nine columns (narrow widgets such as Routine list break). Suggest putting the Bridge on its own canvas tab.
  3. Bridge is chosen by pixel width: a board of 3200 px or wider gets the Bridge flow; a brand-new first canvas on a 3840 px or wider window starts on the Bridge. 2 grid columns per track.
  4. Fluid text is on by default (root about 26 px at 5120 wide).
  5. Module colours on by default; Next up is the only solid block; the Today colour defaults to Module (indigo).
  6. Sliders replaced by stepped scales plus preset chips (text size Smaller 92, Standard 100, Larger 114, Largest 128; zoom 75, 100, 125, 150; spacing 0.8, 1, 1.2, 1.4).
  7. Appearance stacks its preview and tabs below 56rem of its own width (fits the side pane).
  8. Pick stays a worded button on task rows; Add, Add task, Save bill and Save check-in stay worded as main actions.
  9. The opening screen choice (auto, canvas, today) sits in Appearance, Screens, not Settings.
  10. Check-ins on the phone show one question per screen with Back and Next.
  11. Scratch pad saves to a visible note `note:scratch` (it also shows in Notes).
  12. Narrow canvas widgets (under 20rem) hide their tools inside the three-dot menu.
  13. The Bills chevron sits before the amount on rows (looks odd; a small follow-up).
  14. Google Sans Flex is a Latin subset from the Google Fonts API (51 KB).
  15. A1 (pure refactor) has no decisions entry; D-41 is written after D-43 in `docs/decisions.md`.
- PJ to-do:
  1. Review and merge PR #2 "XO design port" on GitHub.
  2. Deploy from /home/pj/projects/xo on main after the merge: `make db-backup`, then `make up`, then `docker inspect xo-app --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'` and check the content/text mount source is /home/pj/projects/xo/content/text, then `curl -s http://172.17.0.1:8010/api/text | wc -c` and check it is well over 10000 bytes.
  3. Decide about the `bridge-and-large-screens` branch: everything it had is now on design-port (rewritten), so it can be deleted with `git push origin --delete bridge-and-large-screens` once PR #2 is merged.
  4. Decide where the Bridge lives: on its own canvas tab (suggested) or the main canvas (it squeezes on a laptop, see default 2).
  5. On the 5K screen: open Canvas, Starter layout, Bridge (very wide screens); open Appearance and Settings to see them in the side pane.
  6. On the phone: Today, Diary, Tasks, Duties, Bills, Check-ins, My plan, Routine, More: tap the round + button to try each sheet.
  7. Answer the handoff section 10 open questions (light 300 or 350 for grey detail text; copper and sepia closeness; indigo as the Today default).
  8. Veto any default above.

- Deployed on gs-sv-008 at `https://xo.tifunction.com`, behind Cloudflare Access. The Access policy allows only the owner's email.
- Private repository `goldstar-ti/xo`, branch `main`.
- Stack: Docker Compose project `xo` (`xo-app`, `xo-db`), app published on `172.17.0.1:8010` behind NOBBIE's nginx. See `docs/RUNBOOK.md`.
- Both component kits are served locally from `static/vendor/` and `static/tw.css`: daisyUI 5 (Tailwind plugin, `tw:` prefix) and Web Awesome 3 (`static/js/kit.js`). Forms, dialogs, toasts and the screens follow the Kit choice in Appearance (`ui.js`); the screens moved onto the kit controls in D-48.
- Canvas screen `#/canvas` (D-9, 2.4.0): `static/js/views/canvas.js` mounts `static/js/canvas.js` (`mountCanvas(root)`; widget management in the More menu and the canvas bar, side tabs, undo), `static/js/tabs.js` (`tabStrip`, `tabSet`), registry `static/js/widgets.js` (every screen is a widget; 24 columns of 28px rows), styles `static/canvas.css`, text `content/text/canvas.yaml`, GridStack in `static/vendor/gridstack`. Covered by `tests/e2e_canvas.py`. The canvas bar and widget title bars use icon buttons (`iconButton()` in `static/js/icons.js`); the Widgets popover replaces Add widget; Redo is Ctrl+Shift+Z or Ctrl+Y; New canvas and Rename canvas are form popovers with an Icon field (`openIconPicker` in `static/js/iconpicker.js`); popovers are `openPopover()` in `static/js/popover.js`. Decision D-32.
- Tracker screen `#/tracker` (D-10, 2.5.0): `static/js/views/tracker.js` and `static/js/tracker/` (model, list, detail, board, reports, projects, keys, widgets, nobbie). NOBBIE's tracker shows read-only once `NOBBIE_URL`, `NOBBIE_USER` and `NOBBIE_PASSWORD` are in `.env` (`app/nobbie.py`). Covered by `tests/e2e_tracker.py` and two API tests.
- Tasks (2.8.0 to 2.11.0, D-19 to D-22): priority, categories, subtasks, repeats, dependencies, board and table views, filters, stale review, time blocks, pacing, close the day, command palette. Logic in `static/js/tasks.js`, data in `static/js/taskdata.js`, screen in `static/js/views/tasks.js`, palette in `static/js/palette.js`. Covered by `tests/e2e_tasks.py`.
- Shortcuts, custom fields, Notes and dictation (2.12.0 to 2.17.0, D-24 and D-26 to D-29): every keyboard shortcut is configurable in Settings (`static/js/keymap.js`); custom fields on every kind of record (`static/js/customfields.js`); a Notes screen in Markdown with a toolbar and preview (`static/js/views/notes.js`, `mdeditor.js`, `markdown.js`, marked 18.2.0 vendored); dictation through the browser's speech service (`static/js/voice.js`). Covered by `tests/e2e_extras.py`.
- Version 1 screens are built (Today, Diary, Tasks, Routine, Bills, Duties, Check-ins, My plan, Appearance). Specs for the rest are in `docs/ROADMAP.md`.
- House style brought in from the owner's other project: `ruff.toml`, `docs/voice.md`, the Code style section of `CLAUDE.md`, `.claude/` skills, commands and guides, and `docs/decisions.md`.
- Right-split pane (D-40): Appearance and Settings open beside the screen on wide windows; `static/js/pane.js`, text in `content/text/pane.yaml`, covered by `tests/e2e_pane.py`.
- Fluid desktop text (D-39): the root text size scales with the window width; `static/js/boot.js`, `static/app.css`.
- Ink and module colours (D-45): Ink is the default for new looks and each module has its own colour; `static/js/boot.js`.
- Fonts (D-46): Inter Tight and Google Sans Flex are the default fonts, vendored in `static/fonts/`; `static/js/boot.js`.
- New controls (D-47, D-48): tick box, play ring, stepped scale, three-dot menu and plain link in `static/js/ui.js`, one set for all three kits.
- Bridge widgets and starter layout (D-44, D-49): 17 widgets in `static/js/bridgewidgets.js`, the starter layout in `static/js/canvas.js`; the canvas chooses the Bridge flow by width.
- Phone pattern C (D-50): one round add button and a shared sheet, `static/js/sheet.js`, on Today, Diary, Tasks, Duties, Bills, Check-ins, My plan, Routine and More; covered by `tests/e2e_phone.py`.

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
4. Canvas, parked: a resizable side pane, undo that survives a reload, and saved layout presets. Also parked: NOBBIE single-key canvas shortcuts (W Widgets, F Fit, R Reset); Appearance Iconography overrides (swap any app icon) and icons in the rest of XO; widget icons in the Widgets popover and title bars (a registry `icon` per widget); glass effect on popovers.
5. Tasks, parked: manual card order on the board; subtasks as full tasks. Out of scope by the owner's decision: local-first sync and webhooks. OS-wide hotkeys are parked (D-29): a PWA cannot register them.

## Background patterns and Motion (2.24.0, D-35)

- Branch `feat/pattern-motion`, built in the worktree `/home/pj/projects/xo-motion`; not merged, not deployed.
- Pattern: `static/js/pattern.js`, vendor `static/vendor/geopattern/` (un-ignored in `.gitignore`), look field `pattern` in `boot.js`, Appearance > Layout > Background pattern.
- Motion: look field `motion`, `data-xo-motion` on `<html>`, `motionStill()` in `util.js`, Appearance > Effects > Motion. Entrance rules sit together in `app.css` under "motion".
- Tests: `tests/e2e_look.py` (pattern and motion block near the end).

## Restyle to the design canvas and EasyMDE (2.21.1 to 2.23.0)

- Shipped and live (2026-11-27, deployed from a clean worktree of `ca9e61a`; `sw.js` cache `xo-v34`): font list "null" rows fixed; theme names inside two-column tiles; tighter shell and page rhythm; Tabler default icons; `tag`, `progress`, `callout`, `linkRow` in `ui.js`; Today restyled with offline and first-run notices; list screens restyled; full-screen phone forms with a pinned footer; check-ins, My plan, plan card, Settings, More and sign-in restyled; EasyMDE (2.21.0, vendored) in every long text box; long text shown as Markdown, one-liners through `plainText()`. Decisions D-33, D-34. Plan: `~/.claude/plans/implement-this-design-in-quirky-teacup-of-759e7242-63e4-4407-9438-bec451419a02.md`.
- Commits: A1 `4677eb7`; B1 `63f3b4a`; B2 `85769fd`; B3 `8420944`; B4 `29b25eb`; B5 `6986c1b`; B4b `bd41bcd` (tasks test after the Today change); B6 `5f92d59`; cache `e99cddf`; test fixes `cd957db`; C1 `ce1ad13`; C2 `bb76614`; C3 `4b3f135`; C4 `ca9e61a`.
- Tests on a clean worktree of `ca9e61a`: `make test-api` 15 passed, `make lint` clean, `make test-e2e` full chain passed (e2e per kit, look, rail, canvas, tracker, kits, tasks, extras, data per kit).
- Defaults worth vetoing:
  1. Default screen icons are Tabler (sun, calendar-event, list-check, scale, dots, palette, lifebuoy) where the owner has not picked one.
  2. One tile style for named themes and family themes, names inside, 2 columns on a phone.
  3. Look and My plan card are a neutral outlined pair; the plan button is no longer ink-filled.
  4. Today's three: time and "Start with" moved into the task form ("Do it at"); the list shows "allow N min" or "done".
  5. First-run notification callout shows only while permission is "default" and no ticks exist.
  6. Missed-day line needs open ticks yesterday and at least one older tick, so a new account never sees it.
  7. Desktop Today sections are placed by column class, so the Appearance block order applies within a column only.
  8. Tick and Start keep a 2.5rem hit area through an invisible overlay; in the wa kit they keep Web Awesome's button look.
  9. `notice()` stays plain text in the xo kit (the toast already draws the box); a callout in daisy and wa.
  10. Full-screen sheets apply to forms only (`openDialog({ form: true })`); other dialogs keep their look and Close button.
  11. Warning signs in the evening check-in are a segmented choice, so a tap cannot clear it.
  12. Sign-in shows "There is no password reset" as a warning callout on the create-account screen (new text).
  13. More subtitles written by the agent in `content/text/app.yaml` (`app.more_sub.*`).
  14. The editor's Write/Preview tabs are gone; Preview is a toolbar button (Alt+P still toggles).
  15. Long boxes lost their placeholder text (EasyMDE has none set).
  16. Plan card answers show as plain text, not formatted Markdown; tracker reports test steps and comments stay plain.
  17. Desktop Diary stays single column (there is no month calendar).
  18. EasyMDE is precached by the service worker.
- Not checked in a browser by a person: everything above. Screenshots (xo, daisy, wa at 390 and 1280) were checked by eye for Today, Appearance tiles and the task form; the family-theme tiles, More, evening check-in, plan card, offline and first-run states were covered only by the Playwright asserts.
- Owner to-do:
  1. Open `https://xo.tifunction.com/#/appearance`, Advanced, Theme families: check the tiles no longer look like switches.
  2. Open the font list in Appearance, Text: no "null" lines.
  3. On the phone: add an appointment (full-screen form, Save pinned at the bottom), then write notes with a list and check Preview and Dictate in the editor.
  4. Turn off Wi-Fi on the phone and open Today: the offline notice shows and Tick is greyed.
  5. Veto any default above.
  6. `make shots` failed twice (2 of 6 runs) with "missing text" for every list key, as if `/api/text` failed to load; the full suite and four later shot runs passed on the same commit. `loadText()` in `static/js/text.js` keeps the failed load and never retries. Decide whether to harden it.
  7. `tests/e2e_tracker.py` checklist flake showed again ("Checklist: 0 of 1 ticked", passed on rerun); see item 10 below.

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
10. `tests/e2e_tracker.py` is flaky: it fails now and then with `Checklist: 0 of 2 ticked` (the page shows "0 of 1 ticked") and passes on rerun. It failed in 3 of the 5 build steps on 2026-11-27. Fix the wait before relying on the suite as a gate. Since 6501657 the test asserts after the first step, and the failure now shows there: the first Enter in the checklist sometimes adds nothing (app race, not a test wait). It failed this way on 6501657 and 1c98cf4 on 2026-11-27.
11. Open `https://xo.tifunction.com/#/settings`, change a key under Keyboard shortcuts, then press `?` on Tasks to see it.
12. Add a custom field in Settings, Custom fields, and fill it in on a task.
13. Open `https://xo.tifunction.com/#/notes`, write a note with a list, and check Preview.
14. On your phone and desktop, tap Dictate once and allow the microphone. Nothing here was checked on a phone or with a real microphone; the tests use a fake speech engine.
15. `tests/e2e_look.py` line 116 (the banner should read "Night") failed once on 2026-11-27 and passed on rerun. Not diagnosed.
16. Another session's Settings, My data, "Review and delete entries" button (it claims 2.13.0 and D-25) was uncommitted at deploy time and is not in the deployed app. Commit it and run `make db-backup` then `docker compose up -d --build app` when that work is finished.
17. Open `https://xo.tifunction.com/#/settings` on desktop: collapse the side bar with the arrows at the top, drag its right edge, and right-click Diary to pick a new icon. Checked only in headless Chromium screenshots and `tests/e2e_rail.py`.
18. `tests/e2e_look.py` line 304 (`Reset Colours: Buttons` not found) fails whenever it runs after the Web Awesome run of `tests/e2e.py`, which is the order `make test-e2e` uses, so the chain stops there. It fails the same way on `7230835`, before 2.20.0. It passes after the XO kit run.
19. Ticking Appearance in the Widgets popover closes the popover. Cause not found; `tests/e2e_canvas.py` closes it only if still open.
20. Seen in canvas screenshots (2026-11-27, 2.21.0): the icon picker opened from the New canvas Icon field sits over the popover's Cancel and Create buttons (no room to its right, so it drops below the field), and it has no X in its title bar as the design guide asks. Escape or a pick closes it. Both belong to `static/js/iconpicker.js` placement and chrome.

## What worked

- Throwaway test stack (`xo-test`): API and browser tests cannot touch `xo-db`.
- Serving both kits locally means no request leaves the origin, so XO works offline.
- A server block in NOBBIE's nginx plus a tunnel route gave XO its own origin.

## What did not work

- Folders at mode 0700 on the build host gave 401s from `StaticFiles`; the Dockerfile now sets `chmod -R a+rX`.
- Loading Web Awesome's `webawesome.css` restyled every plain button; only the default theme file is loaded.
- A new Cloudflare hostname was negatively cached by the server's resolver; test with `curl --resolve`.

More in `.claude/COMMON_MISTAKES.md`. Decisions are in `docs/decisions.md`.
