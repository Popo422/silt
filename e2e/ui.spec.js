import { test, expect } from '@playwright/test';

// Menu, tutorial, assets, responsiveness and interaction edge cases.
// Game-rule coverage lives in game.spec.js.

const open = async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await page.waitForFunction(() => window.SILT?.isReady === true);
  await page.evaluate(() => window.SILT.setTheme('silt'));
  return errors;
};

test.describe('menu', () => {
  test('opens on the menu, not the board', async ({ page }) => {
    await open(page);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#game')).toBeHidden();
  });

  test('defaults to 3 players with 2 opponent rows', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-pc="3"]')).toHaveClass(/on/);
    await expect(page.locator('.botRow')).toHaveCount(2);
  });

  test('adds and removes opponent rows with player count', async ({ page }) => {
    await open(page);
    await page.locator('[data-pc="4"]').click();
    await expect(page.locator('.botRow')).toHaveCount(3);
    await page.locator('[data-pc="2"]').click();
    await expect(page.locator('.botRow')).toHaveCount(1);
  });

  test('offers every bot archetype', async ({ page }) => {
    await open(page);
    const opts = await page.locator('[data-bot="0"] option').allTextContents();
    for (const b of ['balanced', 'tollkeeper', 'steward', 'expander', 'turtle', 'defector']) {
      expect(opts).toContain(b);
    }
  });

  test('updates the description when an opponent changes', async ({ page }) => {
    await open(page);
    await page.locator('[data-bot="0"]').selectOption('turtle');
    await expect(page.locator('[data-desc="0"]')).toContainText('never leaves');
  });

  test('carries the chosen player count into the game', async ({ page }) => {
    await open(page);
    await page.locator('[data-pc="4"]').click();
    await page.locator('#btnPlay').click();
    const n = await page.evaluate(() => window.SILT.state().players.length);
    expect(n).toBe(4);
  });

  test('carries the chosen opponents into the game', async ({ page }) => {
    await open(page);
    await page.locator('[data-bot="0"]').selectOption('defector');
    await page.locator('[data-bot="1"]').selectOption('turtle');
    await page.locator('#btnPlay').click();
    const strats = await page.evaluate(() =>
      window.SILT.state().players.map(p => p.strat));
    expect(strats).toEqual([null, 'defector', 'turtle']);
  });

  test('carries the chosen length into the game', async ({ page }) => {
    await open(page);
    await page.locator('[data-len="5"]').click();
    await page.locator('#btnPlay').click();
    await expect(page.locator('#rd')).toHaveText('Round 1 / 5');
  });

  test('returns to the menu and can start a different game', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await expect(page.locator('#game')).toBeVisible();
    await page.locator('#btnQuit').click();
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('[data-pc="4"]').click();
    await page.locator('#btnPlay').click();
    expect(await page.evaluate(() => window.SILT.state().players.length)).toBe(4);
  });

  test('clears the log between games', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await page.locator('#btnQuit').click();
    await page.locator('#btnPlay').click();
    const lines = await page.locator('#log div').count();
    expect(lines).toBeLessThan(3);   // just the fresh "Round 1 — seed" header
  });
});

test.describe('assets', () => {
  test('loads the sprite sheet', async ({ page }) => {
    await open(page);
    const n = await page.locator('#sprites symbol').count();
    expect(n).toBeGreaterThanOrEqual(12);
  });

  test('every referenced icon exists in the sheet', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    const missing = await page.evaluate(() => {
      const have = new Set([...document.querySelectorAll('#sprites symbol')].map(s => s.id));
      const want = [...document.querySelectorAll('use')]
        .map(u => (u.getAttribute('href') || '').slice(1))
        .filter(Boolean);
      return [...new Set(want)].filter(id => !have.has(id));
    });
    expect(missing).toEqual([]);
  });

  test('renders commodity icons on the board', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    for (const good of ['timber', 'grain', 'salt']) {
      const n = await page.locator(`#svg use[href="#ic-${good}"]`).count();
      expect(n, good).toBeGreaterThan(0);
    }
  });

  test('renders a lighthouse at each mouth', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await expect(page.locator('#svg use[href="#ic-mouth"]')).toHaveCount(3);
  });

  test('renders a dock for every owned station', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    const [docks, stations] = await Promise.all([
      page.locator('#svg use[href="#ic-station"]').count(),
      page.evaluate(() => window.SILT.state().players.reduce((s, p) => s + p.stations.length, 0)),
    ]);
    expect(docks).toBe(stations);
  });
});

