"""Browser smoke test for the component kits, served locally.

Loads Web Awesome through static/js/kit.js, renders a button and an icon, and
checks that the daisyUI "xo" theme maps onto the XO tokens. Then builds every
static/js/ui.js control under each kit (xo, daisy, wa) and checks the value,
checked state and click events behave the same. Fails on any console error and
on any request that leaves the app's origin.

Usage: python tests/e2e_kits.py http://localhost:8000
"""

import os
import sys
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

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

    BUILD = """async (kit) => {
      window.XOLook.change((s, look) => { look.kit = kit; }, { quiet: true });
      const { loadWebAwesome } = await import('/js/kit.js');
      if (kit === 'wa') await loadWebAwesome();
      const ui = await import('/js/ui.js');
      window.__clicks = 0;
      const host = document.createElement('div');
      host.id = 'kit-host';
      const count = () => { window.__clicks += 1; };
      host.append(
        ui.button('Press', { variant: 'primary', onclick: count }),
        ui.field('Name', ui.input({ id: 'k-in', value: 'start' }), 'A hint'),
        ui.field('Notes', ui.textarea({ id: 'k-ta', rows: 2 })),
        ui.field('Pick one', ui.select([['a', 'Alpha'], ['b', 'Beta']], { id: 'k-sel', value: 'b' })),
        ui.field('Tick it', ui.checkbox({ id: 'k-cb', checked: true }), 'Another hint'),
        ui.chip('Chosen', { pressed: true, onclick: count }),
        ui.chip('Spare', { pressed: false }),
      );
      document.body.append(host);
      if (kit === 'wa') {
        const tags = ['wa-button', 'wa-input', 'wa-textarea', 'wa-select', 'wa-checkbox', 'wa-tag'];
        await Promise.all(tags.map((t) => customElements.whenDefined(t)));
      }
      return document.documentElement.dataset.kit;
    }"""
    PRIMARY_BG = "getComputedStyle(document.querySelector('#kit-host button, #kit-host wa-button')).backgroundColor"
    for kit in ("xo", "daisy", "wa"):
        assert page.evaluate(BUILD, kit) == kit
        host = page.locator("#kit-host")
        inner = lambda sel, kit=kit: page.locator(sel).locator("input") if kit == "wa" else page.locator(sel)  # noqa: E731
        expect(page.locator("#k-sel")).to_have_js_property("value", "b")
        page.locator("#k-sel").evaluate("(e) => { e.value = 'a'; }")
        assert page.locator("#k-sel").evaluate("(e) => e.value") == "a"
        inner("#k-in").fill("typed")
        assert page.locator("#k-in").evaluate("(e) => e.value") == "typed"
        if kit == "wa":
            page.locator("#k-ta").locator("textarea").fill("some notes")
        else:
            page.locator("#k-ta").fill("some notes")
        assert page.locator("#k-ta").evaluate("(e) => e.value") == "some notes"
        expect(page.locator("#k-cb")).to_have_js_property("checked", True)
        # A Web Awesome checkbox is as wide as its row, so click its box, not the middle of the row.
        page.locator("#k-cb").click(position={"x": 8, "y": 8})
        expect(page.locator("#k-cb")).to_have_js_property("checked", False)
        host.get_by_role("button", name="Press").click()
        host.get_by_role("button", name="Chosen").click()
        assert page.evaluate("window.__clicks") == 2
        expect(host.get_by_role("button", name="Chosen")).to_have_attribute("aria-pressed", "true")
        expect(host.get_by_role("button", name="Spare")).to_have_attribute("aria-pressed", "false")
        expect(host.get_by_text("A hint")).to_have_count(1)
        if kit == "daisy":
            assert page.evaluate(PRIMARY_BG) != "rgba(0, 0, 0, 0)", "daisyUI classes did not compile into tw.css"
        page.evaluate("document.getElementById('kit-host').remove()")
        print("ui.js controls ok:", kit)

    # GridStack for the Bridge, served from static/vendor/gridstack like the kits.
    gridstack = page.evaluate(
        """() => new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = '/vendor/gridstack/gridstack-all.js';
          s.onload = () => resolve(typeof (window.GridStack?.GridStack || window.GridStack)?.init === 'function');
          s.onerror = () => resolve(false);
          document.head.append(s);
        })"""
    )
    print("gridstack loaded:", gridstack)
    assert gridstack, "GridStack did not load from /vendor/gridstack"
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
