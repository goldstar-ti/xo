# Decisions

A numbered log. Add the next `D-n` for anything that was chosen over an alternative, with the date and the reason.

## D-1 (2026-11-26): CSP relaxed for inline styles

`style-src 'self' 'unsafe-inline'`, because Web Awesome and daisyUI components set inline styles. Scripts stay `'self'` only: no inline scripts, no `eval`. The Web Awesome and Font Awesome hosts are permitted only when a local copy is not possible. `frame-ancestors 'none'`, `base-uri 'none'` and `form-action 'self'` stay. Why: the owner wants both kits, and neither works without inline styles. Rule 3 in `CLAUDE.md` holds the wording.

## D-2 (2026-11-26): Both component kits served locally, switchable later

daisyUI 5 comes through Tailwind with the `tw:` prefix. Web Awesome 3 loads through `static/js/kit.js`. Both are copied into the image at build time, so no request leaves the origin. A later step adds a Kit appearance option (XO, daisyUI, Web Awesome) and moves screens over one by one. Why: the owner wants to compare them in use before choosing, and local copies keep the CSP tight.

## D-3 (2026-11-25): App port published only on 172.17.0.1:8010

The app is reachable only on the docker0 address, and NOBBIE's nginx container proxies `xo.tifunction.com` to it through `host.docker.internal`. Why: no LAN address exposes XO, and nginx can still start when XO is down.

## D-4 (2026-11-26): Cloudflare Access allows only the owner's email

The Access application for `xo.tifunction.com` has one policy: the owner's email. Why: the first sign-in creates the only account, so anyone who reached the sign-in page first could take it.

## D-5 (2026-11-26): NOBBIE's front-end stack and settings table not adopted

XO does not take NOBBIE's htmx, Alpine, Jinja or Vite stack, or its `app_settings` table. Why: XO's rule 3 (local assets, tight CSP), plain ES modules with no build step, and settings that are encrypted items or browser-side (`xo-look`) rather than a plaintext table. Only the code style, voice guide, Claude tooling and decisions habit were carried over.

## D-6 (2026-11-26): Security handled outside the codebase

The owner handles security separately and takes responsibility for it. The app sends no CSP or other security headers (`X-Content-Type-Options`, `Referrer-Policy` removed), and the CLAUDE.md rules about security are lifted. Kept: the `X-XO: 1` check on changes (it works and costs nothing), Cloudflare Access in front of the hostname, HSTS from nginx, and local copies of libraries and fonts (for offline use, not security). This supersedes D-1.

## D-7 (2026-11-26): Browser encryption removed

Items are stored as plain JSON and sign-in becomes a normal password checked on the server. Why: the owner put browser encryption out of scope. The database had no accounts, so the tables are recreated rather than migrated.

## D-8 (2026-11-26): Rule 5 (no personal details) paused until production

Personal names and details may appear in code, defaults, tests and commits while the rule is paused. The owner reinstates it before production, and every detail added meanwhile must be removed then. The repository stays private (rule 6).

## D-9 (2026-11-26): NOBBIE's widget canvas and tabs

XO takes NOBBIE's canvas model: tabs of canvases, each a GridStack board of widgets from one registry (`static/js/widgets.js`), with roll up, take off and Add widget, plus a generic tab set for a pane of open things (`static/js/tabs.js`). GridStack 14.1.0 is served from `static/vendor/gridstack` (its one-file browser build, since its ES modules need a bundler). Each canvas is an item of kind `canvas`, so layouts sync between devices; a phone shows the widgets as a list and never saves geometry. It lives on its own Canvas screen (2.4.0). Why: the owner wants the screens composable side by side, as in NOBBIE. Every screen is registered as a widget (`viewWidget()`), on a 24-column grid of 28px rows, the density the owner asked for. NOBBIE's widget management came with it: Refresh, Zoom, Focus, Fit to content, Reset size, Fit all, Reset layout, Move to another canvas, Open in side tab and Undo (this visit only). Not adopted: per-role layouts, wide-screen layouts, layout presets, title-bar overflow (XO puts the rarer tools in a More menu instead) and a resizable side pane.

## D-10 (2026-11-26): The tracker lives in XO's items table, with NOBBIE's tracker read-only beside it

The owner chose: XO's generic `items` table (kinds `project`, `pm_item`, `tracker`), every NOBBIE tracker view and function except attachments and commits (rule 2: text only), plus due dates on Today, checklists, per-project pick lists and tracker widgets, and a live read-only view of NOBBIE's tracker. Each project carries its own lists; an item carries its comments, checklist, links and history, so it syncs and works offline like any other item. NOBBIE is read by the server: it signs in as a reader account (`NOBBIE_URL`, `NOBBIE_USER`, `NOBBIE_PASSWORD`) and only sends GET requests after the sign-in post, with a two-minute cache. Why: no schema change or migration in XO, no change to NOBBIE, and NOBBIE stays the team's tracker while XO is the owner's own view across projects.