test.describe('tutorial', () => {
  test('starts from the guided button and shows step 1', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    await expect(page.locator('#tut')).toBeVisible();
    await expect(page.locator('#tutStep')).toHaveText('Step 1 of 9');
  });

  test('does not appear in a normal game', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await expect(page.locator('#tut')).toBeHidden();
  });

  test('advances through untimed steps with Next', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    await page.locator('#tutNext').click();
    await expect(page.locator('#tutStep')).toHaveText('Step 2 of 9');
    await page.locator('#tutNext').click();
    await expect(page.locator('#tutStep')).toHaveText('Step 3 of 9');
  });

  test('gates on a real action and hides Next while waiting', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    for (let i = 0; i < 3; i++) await page.locator('#tutNext').click();
    await expect(page.locator('#tutStep')).toHaveText('Step 4 of 9');
    await expect(page.locator('#tutNext')).toBeHidden();
    // A gated step tells you what to do and offers an escape hatch.
    await expect(page.locator('#tutWait')).not.toBeEmpty();
    await expect(page.locator('#tutSkipStep')).toBeVisible();
    // The gate is SHIP specifically — a different action must not advance it.
    await page.locator('[data-act="survey"]').click();
    await expect(page.locator('#tutStep')).toHaveText('Step 4 of 9');
  });

  test('advances when the gated action is performed', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    for (let i = 0; i < 3; i++) await page.locator('#tutNext').click();
    await page.locator('[data-act="ship"]').click();
    await expect(page.locator('#tutStep')).toHaveText('Step 5 of 9');
  });

  test('highlights the element it is talking about', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    for (let i = 0; i < 3; i++) await page.locator('#tutNext').click();
    await expect(page.locator('[data-act="ship"]')).toHaveClass(/uiPulse/);
  });

  test('can be skipped at any point', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    await page.locator('#tutSkip').click();
    await expect(page.locator('#tut')).toBeHidden();
    // and the game is still playable afterwards
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('#rd')).toHaveText('Round 2 / 8');
  });

  test('closes itself on the last step', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    for (let i = 0; i < 20; i++) {
      if (!await page.locator('#tut').isVisible()) break;
      const gated = await page.locator('#tutNext').isHidden();
      if (gated) {
        await page.evaluate(() => window.SILT.program('ship', 'survey'));
        await page.evaluate(() => window.SILT.commit());
        for (let k = 0; k < 3; k++) {
          if (!await page.evaluate(() => window.SILT.pending())) break;
          await page.evaluate(() => window.SILT.autoResolve());
        }
      } else {
        await page.locator('#tutNext').click();
      }
    }
    await expect(page.locator('#tut')).toBeHidden();
  });
});

test.describe('board readability', () => {
  test('keeps the whole delta inside the viewport', async ({ page }) => {
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

  test('shows depth on every channel', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    const depths = await page.locator('line.ch').evaluateAll(
      els => els.map(e => e.dataset.depth));
    expect(depths).toHaveLength(31);
    expect(depths.every(d => d !== undefined && d !== '')).toBe(true);
  });

  test('keeps both slot numbers visible once filled', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.locator('[data-act="ship"]').click();
    await page.locator('[data-act="dredge"]').click();
    await expect(page.locator('#s0')).toContainText('SLOT 1');
    await expect(page.locator('#s1')).toContainText('SLOT 2');
  });

  test('survives a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    const errors = await open(page);
    await page.locator('#btnPlay').click();
    await expect(page.locator('#svg')).toBeVisible();
    await expect(page.locator('#acts')).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });

  test('survives a very wide viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors = await open(page);
    await page.locator('#btnPlay').click();
    await expect(page.locator('#svg')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('interaction edge cases', () => {
  test('ignores commit until both slots are filled', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await expect(page.locator('#go')).toBeDisabled();
    await page.locator('#go').click({ force: true });
    await expect(page.locator('#rd')).toHaveText('Round 1 / 8');
  });

  test('disables the action buttons while a target is pending', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.program('ship', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('[data-act="ship"]')).toBeDisabled();
    await expect(page.locator('#go')).toBeDisabled();
  });

  test('shows a hint while waiting for a target', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.program('build', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('#hint')).toBeVisible();
    await expect(page.locator('#hint')).toContainText('build');
  });

  test('ignores a stray resolve when nothing is pending', async ({ page }) => {
    const errors = await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.autoResolve());
    await expect(page.locator('#rd')).toHaveText('Round 1 / 8');
    expect(errors).toEqual([]);
  });

  test('lets a slot be re-picked before commit', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.locator('[data-act="ship"]').click();
    await page.locator('[data-act="survey"]').click();
    await page.locator('#s0').click();
    await page.locator('[data-act="dredge"]').click();
    await expect(page.locator('#s0')).toContainText(/dredge/i);
    await expect(page.locator('#s1')).toContainText(/survey/i);
  });

  test('renders toll markers only for owned live channels', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => {
      const g = window.SILT.state();
      const keys = Object.keys(g.depth);
      g.rights[keys[0]] = 0; g.depth[keys[0]] = 3;   // owned + alive -> marker
      g.rights[keys[1]] = 1; g.depth[keys[1]] = 0;   // owned + dead  -> no marker
    });
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    // re-render without advancing
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    const marks = await page.locator('#svg [data-toll]').count();
    expect(marks).toBeGreaterThanOrEqual(1);
  });

  test('plays a full game from the menu with no console errors', async ({ page }) => {
    const errors = await open(page);
    await page.locator('[data-len="5"]').click();
    await page.locator('#btnPlay').click();
    for (let r = 0; r < 5; r++) {
      await page.evaluate(() => window.SILT.program('ship', 'build'));
      await page.evaluate(() => window.SILT.commit());
      for (let i = 0; i < 4; i++) {
        if (!await page.evaluate(() => window.SILT.pending())) break;
        await page.evaluate(() => window.SILT.autoResolve());
      }
    }
    await expect(page.locator('#ov')).toHaveClass(/on/);
    await expect(page.locator('#final table')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('play again starts a fresh game from the result screen', async ({ page }) => {
    await open(page);
    await page.locator('[data-len="5"]').click();
    await page.locator('#btnPlay').click();
    for (let r = 0; r < 5; r++) {
      await page.evaluate(() => window.SILT.program('survey', 'survey'));
      await page.evaluate(() => window.SILT.commit());
    }
    await expect(page.locator('#ov')).toHaveClass(/on/);
    await page.locator('#btnAgain').click();
    await expect(page.locator('#ov')).not.toHaveClass(/on/);
    await expect(page.locator('#rd')).toHaveText('Round 1 / 5');
  });
});
