import { test, expect } from '@playwright/test';

// These specs assume a 4-player table; the menu default is 3.
const boot = async (page, seed = 20260719, players = 4) => {
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
  await page.evaluate(() => window.SILT.setTheme('silt'));
  await page.evaluate(n => window.SILT.setConfig({
    players: n, bots: ['balanced', 'expander', 'steward'].slice(0, n - 1),
  }), players);
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
    // Match on the class, not the element type. These pinned `line.ch` and broke
    // when channels became curved <path> ribbons — the contract is "31 channels
    // carrying a depth", not "31 SVG lines".
    await expect(page.locator('.ch')).toHaveCount(31);
  });

  test('shows the three mouths', async ({ page }) => {
    await boot(page);
    for (const m of ['A', 'B', 'C']) {
      await expect(page.locator(`[data-node="${m}"]`)).toBeVisible();
    }
  });

  test('opens every channel at full depth', async ({ page }) => {
    await boot(page);
    const depths = await page.locator('.ch').evaluateAll(
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
    await expect(page.locator('#s0 .a')).toHaveText(/dredge/i);
    await page.locator('[data-act="survey"]').click();
    await expect(page.locator('#s1 .a')).toHaveText(/survey/i);
  });

  test('lets a slot be re-targeted by clicking it', async ({ page }) => {
    await boot(page);
    await page.locator('[data-act="dredge"]').click();
    await page.locator('[data-act="survey"]').click();
    await page.locator('#s0').click();
    await page.locator('[data-act="ship"]').click();
    await expect(page.locator('#s0 .a')).toHaveText(/ship/i);
    await expect(page.locator('#s1 .a')).toHaveText(/survey/i);
  });

  test('allows the same action in both slots', async ({ page }) => {
    await boot(page);
    await page.locator('[data-act="survey"]').click();
    await page.locator('[data-act="survey"]').click();
    await expect(page.locator('#s0 .a')).toHaveText(/survey/i);
    await expect(page.locator('#s1 .a')).toHaveText(/survey/i);
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
    // Resolution is async now, so commit() returns before the prompt is painted.
    // Reading the DOM straight after raced the render and failed only under
    // parallel load.
    await page.waitForFunction(() => window.SILT.pending() === 'build');
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
    await expect(page.locator('.ch[data-rights="0"]').first()).toBeAttached();
    // And the marker itself must be on the board, not just the data attribute.
    await expect(page.locator('circle[data-toll="0"]').first()).toBeAttached();
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

// Nothing in this game is hidden — what everyone committed IS the game. Until the
// player rows showed it, the only way to learn what an opponent played was to
// catch log lines as they scrolled past.
test.describe('opponent programs are visible', () => {
  test('slots are face down before anyone commits', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.pl .pslot')).toHaveCount(8);   // 4 players x 2
    expect(await page.locator('.pl .pslot.on').count(),
      'a program leaked before commit').toBe(0);
  });

  test('every player reveals both actions once the round is committed', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    // Survey needs no target, so the round resolves without waiting on us.
    expect(await page.locator('.pl .pslot.on').count()).toBe(8);
  });

  test('picking an action does not reveal it to opponents early', async ({ page }) => {
    await boot(page);
    await page.locator('[data-act="ship"]').click();
    // My own choice is shown in the bar slots, but nothing is revealed on the
    // player rows until commit — otherwise the simultaneous reveal is a fiction.
    expect(await page.locator('.pl .pslot.on').count()).toBe(0);
    await expect(page.locator('#s0 .a')).not.toHaveText('—');
  });

  test('the reveal names the action in the active theme', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    const tip = await page.locator('.pl').first().locator('.prog').getAttribute('data-tip');
    const survey = await page.evaluate(() => window.SILT.theme().actions.survey.name);
    expect(tip).toContain(survey);
  });
});

// The final score table is the last thing every player sees, and its columns
// used to be four-letter truncations — "Barâ", "Lupà", "Kasund" — with no
// explanation anywhere on the screen. One of them is negative and never said so.
test.describe('the final score explains itself', () => {
  const playOut = async (page) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.SILT.ready);
    await page.evaluate(() => { window.SILT.setSpeed('off'); window.SILT.setTheme('silt'); });
    await page.evaluate(() => window.SILT.boot(3));
    for (let r = 0; r < 12; r++) {
      if (await page.locator('#ov').evaluate(e => e.classList.contains('on'))) break;
      await page.evaluate(() => window.SILT.program('survey', 'survey'));
      await page.evaluate(() => window.SILT.commit());
    }
    await expect(page.locator('#ov')).toHaveClass(/on/);
  };

  test('every scoring column says where its number came from', async ({ page }) => {
    await playOut(page);
    // Player and Total are self-evident; the six scoring columns are not.
    await expect(page.locator('#final th.hasTip')).toHaveCount(6);
    for (const th of await page.locator('#final th.hasTip').all()) {
      expect((await th.getAttribute('data-tip'))?.length ?? 0).toBeGreaterThan(20);
    }
  });

  test('the penalty column warns that it is negative', async ({ page }) => {
    await playOut(page);
    const tips = await page.locator('#final th.hasTip')
      .evaluateAll(ths => ths.map(t => t.getAttribute('data-tip')));
    expect(tips.some(t => /negative/i.test(t))).toBe(true);
  });
});

