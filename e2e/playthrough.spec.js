import { test, expect } from '@playwright/test';

// Real playthroughs: every interaction goes through the DOM the way a human does.
// No window.SILT helpers for commit/resolve — those bypass exactly the wiring that
// breaks. State is only ever READ via window.SILT, never driven by it.
//
// These run WITH animation on, at the speed a person actually plays at, because
// the point is to prove the game is completable as shipped. That makes them slow:
// a full 8-round game is ~20s of deliberate animation, and several such games run
// per test. The default 30s budget fits when a test runs alone but not when six
// workers compete for CPU — which showed up as four tests failing in the suite and
// passing in isolation. The game was fine; the budget was not.
test.describe.configure({ timeout: 180_000 });

const open = async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Animation speed persists to localStorage, which is shared across the workers
  // running this file in parallel. Without clearing it a test that turns effects
  // off changes the speed of an unrelated test — the suite failed only when run
  // together and passed in isolation, which is exactly what that looks like.
  await page.addInitScript(() => {
    try { localStorage.removeItem('silt.speed'); } catch { /* private mode */ }
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => window.SILT?.isReady === true);
  // This suite deliberately runs WITH animation: its whole job is proving a human
  // can finish the game at real speed.
  await page.evaluate(() => window.SILT.setSpeed('normal'));
  return errors;
};

// Resolve whatever target prompt is showing by clicking on the board.
async function clickTarget(page) {
  const pending = await page.evaluate(() => window.SILT.pending());
  if (!pending) return false;

  if (pending === 'dredge') {
    const hit = page.locator('#svg [data-hit]').first();
    await expect(hit).toBeAttached();
    await hit.click({ force: true });
    return true;
  }
  // build / ship: click a highlighted node's oversized hit circle
  const node = page.locator('#svg [data-hit-node]').first();
  await expect(node).toBeAttached();
  await node.click({ force: true });
  return true;
}

// Resolution is animated, so a round advances over many frames instead of in one
// synchronous blast. Wait for the game to reach a state the player can act on:
// either a prompt is up, or the round has moved on, or the game is over.
//
// Do NOT wait on g.log — flush() clears it, so it is empty at almost every poll.
// That is the same trap that made the old tutorial 'commit' step impossible.
async function settle(page, fromRound) {
  await page.waitForFunction((r0) => {
    const s = window.SILT;
    if (s.pending() !== null) return true;                  // needs my input
    if (document.getElementById('ov').classList.contains('on')) return true;  // finished
    return (s.state()?.round ?? 0) !== r0;                  // round advanced
  }, fromRound, { timeout: 20000 });
}

// Play one round entirely by clicking.
async function playRound(page, a = 'ship', b = 'dredge') {
  const r0 = await page.evaluate(() => window.SILT.state()?.round);
  await page.locator(`[data-act="${a}"]`).click();
  await page.locator(`[data-act="${b}"]`).click();
  await expect(page.locator('#go')).toBeEnabled();
  await page.locator('#go').click();
  // More iterations than there are slots: a prompt can appear a frame or two
  // after the previous one resolves.
  for (let i = 0; i < 8; i++) {
    await settle(page, r0);
    if (!await clickTarget(page)) break;
  }
}

