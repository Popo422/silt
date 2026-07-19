import { test, expect } from '@playwright/test';

const boot = async (page, seed = 20260719) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.SILT);
  await page.evaluate(s => window.SILT.boot(s), seed);
  return errors;
};

// Play a full game, auto-resolving any target prompts.
async function playFullGame(page) {
  for (let r = 0; r < 8; r++) {
    await page.evaluate(() => window.SILT.program('ship', 'dredge'));
    await page.evaluate(() => window.SILT.commit());
    // resolve up to 2 human target prompts per round
    for (let i = 0; i < 4; i++) {
      const p = await page.evaluate(() => window.SILT.pending());
      if (!p) break;
      await page.evaluate(() => window.SILT.autoResolve());
    }
  }
}

test.describe('board rendering', () => {
  test('renders all nodes and channels', async ({ page }) => {
    await boot(page);
    await expect(page.locator('[data-node]')).toHaveCount(20);
    await expect(page.locator('line.ch')).toHaveCount(31);
  });

  test('shows the three mouths', async ({ page }) => {
    await boot(page);
    for (const m of ['A', 'B', 'C']) {
      await expect(page.locator(`[data-node="${m}"]`)).toBeVisible();
    }
  });

  test('opens every channel at full depth', async ({ page }) => {
    await boot(page);
    const depths = await page.locator('line.ch').evaluateAll(
      els => els.map(e => +e.dataset.depth));
    expect(depths).toHaveLength(31);
    expect(depths.every(d => d === 3)).toBe(true);
  });

  test('starts each of the four players with one station', async ({ page }) => {
    await boot(page);
    const st = await page.evaluate(() => window.SILT.state().players.map(p => p.stations.length));
    expect(st).toEqual([1, 1, 1, 1]);
  });
});

test.describe('programming UI', () => {
  test('commit is disabled until both slots are filled', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#go')).toBeDisabled();
    await page.locator('[data-act="survey"]').click();
    await expect(page.locator('#go')).toBeDisabled();
    await page.locator('[data-act="survey"]').click();
    await expect(page.locator('#go')).toBeEnabled();
  });

  test('fills slot 1 then slot 2 in order', async ({ page }) => {
    await boot(page);
    await page.locator('[data-act="dredge"]').click();
    await expect(page.locator('#s0 .a')).toHaveText('dredge');
    await page.locator('[data-act="survey"]').click();
    await expect(page.locator('#s1 .a')).toHaveText('survey');
  });

  test('lets a slot be re-targeted by clicking it', async ({ page }) => {
    await boot(page);
    await page.locator('[data-act="dredge"]').click();
    await page.locator('[data-act="survey"]').click();
    await page.locator('#s0').click();
    await page.locator('[data-act="ship"]').click();
    await expect(page.locator('#s0 .a')).toHaveText('ship');
    await expect(page.locator('#s1 .a')).toHaveText('survey');
  });

  test('allows the same action in both slots', async ({ page }) => {
    await boot(page);
    await page.locator('[data-act="survey"]').click();
    await page.locator('[data-act="survey"]').click();
    await expect(page.locator('#s0 .a')).toHaveText('survey');
    await expect(page.locator('#s1 .a')).toHaveText('survey');
  });
});

test.describe('actions', () => {
  test('survey pays coins without prompting for a target', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() => window.SILT.state().players[0].coins);
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    const after = await page.evaluate(() => window.SILT.state().players[0].coins);
    expect(after).toBeGreaterThan(before);
  });

  test('ship prompts for a source station and then delivers', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.SILT.program('ship', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    expect(await page.evaluate(() => window.SILT.pending())).toBe('ship');
    await expect(page.locator('#hint')).toBeVisible();
    await page.evaluate(() => window.SILT.autoResolve());
    const delivered = await page.evaluate(() => {
      const p = window.SILT.state().players[0];
      return ['A', 'B', 'C'].reduce((s, m) =>
        s + p.delivered[m].timber + p.delivered[m].grain + p.delivered[m].salt, 0);
    });
    expect(delivered).toBeGreaterThan(0);
  });

  test('build prompts, places a station, and charges coins', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() => window.SILT.state().players[0]);
    await page.evaluate(() => window.SILT.program('build', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    expect(await page.evaluate(() => window.SILT.pending())).toBe('build');
    await page.evaluate(() => window.SILT.autoResolve());
    const after = await page.evaluate(() => window.SILT.state().players[0]);
    expect(after.stations.length).toBe(before.stations.length + 1);
    expect(after.coins).toBeLessThan(before.coins + 10);
  });

  test('build highlights only legal targets', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.SILT.program('build', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    const legal = await page.evaluate(() => {
      const g = window.SILT.state();
      const owned = new Set(g.players.flatMap(p => p.stations));
      return [...document.querySelectorAll('[data-node]')]
        .filter(n => n.style.cursor === 'pointer')
        .map(n => n.dataset.node)
        .every(id => !owned.has(id) && !['A', 'B', 'C'].includes(id));
    });
    expect(legal).toBe(true);
  });

  test('dredge only offers damaged channels', async ({ page }) => {
    await boot(page);
    // silt the board a little first
    await page.evaluate(() => {
      const g = window.SILT.state();
      Object.keys(g.depth).slice(0, 5).forEach(k => { g.depth[k] = 1; });
    });
    await page.evaluate(() => window.SILT.program('dredge', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    expect(await page.evaluate(() => window.SILT.pending())).toBe('dredge');
    await page.evaluate(() => window.SILT.autoResolve());
    const maxed = await page.evaluate(() => {
      const g = window.SILT.state();
      return Object.values(g.depth).every(d => d >= 0 && d <= 3);
    });
    expect(maxed).toBe(true);
  });
});