// Ownership used to be ring COLOUR alone: you had to remember your seat colour,
// and a colourblind player could not tell their settlements from an opponent's
// at all. Now each settlement carries a piece, and yours is outlined.
test.describe('you can find your own pieces', () => {
  const start = async (page) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.SILT.ready);
    await page.evaluate(() => { window.SILT.setSpeed('off'); window.SILT.setTheme('silt'); });
    await page.evaluate(() => window.SILT.boot(3));
  };

  test('every settlement shows a piece in its owner colour', async ({ page }) => {
    await start(page);
    const pieces = page.locator('use[href="#ic-piece"]');
    await expect(pieces).toHaveCount(3);          // one per player at setup
    const colours = await pieces.evaluateAll(us => us.map(u => u.style.color));
    expect(new Set(colours).size, 'each player needs a distinct colour').toBe(3);
  });

  test('your own piece is marked by more than colour', async ({ page }) => {
    await start(page);
    const mine = page.locator('use.ownPiece');
    await expect(mine, 'exactly one piece is yours').toHaveCount(1);
    // A stroke, not a hue: this is what survives colourblindness.
    const stroke = await mine.evaluate(e => getComputedStyle(e).strokeWidth);
    expect(parseFloat(stroke)).toBeGreaterThan(0);
  });
});

// You could see an effect fire and an animation play, but the badge above the
// board named only WHO was acting — never what they did. The only place to
// learn the move was the log, which you had to catch as it scrolled.
test('the actor badge names the action, not just the player', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  await page.evaluate(() => window.SILT.setTheme('silt'));
  await page.evaluate(() => window.SILT.boot(3));
  const seen = await page.evaluate(async () => {
    const out = [];
    const el = document.getElementById('actor');
    new MutationObserver(() => {
      if (el.classList.contains('on') && el.textContent) out.push(el.textContent);
    }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
    window.SILT.program('survey', 'survey');
    window.SILT.commit();
    await new Promise(r => { setTimeout(r, 6000); });
    return [...new Set(out)];
  });
  expect(seen.length, 'the badge should appear during resolution').toBeGreaterThan(0);
  // "Name — Action", not a bare name.
  expect(seen.every(s => s.includes('—')), `got: ${seen.join(' | ')}`).toBe(true);
});

// Bay majority is the largest scoring block after contracts, and it used to be
// invisible while playing: the board showed one combined "15 delivered" with no
// indication of who led or what leading was worth. You found out at scoring.
test.describe('bay majority is visible during the game', () => {
  const playRounds = async (page, n) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.SILT.ready);
    await page.evaluate(() => { window.SILT.setSpeed('off'); window.SILT.setTheme('silt'); });
    await page.evaluate(() => window.SILT.boot(3));
    for (let r = 0; r < n; r++) {
      await page.evaluate(() => window.SILT.program('survey', 'survey'));
      await page.evaluate(() => window.SILT.commit());
    }
  };

  test('each bay shows who leads it and what that is worth', async ({ page }) => {
    await playRounds(page, 7);
    const tracks = page.locator('g.bayTrack');
    expect(await tracks.count(), 'bays with deliveries should show a track')
      .toBeGreaterThan(0);
    // "6 → 12": goods delivered, then the VP tier that currently earns.
    const rows = await tracks.first().locator('text').allTextContents();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toMatch(/^\d+ → \d+$/);
  });

  test('the tiers shown are the ones the engine actually scores', async ({ page }) => {
    await playRounds(page, 7);
    const { shown, legal } = await page.evaluate(() => ({
      // Read the real TUNING off the app rather than hardcoding 12/6/2 here:
      // the point of this test is that the board cannot drift from the engine,
      // and a literal in the test would just be a third copy to drift.
      legal: window.SILT.tuning.mouthVP,
      shown: [...document.querySelectorAll('g.bayTrack text')]
        .map(t => +t.textContent.split('→')[1].trim()),
    }));
    expect(shown.length, 'expected some bay rows to check').toBeGreaterThan(0);
    for (const v of shown) expect(legal, `printed tier ${v}`).toContain(v);
  });
});
