# Decisions

A numbered log. Add the next `D-n` for anything that was chosen over an alternative, with the date and the reason.

## D-1 (2026-11-26): CSP relaxed for inline styles

`style-src 'self' 'unsafe-inline'`, because Web Awesome and daisyUI components set inline styles. Scripts stay `'self'` only: no inline scripts, no `eval`. The Web Awesome and Font Awesome hosts are permitted only when a local copy is not possible. `frame-ancestors 'none'`, `base-uri 'none'` and `form-action 'self'` stay. Why: the owner wants both kits, and neither works without inline styles. Rule 3 in `CLAUDE.md` holds the wording.

## D-2 (2026-11-26): Both component kits served locally, switchable later

daisyUI 5 comes through Tailwind with the `tw:` prefix. Web Awesome 3 loads through `static/js/kit.js`. Both are copied into the image at build time, so no request leaves the origin. A later step adds a Kit appearance option (XO, daisyUI, Web Awesome) and moves screens over one by one. Why: the owner wants to compare them in use before choosing, and local copies keep the CSP tight.

## D-3 (2026-11-25): App port published only on 172.17.0.1:8010

The app is reachable only on the docker0 address, and NOBBIE's nginx container proxies `xo.tifunction.com` to it through `host.docker.internal`. Why: no LAN address exposes XO, and nginx can still start when XO is down.

## D-4 (2026-11-26): Cloudflare Access allows only the owner's email

The Access application for `xo.tifunction.com` has one policy: the owner's email. Why: the first sign-in creates the only account, so anyone who reached the sign-in page first could take it.

## D-5 (2026-11-26): NOBBIE's front-end stack and settings table not adopted

XO does not take NOBBIE's htmx, Alpine, Jinja or Vite stack, or its `app_settings` table. Why: XO's rule 3 (local assets, tight CSP), plain ES modules with no build step, and settings that are encrypted items or browser-side (`xo-look`) rather than a plaintext table. Only the code style, voice guide, Claude tooling and decisions habit were carried over.

## D-6 (2026-11-26): Security handled outside the codebase

The owner handles security separately and takes responsibility for it. The app sends no CSP or other security headers (`X-Content-Type-Options`, `Referrer-Policy` removed), and the CLAUDE.md rules about security are lifted. Kept: the `X-XO: 1` check on changes (it works and costs nothing), Cloudflare Access in front of the hostname, HSTS from nginx, and local copies of libraries and fonts (for offline use, not security). This supersedes D-1.

## D-7 (2026-11-26): Browser encryption removed

Items are stored as plain JSON and sign-in becomes a normal password checked on the server. Why: the owner put browser encryption out of scope. The database had no accounts, so the tables are recreated rather than migrated.

## D-8 (2026-11-26): Rule 5 (no personal details) paused until production

Personal names and details may appear in code, defaults, tests and commits while the rule is paused. The owner reinstates it before production, and every detail added meanwhile must be removed then. The repository stays private (rule 6).
