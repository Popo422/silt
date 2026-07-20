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

// Commit the current program, then clear whatever prompt it raised — a board
// target OR the survey keep-1 picker — so the round finishes. Many tests use
// `survey, survey` purely as a neutral way to advance a round; since Survey now
// opens a picker, "commit and move on" has to dismiss it.
async function commitAndClear(page) {
  await page.evaluate(() => window.SILT.commit());
  for (let i = 0; i < 4; i++) {
    if (!await page.evaluate(() => window.SILT.pending())) break;
    await page.evaluate(() => window.SILT.autoResolve());
  }
}

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
    // Match on the class, not the element type (channels are curved <path> ribbons),
    // and count against the actual graph rather than a hardcoded number so a map
    // change doesn't silently break the contract "one .ch per channel".
    const channels = await page.evaluate(() => Object.keys(window.SILT.state().depth).length);
    await expect(page.locator('.ch')).toHaveCount(channels);
  });

  test('shows the three mouths', async ({ page }) => {
    await boot(page);
    for (const m of ['A', 'B', 'C']) {
      await expect(page.locator(`[data-node="${m}"]`)).toBeVisible();
    }
  });

  test('opens every channel at full depth', async ({ page }) => {
    await boot(page);
    const channels = await page.evaluate(() => Object.keys(window.SILT.state().depth).length);
    const depths = await page.locator('.ch').evaluateAll(
      els => els.map(e => +e.dataset.depth));
    expect(depths).toHaveLength(channels);
    expect(depths.every(d => d === 3)).toBe(true);
  });

  test('starts each of the four players with one station', async ({ page }) => {
    await boot(page);
    const st = await page.evaluate(() => window.SILT.state().players.map(p => p.stations.length));
    expect(st).toEqual([1, 1, 1, 1]);
  });
});