## D-11 (2026-11-27): Check-in choices are an editable lookup, kept in the settings item

The body, "Today I…" and sleep chips start from `content/text/checkin.yaml`, now grouped as positive, neutral and negative (the owner's list from a Gemini session, merged with the existing chips so saved check-ins still match). The owner edits them in Settings, Check-in choices; an edited list is stored as `[{ text, group }]` rows under `lookups.<key>` in the `settings` item, so it syncs and needs no new kind. Lists are registered once in `LOOKUPS` (`static/js/lookups.js`). A saved answer that is later removed from the list still shows on that check-in under "Chosen before". Why: the owner asked to customise the lists without editing YAML, and the YAML stays the starting point and the reset target.

## D-12 (2026-11-27): Reporting register built after roadmap 1 to 3

The owner chose to build Workbook sittings, Outputs and Life story first, then the Reporting register, then GTD core. The register stores the password itself for each login reported, as plain JSON like every item (D-7). The 3-day rule is counted by a daily prompt in the evening check-in. Deadlines live in `content/rules/ro.yaml`, not in code, so a rule change is a file edit. Why: the owner reports to the Registry and wants the deadlines and receipts in one place, and the FAQ wording may change.

## D-13 (2026-11-27): One `person` kind

People, Life story, the plan card team and the register's child-contact reports all read one `person` kind, with the alias and the private "who" held on it. Why: a person entered once should appear everywhere, and Life story's aliases-only rule then applies the same way to every output.

## D-14 (2026-11-27): Google Calendar two-way for every entry with a time

XO's server holds the OAuth refresh token. Writing to Google stays off until the owner switches it on in Settings. Pulled edits and new events go into the Diary, and the last edit wins. Why: the owner wants one calendar across phone and XO, and nothing should leave XO until the owner says so.

## D-15 (2026-11-27): Claude API for capture, SMART coaching and review summaries

Each use has its own switch in Settings, off by default, and the text to be sent is shown in a dialog before sending. Why: the owner wants help with parsing and summaries but wants to see and control what leaves XO. Rule-based dates cover GTD capture first, so nothing depends on the API.

## D-16 (2026-11-27): Reminder wording chosen per reminder kind

Settings holds a choice of discreet or detailed wording for each reminder kind. Discreet stays the default (voice guide rule 4). Why: some reminders are safe to detail on the owner's own phone and others are not, and the owner knows which.

## D-17 (2026-11-27): Records built first

Change history on entries, a nightly backup and export everything come before the register. Why: the register may be used as evidence, so its history, backups and exports have to exist before the first entry.

## D-18 (2026-11-27): Group order after GTD core

After GTD core the order is: Health and mood; People and life admin; Legal and sessions; Goals and reviews; Money; Google Calendar; AI. This is a default and the owner may reorder it. Why: the earlier groups feed the later ones (people feed legal, goals feed reviews), and the two external services come last.

## D-19 (2026-11-27): Task status, priority, categories and subtasks

A task has a status (to do, doing, done) and a priority, and `done` stays in step with the status so Today, check-ins and reminders keep working. Subtasks are a checklist inside the task, not separate items, so Today's three and reminders stay one level deep. Categories and places live in one `taskmeta` item, seeded from `defaults.yaml` until first saved. Why: the owner wanted real task management (priority, categories, repeats, waiting on another task) without a second kind of item or a change to how Today picks work.

## D-20 (2026-11-27): Tasks board and views

The Tasks screen shows tasks as a list, a To do, Doing, Done board or a table. Cards have no manual order: they sort by priority, due date and title, so a drag changes status only. The chosen view and the filters are kept per browser, and the board and table are also canvas widgets. Why: a manual order would be a second thing to maintain beside Today's three, and the filters decide what is worth looking at, not where it sits.

## D-21 (2026-11-27): Time blocks, pacing and closing the day

Actual time is asked for in the evening check-in, not on each tick, so finishing a task never interrupts. The time XO allows on top of a guess is the median of actual over guess for the last 20 finished tasks, clamped to 0.5 to 4, and stays 1.5 until five tasks have an actual time. Overload on Today compares the unfinished picks with the time left before the evening check-in. Why: the owner wanted allowances from their own pace without being asked mid-task.

## D-22 (2026-11-27): Command palette and shortcuts

The palette builds its command list each time it opens, from the screens, check-ins, task views and open tasks, so nothing is listed twice. Single-key shortcuts work only on the Tasks page, never in widgets and never while typing. Ctrl+K works on every screen, but the Tracker screen keeps its own `/` and `?` keys, so the palette leaves those two to it there. Why: one place to reach anything by keyboard without a second shortcut list to maintain, and no clash with keys already in use.

## D-23 (2026-11-27): A Claude agent with memory, a daily review and nudges

One switch in Settings, off by default, turns the agent on. Its daily review and chat may read every kind, so there is no dialog before each call. Instead, Settings shows the exact text the next review would send and a log of every call with its time, tokens and the kinds it read. A monthly token cap stops all calls once reached. The agent's own words appear only on the Insights and Chat screens and in nudges, labelled as Claude's, so the rule that the app does not interpret answers still holds everywhere else. D-15 still governs capture, SMART coaching and review drafts. AI stays last in the D-18 order. Why: the owner wants the agent to learn and notice patterns across everything, and a review that runs on its own cannot wait for a dialog.

## D-24 (2026-11-27): Every keyboard shortcut is configurable

All shortcuts are entries in one registry, `ACTIONS` in `static/js/keymap.js`, and a screen asks `matchKey(scope, event)` for an action id instead of testing keys. The owner's changes live in the settings item as `settings.keys`, so they follow the owner across devices, unlike the look. A key without Ctrl or Alt never fires while typing, and a combo already used in the same scope, or in the global scope against any scope, is refused. OS-wide hotkeys are parked: a PWA cannot register them. Why: the owner wants to choose every key, and one registry keeps the shortcut list, the Tracker keys table and Settings from drifting apart.

## D-25 (2026-11-27): Delete entries in bulk

Settings, My data has a Review and delete entries dialog. It lists every saved entry straight from the server (old done marks and check-ins included), narrows by kind and search, and deletes the ticked ones through `POST /api/items/bulk-delete` after a second tap. A bulk delete is the same soft delete as deleting one entry: the row stays as an empty tombstone and its reminders go. Nothing deletes linked entries (a tracker project's items, a task's done marks). Why: the owner is still testing and wants to clear out entries they no longer need without deleting them one screen at a time.

## D-26 (2026-11-27): Custom fields on every record

The owner defines extra fields per kind of record in Settings, Custom fields. The definitions are one item (`fields`, kind `fields`) and the values sit on each record as `payload.custom`, keyed by the field's id. Removing a field hides its values and leaves them saved. Form fields go in the main part of the form, after the built-in ones. `static/js/customfields.js` owns both, and a new kind that takes custom fields is one entry in `FIELD_KINDS`. Why: the owner wants to track things XO has no field for, without a code change for each one.

## D-27 (2026-11-27): Notes in Markdown

Notes are items of kind `note` (`{ title, body, pinned, custom, created, updated }`), written in Markdown and stored as plain text. The editor (`static/js/mdeditor.js`) is a toolbar over a text area with Write and Preview tabs, and the same editor is the Notes field on a task. `marked` is vendored from npm into `static/vendor/marked` at image build, so there is no CDN (rule 3) and notes render offline. Raw HTML is shown as text and images are shown as links, because XO stores text only (rule 2). Why: the owner wants longer notes with lists and headings, kept next to the tasks, without a second place to keep them.

## D-28 (2026-11-27): Voice capture through the browser's speech service

Dictation uses the browser's own speech recognition (`static/js/voice.js`), which may send the audio to the browser maker's speech service. The owner allowed that; XO saves only the recognised text and never the audio, so rule 2 (text only) now carries that one exception. The microphone button shows only when the browser supports recognition and Settings, Dictation is on. Why: the owner wants to capture thoughts by speaking, and a local model would add a large download for a small gain.

## D-29 (2026-11-27): OS-wide hotkeys parked

A PWA cannot register a hotkey that works while another app has focus, so dictation has no system-wide key. Its in-app key (`global.voice`, Alt+V by default) is configurable like every other shortcut (D-24). Why: nothing in a browser can do better, and a separate desktop helper is not worth building yet.

## D-30 (2026-11-27): NOBBIE's Appearance options in XO

Appearance takes every NOBBIE option XO has an element for, behind a Standard and an Advanced view. Advanced items are hidden in Standard until changed, and then show with a dot (`adv()` in `static/js/views/appearance.js`). What was taken: 151 colour themes in 30 families, a font catalogue of 493 fonts plus a code font, sizes for text roles, light and dark colours per element, spacing, header size, zoom, radius, glass, figure style, and widget and tab colours. What was mapped: NOBBIE's Colourful style is XO's colour strength, NOBBIE's 98 `--nb-*` tokens become 57 XO colour tokens in 12 groups (`COLOUR_GROUPS` in `static/js/boot.js`, one per XO element with its own colour), and NOBBIE's 23 text roles become 18 (`FS_ROLES`, those with no XO text were left out). The screen has six groups: Colour, Text, Layout, Effects, Screens, Share and reset. The look stays on the device (rule 4), so radius is per device, unlike NOBBIE's shared radius. Fonts load on demand and are cached after first use, so a catalogue font chosen offline before first use falls back to system-ui. Look codes are JSON and start `XO2-`; `XO1-` still decodes. Themes export and import as XO's own JSON, and NOBBIE's `ng-colours` export is not read. Options XO has no element for yet are listed by name in `docs/ROADMAP.md`, Future Appearance options. Why: the owner asked for every NOBBIE option, with a Standard and an Advanced view so the common choices stay easy to find.
