# Version history

`VERSION` in `app/version.py` is the one app version. Add a row at the top for every shipped feature (minor bump) or fix (patch bump). The major number changes only with the owner's say-so.

| Version | Date | Change |
|---|---|---|
| 2.15.0 | 2026-11-27 | Custom fields on tracker items and check-ins: add your own fields in Settings. Items show them in the details pane and record changes in the history. |
| 2.14.0 | 2026-11-27 | Custom fields: add your own fields to appointments, tasks, routine, bills, obligations and reports in Settings. Tasks can show them as table columns and filter by them. |
| 2.12.0 | 2026-11-27 | Every keyboard shortcut can be changed in Settings, Keyboard shortcuts. The shortcut list shows the keys you chose. |
| 2.11.0 | 2026-11-27 | A command palette (Ctrl+K) and keyboard shortcuts on the Tasks screen. |
| 2.10.0 | 2026-11-27 | Tasks can take a time on Today's day line. The evening check-in closes the day: carry tasks forward, note actual times, pick tomorrow's three. Time allowed follows your own pacing. |
| 2.9.0 | 2026-11-27 | Tasks as a list, a To do, Doing, Done board or a table, with filters for categories, focus and place, a ready list, and a review of tasks left untouched. |
| 2.8.0 | 2026-11-27 | Tasks have priority, categories, subtasks, focus, places, repeats and waiting on another task. Quick add reads dates, priority, categories and time. |
| 2.7.0 | 2026-11-27 | Every Appearance slider has a reset button, - and + buttons and a number box, matching NOBBIE. |
| 2.6.0 | 2026-11-27 | Check-in choices: more body and "Today I…" options, grouped as positive, neutral and negative. Settings has a Check-in choices table to edit, regroup, reorder, add and remove choices, with a way back to the original list and a switch for the group names. |
| 2.5.0 | 2026-11-26 | The Tracker screen: projects with their own pick lists, items with due dates, checklists, links, comments and history; list, board, needs test, handover, pivot, history and activity views; bulk changes and keys; due items on Today with reminders; tracker widgets; NOBBIE's tracker read-only. |
| 2.4.0 | 2026-11-26 | The Canvas screen: every screen as a widget on canvas tabs, with roll up, zoom, focus, fit, reset, move between canvases, side tabs and undo. |
| 2.3.4 | 2026-11-26 | Fixed doubled borders, unreadable primary buttons and run-together list rows in the daisyUI and Web Awesome kits. |
| 2.3.3 | 2026-11-26 | Settings, Appearance, sign-in and the app shell follow the Kit choice; all wording is in content/text. |
| 2.3.2 | 2026-11-26 | Check-ins and My plan follow the Kit choice; their wording is in content/text. |
| 2.3.1 | 2026-11-26 | Today and the lists follow the Kit choice; their wording is in content/text. |
| 2.3.0 | 2026-11-26 | Text and prose come from YAML files in content/text, live on reload. Appearance has a Kit choice: XO, daisyUI or Web Awesome (forms and dialogs follow it; screens move over next). |
| 2.2.0 | 2026-11-26 | Browser encryption removed: entries are stored as plain JSON and sign-in is a password checked on the server. No CSP or security headers. |
| 2.1.0 | 2026-11-26 | Inline styles allowed in the CSP; Web Awesome, Font Awesome icons and daisyUI served locally; house code style, voice guide and Claude tooling. |
| 2.0.0 | 2026-11-25 | XO v2 deployed on gs-sv-008 behind Cloudflare Access. |
