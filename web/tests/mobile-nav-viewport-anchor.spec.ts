import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Architectural contract for the mobile bottom nav.
 *
 * The nav is a `position: fixed` shell surface. It only stays glued to the
 * visual viewport while NOTHING on its ancestor chain (html → body → shell
 * root) is a containing block for fixed descendants or a scroll container.
 *
 * The shipped regression was `overflow-x: clip` on `html` and `body`: per CSS
 * Overflow 3 a non-visible value on one axis promotes the other axis from
 * `visible` to `auto`, so both boxes became scroll containers. WebKit then
 * anchors fixed descendants to the body's scrolled contents rather than the
 * viewport, so the nav scrolled with the page and ended up mid-screen.
 *
 * These tests are engine-independent: they assert the invariant (no capturing
 * ancestor) rather than a WebKit-only symptom, because Chromium happens to
 * tolerate the broken CSS.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const GLOBALS_CSS = read('src/app/globals.css');
const APP_LAYOUT = read('src/app/(app)/layout.tsx');
const BOTTOM_NAV = read('src/components/layout/bottom-nav.tsx');

/** Declarations that either establish a fixed-position containing block or make
 *  the box a scroll container that WebKit re-anchors fixed descendants to. */
const CAPTURING_PROPERTY =
  /(?:^|[\s;])(overflow(?:-x|-y|-block|-inline)?|transform|translate|rotate|scale|filter|backdrop-filter|-webkit-backdrop-filter|perspective|contain|content-visibility|will-change)\s*:/;

/** Every `html` / `body` (or `html, body`) rule block in globals.css. */
function rootRuleBlocks(): Array<{ selector: string; body: string }> {
  const re = /(?:^|\n)\s*((?:html|body)(?:\s*,\s*(?:html|body))*)\s*\{([^}]*)\}/g;
  const blocks: Array<{ selector: string; body: string }> = [];
  for (const m of GLOBALS_CSS.matchAll(re)) {
    blocks.push({ selector: m[1].trim(), body: m[2] });
  }
  return blocks;
}

test.describe('mobile bottom nav — viewport anchoring contract', () => {
  test('globals.css never gives html/body a fixed containing block or scroll container', () => {
    const blocks = rootRuleBlocks();
    // Guard against the regex silently matching nothing after a refactor.
    expect(blocks.length).toBeGreaterThan(0);

    for (const { selector, body } of blocks) {
      const offending = body
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d.length > 0 && CAPTURING_PROPERTY.test(` ${d};`));

      expect(
        offending,
        `\`${selector}\` must not declare ${offending.join(', ')} — it would capture the fixed bottom nav on iOS Safari`,
      ).toEqual([]);
    }
  });

  test('BottomNav stays a direct child of the app shell, outside <main>', () => {
    const mainClose = APP_LAYOUT.indexOf('</main>');
    const navMount = APP_LAYOUT.indexOf('<BottomNav');

    expect(mainClose, 'app shell should still render a <main> element').toBeGreaterThan(-1);
    expect(navMount, 'app shell should still render <BottomNav />').toBeGreaterThan(-1);
    expect(
      navMount,
      '<BottomNav /> must be a shell-level sibling of <main>, not nested inside the scrolling content region',
    ).toBeGreaterThan(mainClose);

    // <main> owns the bottom clearance so content is never hidden behind the nav.
    expect(APP_LAYOUT).toMatch(/<main[^>]*\bpb-24\b/);
  });

  test('the nav element itself is still viewport-fixed with safe-area inset', () => {
    expect(BOTTOM_NAV).toMatch(/<nav className="fixed inset-x-0 bottom-0 z-50/);
    expect(BOTTOM_NAV).toContain('env(safe-area-inset-bottom)');
    expect(BOTTOM_NAV).toContain('md:hidden'); // desktop sidebar owns navigation
  });
});

test.describe('mobile bottom nav — computed layout at 589x1280', () => {
  test.use({ viewport: { width: 589, height: 1280 }, hasTouch: true, isMobile: true });

  /** Real `html` / `body` base declarations, injected verbatim into a harness
   *  that mirrors the (app) shell: shell root → <main> + fixed <nav>. */
  function harness(): string {
    const rootCss = rootRuleBlocks()
      .map(({ selector, body }) => `${selector} { ${body.replace(/@apply[^;]*;/g, '')} }`)
      .join('\n');

    return `<!doctype html>
<html lang="en" class="dark"><head>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
  ${rootCss}
  body { margin: 0; min-height: 100dvh; }
  .shell { position: relative; display: flex; min-height: 100dvh; }
  main { position: relative; display: flex; flex: 1 1 0%; flex-direction: column; padding-bottom: 6rem; }
  .row { height: 80px; margin: 8px; background: #222; }
  nav { position: fixed; inset-inline: 0; bottom: 0; z-index: 50;
        padding: 0 .5rem max(0.5rem, env(safe-area-inset-bottom)); }
  nav .bar { height: 56px; background: #111; }
</style></head>
<body>
  <div class="shell">
    <main>${'<div class="row"></div>'.repeat(40)}</main>
    <nav id="bottom-nav"><div class="bar">nav</div></nav>
  </div>
</body></html>`;
  }

  test('html and body resolve to visible overflow on both axes', async ({ page }) => {
    await page.setContent(harness(), { waitUntil: 'load' });

    const overflow = await page.evaluate(() => {
      const of = (el: Element) => {
        const s = getComputedStyle(el);
        return { x: s.overflowX, y: s.overflowY };
      };
      return { html: of(document.documentElement), body: of(document.body) };
    });

    // A non-visible value on either axis promotes the other to `auto`, which is
    // exactly what detached the nav from the viewport on iOS.
    expect(overflow).toEqual({
      html: { x: 'visible', y: 'visible' },
      body: { x: 'visible', y: 'visible' },
    });
  });

  test('the nav does not move with page scroll', async ({ page }) => {
    await page.setContent(harness(), { waitUntil: 'load' });

    const measure = () =>
      page.evaluate(() => {
        const r = document.getElementById('bottom-nav')!.getBoundingClientRect();
        return {
          bottomGap: Math.round(window.innerHeight - r.bottom),
          top: Math.round(r.top),
          scrollY: Math.round(window.scrollY),
        };
      });

    const atTop = await measure();
    expect(atTop.bottomGap, 'nav should sit flush against the bottom of the viewport').toBe(0);

    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForFunction(() => window.scrollY > 0);
    const scrolled = await measure();

    expect(scrolled.scrollY, 'harness must actually scroll for this to prove anything').toBeGreaterThan(0);
    expect(scrolled.bottomGap, 'nav drifted off the viewport bottom while scrolling').toBe(0);
    expect(scrolled.top, 'nav must not be carried up the screen by the scroll').toBe(atTop.top);
  });
});