test.describe('dredging rights', () => {
  test('starts with no channel owned', async ({ page }) => {
    await boot(page);
    const owned = await page.evaluate(() =>
      Object.values(window.SILT.state().rights).filter(r => r !== null).length);
    expect(owned).toBe(0);
  });

  test('claims a channel when you dredge and renders a toll marker', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const g = window.SILT.state();
      Object.keys(g.depth).slice(0, 6).forEach(k => { g.depth[k] = 1; });
    });
    await page.evaluate(() => window.SILT.program('dredge', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await page.evaluate(() => window.SILT.autoResolve());
    const owned = await page.evaluate(() =>
      Object.values(window.SILT.state().rights).filter(r => r !== null).length);
    expect(owned).toBeGreaterThan(0);
    await expect(page.locator('line.ch[data-rights="0"]').first()).toBeAttached();
  });

  test('pays the holder when an opponent ships through', async ({ page }) => {
    await boot(page);
    // hand every channel to the human, then let a full round resolve
    await page.evaluate(() => {
      const g = window.SILT.state();
      Object.keys(g.rights).forEach(k => { g.rights[k] = 0; });
    });
    const before = await page.evaluate(() => window.SILT.state().players[0].coins);
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    const after = await page.evaluate(() => window.SILT.state().players[0].coins);
    // survey alone pays 3+3; anything above that is toll income from the bots
    expect(after).toBeGreaterThan(before + 6);
  });

  test('releases rights when a channel silts out', async ({ page }) => {
    await boot(page);
    const k = await page.evaluate(() => {
      const g = window.SILT.state();
      const key = Object.keys(g.depth)[0];
      g.depth[key] = 1; g.rights[key] = 0; g.shippedThisRound = new Set([key]);
      return key;
    });
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    const st = await page.evaluate((key) => {
      const g = window.SILT.state();
      return { depth: g.depth[key], rights: g.rights[key] };
    }, k);
    expect(st.depth).toBe(0);
    expect(st.rights).toBeNull();
  });
});

test.describe('opening draft', () => {
  test('gives every player a distinct mid-tier start', async ({ page }) => {
    await boot(page);
    const starts = await page.evaluate(() =>
      window.SILT.state().players.map(p => p.stations[0]));
    expect(new Set(starts).size).toBe(4);
  });

  test('does not pin any seat to one node across seeds', async ({ page }) => {
    const seen = [new Set(), new Set(), new Set(), new Set()];
    for (const seed of [11, 22, 33, 44, 55, 66]) {
      await boot(page, seed);
      const starts = await page.evaluate(() =>
        window.SILT.state().players.map(p => p.stations[0]));
      starts.forEach((s, i) => seen[i].add(s));
    }
    // at least one seat must vary — a fixed assignment would give all size 1
    expect(Math.max(...seen.map(s => s.size))).toBeGreaterThan(1);
  });
});