test.describe('real playthrough — clicks only', () => {
  test('finishes a 5-round game entirely through the UI', async ({ page }) => {
    const errors = await open(page);
    await page.locator('[data-len="5"]').click();
    await page.locator('#btnPlay').click();

    for (let r = 1; r <= 5; r++) {
      await expect(page.locator('#rd')).toContainText(`${r} / 5`);
      await playRound(page);
    }

    await expect(page.locator('#ov')).toHaveClass(/on/);
    await expect(page.locator('#final table')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('finishes a full 8-round game through the UI', async ({ page }) => {
    const errors = await open(page);
    await page.locator('#btnPlay').click();
    for (let r = 1; r <= 8; r++) await playRound(page);
    await expect(page.locator('#ov')).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });

  test('finishes with every action pairing', async ({ page }) => {
    const pairs = [['ship', 'ship'], ['build', 'build'], ['survey', 'survey'],
                   ['dredge', 'ship'], ['build', 'ship']];
    for (const [a, b] of pairs) {
      const errors = await open(page);
      await page.locator('[data-len="5"]').click();
      await page.locator('#btnPlay').click();
      for (let r = 0; r < 5; r++) await playRound(page, a, b);
      await expect(page.locator('#ov'), `${a}+${b}`).toHaveClass(/on/);
      expect(errors, `${a}+${b}`).toEqual([]);
    }
  });

  test('finishes at every player count', async ({ page }) => {
    for (const n of ['2', '3', '4']) {
      const errors = await open(page);
      await page.locator('[data-len="5"]').click();
      await page.locator(`[data-pc="${n}"]`).click();
      await page.locator('#btnPlay').click();
      for (let r = 0; r < 5; r++) await playRound(page);
      await expect(page.locator('#ov'), `${n}p`).toHaveClass(/on/);
      const rows = await page.locator('#final tr').count();
      expect(rows, `${n}p`).toBe(Number(n) + 1);   // header + players
      expect(errors, `${n}p`).toEqual([]);
    }
  });

  test('play again works after finishing', async ({ page }) => {
    const errors = await open(page);
    await page.locator('[data-len="5"]').click();
    await page.locator('#btnPlay').click();
    for (let r = 0; r < 5; r++) await playRound(page);
    await expect(page.locator('#ov')).toHaveClass(/on/);
    await page.locator('#btnAgain').click();
    await expect(page.locator('#rd')).toContainText('1 / 5');
    for (let r = 0; r < 5; r++) await playRound(page);
    await expect(page.locator('#ov')).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });
});

test.describe('real tutorial — clicks only', () => {
  test('completes the guided game by following its own instructions', async ({ page }) => {
    const errors = await open(page);
    await page.locator('#btnTutorial').click();
    await expect(page.locator('#tut')).toBeVisible();

    const visited = [];
    for (let guard = 0; guard < 30; guard++) {
      const t = await page.evaluate(() => window.SILT.tutorial());
      if (!t || !t.active) break;
      visited.push(t.id);

      // Untimed step -> Next. Gated step -> do the thing it asks for.
      if (await page.locator('#tutNext').isVisible()) {
        await page.locator('#tutNext').click();
        continue;
      }
      if (t.id === 'pick-ship') {
        await page.locator('[data-act="ship"]').click();
      } else if (t.id === 'pick-second') {
        await page.locator('[data-act="dredge"]').click();
      } else if (t.id === 'commit') {
        const r0 = await page.evaluate(() => window.SILT.state()?.round);
        await page.locator('#go').click();
        for (let i = 0; i < 8; i++) {
          await settle(page, r0);
          if (!await clickTarget(page)) break;
        }
      } else {
        throw new Error(`gated step with no scripted action: ${t.id}`);
      }
    }

    // It must have reached the end, not bailed early.
    expect(visited).toContain('commit');
    expect(visited[visited.length - 1]).toBe('free');
    await expect(page.locator('#tut')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('the game is still playable after the tutorial ends', async ({ page }) => {
    const errors = await open(page);
    await page.locator('[data-len="5"]').click();
    await page.locator('#btnTutorial').click();
    for (let guard = 0; guard < 30; guard++) {
      const t = await page.evaluate(() => window.SILT.tutorial());
      if (!t || !t.active) break;
      if (await page.locator('#tutNext').isVisible()) { await page.locator('#tutNext').click(); continue; }
      if (t.id === 'pick-ship') await page.locator('[data-act="ship"]').click();
      else if (t.id === 'pick-second') await page.locator('[data-act="dredge"]').click();
      else if (t.id === 'commit') {
        const r0 = await page.evaluate(() => window.SILT.state()?.round);
        await page.locator('#go').click();
        for (let i = 0; i < 8; i++) {
          await settle(page, r0);
          if (!await clickTarget(page)) break;
        }
      } else await page.locator('#tutSkipStep').click();
    }
    // finish the remaining rounds by hand
    for (let r = 0; r < 6; r++) {
      if (await page.locator('#ov').evaluate(e => e.classList.contains('on'))) break;
      await playRound(page);
    }
    await expect(page.locator('#ov')).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });

  test('skipping the tutorial leaves a working game', async ({ page }) => {
    const errors = await open(page);
    await page.locator('[data-len="5"]').click();
    await page.locator('#btnTutorial').click();
    await page.locator('#tutSkip').click();
    await expect(page.locator('#tut')).toBeHidden();
    for (let r = 0; r < 5; r++) await playRound(page);
    await expect(page.locator('#ov')).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });
});

test.describe('real playthrough on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('finishes a game by tapping', async ({ page }) => {
    const errors = await open(page);
    await page.locator('[data-len="5"]').click();
    await page.locator('#btnPlay').click();
    for (let r = 0; r < 5; r++) {
      const r0 = await page.evaluate(() => window.SILT.state()?.round);
      await page.locator('[data-act="ship"]').click();
      await page.locator('[data-act="dredge"]').click();
      await page.locator('#go').scrollIntoViewIfNeeded();
      await page.locator('#go').click();
      for (let i = 0; i < 8; i++) {
        await settle(page, r0);
        if (!await clickTarget(page)) break;
      }
    }
    await expect(page.locator('#ov')).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });
});
