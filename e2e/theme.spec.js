import { test, expect } from '@playwright/test';

// Rulebook, theme layer, and mobile layout.

const open = async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    try { localStorage.removeItem('silt.speed'); } catch { /* private mode */ }
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => window.SILT?.isReady === true);
  // Animations off: these suites assert state, not motion, and would otherwise
  // wait on every effect. playthrough.spec.js deliberately leaves them ON.
  await page.evaluate(() => window.SILT.setSpeed('off'));
  return errors;
};

// Commit the program and clear whatever prompt it raises so the round actually
// advances. Survey opens a keep-1-of-3 picker now, so a bare commit() leaves
// resolution parked on the human — the round never ticks over. autoResolve()
// dismisses the picker (keeping the best card) or resolves a board target.
async function commitRound(page) {
  await page.evaluate(() => window.SILT.commit());
  for (let i = 0; i < 4; i++) {
    if (!await page.evaluate(() => window.SILT.pending())) break;
    await page.evaluate(() => window.SILT.autoResolve());
  }
}

test.describe('rulebook', () => {
  test('opens from the menu and from a live game', async ({ page }) => {
    await open(page);
    await page.locator('#btnRulesMenu').click();
    await expect(page.locator('#book')).toHaveClass(/on/);
    await page.locator('#bkClose').click();
    await expect(page.locator('#book')).not.toHaveClass(/on/);

    await page.locator('#btnPlay').click();
    await page.locator('#btnRules').click();
    await expect(page.locator('#book')).toHaveClass(/on/);
  });

  test('pages forward and back, with the ends disabled', async ({ page }) => {
    await open(page);
    await page.locator('#btnRulesMenu').click();
    await expect(page.locator('#bkPrev')).toBeDisabled();
    const total = await page.evaluate(() => window.SILT.book().total);
    for (let i = 1; i < total; i++) await page.locator('#bkNext').click();
    await expect(page.locator('#bkNext')).toBeDisabled();
    expect(await page.evaluate(() => window.SILT.book().page)).toBe(total - 1);
    await page.locator('#bkPrev').click();
    expect(await page.evaluate(() => window.SILT.book().page)).toBe(total - 2);
  });

  test('jumps to a page from the dots', async ({ page }) => {
    await open(page);
    await page.locator('#btnRulesMenu').click();
    await page.locator('#bkDots [data-page="5"]').click();
    expect(await page.evaluate(() => window.SILT.book().page)).toBe(5);
    await expect(page.locator('#bkDots [data-page="5"]')).toHaveClass(/on/);
  });

  test('every page has a title and real content', async ({ page }) => {
    await open(page);
    const total = await page.evaluate(() => window.SILT.book().total);
    for (let i = 0; i < total; i++) {
      await page.evaluate(n => window.SILT.openBook(n), i);
      await expect(page.locator('#bkTitle')).not.toBeEmpty();
      const len = await page.locator('#bkBody').evaluate(e => e.textContent.trim().length);
      expect(len, `page ${i}`).toBeGreaterThan(80);
    }
  });

  // The whole point of generating pages from TUNING: the book cannot go stale.
  test('quotes live tuning values, not hardcoded ones', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.SILT.tuning.tollPerShip = 7; });
    await page.evaluate(() => window.SILT.openBook(4));
    await expect(page.locator('#bkBody')).toContainText('7');
    await page.evaluate(() => { window.SILT.tuning.tollPerShip = 2; });
  });

  test('states the round count from tuning', async ({ page }) => {
    await open(page);
    await page.locator('[data-len="11"]').click();
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.openBook(0));
    await expect(page.locator('#bkBody')).toContainText('11');
  });

  test('closes on Escape and on backdrop click', async ({ page }) => {
    await open(page);
    await page.locator('#btnRulesMenu').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#book')).not.toHaveClass(/on/);
    await page.locator('#btnRulesMenu').click();
    await page.locator('#book').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#book')).not.toHaveClass(/on/);
  });

  test('arrow keys page through', async ({ page }) => {
    await open(page);
    await page.locator('#btnRulesMenu').click();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => window.SILT.book().page)).toBe(1);
    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => window.SILT.book().page)).toBe(0);
  });

  test('follows the active theme vocabulary', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.SILT.setTheme('anod'));
    await page.evaluate(() => window.SILT.openBook(2));
    await expect(page.locator('#bkBody')).toContainText('Hukay');
    await page.evaluate(() => window.SILT.setTheme('silt'));
    await expect(page.locator('#bkBody')).toContainText('Dredge');
  });

  test('does not block play', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.locator('#btnRules').click();
    await page.locator('#bkClose').click();
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await commitRound(page);
    await expect(page.locator('#rd')).toContainText('2 / 8');
  });
});

