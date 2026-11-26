# Phase complete - XO

Use this command when you believe all steps of a roadmap item or phase are done. The specs are in `docs/ROADMAP.md`.

## Steps

1. Re-read the item's spec in `docs/ROADMAP.md` and the "Before calling a change done" list in `CLAUDE.md`.

2. Check each point. Run the tests:

   ```bash
   make test-api
   make test-e2e
   ```

   Both must pass. For visual points (360 px and desktop width, light and dark, two themes) say exactly what you checked in the running app and what you only read from source. Ask the owner to check anything you cannot drive.

3. Write a status report:

   ```
   Phase N verification:
   [PASS] item one
   [FAIL] item three: what is wrong
   [SKIP] item four: why it cannot be verified yet
   ```

4. Fix every FAIL before going on. Do not mark a phase complete with an open failure.

5. Update `README.md` and `docs/ROADMAP.md` so they describe what exists. Add a row to `docs/version-history.md` and bump `VERSION` in `app/version.py` (minor for a feature, patch for a fix). Add any decision to `docs/decisions.md` and update `HANDOFF.md`.

6. Commit with explicit pathspecs, using `.claude/commands/git-commit-message.md`. XO commits end with the `Co-Authored-By` line. Never `git add -A`, and never add `.env` or `backups/`.

7. Report the hash with `git log --oneline -1`, then ask whether to begin the next item. Do not start it without a yes.

## Important

Never call a change done on unit tests alone when it changes what the user sees. Never push unless asked.
