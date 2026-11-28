# XO: day-to-day commands. See docs/RUNBOOK.md.
SHELL := /bin/bash
COMPOSE := docker compose
TEST := docker compose -f docker-compose.test.yml
BACKUP_DIR := ./backups
BUN := docker run --rm --user "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$(CURDIR)":/x -w /x/tailwind oven/bun:1-debian

.PHONY: family-themes icons help up down restart-app logs ps health db-backup db-restore confirm css test test-api test-e2e test-down shots lint format seed-demo seed-demo-remove
SEED_COMPOSE ?= docker compose
RUFF := docker run --rm -w /srv/xo
RUFF_PATHS := app scripts tests

help: ## List the targets.
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

up: ## Build the image and start (or update) the stack.
	$(COMPOSE) up -d --build

down: ## Stop and remove the containers. Keeps the database volume.
	$(COMPOSE) down

family-themes: ## Rebuild static/js/family-themes.js from the NOBBIE palettes.
	python3 scripts/build_family_themes.py

icons: ## Rebuild static/vendor/icons and static/js/icon-core.js from NOBBIE's Phosphor and Tabler packages.
	python3 scripts/build_icons.py

restart-app: ## Restart the app container only.
	$(COMPOSE) restart app

logs: ## Follow the app log.
	$(COMPOSE) logs -f app

ps: ## Show the containers and their health.
	$(COMPOSE) ps

health: ## Ask the app for /api/health, directly and through nobbie-nginx.
	curl -fsS http://172.17.0.1:8010/api/health; echo
	curl -fsS -H 'Host: xo.tifunction.com' http://127.0.0.1/api/health; echo

db-backup: ## Dump the database to ./backups/xo-<timestamp>.dump.
	mkdir -p $(BACKUP_DIR)
	@# Dump to a .partial file and rename it only when pg_dump succeeds and wrote
	@# something, so a failed run never leaves an empty file that looks like a backup.
	f=$(BACKUP_DIR)/xo-$$(date +%Y%m%d_%H%M%S).dump; \
	docker exec xo-db sh -c 'pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -F c' > "$$f.partial" \
		&& test -s "$$f.partial" && mv "$$f.partial" "$$f" \
		|| { echo "db-backup failed: $$f.partial is not a backup" >&2; exit 1; }
	@ls -lh $(BACKUP_DIR) | tail -3

confirm:
	@read -r -p "This replaces the live XO database. Type RESTORE to go on: " a; [ "$$a" = RESTORE ]

db-restore: confirm ## Restore the newest dump in ./backups/ (or FILE=path).
	@f="$(FILE)"; [ -n "$$f" ] || f=$$(ls -t $(BACKUP_DIR)/xo-*.dump 2>/dev/null | head -n 1); \
	[ -n "$$f" ] || { echo "No backup found"; exit 1; }; \
	echo "Restoring $$f"; \
	docker exec -i xo-db sh -c 'pg_restore -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --clean --if-exists -1' < "$$f"

css: ## Build static/tw.css locally (the image builds its own).
	$(BUN) sh -c 'bun install --frozen-lockfile && bun run build'
	cp tailwind/dist/tw.css static/tw.css

lint: ## Check style with ruff (read-only; builds the test image first).
	$(TEST) --profile run build pytest
	$(RUFF) -u "$$(id -u):$$(id -g)" -v "$(CURDIR)":/srv/xo:ro xo-app:test sh -c 'ruff check --no-cache $(RUFF_PATHS) && ruff format --check --no-cache $(RUFF_PATHS)'

format: ## Format and auto-fix with ruff, writing files as you.
	$(TEST) --profile run build pytest
	$(RUFF) -u "$$(id -u):$$(id -g)" -v "$(CURDIR)":/srv/xo xo-app:test sh -c 'ruff format --no-cache $(RUFF_PATHS); ruff check --fix --no-cache $(RUFF_PATHS)'

test: test-api test-e2e ## API tests, then both browser tests, on a throwaway stack.

test-api: ## API tests against the throwaway xo-test database (never the real one).
	$(TEST) --profile run build
	$(TEST) run --rm pytest; s=$$?; $(TEST) down -v; exit $$s

test-e2e: ## e2e.py per kit (xo, daisy, wa), e2e_look.py, e2e_modules.py, e2e_pane.py, e2e_phone.py, e2e_canvas.py, e2e_tracker.py, e2e_kits.py, e2e_tasks.py, e2e_extras.py, e2e_data.py per kit against a throwaway instance with an empty database.
	$(TEST) --profile run build
	$(TEST) up -d --wait app
	$(TEST) run --rm e2e; s=$$?; $(TEST) down -v; exit $$s

shots: ## Screenshots of every screen in every kit and two widths into ./.scratch/shots (not a test).
	mkdir -p .scratch/shots
	$(TEST) --profile run build
	$(TEST) up -d --wait app
	$(TEST) run --rm shots; s=$$?; $(TEST) down -v; exit $$s

test-down: ## Remove the throwaway test stack if a run was interrupted.
	$(TEST) down -v

seed-demo: ## Fill the running app with made-up data (overwrites check-ins and the plan). See scripts/seed_demo.py.
	$(SEED_COMPOSE) exec -T app python - < scripts/seed_demo.py

seed-demo-remove: ## Soft-delete the made-up data (the plan stays).
	$(SEED_COMPOSE) exec -T app python - --remove < scripts/seed_demo.py