test.describe('theme', () => {
  test('starts on the Filipino theme', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => window.SILT.themeId())).toBe('anod');
    await expect(page.locator('#mTitle')).toHaveText('ANOD');
  });

  test('switches to the plain theme and back', async ({ page }) => {
    await open(page);
    await page.locator('[data-theme="silt"]').click();
    await expect(page.locator('#mTitle')).toHaveText('SILT');
    await page.locator('[data-theme="anod"]').click();
    await expect(page.locator('#mTitle')).toHaveText('ANOD');
  });

  test('renames board nodes without touching the rules', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await expect(page.locator('#svg')).toContainText('Maynilà');
    const before = await page.evaluate(() =>
      window.SILT.state().players.map(p => p.stations[0]));
    await page.evaluate(() => window.SILT.setTheme('silt'));
    await expect(page.locator('#svg')).toContainText('M3');
    const after = await page.evaluate(() =>
      window.SILT.state().players.map(p => p.stations[0]));
    expect(after).toEqual(before);
  });

  test('renames the AI opponents', async ({ page }) => {
    await open(page);
    const opts = await page.locator('[data-bot="0"] option').allTextContents();
    expect(opts).toContain('Maniningil');
    await page.locator('[data-theme="silt"]').click();
    const plain = await page.locator('[data-bot="0"] option').allTextContents();
    expect(plain).toContain('tollkeeper');
  });

  // The inline menu glossary is hidden on short viewports to keep the menu from
  // scrolling, so assert it on a tall one. The same content is always available
  // as a rulebook page — covered by the test below.
  test('shows an inline glossary for the themed variant on tall screens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page);
    await expect(page.locator('#gloss')).toBeVisible();
    await expect(page.locator('#glossBody')).toContainText('bamboo');
    await page.locator('[data-theme="silt"]').click();
    await expect(page.locator('#gloss')).toBeHidden();
  });

  test('always reaches the vocabulary through the rulebook', async ({ page }) => {
    await open(page);
    const total = await page.evaluate(() => window.SILT.book().total);
    let found = false;
    for (let i = 0; i < total && !found; i++) {
      await page.evaluate(n => window.SILT.openBook(n), i);
      const t = await page.locator('#bkBody').textContent();
      if (t.includes('Kawayan') && t.includes('bamboo')) found = true;
    }
    expect(found).toBe(true);
  });

  // A foreigner must always be able to follow what happened.
  test('keeps the log in English', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await commitRound(page);
    await expect(page.locator('#log')).toContainText('surveys');
  });

  test('glosses each Tagalog action with its English meaning', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    for (const [tl, en] of [['Hukay', 'dredge'], ['Bangka', 'ship'], ['Tanáw', 'survey']]) {
      await expect(page.locator('#acts')).toContainText(tl);
      await expect(page.locator('#acts')).toContainText(en);
    }
  });

  test('uses place names in the log', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.program('ship', 'ship'));
    await page.evaluate(() => window.SILT.commit());
    for (let i = 0; i < 4; i++) {
      if (!await page.evaluate(() => window.SILT.pending())) break;
      await page.evaluate(() => window.SILT.autoResolve());
    }
    const log = await page.locator('#log').textContent();
    expect(/Kanluran|Gitna|Silangan|Maynilà|Tundó/.test(log)).toBe(true);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('stacks board over controls with no horizontal scroll', async ({ page }) => {
    const errors = await open(page);
    await page.locator('#btnPlay').click();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    await expect(page.locator('#svg')).toBeVisible();
    await expect(page.locator('#acts')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps the commit button reachable', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.locator('[data-act="ship"]').click();
    await page.locator('[data-act="survey"]').click();
    await expect(page.locator('#go')).toBeEnabled();
    await page.locator('#go').scrollIntoViewIfNeeded();
    await expect(page.locator('#go')).toBeInViewport();
  });

  test('gives action buttons a usable tap size', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    const box = await page.locator('[data-act="ship"]').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(80);
  });

  test('adds oversized hit areas to interactive nodes', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.program('ship', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    expect(await page.locator('#svg [data-hit-node]').count()).toBeGreaterThan(0);
  });

  test('renders the rulebook full-screen', async ({ page }) => {
    await open(page);
    await page.locator('#btnRulesMenu').click();
    const card = await page.locator('.bookCard').boundingBox();
    expect(card.width).toBeGreaterThan(page.viewportSize().width * 0.95);
  });

  test('shows the whole delta on a phone', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    const clipped = await page.evaluate(() => {
      const svg = document.getElementById('svg');
      const vb = svg.viewBox.baseVal;
      return [...svg.querySelectorAll('[data-node]')].filter(g => {
        const b = g.getBBox();
        return b.x < vb.x || b.y < vb.y ||
               b.x + b.width > vb.x + vb.width || b.y + b.height > vb.y + vb.height;
      }).map(g => g.dataset.node);
    });
    expect(clipped).toEqual([]);
  });

  test('plays a full game on a phone', async ({ page }) => {
    const errors = await open(page);
    await page.locator('[data-len="5"]').click();
    await page.locator('#btnPlay').click();
    for (let r = 0; r < 5; r++) {
      await page.evaluate(() => window.SILT.program('ship', 'dredge'));
      await page.evaluate(() => window.SILT.commit());
      for (let i = 0; i < 4; i++) {
        if (!await page.evaluate(() => window.SILT.pending())) break;
        await page.evaluate(() => window.SILT.autoResolve());
      }
    }
    await expect(page.locator('#ov')).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });
});

