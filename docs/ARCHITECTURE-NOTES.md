# Architecture notes: house conventions on gs-sv-008

Phase 0 discovery, 2026-11-25. Read-only: nothing on the server was changed to
write this. Reference projects: NOBBIE (`~/projects/GS-AUTO-043_NOBBIE`, the
only stack running here) and BWS (`~/projects/GS-AUTO-058_Bustle_Webhook_Service`,
code here, runs on GS-SV-019 and GS-SV-020). No project called SCM exists on this
server (searched `/` to depth 4). `GS-AUTO-123_LEAVE` is a Supabase and static
HTML project with no Docker stack, so it sets no conventions here.

## Server

| Item | Finding |
| --- | --- |
| Host | `gs-sv-008`, Debian 13 (trixie), Docker 29.6.0, Compose 5.1.4 |
| Load at discovery | about 4 (a NOBBIE E2E container was running) |
| Data disk | `/mnt/data` (9.7 TB). NOBBIE uses `/mnt/data/nobbie` |
| DR disk | `/mnt/backup/gs-sv-008/` (9.8 TB) |
| Host firewall | iptables `INPUT` policy ACCEPT; no nftables filter table |
| Docker daemon config | none (`/etc/docker/daemon.json` absent): default `json-file` logging, no rotation |

## Directory layout and compose

Both reference projects follow one pattern:

- Repo root holds `docker-compose.yml`, `Dockerfile` (BWS: `app/Dockerfile`),
  `Makefile`, `.env` (gitignored, mode 600), `.env.example` (committed),
  `nginx/nginx.conf`, `postgres/` (init scripts), `backups/` (gitignored dumps),
  `docs/`, `CLAUDE.md`, `HANDOFF.md`.
- Services are named by role: `app`, `db`, `nginx`, `pgadmin`. Containers are
  `<project>-<role>` (`nobbie-app`, `nobbie-db`, `bws-app`, `bws-db`).
- One private bridge network per stack, called `internal`. Only nginx publishes
  host ports. The app and database use `expose:` only.
- `restart: unless-stopped` on every long-running service.
- `env_file: .env`, and `DATABASE_URL` is assembled in compose from
  `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`, so the database
  container and the app always agree.
- Healthchecks on every service: app `curl -f http://localhost:8000/health`,
  db `pg_isready`, nginx `wget` of `/health`.
- Optional or dev-only services sit behind compose `profiles` (`dev`, `test`).
  NOBBIE's E2E runner is an on-demand `e2e` service (profile `test`) using the
  official Playwright image.

## Images and builds

| Item | NOBBIE | BWS |
| --- | --- | --- |
| Python base | `python:3.12-slim-bookworm`, multi-stage (builder, runtime) | `python:3.12-slim` |
| Extra packages | `curl` (healthcheck), `tzdata`, `libpq5` | `curl`, `bash`, `wget` |
| Front-end stage | `oven/bun:1-debian` builds the Vite and Tailwind bundle, copied into the runtime image | none |
| App command | `uvicorn app.main:app --host 0.0.0.0 --port 8000` | same port |
| Dev reload | bind-mounts `./app` over the image | bind-mounts templates and static |

## nginx

- Runs as a container, `nobbie-nginx` (`nginx:alpine`, nginx 1.31.1), owning host
  ports 80 and 443 for the whole VM. Config is the single file
  `GS-AUTO-043_NOBBIE/nginx/nginx.conf`, bind-mounted read-only (host and
  container show the same inode, so an in-place edit plus `nginx -s reload`
  works; an edit that replaces the file needs a container restart).
- One `server` block, `server_name _`, `listen 80` and `listen 443 ssl` with the
  Let's Encrypt cert for `nobbie.lan.tifunction.com` (certbot dns-cloudflare on
  the host, renewed by `certbot.timer`).
- Pattern for an app: `location = /<name> { return 301 /<name>/; }` then
  `location /<name>/ { proxy_pass http://<upstream>/; ... }`, which strips the
  prefix. Headers passed: `Host $host`, `X-Real-IP`, `X-Forwarded-For`,
  `X-Forwarded-Proto $scheme`; `proxy_http_version 1.1`; rate limit zone
  `general` (30 r/s, burst 50).
