# Version history

`VERSION` in `app/version.py` is the one app version. Add a row at the top for every shipped feature (minor bump) or fix (patch bump). The major number changes only with the owner's say-so.

| Version | Date | Change |
|---|---|---|
| 2.3.3 | 2026-11-26 | Settings, Appearance, sign-in and the app shell follow the Kit choice; all wording is in content/text. |
| 2.3.2 | 2026-11-26 | Check-ins and My plan follow the Kit choice; their wording is in content/text. |
| 2.3.1 | 2026-11-26 | Today and the lists follow the Kit choice; their wording is in content/text. |
| 2.3.0 | 2026-11-26 | Text and prose come from YAML files in content/text, live on reload. Appearance has a Kit choice: XO, daisyUI or Web Awesome (forms and dialogs follow it; screens move over next). |
| 2.2.0 | 2026-11-26 | Browser encryption removed: entries are stored as plain JSON and sign-in is a password checked on the server. No CSP or security headers. |
| 2.1.0 | 2026-11-26 | Inline styles allowed in the CSP; Web Awesome, Font Awesome icons and daisyUI served locally; house code style, voice guide and Claude tooling. |
| 2.0.0 | 2026-11-25 | XO v2 deployed on gs-sv-008 behind Cloudflare Access. |
