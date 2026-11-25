# XO

A private, single-user day planner with check-ins, a relapse prevention plan and a workbook.
Installs as a PWA on Android and desktop. The name: the executive officer runs the ship's day so the captain can think.

`docs/ROADMAP.md` holds the specs for what is not built yet. Read it before starting a feature.

## Stack

- Backend: FastAPI, SQLAlchemy 2.0 async, PostgreSQL (asyncpg), argon2, pywebpush. One uvicorn worker.
- Front end: plain ES modules in `static/`, no framework, no JavaScript build step. One classic script, `static/js/boot.js`, loads in `<head>`. CSS: hand-written `static/app.css`, plus Tailwind v4 compiled at image build time into `static/tw.css`.
- Deploy: gs-sv-008, Docker Compose project `xo` (`xo-app`, `xo-db`), app published only on `172.17.0.1:8010`, behind NOBBIE's nginx container and the gs-sv-008 Cloudflare tunnel at `https://xo.tifunction.com`. See `docs/RUNBOOK.md` and `docs/ARCHITECTURE-NOTES.md`.

## Rules that must not be broken

1. **Encrypt in the browser.** Everything the user types goes through `store.save()`, which encrypts with AES-GCM before the request. The server may see only: item `kind`, item `day`, item ids, and reminder times. Never add a plaintext column for user content, and never send user text in a query string, a log line, or a push payload.
2. **Text only.** No image, audio or file uploads, anywhere.
3. **Strict CSP.** `default-src 'self'`, no inline scripts, no inline `style=""` attributes in markup. Setting styles through the DOM (`el.style.setProperty`) is fine. No CDN assets; fonts are self-hosted in `static/fonts`.
4. **Appearance never leaves the device.** The look lives in `localStorage` under `xo-look`. Do not sync it.
5. **No personal names or details in the code.** Names of people, clinicians, places or cases belong in encrypted items, never in source, defaults, tests, comments or commit messages. Tests use obviously made-up data.
6. **`content/workbook.json` is unpublished material.** Keep the repository private. It is served only through `/api/workbook`, which requires a session. Do not move it into `static/`.
7. **Notifications stay discreet.** Push payloads carry ids and a kind only. Wording is built in the service worker; neutral wording is the default (see `NEUTRAL` in `static/sw.js`).
8. **Changes need the `X-XO: 1` header.** The middleware rejects any non-GET `/api/` request without it (CSRF guard). `store.api()` and the service worker add it.

## How the data works

- One generic table, `items`: `(user_id, id, kind, day, payload, deleted)`. `payload` is ciphertext (`v1.` + base64 of IV + AES-GCM output).
- Kinds in use: `appointment`, `task`, `routine`, `tick`, `bill`, `obligation`, `report`, `checkin`, `plan`, `settings`.
- Singletons use fixed ids: `plan`, `settings`. Ticks use `tick:<ref>:<YYYY-MM-DD>` with a null payload. Check-ins use `checkin:<type>:<day>`.
- Reminders are plaintext rows (`fire_at`, `repeat`, `kind`, `item_id`). The browser computes them in `REMINDERS` in `static/js/store.js` and sends them with the item; the server replaces that item's reminders on every save.
- To add a kind: pick a name matching `^[a-z_]{1,20}$`, add a `REMINDERS` entry if it needs reminders, add wording for any new reminder kind to `NEUTRAL` and `detailed()` in `static/sw.js`.
- Tables are created with `create_all` on startup. There is no migration tool yet; adding a column to an existing table needs a manual `ALTER TABLE` or Alembic.

## Key derivation

`passphrase -> PBKDF2-SHA256 (600k, per-user salt) -> 64 bytes`. First half is the AES key (non-extractable `CryptoKey`, kept in IndexedDB `xo/kv`). Second half is the auth key sent at sign-in; the server stores its argon2 hash. There is no passphrase reset or change yet.

## Front end layout

```
static/js/boot.js          appearance engine (themes, fonts, look state, undo, look codes, schedules)
static/js/app.js           shell, sign-in, router, nav
static/js/store.js         api(), encrypt/save/load, ticks, reminder times
static/js/crypto.js        key derivation, AES-GCM, IndexedDB key-value
static/js/util.js          h() element builder, put(), dates, toast, openDialog(), openForm()
static/js/forms.js         add/edit dialogs per kind
static/js/content.js       all fixed wording: plan prompts, check-in choices, daily lines, defaults
static/js/views/*.js       one module per screen; each exports render(root, ...params) and `live`
static/sw.js               offline shell + notifications (classic script, no imports)
static/app.css             all styles
```

Conventions:

- Build DOM with `h(tag, attrs, ...children)`. To append a mixed list (arrays, `false`, `null`), use `put(parent, ...)`, never `parent.append(...)`, which prints `false` and `[object ...]`.
- A view with `live = true` is redrawn when the store changes. Views with free-text inputs set `live = false` and save with `{ silent: true }` so typing is never interrupted.
- Routes are hash routes (`#/today`). Add a screen in three places in `app.js` (`NAV`, `VIEWS`, import) and in `SECTIONS` in `boot.js` plus `SECTION_NAMES` in `views/appearance.js` so it can sit on the bottom bar.
- New files the app must work offline with go in `SHELL` in `static/sw.js`; bump `CACHE` when you change that list.