test.describe('tablet', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test('lays out without overflow', async ({ page }) => {
    const errors = await open(page);
    await page.locator('#btnPlay').click();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });
});

// The tutorial used to hardcode English action names ("pick SHIP") while the
// buttons beside it rendered the themed label ("Bangka"). That is not cosmetic:
// it instructs a new player to click a word that is nowhere on screen. These
// tests assert the tutorial and the board always speak the same language.
test.describe('tutorial speaks the active theme', () => {
  // Walk every step and return its rendered title+body, per theme.
  const tourText = async (page) => {
    await page.locator('#btnTutorial').click();
    const seen = [];
    for (let guard = 0; guard < 30; guard++) {
      const t = await page.evaluate(() => window.SILT.tutorial());
      if (!t || !t.active) break;
      seen.push({
        id: t.id,
        title: await page.locator('#tutTitle').textContent(),
        body: await page.locator('#tutBody').textContent(),
        hint: await page.locator('#tutWait').textContent(),
      });
      if (await page.locator('#tutNext').isVisible()) await page.locator('#tutNext').click();
      else await page.locator('#tutSkipStep').click();
    }
    return seen;
  };

  test('names the actions exactly as the buttons paint them', async ({ page }) => {
    await open(page);
    const steps = await tourText(page);

    // What the ship step tells you to click must be on the ship button.
    const shipBtn = await page.evaluate(() => window.SILT.theme().actions.ship.name);
    const ship = steps.find(s => s.id === 'pick-ship');
    expect(ship.title + ship.body, 'ship step must name the themed action')
      .toContain(shipBtn);

    // The second-slot step teaches build specifically. On round one every channel
    // is at full depth, so dredge has no legal target and just fizzles — so the
    // tutorial pairs ship with BUILD (expansion), the action that actually works
    // turn one. This asserts the step names that action, not a menu of options.
    const second = steps.find(s => s.id === 'pick-second');
    const build = await page.evaluate(() => window.SILT.theme().actions.build.name);
    expect(second.title + second.body, 'second step must name the themed build action')
      .toContain(build);
  });

  test('never uses the plain-theme action words while ANOD is active', async ({ page }) => {
    await open(page);
    const steps = await tourText(page);
    const all = steps.map(s => `${s.title} ${s.body} ${s.hint}`).join(' ');

    // Bare English action verbs are fine as glosses in parens — "Bangka (ship)" —
    // but must never stand alone as the thing you are told to click.
    for (const word of ['SHIP', 'DREDGE', 'SETTLE', 'SURVEY']) {
      expect(all, `${word} should not appear uppercased`).not.toContain(word);
    }
  });

  test('glosses each Tagalog term on first use', async ({ page }) => {
    await open(page);
    const steps = await tourText(page);
    const all = steps.map(s => `${s.title} ${s.body}`).join(' ');
    // A foreigner has to be able to decode it: the first time an action appears
    // it carries its English gloss in parens. Only actions the script actually
    // teaches — survey is no longer mentioned, since the guided round is ship
    // plus dredge and listing the others taught nothing.
    for (const [k, en] of [['ship', 'ship'], ['dredge', 'dredge']]) {
      const name = await page.evaluate(
        (kk) => window.SILT.theme().actions[kk].name, k);
      expect(all, `${name} needs a gloss somewhere`).toContain(`${name} (${en})`);
    }
  });

  test('falls back to plain English on the SILT theme', async ({ page }) => {
    await open(page);
    await page.locator('[data-theme="silt"]').click();
    const steps = await tourText(page);
    const ship = steps.find(s => s.id === 'pick-ship');
    // No empty parens or doubled words like "Ship (ship)" on the plain theme.
    expect(ship.body).not.toMatch(/\((\s*)\)/);
    expect(ship.body.toLowerCase()).not.toContain('ship (ship)');
  });
});

