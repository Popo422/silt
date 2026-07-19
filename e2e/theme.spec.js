import { test, expect } from '@playwright/test';

// Rulebook, theme layer, and mobile layout.

const open = async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await page.waitForFunction(() => window.SILT?.isReady === true);
  return errors;
};

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
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('#rd')).toContainText('2 / 8');
  });
});

test.describe('theme', () => {
  test('starts on the Filipino theme', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => window.SILT.theme())).toBe('anod');
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
    await page.evaluate(() => window.SILT.commit());
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
