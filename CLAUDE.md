# XO

A private, single-user day planner with check-ins, a relapse prevention plan and a workbook.
Installs as a PWA on Android and desktop. The name: the executive officer runs the ship's day so the captain can think.

`docs/ROADMAP.md` holds the specs for what is not built yet. Read it before starting a feature.
`HANDOFF.md` has the current state and next steps. `docs/decisions.md` logs each decision with its reason (D-1, D-2, ...): add the next one when a choice is made.

## Stack

- Backend: FastAPI, SQLAlchemy 2.0 async, PostgreSQL (asyncpg), argon2, pywebpush. One uvicorn worker.
- Front end: plain ES modules in `static/`, no framework, no JavaScript build step. One classic script, `static/js/boot.js`, loads in `<head>`. CSS: hand-written `static/app.css`, plus Tailwind v4 compiled at image build time into `static/tw.css`.
- Deploy: gs-sv-008, Docker Compose project `xo` (`xo-app`, `xo-db`), app published only on `172.17.0.1:8010`, behind NOBBIE's nginx container and the gs-sv-008 Cloudflare tunnel at `https://xo.tifunction.com`. See `docs/RUNBOOK.md` and `docs/ARCHITECTURE-NOTES.md`.

## Rules

Security is the owner's responsibility, handled outside this codebase (owner's decision, 2026-11-26). Agents do not add, enforce or propose security controls (CSP, security headers, encryption, CSRF schemes) unless the owner asks. The rules below that were about security are lifted; what still applies is listed.

