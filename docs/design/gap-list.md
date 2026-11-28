# Design handoff gap list

Compares `docs/design/xo-design-handoff.md` with `main` at a2016e2 (v2.28.0). Status is what exists on main today. "Step" is the step in the design-port plan that builds it (A1 to A7 are the Bridge port, B1 to B6e the handoff work). Where the handoff and main disagree, main wins until PJ says otherwise.

## Handoff errors (O11)

1. Section 3 says the look code has "a slot" per option (`encode` and `decode`, length changes). It has none. The look code is JSON (`XO2-`), so a new option needs `DEFAULT_LOOK`, a `CHOICES` entry or a clamp, and a `cleanLook()` line in `static/js/boot.js`.
2. Section 6 says the pane exists ("existing right-split function", `pane.js`, `openTab()`, `closeTabOf()`, `xo-pane`). There is no `static/js/pane.js` on main. It lives on the `bridge-and-large-screens` branch and is ported in step A3.
3. Section 1 decision 8 and section 0 say a Today colour setting exists. Main has no `todayColour` look choice. It is built in step B1.
4. Section 1 decision 7 says Duties replaces Obligations "in all wording". The wording is already Duties in `content/text/*.yaml`; only ids and kinds (`obligation`, `obligations`) stay, by design.
5. Section 1 names decisions "D-39 onwards" but section 9 says "D-13 onwards". Main already uses D-9 to D-38, so new decisions start at D-39 (O13).
6. Section 6 says the Bridge is its own board with a nine-column layout and a "Layout" drop-down. On main the board is the Canvas (24 columns, `static/js/canvas.js`); the Bridge becomes a starter layout of the Canvas (O4).
7. Section 4 lists Google Sans Flex as available. It is not in the repo and not in `static/vendor/fonts/files`; it must be downloaded (O9). Inter Tight is already vendored there.
8. Section 3 colours: `--concept-*` tokens exist on main (not `--m`), with a single chroma of 0.1 and different hues. The handoff hues replace them (O8).

## Section 1: decisions

| Item | Status on main | Where / what | Step |
|---|---|---|---|
| 1 Grow text with the window (dial) | Not built | `boot.js:340` sets `root.style.fontSize` inline; no `fluid` choice | A2 (D-39), look choice `fluid` (O6) |
| 2 Module colours, switch "A colour for each module" | Partly built | `--concept-<id>` tokens in `static/app.css` lines 68 and 83; pref `conceptNav` in `boot.js` (`DEFAULT_PREFS`) only tints nav icons | B1 (O7, O8) |
| 3 Type: Inter Tight and Google Sans Flex as dials | Not built | `FONTS` in `boot.js` has atkinson, lexend, grotesk, fraunces, mono, system, serif; body default `atkinson`, head `same` | B2 (O9) |
| 4 Controls follow what they do | Partly built | `ui.js`: button, input, textarea, select, checkbox, chip, segmented, toggle, disclosure, optionCards, progress, sortList | B3, B4a to B4f |
| 5 Appearance and Settings open in the right-split pane | Not built | No `pane.js`; `openForm` and `openPopover` only | A3 (O5) |
| 6 Tables: column share rule | Not built | Table view exists in `views/tasks.js` without the share rule | B4c |
| 7 Duties replaces Obligations in wording | Built | `content/text/app.yaml:28`, `lists.yaml`, `forms.yaml` | none |
| 8 Today colour option | Not built | No `todayColour` in `boot.js` | B1 (O7) |

## Section 2: Ink as base theme

| Item | Status | Where | Step |
|---|---|---|---|
| Ink theme exists | Built | `THEMES.ink` in `boot.js:21` | none |
| Ink as the default theme | Not built | `DEFAULT_LOOK.theme` is `foliage` (`boot.js:112`) | B1 (O10, new looks only) |
| 1 px hairline on near-white widgets | Not built | none | B1 |

## Section 3: module colours

| Item | Status | Where | Step |
|---|---|---|---|
| Per-module colour tokens | Partly built | `--concept-<id>` (today, diary, tasks, notes, obligations, routine, bills, checkin, plan, tracker, canvas, appearance, settings) in `app.css`; per-device overrides on the Modules tab (`views/appearance.js`, `static/js/modules.js`) | B1 |
| `--m` and `--m-soft` on the module root | Not built | no match in `app.css` | B1 (O8) |
| Handoff hues | Not built | current hues differ | B1 |
| Rail icons take module colour | Built | `app.css:895` under `data-concept-nav="on"` | none |
| Widgets use the module colour (icon chip, fold cards, lead card, buttons, chips) | Not built | none | B4a to B4f as screens move over |
| Items keep their home colour (The day, month grid, week) | Not built | none | B4b, B5 |
| New options: module colours on/off, Today colour, heading font, body font, grow text | Not built (module colours on/off exists as `conceptNav`) | `boot.js`, `views/appearance.js` | B1 |

## Section 4: type

