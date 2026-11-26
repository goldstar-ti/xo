"""Browser smoke test for the two component kits, served locally under the CSP.

Loads Web Awesome through static/js/kit.js, renders a button and an icon, and
checks that the daisyUI "xo" theme maps onto the XO tokens. Fails on any console
error (a CSP violation is one) and on any request that leaves the app's origin.

Usage: python tests/e2e_kits.py http://localhost:8000
"""

import os
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
ORIGIN = urlparse(BASE).netloc
errors = []
offsite = []

with sync_playwright() as p:
    chrome = os.environ.get("XO_CHROME", "/usr/bin/google-chrome")
    browser = p.chromium.launch(executable_path=chrome or None, args=["--no-sandbox"])
    page = browser.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "401" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on(
        "request",
        lambda r: (
            offsite.append(r.url)
            if urlparse(r.url).netloc not in (ORIGIN, "") and not r.url.startswith("data:")
            else None
        ),
    )
    page.goto(BASE)
    page.wait_for_load_state("load")

    result = page.evaluate(
        """async () => {
          const { loadWebAwesome } = await import('/js/kit.js');
          await loadWebAwesome();
          const host = document.createElement('div');
          host.innerHTML = '<wa-button variant="brand">Save</wa-button> <wa-icon name="check"></wa-icon>'
            + ' <wa-icon name="calendar" variant="regular"></wa-icon>';
          document.body.append(host);
          await Promise.all(['wa-button', 'wa-icon'].map((t) => customElements.whenDefined(t)));
          const icons = [...host.querySelectorAll('wa-icon')];
          for (let i = 0; i < 50 && !icons.every((el) => el.shadowRoot?.querySelector('svg')); i++) {
            await new Promise((r) => setTimeout(r, 100));
          }
          const css = getComputedStyle(document.documentElement);
          return {
            button: !!host.querySelector('wa-button').shadowRoot,
            icons: icons.map((el) => !!el.shadowRoot?.querySelector('svg')),
            daisyPrimary: css.getPropertyValue('--color-primary').trim(),
            daisyBase: css.getPropertyValue('--color-base-100').trim(),
          };
        }"""
    )
    browser.close()

print("kits:", result)
print("offsite requests:", offsite or "none")
print("console errors:", errors or "none")
assert result["button"], "wa-button did not render"
assert all(result["icons"]), "a wa-icon did not load its local SVG"
assert result["daisyPrimary"] and result["daisyBase"], "daisyUI xo theme variables missing"
assert not offsite
assert not errors
print("KITS OK")