## Styling

- Every colour derives in CSS (OKLCH) from eight numbers set by `boot.js`: `--nh --nc --ah --ac --wh --al --ad --pl`. Lightness is fixed per token so any theme stays readable. Use the tokens (`--paper --surface --ink --muted --line --leaf --leaf-ink --leaf-soft --ochre --ochre-soft --danger`); never hard-code a colour.
- Respect the dials: `--radius`, `--pill`, `--rule`, `--d` (density multiplier), `--loud`, `--font-body`, `--font-head`, `--font-num`. New components should pick them up without extra work.
- Layout variants are data attributes on `<html>`: `data-scheme`, `data-texture`, `data-hero`, `data-dayline`, `data-line`, `data-pop`.
- A new appearance option needs: a default and a `CHOICES` entry (or a clamp) in `boot.js`, a line in `cleanLook()`, a slot in the look code (`encode`/`decode`, which changes its length), CSS, and a control in `views/appearance.js`.
- Tailwind (`tailwind/src/tw.css`, v4.3.1 through Bun, built in the Dockerfile's `css` stage) is for new screens. Rules:
  - Every utility carries the `tw:` prefix (`tw:flex`, `tw:bg-paper`), so no existing class name in `static/` can turn into a utility, and Tailwind's own variables are `--tw-*`.
  - The theme maps only to the variables above: colours `tw:bg-paper`, `tw:text-ink`, `tw:border-line`, `tw:bg-leaf`, `tw:text-leaf-ink`, `tw:bg-leaf-soft`, `tw:text-ochre`, `tw:bg-ochre-soft`, `tw:text-danger`, `tw:bg-surface`, `tw:text-muted`; fonts `tw:font-sans` (body), `tw:font-display` (head), `tw:font-figures` (numbers); radius `tw:rounded-xo`, `tw:rounded-pill`; `tw:border-rule`; spacing scales with `--d`. The default palette, shadows and fonts are removed, so a raw Tailwind colour does not exist. Never add one.
  - `@theme inline` keeps each utility reading the variable on its own element, so `.themed` swatches and the dark scheme work.
  - No Preflight. Utilities are unlayered and `tw.css` loads after `app.css`, so a utility beats an `app.css` rule of the same specificity.
  - Existing screens stay on `app.css` until the owner approves a conversion plan.
- Tap targets at least 2.5rem. Keyboard focus must stay visible. Honour `prefers-reduced-motion`.

## Product principles

- The app comes to the user: reminders and the Today screen do the prompting.
- Small sittings. Anything long is cut into pieces that take about ten minutes.
- Concrete choices before free text. Offer chips for body, behaviour and facts; keep text boxes optional where possible.
- Time is always shown with a buffer and in order. Sequence is information.
- Configuration is welcome. The owner likes options, dense settings and pun names. Add the dial, give it a sensible default.
- The app holds the user's own words. It does not write the plan, score the user, or interpret answers.

## Copy style for anything the user reads

Australian English. Sentence case. Plain verbs. No emojis. No exclamation marks.
Avoid "It's not X, it's Y" constructions, rhetorical questions, and hype words (powerful, seamless, robust).
Avoid: delve, navigate, unlock, foster, elevate, harness, landscape, tapestry, journey, crucial, vital, nuance.
Buttons say what they do ("Save check-in"). Errors say what happened and what to do next.

## Running it

Everything runs in containers (the host has no Python dependencies, Node or Bun). From the project folder:

```bash
make up            # build (Tailwind included) and start xo-app and xo-db
make logs          # follow the app
make health        # /api/health directly and through nobbie-nginx
make db-backup     # ./backups/xo-<timestamp>.dump
make css           # local static/tw.css, only needed to run uvicorn outside Docker
```

Tests, each on a throwaway compose project (`xo-test`, `docker-compose.test.yml`) that cannot reach `xo-db`:

```bash
make test-api      # pytest; it DROPS and recreates every table in its database
make test-e2e      # tests/e2e.py then tests/e2e_look.py, on a throwaway app and empty database
```

The browser tests run in `mcr.microsoft.com/playwright/python` sharing the test app's network, so the app is `http://localhost:8000` (a secure context).
To run them elsewhere, `XO_CHROME` sets the browser path (empty means Playwright's own Chromium; unset means `/usr/bin/google-chrome`).
Run both browser tests after any front-end change. They catch console errors and CSP violations.

Never print or commit `.env`. The keys in it were generated once; new VAPID keys mean every device turns notifications on again.

Rebuild the workbook data after the .docx changes (in a container with `python-docx`):

```bash
python scripts/build_workbook.py path/to/workbook.docx
```

## Before calling a change done

- API tests and both browser tests pass.
- No user text reaches the server unencrypted (check the request body in the Network tab).
- The screen works at 360 px wide and at desktop width, in light and dark, in at least two themes.
- `README.md` and `docs/ROADMAP.md` still describe what exists.
