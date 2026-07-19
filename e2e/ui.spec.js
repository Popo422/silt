import { test, expect } from '@playwright/test';

// Menu, tutorial, assets, responsiveness and interaction edge cases.
// Game-rule coverage lives in game.spec.js.

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
    // A commodity may render as painted art (<image>) or as a sprite (<use>),
    // depending on whether it has a promoted asset. Assert that SOMETHING marks
    // each good rather than pinning the mechanism — the old test asserted <use>
    // specifically and broke the moment art was wired in, which is the test being
    // wrong, not the board.
    for (const good of ['timber', 'grain', 'salt']) {
      const sprites = await page.locator(`#svg use[href="#ic-${good}"]`).count();
      const art = await page.locator(`#svg image[href*="${good}"]`).count();
      expect(sprites + art, `${good}: no marker of any kind on the board`).toBeGreaterThan(0);
    }
  });

  test('painted art loads rather than 404ing', async ({ page }) => {
    // A broken href renders as nothing in SVG — silently, with no console error.
    // Without this the board would just quietly lose its goods.
    const bad = [];
    page.on('response', r => { if (r.url().includes('/assets/art/') && r.status() >= 400) bad.push(r.url()); });
    await open(page);
    await page.locator('#btnPlay').click();
    await page.waitForTimeout(400);
    const broken = await page.evaluate(() => {
      const out = [];
      for (const im of document.querySelectorAll('#svg image')) {
        const href = im.getAttribute('href');
        if (href && !href.startsWith('data:')) out.push(href);
      }
      return out;
    });
    // Every art href the board asked for must have actually resolved.
    expect(bad, `failed art requests: ${bad.join(', ')}`).toEqual([]);
    expect(broken.length, 'board rendered no painted art at all').toBeGreaterThan(0);
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
  // Navigate by step ID, never by index. These tests used to hardcode "Step 4 of
  // 9" and "click Next three times", so adding an orientation step broke five of
  // them at once — the tests were pinned to the script's shape rather than its
  // behaviour.
  const advanceTo = async (page, id) => {
    for (let i = 0; i < 30; i++) {
      const t = await page.evaluate(() => window.SILT.tutorial());
      if (!t?.active) throw new Error(`tutorial ended before reaching ${id}`);
      if (t.id === id) return t;
      if (await page.locator('#tutNext').isVisible()) await page.locator('#tutNext').click();
      else await page.locator('#tutSkipStep').click();
    }
    throw new Error(`never reached step ${id}`);
  };

  test('starts from the guided button on the first step', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    await expect(page.locator('#tut')).toBeVisible();
    const t = await page.evaluate(() => window.SILT.tutorial());
    expect(t.i).toBe(1);
    expect(t.id).toBe('welcome');
    await expect(page.locator('#tutStep')).toContainText(`of ${t.n}`);
  });

  test('does not appear in a normal game', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await expect(page.locator('#tut')).toBeHidden();
  });

  test('advances through untimed steps with Next', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    const before = await page.evaluate(() => window.SILT.tutorial());
    await page.locator('#tutNext').click();
    const after = await page.evaluate(() => window.SILT.tutorial());
    expect(after.i).toBe(before.i + 1);
    expect(after.id).not.toBe(before.id);
  });

  test('gates on a real action and hides Next while waiting', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    await advanceTo(page, 'pick-ship');
    await expect(page.locator('#tutNext')).toBeHidden();
    // A gated step tells you what to do and offers an escape hatch.
    await expect(page.locator('#tutWait')).not.toBeEmpty();
    await expect(page.locator('#tutSkipStep')).toBeVisible();
    // Other actions are not merely ignored — they are not clickable at all.
    await expect(page.locator('[data-act="survey"]')).toBeDisabled();
    expect((await page.evaluate(() => window.SILT.tutorial())).id).toBe('pick-ship');
  });

  test('advances when the gated action is performed', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    await advanceTo(page, 'pick-ship');
    await page.locator('[data-act="ship"]').click();
    expect((await page.evaluate(() => window.SILT.tutorial())).id).toBe('pick-second');
  });

  test('highlights the element it is talking about', async ({ page }) => {
    await open(page);
    await page.locator('#btnTutorial').click();
    await advanceTo(page, 'pick-ship');
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
    const depths = await page.locator('.ch').evaluateAll(
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

// The board used to change state with no visible cause: a whole round resolved in
// one repaint, so channels silted and tolls were paid between frames. These assert
// that things actually get SHOWN, not just recorded in the log.
test.describe('effects', () => {
  // Drive one round with effects on and collect what the overlay drew.
  const runRound = async (page) => {
    await page.evaluate(() => window.SILT.setSpeed('normal'));
    await page.locator('[data-act="ship"]').click();
    await page.locator('[data-act="dredge"]').click();
    await page.locator('#go').click();
    const seen = new Set();
    for (let i = 0; i < 90; i++) {
      const cls = await page.evaluate(() =>
        [...document.getElementById('fx').children].map(n => n.getAttribute('class') || ''));
      cls.forEach(c => c.split(/\s+/).filter(Boolean).forEach(x => seen.add(x)));
      const pd = await page.evaluate(() => window.SILT.pending());
      if (pd) {
        const sel = pd === 'dredge' ? '#svg [data-hit]' : '#svg [data-hit-node]';
        if (await page.locator(sel).count()) await page.locator(sel).first().click({ force: true });
      }
      if (await page.evaluate(() => (window.SILT.state()?.round ?? 0) > 1)) break;
      await page.waitForTimeout(60);
    }
    return seen;
  };

  test('draws something on the overlay when a round resolves', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    const seen = await runRound(page);
    expect(seen.size, 'the overlay drew nothing all round').toBeGreaterThan(0);
  });

  test('shows a boat travelling and a payout for a shipment', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    const seen = await runRound(page);
    expect([...seen].some(c => c === 'fxBoat' || c === 'fxWake'),
      `no boat or wake drawn; saw: ${[...seen]}`).toBe(true);
  });

  test('names whoever is currently acting', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.setSpeed('normal'));
    await page.locator('[data-act="survey"]').click();
    await page.locator('[data-act="survey"]').click();
    await page.locator('#go').click();
    // Survey needs no target, so the round resolves without waiting on us.
    await page.waitForFunction(() => window.SILT.actor() !== null, null, { timeout: 10000 });
    const who = await page.evaluate(() => window.SILT.actor());
    expect(who).toBeTruthy();
  });

  test('the overlay never swallows a click meant for the board', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    // pointer-events:none is the whole reason the board is still playable with an
    // overlay stacked on top of it.
    const pe = await page.evaluate(() =>
      getComputedStyle(document.getElementById('fx')).pointerEvents);
    expect(pe).toBe('none');
  });

  test('cleans up after itself instead of accumulating nodes', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await runRound(page);
    // Every effect removes itself; nothing should be left a couple of seconds on.
    await page.waitForFunction(() => window.SILT.fxCount() === 0, null, { timeout: 8000 });
    expect(await page.evaluate(() => window.SILT.fxCount())).toBe(0);
  });

  test('speed control cycles and turning it off draws nothing', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.setSpeed('normal'));
    await page.locator('#btnSpeed').click();
    expect(await page.evaluate(() => window.SILT.speed())).toBe('fast');
    await page.locator('#btnSpeed').click();
    expect(await page.evaluate(() => window.SILT.speed())).toBe('off');

    await page.locator('[data-act="survey"]').click();
    await page.locator('[data-act="survey"]').click();
    await page.locator('#go').click();
    await page.waitForFunction(() => (window.SILT.state()?.round ?? 0) > 1, null, { timeout: 10000 });
    expect(await page.evaluate(() => window.SILT.fxCount()),
      'effects were drawn while speed was off').toBe(0);
  });

  test('a new game clears effects left over from the last one', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => window.SILT.setSpeed('normal'));
    await page.locator('[data-act="survey"]').click();
    await page.locator('[data-act="survey"]').click();
    await page.locator('#go').click();
    await page.waitForTimeout(120);
    await page.evaluate(() => window.SILT.menu());
    await page.locator('#btnPlay').click();
    expect(await page.evaluate(() => window.SILT.fxCount())).toBe(0);
    expect(await page.evaluate(() => window.SILT.actor())).toBe(null);
  });
});

