# XO handoff

## Current state

- Deployed on gs-sv-008 at `https://xo.tifunction.com`, behind Cloudflare Access. The Access policy allows only the owner's email.
- Private repository `goldstar-ti/xo`, branch `main`.
- Stack: Docker Compose project `xo` (`xo-app`, `xo-db`), app published on `172.17.0.1:8010` behind NOBBIE's nginx. See `docs/RUNBOOK.md`.
- Both component kits are served locally from `static/vendor/` and `static/tw.css`: daisyUI 5 (Tailwind plugin, `tw:` prefix) and Web Awesome 3 (`static/js/kit.js`). Forms, dialogs and toasts follow the Kit choice in Appearance (`ui.js`); screens do not yet.
- Version 1 screens are built (Today, Diary, Tasks, Routine, Bills, Obligations, Check-ins, My plan, Appearance). Specs for the rest are in `docs/ROADMAP.md`.
- Version 2.4.0 (branch `bridge-and-large-screens`): the Bridge widget board (`board.js`, `widgets.js`, GridStack vendored), the desktop side pane (`pane.js`) and desktop text that grows with the window. Decisions D-9 to D-12. Browser tests cover the Bridge on desktop and phone in all three kits.
- House style brought in from the owner's other project: `ruff.toml`, `docs/voice.md`, the Code style section of `CLAUDE.md`, `.claude/` skills, commands and guides, and `docs/decisions.md`.

## Next steps

1. Logging, `app/version.py` with `docs/version-history.md`, and a ruff lint and format pass (no behaviour change). Add `make lint` when ruff is in the image.
2. Convert the screens to `static/js/ui.js` controls and `t()` text, in three batches: (a) Today and the lists (diary, tasks, obligations, routine, bills); (b) check-ins and My plan; (c) settings, appearance and the app shell with sign-in. Each batch moves its inline strings into `content/text/*.yaml` and runs the browser flow under all three kits. Existing screens stay on `app.css` until the owner approves each conversion.
3. Build items from `docs/ROADMAP.md` in the order the owner picks.
4. Bridge follow-ups the owner may want: a sticky-note widget (needs a `note` kind), widget icons (Phosphor, as in NOBBIE), more than one board (canvases on the rail), and dragging widgets on the phone instead of the arrow buttons.

## Owner to-do

1. Create the XO account straight after the first sign-in at `https://xo.tifunction.com`. The first sign-in creates the only account, and sign in with a name and a password of at least 8 characters.
2. Run `make db-backup` before every update. Nothing runs it on a schedule yet.
3. Before production: reinstate CLAUDE.md rule 5 (no personal names or details) and remove every personal detail added while it was paused (decision D-8).
4. Security is handled outside the codebase (decision D-6): the app sends no CSP or security headers.

## What worked

- Throwaway test stack (`xo-test`): API and browser tests cannot touch `xo-db`.
- Serving both kits locally means no request leaves the origin, so XO works offline.
- A server block in NOBBIE's nginx plus a tunnel route gave XO its own origin.

## What did not work

- Folders at mode 0700 on the build host gave 401s from `StaticFiles`; the Dockerfile now sets `chmod -R a+rX`.
- Loading Web Awesome's `webawesome.css` restyled every plain button; only the default theme file is loaded.
- A new Cloudflare hostname was negatively cached by the server's resolver; test with `curl --resolve`.
- GridStack caps a board at 12 columns once `columnOpts` is set, unless `columnMax` is given (NOBBIE hit this too).
- Focusing a Web Awesome button straight after a redraw throws until it has upgraded; use `focusControl()` from `ui.js`.
- GridStack's ES module build imports files without `.js` extensions, which a browser cannot load without a bundler; XO loads `gridstack-all.js`.

More in `.claude/COMMON_MISTAKES.md`. Decisions are in `docs/decisions.md`.