// The rulebook was ten pages of prose describing a board the reader could not
// see. Diagrams draw with the SAME channel curves and water textures as the real
// board, so what the book shows cannot drift from what you play.
test.describe('rulebook diagrams', () => {
  const openTo = async (page, i) => {
    await page.locator('#btnRulesMenu').click();
    await page.evaluate((n) => window.SILT.openBook(n), i);
  };

  test('the water page illustrates depth, silting and chokepoints', async ({ page }) => {
    await open(page);
    await openTo(page, 3);
    await expect(page.locator('.bookBody .fig')).toHaveCount(3);
  });

  test('the tolls page shows a claimed channel', async ({ page }) => {
    await open(page);
    await openTo(page, 4);
    await expect(page.locator('.bookBody .fig')).toHaveCount(1);
  });

  test('every depth state is drawn with its own texture', async ({ page }) => {
    await open(page);
    await openTo(page, 3);
    // Four patterns, one per depth — if a diagram reused an id, the second figure
    // on the page would silently steal the first one's fill.
    for (const d of [0, 1, 2, 3]) {
      await expect(page.locator(`.bookBody pattern[id$="t${d}"]`).first()).toBeAttached();
    }
  });

  test('figures carry captions rather than floating unexplained', async ({ page }) => {
    await open(page);
    await openTo(page, 3);
    const caps = await page.locator('.bookBody .fig figcaption').allTextContents();
    expect(caps.length).toBe(3);
    for (const c of caps) expect(c.trim().length).toBeGreaterThan(10);
  });

  test('diagram textures actually load', async ({ page }) => {
    const bad = [];
    page.on('response', r => {
      if (/water-|land-/.test(r.url()) && r.status() >= 400) bad.push(r.url().split('/').pop());
    });
    await open(page);
    await openTo(page, 3);
    await page.waitForTimeout(400);
    expect(bad, `missing textures: ${bad.join(', ')}`).toEqual([]);
  });

  test('diagrams follow the active theme', async ({ page }) => {
    await open(page);
    // This suite opens on ANOD, so set the theme explicitly rather than assuming.
    await page.evaluate(() => window.SILT.setTheme('silt'));
    await openTo(page, 3);
    const en = await page.locator('.bookBody .fig figcaption').first().textContent();
    expect(en).toMatch(/depth|Depth/);
    await page.locator('#bkClose').click();
    await page.evaluate(() => window.SILT.setTheme('anod'));
    await openTo(page, 3);
    const tl = await page.locator('.bookBody .fig figcaption').first().textContent();
    expect(tl, 'the caption should change with the theme').not.toBe(en);
    expect(tl).toContain('lalim');
  });
});