- Server-level `add_header Strict-Transport-Security "max-age=86400" always`.
  nginx inherits server-level `add_header` only into locations that set none of
  their own, so an XO location must not add headers if HSTS is to stay.
- `absolute_redirect off`, `client_max_body_size 100m`, access log format
  `main_host` (includes the Host header and the request line with query string).
- A plain-http request is redirected to `https://nobbie.lan.tifunction.com`
  unless its host is `nobbie.tifunction.com` (the tunnel) or the path is
  `/health`.
- Upstreams are literal (`upstream app_upstream { server app:8000; }`), resolved
  when nginx starts or reloads. BWS's nginx uses `resolver 127.0.0.11` with a
  variable `proxy_pass` so a missing upstream never stops nginx starting.
- Sibling-project precedent: NOBBIE once proxied `/bws/` to
  `http://host.docker.internal:8082` (commit `d706947e`, removed 2026-09-24).
  `nobbie-nginx` has `extra_hosts: host.docker.internal:host-gateway`, which
  resolves to `172.17.0.1` (docker0) inside the container.

## PostgreSQL

- No PostgreSQL on the host (nothing listens on 5432). XO's own README assumes a
  host server (`sudo -u postgres psql`); that does not match this server.
- Each stack runs its own `postgres:16-alpine` container named `<project>-db`,
  on its private network, data in a named volume `postgres_data`.
- Roles: the bootstrap role is `POSTGRES_USER` (`nobbie_user`, database
  `nobbie_db`), and the app connects as that role. Extra roles come from
  `postgres/init_roles.sh` (passwords from `.env`) mounted into
  `/docker-entrypoint-initdb.d/`. NOBBIE's driver app is the one case of a second
  app sharing a database container, with its own schema and role.
- Backups: `make db-backup` runs `pg_dump -F c` in the container and copies the
  dump to `./backups/` (or the DR disk). `make db-restore` uses
  `pg_restore --clean --if-exists -1`.
- DR: `dr-backup.timer` (every 6 hours, `/usr/local/bin/dr-backup`) dumps the
  databases listed in `/etc/dr-backup/targets`, and tars all of
  `/home/pj/projects` (so every project's `.env` and `./backups/` reach the DR
  disk). Its Postgres check fails any dump under 1 MiB, so a small new database
  cannot simply be added as a target.

## Tailwind

- NOBBIE: Tailwind v4 (installed 4.3.1) through `@tailwindcss/vite` 4.3.1,
  managed by Bun (`frontend/package.json` plus committed `bun.lock`).
  Entry CSS `frontend/src/main.css` starts with `@import "tailwindcss";` and
  `@source` lines for the templates. No `tailwind.config.js` (v4 CSS config).
- Built in the Dockerfile's `oven/bun:1-debian` stage (`bun run build`); output
  goes to `app/static/dist/`, which is gitignored and baked into the image.
  In dev a `frontend` container (profile `dev`) runs `vite build --watch`.
- No Node or Bun on the host: builds run in containers.
- BWS does not use Tailwind.

## Secrets and env files

- `.env` per project, mode 600, gitignored along with `*.pem`, `*.key`,
  `secrets/`, `backups/*`. `.env.example` is committed with blank values.
- Docker secrets for key files (`secrets/` folder).
- `TZ` and `LOG_LEVEL` are set in `.env`.

## Ports in use on the host

| Port | Owner |
| --- | --- |
| 22 | sshd |
| 80, 443 | `nobbie-nginx` |
| 445 | `nobbie-samba` |
| 6380 | `inbox-zero-dev-redis` |
| 8000, 9443 | Portainer |
| 9090, 10000, 20000 | host services |
| 19999 | Netdata |
| 127.0.0.1:20241 | cloudflared metrics |
| 127.0.0.1:4317, 8125 | telemetry agents |