| Item | Status | Where | Step |
|---|---|---|---|
| Inter Tight vendored | Built (as catalogue font) | `static/vendor/fonts/files/InterTight[wght].woff2` | B2 copies it to `static/fonts/inter-tight.woff2` as `FONTS.intertight` |
| Google Sans Flex vendored | Not built | absent | B2 (park if the download fails) |
| `--fs-*` size roles | Partly built | `--fs-body`, `--fs-page`, `--fs-section`, `--fs-sub`, `--fs-small` used in `app.css`; roles in `FS_ROLES` (`boot.js`) | B1 |
| `--fw-*` weight tokens | Not built | none | B1 |
| Size and weight table | Not built | none | B1 and B4a to B4f |

## Section 5: controls

| Control | Status | Where | Step |
|---|---|---|---|
| Round tick box | Not built as a control | ticks are checkboxes (`ui.js` `checkbox`) | B3 |
| Play ring | Not built | none | B3 |
| Switch | Built | `toggle()` in `ui.js:262` | none |
| Segmented | Built | `segmented()` in `ui.js:240` | none |
| Drop-down | Built | `select()` in `ui.js:59` | none |
| Stepped scale (replaces sliders) | Not built | none | B3 |
| Picture options | Partly built | `optionCards()` in `ui.js:311` | B3 |
| Progress bar | Built | `progress()` in `ui.js:160` | none |
| Three-dot menu | Not built as a control | `iconButton` and `openPopover` exist | B3 |
| Auto-save line | Not built as a control | Notes autosave exists in `views/notes.js` | B3 |
| Plain link | Partly built | `linkRow()` in `ui.js:168` | B3 |
| Look controls padding token | Not built | none | B3 |

## Section 6: the Bridge at 5120 x 2160

| Item | Status | Where | Step |
|---|---|---|---|
| Canvas board (GridStack, widgets, tabs, undo) | Built | `static/js/canvas.js`, `widgets.js`, `grid.js`, `tabs.js`, `views/canvas.js` | none |
| Right-split pane | Not built | branch `static/js/pane.js` | A3 (O5) |
| Nine-column 5K layout as a built-in layout | Not built | none | B5 (starter layout named "Bridge", O4) |
| Left rail 88 px, top bar Board/Focus, Layout drop-down | Not built | Canvas bar exists | A7, B5 |
| Tasks widget: lead card, Board lanes, New task panel, Table | Partly built | `tasks`, `tasks-board`, `tasks-table` widgets in `widgets.js` | B4c |
| Diary widget: month grid, agenda, week by the hour | Not built | `diary` widget draws the list | B4b |
| Widget catalogue additions (Now, Next up, Daily line, Routine this week, Last 28 days, Timer, Reports to the officer, For court on Tuesday, Who to call, Next 30 days, By bill, Add a bill, Four weeks, In my own words, Yesterday evening, Weekly check-in, Write the next box, Boxes still to write, Plan card for my wallet) | Not built | none; `checkin-weekly` exists as a screen widget only | A6 (the 22 Bridge widgets from the branch) |
| Screen parts (`todayBlocks()`, `taskParts()`, `obligationParts()`, `*Part()`) | Not built | `today.js` `render()` :111; `lists.js` objects `diary`, `routine`, `bills`, `obligations` | A1 (extract), A6 |
| Workbook, Life story, Outputs widgets | Parked (O12) | ROADMAP sections 1 to 3 not built, no data | Parked |
| Scratch pad widget | Not built | `notes` widget exists; fixed note id `note:scratch` planned | B5 (O12) |

## Section 7: phone screens

| Item | Status | Where | Step |
|---|---|---|---|
| Pattern C screens (view switch, ribbon, lead card, fold cards, FAB sheet) | Not built | none | B6a to B6e |
| Bottom bar Today, Diary, Tasks, Duties, More | Partly built | `DEFAULT_PREFS.tabs` is today, diary, tasks, obligations in `boot.js:125`; no More screen | B6e |
| Tasks C1 to C3 and New task sheet | Not built | none | B6c |
| Maximal mode | Parked | none | Parked |

## Section 8: build order

| # | Item | Status | Step |
|---|---|---|---|
| 1 | Tokens and dials, fonts | Partly built | B1, B2 |
| 2 | `ui.js` controls in all three kits | Partly built | B3 |
| 3 | Screens onto the controls, Duties rename | Not built (rename built) | B4a to B4f |
| 4 | Bridge widgets, 5K layout, pane | Not built | A1 to A7, B5 |
| 5 | Phone screens, pattern C | Not built | B6a to B6e |
| 6 | Maximal mode | Parked | Parked |

## Section 9: tests and docs

| Item | Status | Step |
|---|---|---|
| `tests/e2e_shots.py` at 360, 1280, 1920 and 5120 | Built in A0 | A0 |
| Bridge at 5120 and Appearance in the pane in the shots | Not built | A3, B5 |
| Version bump, version-history row, decisions from D-39, README, ROADMAP, HANDOFF | Per step | each step |
