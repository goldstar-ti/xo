# Version history

`VERSION` in `app/version.py` is the one app version. Add a row at the top for every shipped feature (minor bump) or fix (patch bump). The major number changes only with the owner's say-so.

| Version | Date | Change |
|---|---|---|
| 2.2.0 | 2026-11-26 | Browser encryption removed: entries are stored as plain JSON and sign-in is a password checked on the server. No CSP or security headers. |
| 2.1.0 | 2026-11-26 | Inline styles allowed in the CSP; Web Awesome, Font Awesome icons and daisyUI served locally; house code style, voice guide and Claude tooling. |
| 2.0.0 | 2026-11-25 | XO v2 deployed on gs-sv-008 behind Cloudflare Access. |
