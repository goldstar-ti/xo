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

## How privacy works here

Everything you type is encrypted in the browser, with a key made from your passphrase,
before it leaves the device. The passphrase and the key never reach the server.

| The server can read | The server cannot read |
| --- | --- |
| Your sign-in name | Titles, notes, places, amounts |
| The kind of each entry (appointment, task, tick, check-in ...) | Your plan |
| The date an entry belongs to | Check-in answers |
| Reminder times | Conditions and the reporting record |

So an administrator of the server or the database sees that an appointment exists on a date,
with reminders at certain times, and a block of ciphertext. They do not see what it is.

Three limits to know about:

1. **There is no passphrase reset.** Lose the passphrase and the contents are gone. Write it down and store it somewhere safe.
2. **A device that is signed in can read everything.** Lock your phone and computer. Use "Sign out of this device" on any machine you stop using.
3. **Whoever controls the server controls the app's code.** Encryption protects stored data from being read. It does not protect against someone deliberately changing the app files on the server.

The app stores text only. There are no photo or file uploads.

## Set up on GS-SV-008

You need Docker Compose and PostgreSQL on the server, and a Cloudflare Tunnel (`cloudflared`).

### 1. Create the database

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE xo LOGIN PASSWORD 'choose-a-long-password';
CREATE DATABASE xo OWNER xo;
\q
```

The app creates its own tables the first time it starts.

### 2. Get the code onto the server

Copy this folder to the server (git, scp, or VS Code Remote), then:

```bash
cd xo
cp .env.example .env
```

Put the database password into `DATABASE_URL` in `.env`.
If the password contains `@`, `:` or `/`, percent-encode those characters.

### 3. Generate the keys

```bash
docker compose build
docker compose run --rm xo python scripts/gen_keys.py         secret and notification keys
scripts/build_workbook.py   workbook .docx to content/workbook.json
content/workbook.json       the workbook's chapters and prompts
docs/ROADMAP.md             specs for the next features
```

Paste the three lines it prints into `.env`, replacing the empty `SECRET_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_PUBLIC_KEY` lines.
Set `VAPID_SUBJECT` to `mailto:` followed by an email address of yours.

Do this once. If the VAPID keys change later, every device has to turn notifications on again.

### 4. Start it

```bash
docker compose up -d
docker compose logs -f xo      # Ctrl+C to stop watching
curl http://localhost:8010/api/health
```

The app listens on `127.0.0.1:8010` only. It is not reachable from the LAN.

### 5. Publish it through Cloudflare

In the Cloudflare Zero Trust dashboard, open your tunnel and add a public hostname:

- Hostname: for example `xo.yourdomain.com`
- Service: `http://localhost:8010`

Notifications and installing to the home screen both require HTTPS, which the tunnel provides.

Optional: put a Cloudflare Access policy in front (your email only). If you do, set the Access
session to a long duration. When an Access session lapses, notification actions (Done, In 15 min)
stop working until you open the app and sign in to Access again.

### 6. Check the server can send notifications

Reminders are delivered through the browser makers' push services. The server needs outbound
HTTPS (port 443) to:

- `fcm.googleapis.com` (Chrome on Android and desktop)
- `*.notify.windows.com` (Edge)
- `updates.push.services.mozilla.com` (Firefox)

If the firewall blocks outbound traffic, ask your network administrator to allow these.

### 7. First run

1. Open the hostname in Chrome on your computer.
2. Choose a sign-in name and a passphrase. The first account created is the only account; registration then closes.
3. Go to Settings, turn on notifications, and press "Send a test".
4. On your Android phone, open the same address in Chrome, sign in with the same name and passphrase, then use Chrome's menu, "Add to Home screen" or "Install app". Open it from the home screen icon, go to Settings and turn on notifications there too.
5. On Android, long-press the app icon, open App info, and check that notifications are allowed and battery use is not restricted. Restricted battery settings delay reminders.

## Everyday care

**Back up the database.** The dump contains ciphertext, so it is safe to store with your other backups:

```bash
pg_dump -U xo -h localhost xo | gzip > xo-$(date +%F).sql.gz
```

A backup is only useful together with the passphrase.

**Update the app** after changing code:

```bash
docker compose up -d --build
```

**Read your own data outside the app:** Settings, "Download everything, unencrypted". That file is readable by anyone who opens it.

## What is deliberately missing from version 1

- No offline editing. The app opens offline, but saving needs a connection.
- No passphrase change (it needs every entry re-encrypted).
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

## Changing the wording

All fixed text sits in `static/js/content.js`: plan prompts, check-in choices, daily lines,
default routine, and the services on the plan card. Edit it and rebuild.

## Project layout

```
app/            FastAPI backend
  main.py       routes: sign-in, items, reminders, push
  models.py     tables (users, sessions, items, reminders, push_subs)
  push.py       reminder loop and Web Push delivery
static/         the app itself (plain JavaScript, no build step)
  js/crypto.js  key derivation and encryption
  js/store.js   encrypt, save, load, and reminder times for each kind of entry
  js/boot.js    appearance engine, loaded before first paint
  js/views/     one file per screen
  sw.js         service worker: offline shell and notifications
scripts/gen_keys.py         secret and notification keys
scripts/build_workbook.py   workbook .docx to content/workbook.json
content/workbook.json       the workbook's chapters and prompts
docs/ROADMAP.md             specs for the next features
tests/          API tests (pytest) and a browser smoke test (Playwright)
```

## Running the tests

```bash
pip install -r requirements-dev.txt
DATABASE_URL=postgresql+asyncpg://xo:xo@localhost:5432/xo_test pytest tests/test_api.py

# browser test: start the app against an EMPTY database first
COOKIE_SECURE=false uvicorn app.main:app --port 8010
python tests/e2e.py http://localhost:8010
python tests/e2e_look.py http://localhost:8010   # appearance; run straight after, same database
```

The API tests drop and recreate every table in the database they are pointed at. Never point them at the real one.

## A note on what to write

The app carries the workbook's rule: do not describe offending behaviour or a child anywhere in it.
Write about needs, feelings and decisions. If you have a matter before a court, ask your lawyer
what is safe to record in check-ins before you use the warning-signs question. It can be switched off in Settings.

This app is a personal organiser. Nobody monitors it, and it does not replace your psychologist,
your lawyer, or your reporting contact.

Typefaces: Atkinson Hyperlegible Next, Lexend, Fraunces, Space Grotesk and JetBrains Mono, all under the SIL Open Font License (see `static/fonts`).