8010 (XO's own default) is free.

## Docker networks

`bridge` (docker0, 172.17.0.0/16), `gs-auto-043_nobbie_internal`
(172.19.0.0/16), `gs-auto-043_nobbie_default`, `bws-dev`, and two
`inbox-zero` networks. `nobbie-frontend` is attached to both
`gs-auto-043_nobbie_internal` and `bws-dev`, the one cross-stack attachment.

Compose adds each service name as a DNS alias on every network the service
joins. A second stack joining `gs-auto-043_nobbie_internal` with a service called
`app` would answer for NOBBIE's `app` too, so a shared-network design must use
service names that do not clash.

## Cloudflare

- `cloudflared.service` on the host, tunnel `a96f0fb7-...`, protocol pinned to
  http2. The tunnel is remotely managed: the local `ingress:` list in
  `/etc/cloudflared/config.yml` is not read. Ingress changes are pushed with
  `ops/cloudflared-sync-ingress.sh --push` in the BWS repo.
- `nobbie.tifunction.com` goes to `http://localhost:80` (nobbie-nginx), arriving
  as plain http. Cloudflare Access gates the hostname. TLS ends at the edge.
- Every path on `nobbie.tifunction.com` is one browser origin. Anything served
  under `/xo/` shares cookies (path `/`), `localStorage`, IndexedDB and service
  worker origin with NOBBIE.

## Git and GitHub

- `gh` 2.x is installed and signed in as `goldstar-ti` (scopes `repo`,
  `workflow`, `read:org`, `gist`), git over https with the gh credential helper.
  `goldstar-ti` belongs to the `Goldstar-Transport` organisation.
- No user or organisation called `goldstar-tixo` exists. `goldstar-ti/xo` does
  not exist yet.
- Git identity: global `pj <donazea@gmail.com>` (BWS uses it); NOBBIE's repo
  sets its own `PJ <pj9300@gmail.com>`.
- NOBBIE commit rule: plain messages, no attribution lines, explicit pathspecs.

## Logging and restarts

- Apps log to stdout (NOBBIE uses a JSON formatter; BWS also writes rotating
  files to a named volume). Docker keeps them with the default `json-file`
  driver and no size limit.
- `restart: unless-stopped`; NOBBIE restarts go through Makefile targets
  (`make restart-app-safe` runs checks, a backup and a health wait).

## XO as imported, against these conventions

| XO today | House | Gap |
| --- | --- | --- |
| `network_mode: host`, uvicorn on `127.0.0.1:8010` | private bridge network, app on 8000, only nginx published | nginx runs in a container and cannot reach the host's loopback |
| Host PostgreSQL, role `xo`, db `xo` | per-stack `postgres:16-alpine` container | add an `xo-db` service |
| `python:3.12-slim`, no curl, no healthcheck | `3.12-slim-bookworm`, curl, healthchecks | small Dockerfile and compose changes |
| No Makefile | Makefile for up, logs, restart, backup, restore, tests | add one |
| Absolute URLs (`/api/`, `/js/`, `/sw.js`, `/fonts/`, manifest `/`) and cookie path `/` | apps served under a path prefix | needed only if XO stays at `/xo` |
| Hand-written CSS, no build | Tailwind v4 through Bun, built in the image | add a CSS build stage |
| Tests use system Chrome at `/usr/bin/google-chrome` | Playwright in its official image | make the browser path configurable |
| Test user name is the owner's initials | CLAUDE.md rule 5 | swap for made-up data |

## Decisions taken (PJ, 2026-11-25)

1. XO gets its own hostname, `xo.tifunction.com`, instead of a path under
   `nobbie.tifunction.com`, so it has its own browser origin.
2. nginx reaches XO through `host.docker.internal`; XO publishes its port only on
   the docker0 address `172.17.0.1:8010`.
3. The XO server block goes into NOBBIE's `nginx/nginx.conf` and is committed in
   the NOBBIE repo on its current branch, that file only.
4. GitHub repository: `goldstar-ti/xo`, private.
5. Git identity for this repo: `PJ <pj9300@gmail.com>`, as NOBBIE.
6. Test data uses a made-up sign-in name, not the owner's initials.
7. `VAPID_SUBJECT` is XO's own https address, not an email address.
