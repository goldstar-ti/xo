# XO design handoff: Bridge at 5K, module colours, type, controls, phone screens

Source of truth: the Design canvas "too many buttons!" (claude.ai artifact `b5e7690a-4c09-4ba7-8d9a-31dc9bb4ebb1`). Generators are in `/home/claude/tasksalt` (`wide.py` for the 5K board, `phone.py` and `tasks_phone.py` for the phone screens). The canvas is a drawing, not code to copy. Build with the repo's own conventions (`h()`, `put()`, `ui.js`, `t()`, YAML wording, `REMINDERS`). Nothing here has been built in the repo yet.

Scope of this handoff: the Bridge at 5120 x 2160, the ten phone screens, the Tasks phone designs, and the shared system behind them. The Note Air6 C boards (e-ink) are not part of it and are still open for review.

## 0. State of main when this was written (v2.28.0, D-38)

Main already has modules that switch on and off (D-36, 2.25.0), a Modules tab with a colour for each module per device and tinted screen icons (2.26.0), function switches for Tasks and Today (D-37, D-38), Markdown editors, Tabler icons, the design-canvas restyle (D-33) and a Today colour setting in `content/text/appearance.yaml`. Before building anything below, compare it with what exists and build only the difference: reuse the Modules tab colours, extend rather than duplicate, and fit new options into the Appearance structure that is already there. Where this document disagrees with main, main wins until PJ says otherwise.

## 1. Decisions to record (start at D-39)