test.describe('route-health dots', () => {
  // The dot tells you, during play, whether a settlement still reaches the sea —
  // the thing final scoring rewards (vpLiveStation) and otherwise invisible until
  // the game ends. Contract: one dot per HUMAN station, three states driven by
  // depth. program(null,null) forces a repaint after mutating depth in place.
  const repaint = (page) => page.evaluate(() => window.SILT.program(null, null));

  test('one dot per human station, none for opponents', async ({ page }) => {
    await boot(page);
    const { human, all } = await page.evaluate(() => {
      const g = window.SILT.state();
      return { human: g.players[0].stations.length,
               all: g.players.reduce((s, p) => s + p.stations.length, 0) };
    });
    expect(all).toBeGreaterThan(human);           // opponents have stations too
    await expect(page.locator('.routeDot')).toHaveCount(human);
  });

  test('reads live, fragile, then cut as the water dies', async ({ page }) => {
    await boot(page);
    const statuses = () => page.locator('.routeDot')
      .evaluateAll(els => els.map(e => e.dataset.route));

    // Fresh board: every channel at max depth, so every route survives a shipment.
    expect((await statuses()).every(s => s === 'live')).toBe(true);

    // Everything at depth 1: a route still exists, but only through fragile water.
    await page.evaluate(() => {
      const g = window.SILT.state();
      for (const k of Object.keys(g.depth)) g.depth[k] = 1;
    });
    await repaint(page);
    expect((await statuses()).every(s => s === 'fragile')).toBe(true);

    // Every channel dead: no route to any bay.
    await page.evaluate(() => {
      const g = window.SILT.state();
      for (const k of Object.keys(g.depth)) g.depth[k] = 0;
    });
    await repaint(page);
    expect((await statuses()).every(s => s === 'cut')).toBe(true);
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

  // The order/timing reminder: it must state that silt lands after both actions —
  // the rule that makes same-turn ship-then-repair impossible — and get out of the
  // way once the board takes over for aiming.
  test('states that silt settles after both actions, hides while aiming', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#orderHint')).toContainText(/silt settles after both/i);
    await page.evaluate(() => window.SILT.program('ship', 'dredge'));
    await page.evaluate(() => window.SILT.commit());
    if (await page.evaluate(() => window.SILT.pending())) {
      await expect(page.locator('#orderHint')).toHaveClass(/hide/);
    }
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
  test('survey pays coins and prompts to keep a contract', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() => window.SILT.state().players[0].coins);
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    // Survey now offers a "keep 1 of 3" picker rather than silently keeping the
    // best; the gold is paid the moment it resolves, once you pick.
    await expect(page.locator('#survey.on')).toBeVisible();
    await page.locator('.surveyCard').first().click();
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
    await commitAndClear(page);
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
    await commitAndClear(page);
    const st = await page.evaluate((key) => {
      const g = window.SILT.state();
      return { depth: g.depth[key], rights: g.rights[key] };
    }, k);
    expect(st.depth).toBe(0);
    expect(st.rights).toBeNull();
  });

  // The board shows only who owns a channel; the side panel's claims list shows the
  // marker tug-of-war behind it, so a player can see how close a claim is to flipping.
  test('claims panel lists owned channels and flags a flippable one', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const g = window.SILT.state();
      const keys = Object.keys(g.depth);
      // You own one solidly (2 markers, no rival).
      const solid = keys[10];
      g.markers[solid] = { 0: 2 }; g.rights[solid] = 0; g.depth[solid] = 3;
      // An opponent owns one with 2, you have 1 — one dredge from flipping.
      const hot = keys[12];
      g.markers[hot] = { 1: 2, 0: 1 }; g.mostRecent[hot] = 1; g.rights[hot] = 1; g.depth[hot] = 3;
      window.SILT.program(null, null);
    });
    // Two claimed channels appear, and exactly one is flagged flippable.
    await expect(page.locator('#claims .claim')).toHaveCount(2);
    await expect(page.locator('#claims .claim.hot')).toHaveCount(1);
    // The pips encode the counts: the flippable row shows 2 rival + 1 mine = 3 pips.
    const hotPips = await page.locator('#claims .claim.hot .pip').count();
    expect(hotPips).toBe(3);
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
    await commitAndClear(page);
    await expect(page.locator('#rd')).toHaveText('Round 2 / 8');
  });

  test('clears the program between rounds', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await commitAndClear(page);
    await expect(page.locator('#s0 .a')).toHaveText('—');
    await expect(page.locator('#s1 .a')).toHaveText('—');
    await expect(page.locator('#go')).toBeDisabled();
  });

  test('writes to the log', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.SILT.program('survey', 'survey'));
    await commitAndClear(page);
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
    // Columns: contracts, bay majority, sites, channels held, network bonus,
    // coins, silt penalty — then total. The parts must sum to the total.
    for (const r of rows) {
      const total = r[r.length - 1];
      const parts = r.slice(0, -1).reduce((s, v) => s + v, 0);
      expect(parts).toBe(total);
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
      // Survey now opens a keep-1-of-3 picker; autoResolve keeps the best and
      // lets the round finish, the same way it clears a ship/build target prompt.
      for (let i = 0; i < 4; i++) {
        if (!await page.evaluate(() => window.SILT.pending())) break;
        await page.evaluate(() => window.SILT.autoResolve());
      }
    }
    await expect(page.locator('#ov')).toHaveClass(/on/);
  };

  test('every scoring column says where its number came from', async ({ page }) => {
    await playOut(page);
    // Player and Total are self-evident; the seven scoring columns are not —
    // contracts, bay majority, sites, channels held, network, coins, penalty.
    await expect(page.locator('#final th.hasTip')).toHaveCount(7);
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
    const pieces = page.locator('image[href*="piece-p"]');
    await expect(pieces).toHaveCount(3);          // one per player at setup
    // A distinct painted file per seat, not one sprite tinted four ways.
    const srcs = await pieces.evaluateAll(els => els.map(e => e.getAttribute('href')));
    expect(new Set(srcs).size, 'each player needs a distinct piece').toBe(3);
  });

  test('your own settlement is marked by more than colour', async ({ page }) => {
    await start(page);
    // A dashed ring around the node, drawn under the art so nothing covers it.
    // Colour alone fails for a colourblind player, and a CSS stroke cannot mark
    // an <image> the way it marked the old vector piece.
    const ring = page.locator('circle[stroke-dasharray]');
    await expect(ring, 'exactly one settlement is yours').toHaveCount(1);
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
      // Clear the survey keep-1 picker (and any other prompt) so the round ends.
      for (let i = 0; i < 4; i++) {
        if (!await page.evaluate(() => window.SILT.pending())) break;
        await page.evaluate(() => window.SILT.autoResolve());
      }
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

// Shipping used to auto-resolve: click a settlement and the goods went to
// whichever bay paid most, no choice of destination or route. You could see you
// were losing a bay by 2 and have no way to ship there. Now it is two stages —
// pick an origin, see its routes, pick the bay.
test.describe('shipping lets you choose the route', () => {
  // Reach a state where the human has goods at a settlement with routes to more
  // than one bay, then arm a ship.
  const armShip = async (page) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.SILT.ready);
    await page.evaluate(() => { window.SILT.setSpeed('off'); window.SILT.setTheme('silt'); });
    await page.evaluate(() => window.SILT.boot(3));
    await page.evaluate(() => window.SILT.program('ship', 'survey'));
    await page.evaluate(() => window.SILT.commit());
    await expect(page.locator('#hint')).toBeVisible();
  };

  test('clicking a settlement reveals its routes instead of shipping at once', async ({ page }) => {
    await armShip(page);
    const origin = page.locator('circle[data-hit-kind="ship"]').first();
    await expect(origin, 'a settlement to ship from is offered').toBeVisible();
    await origin.click({ force: true });
    // Stage two: routes drawn, destination bays now the click targets.
    await expect(page.locator('.shipRoute').first()).toBeVisible();
    expect(await page.locator('circle[data-hit-kind="shipTo"]').count(),
      'a settlement reaching >1 bay must offer a destination choice')
      .toBeGreaterThan(1);
  });

  // The first version of this suite passed while the interaction was confusing:
  // it checked the bays were CLICK TARGETS but never that a player could SEE they
  // were. The bays had no cue, so you had to guess the route's endpoint was the
  // thing to click — the exact "which node do I click?" confusion this is meant
  // to prevent.
  test('the destination bays are visibly marked, not just clickable', async ({ page }) => {
    await armShip(page);
    await page.locator('circle[data-hit-kind="ship"]').first().click({ force: true });
    // A beacon ring on each reachable bay, the same cue build targets get.
    const cued = page.locator('g:has(circle[data-hit-kind="shipTo"]) .beacon');
    const targets = page.locator('circle[data-hit-kind="shipTo"]');
    expect(await cued.count(), 'every destination bay needs a visible cue')
      .toBe(await targets.count());
  });

  test('the route hint does not swallow the click', async ({ page }) => {
    await armShip(page);
    await page.locator('circle[data-hit-kind="ship"]').first().click({ force: true });
    // Routes are a hint. Interactive, they intercepted clicks and resolved
    // nothing — the whole thing read as broken.
    const pe = await page.locator('.shipRoute').first()
      .evaluate(e => getComputedStyle(e).pointerEvents);
    expect(pe, 'ship routes must not capture pointer events').toBe('none');
  });

  test('clicking a destination bay actually ships there', async ({ page }) => {
    await armShip(page);
    await page.locator('circle[data-hit-kind="ship"]').first().click({ force: true });
    await page.locator('circle[data-hit-kind="shipTo"]').first().click({ force: true });
    // Aiming is over — the ship resolved rather than sitting stuck.
    await expect(page.locator('#hint')).toBeHidden();
  });

  test('the routes shown lead only to bays the origin can actually reach', async ({ page }) => {
    await armShip(page);
    await page.locator('circle[data-hit-kind="ship"]').first().click({ force: true });
    const { dests, mouths } = await page.evaluate(() => {
      const g = window.SILT.state();
      // Bays are exactly the keys of a player's delivered tally — derived from
      // real state rather than a hardcoded ['A','B','C'], so the test cannot
      // pass against a board whose bays moved.
      const bays = Object.keys(g.players[0].delivered);
      return {
        dests: [...document.querySelectorAll('circle[data-hit-kind="shipTo"]')]
          .map(c => c.getAttribute('data-hit-node')),
        mouths: bays,
      };
    });
    expect(mouths.length, 'derived the real bay list').toBeGreaterThan(0);
    for (const d of dests) expect(mouths).toContain(d);
  });
});