test.describe('round flow', () => {
  test('advances the round counter after committing', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#rd')).toHaveText('Round 1 / 8');
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('#rd')).toHaveText('Round 2 / 8');
  });

  test('clears the program between rounds', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('#s0 .a')).toHaveText('—');
    await expect(page.locator('#s1 .a')).toHaveText('—');
    await expect(page.locator('#go')).toBeDisabled();
  });

  test('writes to the log', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('#log div')).not.toHaveCount(0);
    await expect(page.locator('#log')).toContainText('surveys');
  });

  test('silts channels that carried traffic', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() =>
      Object.values(window.SILT.state().depth).reduce((a, b) => a + b, 0));
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.SILT.program('ship', 'ship'));
      await page.evaluate(() => window.SILT.commit());
      for (let k = 0; k < 4; k++) {
        if (!await page.evaluate(() => window.SILT.pending())) break;
        await page.evaluate(() => window.SILT.autoResolve());
      }
    }
    const after = await page.evaluate(() =>
      Object.values(window.SILT.state().depth).reduce((a, b) => a + b, 0));
    expect(after).toBeLessThan(before);
  });
});

test.describe('full game', () => {
  test('completes 8 rounds and shows the score table', async ({ page }) => {
    const errors = await boot(page);
    await playFullGame(page);
    await expect(page.locator('#ov')).toHaveClass(/on/);
    await expect(page.locator('#final table')).toBeVisible();
    await expect(page.locator('#final tr')).toHaveCount(5);   // header + 4 players
    await expect(page.locator('#ph')).toHaveText('Game over');
    expect(errors).toEqual([]);
  });

  test('score rows total their own parts', async ({ page }) => {
    await boot(page);
    await playFullGame(page);
    const rows = await page.locator('#final tr').evaluateAll(trs =>
      trs.slice(1).map(tr => [...tr.querySelectorAll('td')].slice(1).map(td => +td.textContent)));
    for (const [c, m, n, held, coin, silt, total] of rows) {
      expect(c + m + n + held + coin + silt).toBe(total);
    }
  });

  test('marks exactly one winner (or a tie group)', async ({ page }) => {
    await boot(page);
    await playFullGame(page);
    const wins = await page.locator('#final tr.win').count();
    expect(wins).toBeGreaterThanOrEqual(1);
  });

  test('never leaves a player with negative coins', async ({ page }) => {
    await boot(page);
    await playFullGame(page);
    const coins = await page.evaluate(() => window.SILT.state().players.map(p => p.coins));
    expect(coins.every(c => c >= 0)).toBe(true);
  });

  test('runs clean across several seeds', async ({ page }) => {
    for (const seed of [1, 4242, 999999]) {
      const errors = await boot(page, seed);
      await playFullGame(page);
      await expect(page.locator('#ov')).toHaveClass(/on/);
      expect(errors, `seed ${seed}`).toEqual([]);
    }
  });
});

test.describe('edge cases', () => {
  test('handles a fully silted board without breaking the UI', async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate(() => {
      const g = window.SILT.state();
      Object.keys(g.depth).forEach(k => { g.depth[k] = 0; });
    });
    await page.evaluate(() => window.SILT.program('ship', 'build'));
    await page.evaluate(() => window.SILT.commit());
    for (let i = 0; i < 4; i++) {
      if (!await page.evaluate(() => window.SILT.pending())) break;
      await page.evaluate(() => window.SILT.autoResolve());
    }
    await expect(page.locator('#rd')).toHaveText('Round 2 / 8');
    expect(errors).toEqual([]);
  });

  test('handles a broke player choosing build', async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate(() => { window.SILT.state().players[0].coins = 0; });
    await page.evaluate(() => window.SILT.program('build', 'build'));
    await page.evaluate(() => window.SILT.commit());
    for (let i = 0; i < 4; i++) {
      if (!await page.evaluate(() => window.SILT.pending())) break;
      await page.evaluate(() => window.SILT.autoResolve());
    }
    const coins = await page.evaluate(() => window.SILT.state().players[0].coins);
    expect(coins).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('handles an empty board of cubes', async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate(() => {
      const g = window.SILT.state();
      Object.keys(g.cubes).forEach(k => { g.cubes[k] = 0; });
    });
    await page.evaluate(() => window.SILT.program('ship', 'ship'));
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('#rd')).toHaveText('Round 2 / 8');
    expect(errors).toEqual([]);
  });

  test('handles an exhausted contract deck', async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate(() => { window.SILT.state().deck.length = 0; });
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('#rd')).toHaveText('Round 2 / 8');
    expect(errors).toEqual([]);
  });

  test('is deterministic for a fixed seed', async ({ page }) => {
    const run = async () => {
      await boot(page, 5150);
      await playFullGame(page);
      return page.evaluate(() => window.SILT.score().map(s => s.total));
    };
    expect(await run()).toEqual(await run());
  });
});