1. **Fixed text size on big screens is a dial.** "Grow text with the window" is on by default, so nothing changes until it is turned off. Off pins the root size to the laptop size, and the existing Text size dial still scales it. Per device, in `xo-look`. D-9 stays the default behaviour.
2. **Module colours.** Each module has its own colour. The theme supplies the neutrals, the module supplies the hue. Default theme for the new look is Ink, so nothing clashes. A switch "A colour for each module" turns it off (one accent for all).
3. **Type.** Heading font Inter Tight, body font Google Sans Flex, both as dials. Weight scale in section 4.
4. **Controls follow what they do.** The mapping in section 5 replaces most worded buttons. Worded buttons stay for the single main action only.
5. **Appearance and Settings open in the existing right-split side pane** (`pane.js`), never as a page. No new pane function.
6. **Tables.** Title column two shares, each text column one equal share, no wrapping, number columns narrow and right-aligned. Fall back to content sizing only if equal shares would wrap.
7. **Duties** replaces Obligations in all wording (already agreed earlier; `content/text/*.yaml`, nav, headings, docs).
8. **Today colour is a user option.** Appearance gets a "Today colour" choice with two values: Module colour (indigo, the default) and Ink (the theme's black, so Next up is the only dark block). It sits next to "A colour for each module" and does nothing when that switch is off. Per device, in `xo-look`.

## 2. Theme: Ink as the base

Ink exists already in `boot.js` `THEMES.ink` (`nh 0, nc 0, ah 0, ac 0, wh 75, al 0.16, ad 0.94, pl 0.98`). Use the real OKLCH tokens. The hex values below are only what the drawings used.

| Token | Drawing value |
|---|---|
| paper | `#F8F8F8` |
| surface | `#FDFDFD` |
| ink | `#1B1B1B` |
| muted | `#5D5D5D` |
| line | `#D6D6D6` |
| accent (theme) | `#0D0D0D` |
| soft | `#EBEBEB` |
| overdue (ochre) | stays ochre in every module |

Near-white widgets on near-white paper need a 1 px `--line` hairline (`box-shadow: inset 0 0 0 1px var(--line)`). Other themes should still work: the module colours are applied on top of whatever neutrals the theme gives.

## 3. Module colours

Add per module two custom properties on the module root: `--m` (the hue, takes white text) and `--m-soft` (the tint, takes dark text). Derive them in OKLCH from a hue and chroma pair so light and dark both stay readable, the same way `--leaf` and `--leaf-soft` are derived now. Hex below is the drawing value.

| Module | `--m` | `--m-soft` | Notes |
|---|---|---|---|
| Today, Bridge | `#2B3990` | `#DFE4FA` | indigo by default; the "Today colour" option can switch it to theme ink |
| Tasks | `#1B5FAA` | `#DCE8F8` | blue |
| Diary | `#0B6B6F` | `#D5EEEE` | teal |
| Routine | `#2C6E3F` | `#DCF0DF` | green |
| Duties | `#2F4F6F` | `#DDE6EF` | steel (not slate, too close to Ink greys) |
| Bills | `#94481C` | `#F8E5D8` | copper |
| Check-ins | `#6240A8` | `#EAE2F8` | violet |
| My plan | `#A93226` | `#F9E1DD` | lifebuoy red |
| Workbook | `#9B2C6B` | `#F8DFEC` | berry |
| Life story | `#6B4A2B` | `#F0E6DA` | sepia |
| Outputs, scratch pad, Appearance, Settings | theme ink | theme soft | neutral |

Rules:
- A module's widgets use its colour for the icon chip in the widget header, fold cards, lead card, buttons and chips.
- An item keeps its home colour wherever it appears. In The day, lunch is Routine green, the GP is Diary teal, the workbook sitting is Workbook berry. The month grid and the week-by-the-hour follow the same rule.
- Overdue is always ochre, which is why Bills is copper and not gold.
- The rail icons take their module colour, so the rail is also the legend.
- Only one lead card on the board is solid (Next up). The others are tinted or outlined.
- Copper (Bills) and sepia (Life story) are the closest pair. Revisit if they read as one.

New appearance option steps (CLAUDE.md): a default and a `CHOICES` entry in `boot.js`, a line in `cleanLook()`, a slot in the look code (`encode` and `decode`, which changes its length), CSS, and a control in `views/appearance.js`. This applies to: module colours on/off, Today colour (Module colour or Ink), heading font, body font, grow text with the window.

## 4. Type

Fonts: Inter Tight (headings, `wght` 300 to 800) and Google Sans Flex (body, variable `wght`, check the lightest weight). Both are on Google Fonts as variable fonts. XO prefers local copies (`static/fonts`, `tests/e2e_kits.py` fails on any off-site request), so vendor the two files. The drawings loaded them from Google Fonts only because a canvas cannot self-host.

Sizes (px at the laptop base; these do not change on the 5K screen):

| Role | Size | Weight |
|---|---|---|
| Page title | 28 | 700 |
| Lead card title | 26 | 600 to 700 |
| Widget title | 16 | 700 |
| Fold, lane and row group titles | 16 | 600 |
| Row and card titles | 15 | 600 |
| Body text, the user's own words | 15 to 18 | 400 |
| Small labels, chips, links, times | 12 to 13 | 600 |
| Detail lines (grey) | 12 | 300 |
| Column values in tables (Category, When, Where, Focus) | 12 | 300 |

Bold is only for titles, the picked state and the main worded button. Done items step down to regular with a strike. The user's own words are always regular. Today's date and the current rail item are bold, the rest regular.

Tokens: add `--fs-*` roles and `--fw-*` weights rather than raw values in components (the repo already keeps sizes in rem).

## 5. Controls: use the one that fits

| Job | Control |
|---|---|
| Done or not done | round tick box |
| Start a timed sitting | play ring |
| Open something | the whole row with a chevron |
| On or off | switch |
| One of a few | small segmented control |
| One of many | drop-down |
| A step along a range | filled stepped scale (replaces sliders) |
| A choice you can see | picture options (corners drawn as the corner) |
| How far along | progress bar |
| Several secondary actions | one three-dot menu |
| Nothing to press | auto-save line ("Saved as you type. Last saved 11:04 am") |
| Minor action | plain link |

Left as buttons: the single main action on a card, the New task panel's Add task, Save bill, view tabs, steppers, the star, call and print icons, and the chips in New task.

Sliders are replaced by preset chips plus a stepper for sizes and swatch strips for colours (agreed).

Padding rule for the Look controls (agreed): size every control to its widest label, let longer text wrap, and use one padding token everywhere.

Build each as a `ui.js` control so the kit switch (xo, daisy, wa) still restyles it. Write every daisyUI class in full. Tap targets at least 2.5rem, focus visible, `prefers-reduced-motion` honoured. Every icon-only control needs an `aria-label`.

## 6. The Bridge at 5120 x 2160

- Same type sizes as the phone. Do not scale to fill. More modules, not bigger ones.
- Nine columns, each about one phone wide. Tasks and Diary are two columns wide. 37 widgets. Column bottoms ragged on purpose (a GridStack board, `columnMax` as before).
- Left to right: Today, Tasks, Diary, Routine, Duties, Bills, Check-ins, My plan, Workbook and Life story.
- Left rail (88 px): Bridge, the ten sections, then Appearance and Settings at the foot with a dot to show they open in the pane.
- Top bar: title, a Board or Focus segmented control, a Layout drop-down (per device), search, an Arrange switch, an Add widget icon.
- Right side pane: use the existing right-split function (`pane.js` `openTab()` and `closeTabOf()`, reached through `openDialog()` and `openForm()` at 60rem and wider). Do not build a second pane or a new stacking control. Appearance, Settings and check-ins already open as pane tabs through `#/appearance`, `#/settings` and `#/checkin/<type>[/<day>]`, with the width kept in `xo-pane`. The 440 px width and the folded evening check-in in the drawing are only the look of the existing pane at 5K; keep the current tab behaviour and default width unless PJ asks for a change.
- Tasks widget: filter chips, the Do this now lead card, the Board view (three lanes), the always-open New task panel with five pickers side by side, and the Table view.
- Diary widget: five-week month grid, agenda in two columns, and the week by the hour with get-ready and travel time drawn before each appointment.

Widget catalogue additions (one `WIDGETS` entry each, wording in `bridge.yaml`): Now (clock and week strip), Next up, Daily line, Routine this week, Last 28 days, Timer, Reports to the officer, For court on Tuesday, Who to call, Next 30 days (bars), By bill, Add a bill, Four weeks (check-in history), In my own words, Yesterday evening, Weekly check-in, Write the next box, Boxes still to write, Plan card for my wallet, Workbook, Life story, Outputs, Scratch pad. Reuse the screen builders (`todayBlocks()`, `taskParts()`, `obligationParts()` and the other `*Part()` exports) rather than copying markup.

## 7. Phone screens

Each phone screen follows pattern C: a view-switch control top right, a ribbon of chips, one lead card, fold-up cards, a FAB that opens a blurred 97% opaque bottom sheet with tabs. Screens drawn: Today, Diary (and New appointment), Duties, Bills, Check-ins (and a single question), My plan, Routine, More, and the Tasks C1 to C3 plus the New task sheet in its two tabs (Category, Right now). Each screen uses its module colour, the type scale and the controls above.

Bottom bar: Today, Diary, Tasks, Duties, More. Bills, Check-ins, Routine, My plan and the rest sit under More.

Phone Maximal mode (designed earlier on canvas c8ca62c1, not built): 8-column phone grid, text resizes to fit, text size and spacing per role, show or hide every part, per-screen overrides.

## 8. Suggested build order

1. Tokens and dials: Ink as default, `--m` and `--m-soft` per module, `--fs-*`, `--fw-*`, the five new appearance options (with look-code slots and tests). Vendor the two fonts into `static/fonts`.
2. `ui.js` controls: tick, play ring, switch, segmented, drop-down, stepped scale, picture options, progress, three-dot menu, link. Add to all three kits.
3. Move existing screens onto them in batches (Today first), with wording in `content/text/*.yaml` and the Duties rename.
4. Bridge: new widgets, the nine-column 5K layout as a built-in layout for that device, confirm Appearance and Settings open through the existing right-split pane at 5K (no new pane code).
5. Phone screens in pattern C.
6. Maximal mode.

## 9. Tests and docs (from CLAUDE.md)

- API tests and both browser tests pass. Check 360 px, 1280, 1920 and 5120 wide, light and dark, at least two themes (Ink and one tinted).
- `tests/e2e_kits.py` must stay free of off-site requests (hence local fonts).
- `tests/e2e_shots.py`: add the Bridge at 5120 and Appearance in the pane.
- Bump the minor version, add a row to `docs/version-history.md`, add D-13 onwards to `docs/decisions.md`, update `README.md`, `docs/ROADMAP.md` and `HANDOFF.md`. No em-dash or en-dash anywhere. Wording in YAML, never inline.

## 10. Open questions for PJ

- Fonts are settled: Google Sans Flex for body, Inter Tight for headings. Confirm Google Sans Flex has a weight below 400 for the 12 px grey detail. If its lightest is 400, use 400 there and drop the light step for body text.
- Light (300) for 12 px grey detail may read thin at 1080p. Step up to 350 if so.
- Bills (copper) and Life story (sepia) are close.
- Today's indigo is settled as a user option (decision 8). Open: confirm indigo as the default.
- Combined desktop plus phone "C with A and B" version: agreed by PJ, still to be drawn. Not part of the first build.
- Slider alternatives board (preset chips plus stepper for sizes, swatch strips for colours): agreed by PJ, still to be drawn. The rule itself is in section 5.
- PR #1 (v2.4.1) was closed unmerged because the Canvas screen (D-9) on main supersedes it. The decision numbers D-9 and D-11 quoted above are from that old branch: read `docs/decisions.md` on main for what they mean now.