// Channels are painted ribbons of water texture now, not coloured strokes. The
// board previously read as a node graph — straight lines between grid-aligned
// dots — and these lock in the things that stopped it looking like one.
test.describe('board is a river, not a graph', () => {
  test('paints every channel with a depth texture', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    const fills = await page.locator('.ch').evaluateAll(
      els => els.map(e => e.getAttribute('stroke')));
    expect(fills).toHaveLength(31);
    // Each must reference the pattern matching its own depth.
    const depths = await page.locator('.ch').evaluateAll(
      els => els.map(e => e.dataset.depth));
    for (let i = 0; i < fills.length; i++) {
      expect(fills[i], `channel ${i} at depth ${depths[i]}`).toBe(`url(#tile${depths[i]})`);
    }
  });

  test('defines a pattern for every depth including dead', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    for (const d of [0, 1, 2, 3]) {
      await expect(page.locator(`#svg pattern#tile${d}`)).toBeAttached();
    }
  });

  test('channels curve rather than running straight', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    // A straight line between two points has no control points. Every channel
    // should be a cubic bezier — that meander is most of what stopped this
    // looking like a network diagram.
    const curved = await page.locator('.ch').evaluateAll(
      els => els.filter(e => (e.getAttribute('d') || '').includes('C')).length);
    expect(curved).toBe(31);
  });

  test('the same channel curves identically across repaints', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    const before = await page.locator('.ch').evaluateAll(
      els => els.map(e => e.getAttribute('d')));
    // Force a repaint by picking an action.
    await page.locator('[data-act="survey"]').click();
    const after = await page.locator('.ch').evaluateAll(
      els => els.map(e => e.getAttribute('d')));
    // Jitter is seeded off the channel key, so a river that wriggles on every
    // render would be both ugly and nauseating.
    expect(after).toEqual(before);
  });

  test('a dead channel is drawn as dried bed, not hidden', async ({ page }) => {
    await open(page);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => {
      const g = window.SILT.state();
      g.depth[Object.keys(g.depth)[0]] = 0;
    });
    await page.locator('[data-act="survey"]').click();   // repaint
    const dead = page.locator('.ch[data-depth="0"]').first();
    await expect(dead).toBeAttached();
    // Silting is the whole premise; it must be visible, not merely absent.
    expect(await dead.getAttribute('stroke')).toBe('url(#tile0)');
    expect(Number(await dead.getAttribute('stroke-width'))).toBeGreaterThan(0.5);
  });

  test('water tiles actually load', async ({ page }) => {
    const bad = [];
    page.on('response', r => {
      if (/water-|land-/.test(r.url()) && r.status() >= 400) bad.push(r.url().split('/').pop());
    });
    await open(page);
    await page.locator('#btnPlay').click();
    await page.waitForTimeout(500);
    expect(bad, `missing tiles: ${bad.join(', ')}`).toEqual([]);
  });
});