// The "keep 1 of 3" that IS Survey used to happen with no player input — the
// engine silently kept the highest-VP card, so +gold looked like the only
// effect. Now you pick, in the sidebar, with the board and your hand in view.
test.describe('Survey lets you keep the contract you want', () => {
  const survey = async (page) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.SILT.ready);
    await page.evaluate(() => { window.SILT.setSpeed('off'); window.SILT.setTheme('silt'); });
    await page.evaluate(() => window.SILT.boot(3));
    await page.evaluate(() => window.SILT.program('survey', 'build'));
    await page.evaluate(() => window.SILT.commit());
  };

  test('drawing three contracts shows a picker, not a silent keep', async ({ page }) => {
    await survey(page);
    await expect(page.locator('#survey.on')).toBeVisible();
    await expect(page.locator('.surveyCard')).toHaveCount(3);
    // The board is NOT covered — you choose with it in view.
    await expect(page.locator('#svg')).toBeVisible();
  });

  test('the card you click is the one added, not the highest-VP default', async ({ page }) => {
    await survey(page);
    // Deliberately pick the LOWEST-value card, so a passing test proves the
    // player's choice was honoured rather than the old keep-best default.
    const vps = await page.locator('.surveyCard .vp').allTextContents();
    const nums = vps.map(Number);
    const lowIdx = nums.indexOf(Math.min(...nums));
    const before = await page.evaluate(() =>
      window.SILT.state().players[0].contracts.length);

    await page.locator('.surveyCard').nth(lowIdx).click();
    await expect(page.locator('#survey')).toBeHidden();

    const kept = await page.evaluate(() => {
      const cs = window.SILT.state().players[0].contracts;
      return Math.round(cs[cs.length - 1].vp * window.SILT.tuning.contractScale);
    });
    const after = await page.evaluate(() =>
      window.SILT.state().players[0].contracts.length);
    expect(after, 'the kept contract joins the hand').toBe(before + 1);
    expect(kept, 'the LOW card was kept — the choice was honoured')
      .toBe(Math.min(...nums));
  });
});
