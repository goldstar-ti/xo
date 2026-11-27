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
    COMPONENTS = """async (kit) => {
      const { loadText } = await import('/js/text.js');
      await loadText();
      const ui = await import('/js/ui.js');
      const { tabStrip } = await import('/js/tabs.js');
      const w = window;
      w.__seg = null; w.__tog = null; w.__card = null; w.__font = null; w.__q = null; w.__moved = null;
      w.__tab = null; w.__col = null;
      const host = document.createElement('div');
      host.id = 'cmp-host';
      const fonts = [
        ['Built in', [['atkinson', 'Atkinson'], ['mono', 'Mono']]],
        ['Static serif', [['g:lora|Lora', 'Lora'], ['g:lato|Lato', 'Lato']]],
      ];
      const one = (id, el) => { const d = document.createElement('div'); d.id = id; d.append(el); return d; };
      const strip = tabStrip({ label: 'Groups', vertical: true, active: 'a', onSelect: (k) => { w.__tab = k; },
        items: [{ key: 'a', label: 'Alpha', badge: 2 }, { key: 'b', label: 'Beta' }] });
      host.append(
        one('cmp-seg', ui.segmented('Pick', [['a', 'One'], ['b', 'Two'], ['c', 'Three']], { value: 'a', onchange: (v) => { w.__seg = v; } })),
        one('cmp-tog', ui.toggle('Glass', { checked: false, onchange: (v) => { w.__tog = v; } })),
        one('cmp-disc', ui.disclosure('Section', document.createTextNode('Inside'), { open: false, badge: ui.badge('3', 'accent') })),
        one('cmp-cards', ui.optionCards('Style', [
          { value: 'a', title: 'Card A', hint: 'First' }, { value: 'b', title: 'Card B', hint: 'Second' },
        ], { value: 'a', onchange: (v) => { w.__card = v; } })),
        one('cmp-search', ui.searchBox({ placeholder: 'Find', oninput: (v) => { w.__q = v; } })),
        one('cmp-font', ui.fontPicker({ value: 'atkinson', fonts, label: 'Body font', onchange: (v) => { w.__font = v; } })),
        one('cmp-col', ui.colourField({ value: '#336699', label: 'Ink', onchange: (v) => { w.__col = v; } })),
        one('cmp-sort', ui.sortList(['first', 'second', 'third'], { render: (x) => document.createTextNode(x), onmove: (a, b) => { w.__moved = [a, b]; } })),
        one('cmp-stat', ui.stat('Due', '12')),
        one('cmp-tabs', strip.el),
      );
      document.body.append(host);
      if (kit === 'wa') {
        const tags = ['wa-radio-group', 'wa-radio', 'wa-switch', 'wa-details', 'wa-badge', 'wa-card', 'wa-input', 'wa-color-picker'];
        await Promise.all(tags.map((t) => customElements.whenDefined(t)));
      }
      return true;
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

        # Appearance components (segmented, toggle, disclosure, option cards, search, font picker, colour, sort, stat).
        assert page.evaluate(COMPONENTS, kit)
        cmp = page.locator("#cmp-host")
        cmp.get_by_role("radio", name="Two").click()
        assert page.evaluate("window.__seg") == "b", "segmented click"
        page.keyboard.press("ArrowRight")
        assert page.evaluate("window.__seg") == "c", "segmented arrow key"
        sw = page.locator("#cmp-tog wa-switch") if kit == "wa" else cmp.get_by_role("switch")
        sw.click()
        assert page.evaluate("window.__tog") is True, "toggle on"
        sw = page.locator("#cmp-tog wa-switch") if kit == "wa" else cmp.get_by_role("switch")
        sw.click()
        assert page.evaluate("window.__tog") is False, "toggle off"
        disc = page.locator("#cmp-disc > *")
        assert not disc.evaluate("(e) => e.open")
        page.locator("#cmp-disc").get_by_text("Section").click()
        assert disc.evaluate("(e) => e.open"), "disclosure opens"
        page.locator("#cmp-disc").get_by_text("Section").click()
        page.wait_for_function("!document.querySelector('#cmp-disc > *').open")
        page.locator("#cmp-cards button", has_text="Card B").click()
        assert page.evaluate("window.__card") == "b", "option card"
        expect(page.locator("#cmp-cards button", has_text="Card B")).to_have_attribute("aria-checked", "true")
        search_in = page.locator("#cmp-search input")
        search_in.fill("abc")
        assert page.evaluate("window.__q") == "abc", "search input"
        if kit != "wa":
            page.locator("#cmp-search .xo-search-x").click()
            assert page.evaluate("window.__q") == "", "search clear"
        font_in = page.locator("#cmp-font input")
        font_in.click()
        font_in.fill("lora")
        expect(page.locator("#cmp-font [role=option]")).to_have_count(1)
        font_in.press("Enter")
        assert page.evaluate("window.__font") == "g:lora|Lora", "font picker"
        assert page.evaluate("!!document.head.querySelector('link[data-xo-font=lora]')"), "font loaded on choose"
        assert not page.evaluate("!!document.head.querySelector('link[data-xo-font=lato]')"), "unchosen font not loaded"
        if kit != "wa":
            hexbox = page.locator("#cmp-col input.xo-hex")
            hexbox.fill("#112233")
            hexbox.press("Enter")
            assert page.evaluate("window.__col") == "#112233", "colour hex box"
        else:
            expect(page.locator("#cmp-col wa-color-picker")).to_have_count(1)
        page.locator("#cmp-sort li").first.get_by_label("Move down").click()
        assert page.evaluate("window.__moved") == [0, 1], "sort list down"
        assert page.locator("#cmp-sort .xo-sort-body").all_inner_texts() == ["second", "first", "third"]
        expect(page.locator("#cmp-stat .figure")).to_contain_text("12")
        expect(page.locator("#cmp-tabs [role=tablist]")).to_have_attribute("aria-orientation", "vertical")
        page.locator("#cmp-tabs [role=tab]").first.focus()
        page.keyboard.press("ArrowDown")
        assert page.evaluate("window.__tab") == "b", "vertical tabs arrow down"
        page.evaluate("document.getElementById('cmp-host').remove()")
        print("appearance components ok:", kit)
        print("ui.js controls ok:", kit)
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
