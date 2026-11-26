# Adding a test (XO)

`CLAUDE.md` ("Running it" and "Before calling a change done") is the authority; this page is the working recipe. Everything runs in containers on a throwaway stack (`xo-test`, `docker-compose.test.yml`) that cannot reach `xo-db`.

## Where

| What | File | Run with |
| --- | --- | --- |
| API behaviour (auth, items, reminders, CSP header, CSRF guard) | `tests/test_api.py` (pytest) | `make test-api` |
| A screen or flow in a real browser | `tests/e2e.py` | `make test-e2e` |
| Appearance: themes, look codes, schedules | `tests/e2e_look.py` | `make test-e2e` |
| Component kits (Web Awesome, daisyUI) under the CSP | `tests/e2e_kits.py` | `make test-e2e` |

Add to the file for the area you touched. A new area gets a new script.

## API tests

The `client` fixture drops and recreates every table, then yields an `httpx.AsyncClient` on the ASGI app. Every changing request needs the header `X-XO: 1` (`H` in the file). `register(client)` creates the test account.

```python
@pytest.mark.asyncio
async def test_thing(client):
    await register(client)
    r = await client.put("/api/items/task-1", json={"kind": "task", "day": "2030-01-01", "payload": "v1.AAAA"}, headers=H)
    assert r.status_code == 200
```

Test that the server stores and returns ciphertext only. Never assert on plaintext user content, because the server never has it.

## Browser tests

Python Playwright scripts with plain `assert` (or `expect` from `playwright.sync_api`). They run in `mcr.microsoft.com/playwright/python` sharing the test app's network, so the base URL is `http://localhost:8000`, a secure context.

- Capture `console` errors and `pageerror` into a list and assert it is empty at the end. That also catches CSP violations.
- Build the page with the helpers already in the script (`fill_form`) rather than new selectors where you can. Locate by id, label or role, not by styling classes.
- Wait with web-first `expect(...)` assertions. No fixed sleeps.
- A new script starts with a docstring showing how to run it, takes the base URL from `sys.argv[1]`, and prints a short pass line.
- Add the script to the `e2e` command in `docker-compose.test.yml`, and to every line that lists the scripts: the `test-e2e` target in `Makefile`, `README.md`, `docs/RUNBOOK.md` ("Tests") and `CLAUDE.md` ("Running it").

## Rules

- **Made-up data by default.** CLAUDE.md rule 5 (no personal names or details) is paused until production, but test data stays obviously fake: sign-in names, titles and passwords.
- Golden path plus one or two edge cases. Do not test the framework.
- A bug fix adds the test that would have caught it. Show it fails without the fix.
- Front-end changes run both browser scripts, and the screen is checked at 360 px and desktop width, in light and dark.
- Tests share nothing with the real database. If a script needs state, it builds it through the UI or API on the empty test database.
- Never print `.env` or real keys in test output.

## Run

```bash
make test-api
make test-e2e
make test        # both
make test-down   # clean up an interrupted run
```