1. **No browser encryption (owner's decision, 2026-11-26).** Items are stored as plain JSON and sign-in is a normal password checked on the server. Do not reintroduce client-side encryption.
2. **Text only.** No image, audio or file uploads, anywhere.
3. **No CSP or security headers (owner's decision, 2026-11-26).** The app sends none. Still prefer local copies of libraries and fonts (`static/vendor/`, `static/fonts`) over CDNs, so XO works offline; `tests/e2e_kits.py` fails on any off-site request.
4. **Appearance never leaves the device.** The look lives in `localStorage` under `xo-look`. Do not sync it.
5. **Paused until production: no personal names or details in the code (owner's decision, 2026-11-26).** While paused, names and details may appear in source, defaults, tests, comments and commit messages. The owner reinstates this rule before production; at that point every personal detail added while it was paused must be removed. Original wording: names of people, clinicians, places or cases never in source, defaults, tests, comments or commit messages; tests use obviously made-up data.
6. **`content/workbook.json` is unpublished material.** Keep the repository private. It is served only through `/api/workbook`, which requires a session. Do not move it into `static/`.
7. **Notification wording lives in the service worker** (`NEUTRAL` and `detailed()` in `static/sw.js`). Push payloads carry ids and a kind; the discreet-wording requirement is lifted with the other security rules.
8. **Changes carry the `X-XO: 1` header.** The middleware still rejects a non-GET `/api/` request without it; `store.api()` and the service worker add it. Keep sending it until the owner says to remove the check.

## How the data works

- One generic table, `items`: `(user_id, id, kind, day, payload, deleted)`. `payload` is a JSONB value (object, array, string or number; null for ticks).
- Kinds in use: `appointment`, `task`, `routine`, `tick`, `bill`, `obligation`, `report`, `checkin`, `plan`, `settings`, `canvas`, `project`, `pm_item`, `tracker`, `taskmeta`.
- Task payload fields are listed in `normaliseTask()` in `static/js/tasks.js`; every task write goes through `saveTask()` in `static/js/taskdata.js`.
- The tracker (`static/js/tracker/model.js` documents its shapes): `project:<uuid>` holds a project and its own pick lists, `pm:<uuid>` an item with its comments, checklist, links and history. NOBBIE's tracker joins it read-only through `app/nobbie.py` (GET only, `NOBBIE_*` in `.env`).
- Singletons use fixed ids: `plan`, `settings`. Ticks use `tick:<ref>:<YYYY-MM-DD>` with a null payload. Check-ins use `checkin:<type>:<day>`.
- Reminders are rows (`fire_at`, `repeat`, `kind`, `item_id`). The browser computes them in `REMINDERS` in `static/js/store.js` and sends them with the item; the server replaces that item's reminders on every save.
- To add a kind: pick a name matching `^[a-z_]{1,20}$`, add a `REMINDERS` entry if it needs reminders, add wording for any new reminder kind to `NEUTRAL` and `detailed()` in `static/sw.js`.
- Tables are created with `create_all` on startup. There is no migration tool yet; adding a column to an existing table needs a manual `ALTER TABLE` or Alembic.

## Sign-in

Username and password (at least 8 characters). The server stores an argon2 hash of the password in `users.password_hash` and starts a cookie session (`sid`, 30 days). One account only; sign-in is throttled after 8 failures in 15 minutes. A password change is a single request away from being built: nothing else depends on the password.

## Front end layout

```
static/js/boot.js          appearance engine (themes, fonts, look state, undo, look codes, schedules)
static/js/app.js           shell, sign-in, router, nav
static/js/store.js         api(), save/load, ticks, reminder times
static/js/util.js          h() element builder, put(), dates, toast, openDialog(), openForm(), IndexedDB flags for the service worker
static/js/ui.js             kit-aware controls: button, input, textarea, select, checkbox, chip, field, notice
static/js/kit.js           loads Web Awesome (and static/kit-wa.css) on demand
static/js/forms.js         add/edit dialogs per kind
static/js/tasks.js         pure task logic: normalise, sort, repeats, blocking, pace, quick-add parsing
static/js/taskdata.js      store-bound task actions: taskMeta, saveTask, setStatus, pickTask, quickTask
static/js/taskfields.js    task form controls: chipSet, subtaskEditor, blockedEditor, repeatEditor
static/js/text.js          loadText(), t(key, vars), text(key): the editable wording from /api/text
static/js/content.js       thin module: reads plan, check-in, daily-line and default data through text()
static/js/views/*.js       one module per screen; each exports render(root, ...params) and `live`
static/sw.js               offline shell + notifications (classic script, no imports)
static/app.css             all styles
```

Conventions:

- Build DOM with `h(tag, attrs, ...children)`. To append a mixed list (arrays, `false`, `null`), use `put(parent, ...)`, never `parent.append(...)`, which prints `false` and `[object ...]`.
- A view with `live = true` is redrawn when the store changes. Views with free-text inputs set `live = false` and save with `{ silent: true }` so typing is never interrupted.
- Routes are hash routes (`#/today`). Add a screen in three places in `app.js` (`NAV`, `VIEWS`, import) and in `SECTIONS` in `boot.js` plus `SECTION_NAMES` in `views/appearance.js` so it can sit on the bottom bar.
- New files the app must work offline with go in `SHELL` in `static/sw.js`; bump `CACHE` when you change that list.

## Text and prose

- All user-facing wording lives in YAML files in `content/text/` (`common.yaml`, `plan.yaml`, `checkin.yaml`, `today.yaml`, `lists.yaml`, `forms.yaml`, `defaults.yaml`). The top-level key of a file is its name, so `plan.yaml` holds `plan:` and keys read `plan.guard`.
- `app/text.py` loads every file with `yaml.safe_load`, caches each by modification time and keeps a file's last good version if an edit breaks it. `GET /api/text` serves the merged object, no sign-in. The folder is bind-mounted read-only into `xo-app`, so a saved edit shows on the next page load with no rebuild or restart.
- In the browser, `static/js/text.js` loads it once at boot. `t('common.save')` returns a string; `t('x.y', { name })` fills `{name}` placeholders. `text('plan.services')` returns a list or map as written. A missing key returns the key and logs `missing text: <key>` to the console once, so the browser tests fail on it.
- Rule, from now on: a user-facing string goes in YAML, never inline in a view or template. A new screen adds its keys to a file (or a new file named after its top-level key) in the same commit.
- Each file opens with a comment on how to edit it. Quote times (`'09:00'`) and any text starting with a special character.

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
- Component kits: the Appearance option `kit` (`xo` default, `daisy`, `wa`) sets `data-kit` on `<html>`. Build buttons, fields and chips with `static/js/ui.js`, never with raw elements, so one switch restyles every screen. Write every daisyUI class in full in `ui.js` (Tailwind only compiles what it finds). Web Awesome's theme is mapped to the XO tokens in `static/kit-wa.css`. New screens use `ui.js` and `t()`; existing screens move over in batches.
- Tap targets at least 2.5rem. Keyboard focus must stay visible. Honour `prefers-reduced-motion`.

## Code style

Python (ruff config in `ruff.toml`; the lint and format pass is a later step):

- Docstrings: Google style (`Args:`, `Returns:`, `Raises:`) on every public module, class and function.
- Types: Python 3.10+ (`X | Y`); `Mapped[T]` with `mapped_column()`; `collections.abc` over `typing`.
- Strings use double quotes. Imports go stdlib, third-party, first-party, alphabetical (ruff `I`).
- Comments are full, capitalised sentences. No `TODO` or `FIXME`: mark future work `# LATER:`.
- Logging uses `%s` formatting and lowercase messages. Keys in `extra={}` must not be `LogRecord` attributes (`name`, `msg`, `args`, `module`, `message`, `filename`, `created`, ...): prefix them (`item_kind`). Never put user content in a log line (rule 1): ids and kinds only.
- Exceptions: sentence case, no trailing full stop, an f-string for dynamic values.
- Naming: `snake_case`, `PascalCase`, `UPPER_SNAKE_CASE`, `_single` for private.
- Never use an em-dash (U+2014) or en-dash (U+2013) anywhere: code, comments, docs, UI copy, commit messages. Use a hyphen, comma, colon or a new sentence.

JavaScript keeps what is already there: single quotes, ES modules, `h()` and `put()` for DOM, no framework, no build step.

## Versions

`VERSION` in `app/version.py` is the one app version (passed to `FastAPI(version=...)`). Every shipped feature bumps the minor number and adds a row at the top of `docs/version-history.md`, committed with the work. A fix-only change bumps the patch number. Never bump the major number without the owner's say-so.

## Product principles

- The app comes to the user: reminders and the Today screen do the prompting.
- Small sittings. Anything long is cut into pieces that take about ten minutes.
- Concrete choices before free text. Offer chips for body, behaviour and facts; keep text boxes optional where possible.
- Time is always shown with a buffer and in order. Sequence is information.
- Configuration is welcome. The owner likes options, dense settings and pun names. Add the dial, give it a sensible default.
- The app holds the user's own words. It does not write the plan, score the user, or interpret answers.

## Copy style for anything the user reads

Full guide: `docs/voice.md`. Read it before writing any text the user sees. The three rules to keep in mind:

- Australian English, sentence case, no emojis, no exclamation marks, no em-dash or en-dash. Buttons say what they do ("Save check-in"). Errors say what happened and what to do next.
- The app holds the user's own words. It never interprets, scores or praises them, and notifications stay neutral.
- No hype or AI-sounding words (powerful, seamless, delve, navigate, unlock, journey, crucial, vital). No "It's not X, it's Y" and no rhetorical questions.

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
make test-e2e      # tests/e2e.py once per kit (XO_KIT=xo, daisy, wa), then tests/e2e_look.py and tests/e2e_kits.py, on a throwaway app and empty database
make shots         # screenshots of every screen in every kit at 1280 and 390 wide into ./.scratch/shots (not a test)
make lint          # ruff check and format check (read-only)
make format        # ruff format and auto-fix, in place
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
- The screen works at 360 px wide and at desktop width, in light and dark, in at least two themes.
- `README.md` and `docs/ROADMAP.md` still describe what exists.
