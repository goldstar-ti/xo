# XO

The executive officer runs the ship's day so the captain can think. This one does it for you.

A private day planner with check-ins and a relapse prevention plan, for one person.
It runs as a web app that installs on Android and desktop.

Version 1 covers:

- **Today**: one screen with the next thing to do, today's three tasks, and the day in time order
- **Diary**: appointments with get-ready and leave reminders
- **Tasks**: first small step, time guess (the app allows half again), due dates, three picks a day
- **Routine**: meals, water, sleep, medication, each with a daily reminder and a tick
- **Bills**: due dates, repeats, a Paid button that sets the next one
- **Obligations**: court dates, court tasks, conditions with recurring reminders, a reporting record
- **Check-ins**: morning, evening, and a weekly review built from the five questions in Concept 17
- **My plan**: the Relapse Prevention Plan, one box at a time, and a plan card one tap from every screen
- **Appearance**: ten themes, your own colours and saved themes, seven typefaces, shape, density, texture, layout variants, scheduled looks and look codes. A "Look" button in the header opens the quick panel on any screen

Not built yet, specced in `docs/ROADMAP.md`: the workbook in daily sittings, outputs for named readers, and the life story.
`CLAUDE.md` is the guide for working on the code with Claude Code.

## Sign-in and data

You sign in with a name and a password (at least 8 characters). The server stores an argon2 hash of the password and keeps your entries as JSON in the database. Security is handled outside the app (see `CLAUDE.md`).

Two things to know:

1. **A device that is signed in can read everything.** Lock your phone and computer. Use "Sign out of this device" on any machine you stop using.
2. **Backups hold your entries in readable form.** Store dumps somewhere private.

The app stores text only. There are no photo or file uploads.

## How it is deployed

XO runs on gs-sv-008 at `https://xo.tifunction.com`, the same way as the other stacks there:

- Docker Compose project `xo`: `xo-app` (FastAPI, one uvicorn worker) and `xo-db` (PostgreSQL 16, its own database `xo_db` and role `xo_user`) on a private network.
- The app port is published only on the Docker bridge address `172.17.0.1:8010`. NOBBIE's nginx container proxies `xo.tifunction.com` to it.
- The Cloudflare tunnel on gs-sv-008 carries `xo.tifunction.com` to that nginx, and Cloudflare Access sits in front. HTTPS ends at Cloudflare.
- Settings and keys live in `.env` (never committed). Tailwind is compiled into the image at build time.

`docs/RUNBOOK.md` has the commands for start, stop, logs, update, backup and restore.
`docs/ARCHITECTURE-NOTES.md` records the server conventions this follows.

### The server must be able to send notifications

Reminders are delivered through the browser makers' push services. The server needs outbound
HTTPS (port 443) to:

- `fcm.googleapis.com` (Chrome on Android and desktop)
- `*.notify.windows.com` (Edge)
- `updates.push.services.mozilla.com` (Firefox)

If the firewall blocks outbound traffic, ask your network administrator to allow these.

### First run

1. Open `https://xo.tifunction.com` in Chrome on your computer and pass the Cloudflare Access sign-in.
2. Choose a sign-in name and a password. The first account created is the only account; registration then closes.
3. Go to Settings, turn on notifications, and press "Send a test".
4. On your Android phone, open the same address in Chrome, sign in with the same name and password, then use Chrome's menu, "Add to Home screen" or "Install app". Open it from the home screen icon, go to Settings and turn on notifications there too.
5. On Android, long-press the app icon, open App info, and check that notifications are allowed and battery use is not restricted. Restricted battery settings delay reminders.

Cloudflare Access sessions expire. When one lapses, notification actions (Done, In 15 min)
stop working until you open the app and pass the Access sign-in again, so set a long session
duration on the Access application.

## Everyday care

**Back up the database.** The dump contains your entries in readable form, so keep it somewhere private:

```bash
make db-backup        # ./backups/xo-<date>.dump
```

`docs/RUNBOOK.md` covers restore.

**Update the app** after changing code:

```bash
make test && make up
```

**Read your own data outside the app:** Settings, "Download everything".

## What is deliberately missing from version 1

- No offline editing. The app opens offline, but saving needs a connection.
- No password change screen yet.
- No second account.
- If you edit the same entry on two devices at the same moment, the later save wins.
- A reminder that comes due while the server is off is skipped if more than two hours late. Repeating reminders carry on from the next occurrence.
- Appointments are not synced to Google Calendar. Each one has a "To calendar" link that opens Google Calendar with the entry filled in, if you want the phone's own alarm as a backup. Using it sends that entry's title and place to Google.

## Appearance is per device

Your look is stored in the browser on each device and is never sent to the server.
To carry a look to another device, copy its look code from Appearance and type it in there.

## The workbook data

`content/workbook.json` is built from the workbook .docx and served only to a signed-in browser:

```bash
pip install python-docx
python scripts/build_workbook.py path/to/workbook.docx
```

It contains the workbook's full text, so keep this repository private.

## Editing text

The app's wording sits in YAML files in `content/text/` (`common.yaml`, `plan.yaml`, `checkin.yaml`,
`today.yaml`, `defaults.yaml`). Each file starts with a note on how to edit it. Save the file and
reload the page: no rebuild and no restart. A file with a mistake keeps its last good version.
`make test-api` checks that every file parses.

## Project layout

```
app/            FastAPI backend
  main.py       routes: sign-in, items, reminders, push
  models.py     tables (users, sessions, items, reminders, push_subs)
  push.py       reminder loop and Web Push delivery
static/         the app itself (plain JavaScript modules, no JavaScript build step)
  app.css       hand-written styles and the appearance tokens
  tw.css        Tailwind output, built at image build time (gitignored)
  js/store.js   save, load, and reminder times for each kind of entry
  js/boot.js    appearance engine, loaded before first paint
  js/views/     one file per screen
  sw.js         service worker: offline shell and notifications
tailwind/                   Tailwind source (src/tw.css), package.json and bun.lock
scripts/gen_keys.py         secret and notification keys
scripts/build_workbook.py   workbook .docx to content/workbook.json
content/workbook.json       the workbook's chapters and prompts
docs/ROADMAP.md             specs for the next features
docs/RUNBOOK.md             running it on gs-sv-008
tests/          API tests (pytest) and browser smoke tests (Playwright)
Dockerfile, docker-compose.yml, docker-compose.test.yml, Makefile
```

## Running the tests

```bash
make test-api     # API tests against a throwaway database in its own compose project
make test-e2e     # tests/e2e.py, tests/e2e_look.py, then tests/e2e_kits.py, on a throwaway app with an empty database
make lint         # ruff check and format check
make format       # ruff format and auto-fix
```

Both build and remove their own stack (`docker-compose.test.yml`, project `xo-test`), which cannot reach the real database.
The API tests drop and recreate every table in the database they are pointed at. Never point them at the real one.

## A note on what to write

The app carries the workbook's rule: do not describe offending behaviour or a child anywhere in it.
Write about needs, feelings and decisions. If you have a matter before a court, ask your lawyer
what is safe to record in check-ins before you use the warning-signs question. It can be switched off in Settings.

This app is a personal organiser. Nobody monitors it, and it does not replace your psychologist,
your lawyer, or your reporting contact.

Typefaces: Atkinson Hyperlegible Next, Lexend, Fraunces, Space Grotesk and JetBrains Mono, all under the SIL Open Font License (see `static/fonts`).
