# XO runbook

How XO runs on gs-sv-008, and the commands to look after it. Run every command
from `~/projects/xo` unless it says otherwise. `make help` lists the targets.

## What is deployed

```
browser --https--> Cloudflare edge (Access) --tunnel--> cloudflared on gs-sv-008
  --http :80--> nobbie-nginx (server block xo.tifunction.com)
  --host.docker.internal:8010--> xo-app (uvicorn, 1 worker, port 8000)
  --xo_internal network--> xo-db (postgres:16-alpine, database xo_db, role xo_user)
```

| Part | Where |
| --- | --- |
| Address | `https://xo.tifunction.com` |
| Containers | `xo-app` (image `xo-app`), `xo-db` (`postgres:16-alpine`), compose project `xo` |
| Network | `xo_internal` (bridge, XO only) |
| App port | `172.17.0.1:8010` (docker0 address only; not on any LAN address) |
| Data | Docker volume `xo_postgres_data` (ciphertext and reminder times only) |
| Settings and secrets | `.env` (mode 600, gitignored): `POSTGRES_*`, `SECRET_KEY`, `VAPID_*`, `COOKIE_SECURE=true`, `TZ` |
| nginx | server block in `~/projects/GS-AUTO-043_NOBBIE/nginx/nginx.conf`, container `nobbie-nginx` |
| Tunnel route | `xo.tifunction.com` on the gs-sv-008 tunnel, pushed with `ops/cloudflared-sync-ingress.sh` in the BWS repo |
| Access | Cloudflare Access application for `xo.tifunction.com` (Zero Trust dashboard) |
| Workbook text | `content/workbook.json`, baked into the image, served only by `/api/workbook` to a signed-in browser |

`restart: unless-stopped` brings both containers back after a reboot.

## Start, stop, status

```bash
make up            # build the image and start or update the stack
make ps            # containers and health
make health        # /api/health directly and through nobbie-nginx
make down          # stop and remove the containers; the database volume stays
make restart-app   # restart xo-app only
```

While XO is down, `https://xo.tifunction.com` returns 502. NOBBIE is not
affected: nginx resolves `host.docker.internal` from its hosts file, so it starts
and reloads whether XO is running or not.

## Logs

```bash
make logs                          # follow xo-app
docker compose logs --since 1h db  # the database
docker logs nobbie-nginx 2>&1 | grep xo.tifunction.com   # nginx access lines for XO
```

The app logs one line per request (method, path, status). Request bodies are
never logged, and no user text is ever in a path or query string. Sign-in looks
up the sign-in name in a query string (`/api/auth/salt?username=...`), so that
name appears in the app and nginx access logs.

## Update after a code change

```bash
git pull                 # or commit locally
make test                # API tests and both browser tests, on a throwaway stack
make up                  # rebuilds the image (Tailwind included) and recreates xo-app
make health
```

Changing anything in `static/` that the app needs offline: add it to `SHELL` in
`static/sw.js` and bump `CACHE`.

## Backup

```bash
make db-backup           # writes ./backups/xo-<YYYYmmdd_HHMMSS>.dump (pg_dump custom format)
```

- The dump holds ciphertext and reminder times only. It is useless without the
  passphrase, and the passphrase cannot be reset.
- `./backups/` is gitignored. The server's DR job (`dr-backup.timer`, every 6
  hours) archives all of `~/projects`, so dumps in `./backups/` reach the DR
  disk at `/mnt/backup/gs-sv-008/projects/` on its next run. That archive also
  carries `.env`.
- Nothing runs `make db-backup` on a schedule yet. Run it before every update
  and whenever you want a restore point.

## Restore

```bash
make db-restore                          # newest dump in ./backups/; asks you to type RESTORE
make db-restore FILE=backups/xo-20261125_120000.dump
```

This replaces the live database in one transaction (`pg_restore --clean
--if-exists -1`). Take a fresh `make db-backup` first if the current data might
be wanted.

Restoring onto a new server: copy the project folder (with `.env`, because the
VAPID keys must stay the same or every device has to turn notifications on
again), run `make up`, then `make db-restore FILE=...`.

## Tests

```bash
make test-api     # pytest against the throwaway xo-test database
make test-e2e     # tests/e2e.py, then tests/e2e_look.py, on a throwaway app and empty database
make test         # both
make test-down    # clean up if a run was interrupted
```

`docker-compose.test.yml` is a separate compose project (`xo-test`) with its own
network and a database in tmpfs. It cannot reach `xo-db`. The API tests drop
every table in the database they use, so never point them anywhere else. The
browser tests run in `mcr.microsoft.com/playwright/python` sharing the test
app's network namespace, so the app is `http://localhost:8000`, a secure
context.

## Tailwind

`tailwind/src/tw.css` compiles to `static/tw.css` in the image's Bun stage. For
a local copy (for example to run uvicorn outside Docker):

```bash
make css
```

Utilities carry the `tw:` prefix (`tw:flex`, `tw:bg-paper`) and map to XO's
CSS variables, so every appearance dial applies. See `CLAUDE.md`, "Styling".

## Keys

`SECRET_KEY` and the VAPID pair were generated once on 2026-11-25 by
`scripts/gen_keys.py` and written straight into `.env`. Do not regenerate them:
new VAPID keys mean every device must turn notifications on again. If `.env` is
lost, restore it from the DR archive before anything else.

## nginx and tunnel changes

nginx config lives in the NOBBIE repo. After editing the XO block there:

```bash
cd ~/projects/GS-AUTO-043_NOBBIE
docker exec nobbie-nginx nginx -t && docker exec nobbie-nginx nginx -s reload
```

Edit the file in place (an editor that keeps the same inode); the config is a
single-file bind mount. Do not restart `nobbie-nginx` without telling NOBBIE's
users: it serves NOBBIE too.

The tunnel is remotely managed. To change the XO route, edit
`/etc/cloudflared/config.yml`, then run
`ops/cloudflared-sync-ingress.sh --show` and `--push` from the BWS repo.

## Faults

| Symptom | Check |
| --- | --- |
| 502 at `xo.tifunction.com` | `make ps`; `make logs`; `make up` |
| 404 from Cloudflare at `xo.tifunction.com` | tunnel route missing: `ops/cloudflared-sync-ingress.sh --show` in the BWS repo |
| Sign-in works but nothing saves | the browser lost its key: sign out and in again on that device |
| Reminders stop | `make logs` for push errors; outbound 443 to the push services (`fcm.googleapis.com`, `*.notify.windows.com`, `updates.push.services.mozilla.com`) |
| Notification buttons (Done, In 15 min) fail | the Cloudflare Access session lapsed: open the app once to sign in to Access again |
