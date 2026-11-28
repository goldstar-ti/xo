# Text roles

Each kind of text has one role. `TYPE_ROLES` in `static/js/boot.js` holds the defaults; `apply()` sets `--fs-<role>`, `--fw-<role>`, `--lh-<role>` and `--ls-<role>` (underscores become hyphens) on the root, and the selectors below read them with the defaults as fallbacks.

The look keeps `fs[role] = { size?, weight?, lh?, ls? }` (only parts the owner changed) and three global dials: `wShift` (-200 to 200), `lhMul` (0.8 to 1.4) and `lsShift` (-0.03 to 0.05 em). Size is stored in rem, so changing All text size (`base`) scales every role.

| Role | Size (rem) | Weight | Line | Letter (em) | Selectors |
|---|---|---|---|---|---|
| display | 2.25 | 700 | 1.15 | -0.01 | `.auth h1` |
| page | 1.65 | 700 | 1.15 | -0.01 | `h1` |
| quote | 1.5 | 400 | 1.25 | 0 |  |
| figure | 1.5 | 700 | 1.1 | -0.01 | `.figure strong`; `.next-head`; `.md h1`; `.cw-fig strong`; `.cw-count strong`; `.cw-court-when strong` |
| dialog | 1.375 | 600 | 1.3 | 0 | `.sheet-head h2`; `.md h2`; `.form-sheet .sheet-head h2`; `.diary-lead-when` |
| section | 0.9375 | 600 | 1.3 | 0 | `h2` |
| lead | 1.125 | 400 | 1.5 | 0 | `.line`; `:root[data-line="quote"] .line`; `.xo-pop-head h2`; `.checkin-lead .checkin-start, .checkin-fold .checkin-start`; `.xo-w-body .page-head h1` |
| brand | 0.9375 | 700 | 1.5 | -0.01 | `.brand`; `.group > h2`; `.xo-w-title` |
| sub | 1 | 700 | 1.5 | 0 | `h3`; `.md h3, .md h4` |
| body | 1 | 400 | 1.5 | 0 | `body`; `.guard`; `.dayline .t`; `.checkin-nav .xo-link`; `.xo-menu-item`; `.cw-quiet`; `.cw-ev .row-main`; `.cw-answers h3`; `.cw-answers dt`; `.cw-answers dd`; `.cw-sub`; `.cw-bybill td:not(:first-child)`; `.cw-answers-dl dt` |
| large | 1.0625 | 600 | 1.5 | 0 | `.big`; `.list.links .row-main`; `.own`; `.services a`; `.xo-fl-sample`; `.tasks-lead-row .row-main > span`; `.plan-lead-q` |
| label | 0.9375 | 600 | 1.5 | 0 | `.field > label`; `.opt > span, .opt > label`; `.colour-table tbody th`; `.xo-ctl-label`; `.colour-name` |
| control | 1 | 600 | 1.2 | 0 | `.plan-btn:not(.tw\:btn)`; `.look-btn:not(.tw\:btn)`; `.primary:not(.tw\:btn), .ghost:not(.tw\:btn)` |
| small | 0.75 | 400 | 1.5 | 0 | `small, .meta, .hint`; `.sec-head a`; `.dayline .now-rule`; `:is(button, a).tick:not(.tw\:btn)`; `.group > h2 .meta`; `.chip-group h3`; `.lookup-table th`; `.dial-exact`; `.ident-family h3`; `.colour-table thead th`; `.xo-opt-hint`; `.figure-label`; `.look-acc > h3, .look-sub`; `.look-results`; `.look-preview > h2`; `.colour-mode`; `.voice-live`; `.ip-name`; `.auth .auth-foot`; `.xo-scale-val`; `.checkin-day h3`; `.diary-lead-when .meta`; `.ribbon-sep`; `.cw-cell .cw-ev .row-main`; `.cw-more`; `.cw-s7-wd`; `.cw-rw li.cw-rw-head`; `.cw-4w li.cw-4w-head` |
| small_btn | 0.875 | 600 | 1.2 | 0 | `.small:not(.tw\:btn)`; `.pane-tab`; `.tasks-lead-label`; `.xo-menu-label`; `.xo-wgroup h3`; `.cw-fig span`; `.xo-arr-hidden h3` |
| nav | 0.8125 | 500 | 1.5 | 0 | `.tabs a`; `.link-row-sub`; `.next-sub`; `.list.three .meta`; `.list.timed .t`; `.list .row-main > small`; `.swatch`; `.tasks-lead-row .row-main > small`; `.xo-wcount`; `.cw-count li > span`; `.cw-body-log .chip`; `.cw-4w-name` |
| tag | 0.75 | 700 | 1.2 | 0 | `.tag`; `.badge`; `.xo-fl-group`; `.cw-wd`; `.cw-cell-n`; `.cw-bybill th` |
| tiny | 0.6875 | 600 | 1.5 | 0 | `.hue.auto` |
| code | 1 | 400 | 1.5 | 0 | `code, kbd, pre`; `.code`; `.xo-code textarea, .xo-code wa-textarea` |

## Assigned by size

The selectors that had a hard-coded rem size (and no role of their own) went to the nearest role by size, with a small penalty for a different weight. Examples: `.link-row-sub`, `.next-sub`, `.swatch` (0.82rem) to nav; `.cw-sub`, `.cw-ev .row-main` (0.875rem) to body; `.diary-lead-when` (1.4rem) to dialog; `.plan-lead-q` (1.1rem) to large; `.cw-wd` (0.75rem, bold) to tag; `.md h1` to figure. Sizes moved by under about 1 px at the 13 px base.

## Kept as they are

Not text roles, because their size is a glyph, a scale tied to a widget size or a multiple of another size:

- Icon and glyph sizes: `.link-row-ico`, `.xo-search-x`, `.xo-sort-btn`, `.xo-tab-x`, `.fig-sample`, `.dial-btn`.
- Widget digits: `.cw-clock.s-*  .cw-time`, `.cw-now .cw-time`, `.cw-timer-time`, `.cw-sec` (em), `.cw-body .next-head` (clamp).
- View-specific scales: `body[data-view="today"] .next-head`, `body[data-view="bills"] .figure strong`, `.preview .next-head`.
- Chrome scale containers: `.top`, `.tabs`, `.side` (1rem times `--chrome`). Roles inside them (`.brand`, `.tabs a`) keep the `--chrome` multiplier.
- Web Awesome and daisyUI selectors (`wa-*`, `html[data-kit=...]`, `button.tw:btn`): they keep `font-size: inherit` or read `--fs-small-btn`, `--fs-control` and `--fs-large` in `static/kit-wa.css`.

## Weight-only selectors

A selector with a `font-weight` but no `font-size` is an emphasis inside another role (a selected tab, a late row). It keeps the `--fw-light`, `--fw-regular`, `--fw-medium`, `--fw-semibold`, `--fw-bold` or `--fw-detail` token (D-45). `apply()` moves those six tokens with the weight shift, so All text weight reaches them. Numeric weights of 400, 500 and 600 in such rules now read the tokens.

## Notes

- `--ls` (used by `--time-col`) follows the body role's letter spacing plus the shift.
- `--weight`, `--lh`, `--mono-size` and `--mono-ls` are gone. Code size is `fs.code.size` in rem, no longer a percentage of the surrounding text.
