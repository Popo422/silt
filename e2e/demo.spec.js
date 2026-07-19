// Watch mode. The failure this suite exists to catch is the walker stalling:
// the demo drives seat 0 with a bot, and if anything still treats seat 0 as the
// human it stops dead waiting for a click that will never come. A stalled demo
// looks identical to a slow one, so every test here asserts on progress.
import { test, expect } from '@playwright/test';

const boot = async (page) => {
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  // Effects off: the suite should not wait on animation, and the demo's caption
  // holds are scaled by speed so this keeps a full 8-round game to a few seconds.
  await page.evaluate(() => window.SILT.setSpeed('off'));
};

// Speed 'off' collapses every caption hold to zero, so the whole 8-round game
// resolves in well under 100ms — by the time a test looks, the demo has already
// stopped and the scoreboard is up. Anything asserting on the demo *while it
// runs* has to leave the holds in place.
const bootWatching = async (page) => {
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  await page.evaluate(() => window.SILT.setSpeed('fast'));
};

test('the menu offers a game you can watch', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#btnWatch')).toBeVisible();
});

test('watch mode plays itself to the end with no input', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.SILT.watch());

  // The whole point: nobody touches the page from here.
  await expect(page.locator('#ov')).toHaveClass(/on/, { timeout: 25_000 });

  const s = await page.evaluate(() => window.SILT.score());
  expect(s).toHaveLength(3);
  // A real game happened — someone scored something.
  expect(Math.max(...s.map(x => x.total))).toBeGreaterThan(0);
});

test('the board never waits for a target in watch mode', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.SILT.watch());
  // pendingAction is the human-input gate. If it ever sets, the demo has stalled.
  for (let i = 0; i < 12; i++) {
    expect(await page.evaluate(() => window.SILT.pending())).toBeNull();
    await page.waitForTimeout(250);
  }
});

test('narration appears and is themed', async ({ page }) => {
  await bootWatching(page);
  await page.evaluate(() => window.SILT.watch());

  const cap = page.locator('#tut');
  await expect(cap).toHaveClass(/watching/);
  await expect(page.locator('#tutTitle')).not.toBeEmpty();

  // The reactive beats are the ones worth having — they fire because the engine
  // actually did the thing, so this also asserts the chosen seed still produces
  // a game with shipping, a claim and a death in it.
  //
  // Polled for individually rather than by count: the ambient beats ("open",
  // "slot-order") all fire in round one, so any threshold low enough to be met
  // early is met before a single boat has moved. These three arrive across the
  // whole game, and the last of them can land in the closing rounds.
  //
  // demo() goes null the moment the game ends, so the accumulator lives here —
  // reading fired[] after the fact would find nothing left to read.
  // A full demo at 'fast' runs about 25s, and first-death lands near the end.
  const seen = new Set();
  await expect.poll(async () => {
    const d = await page.evaluate(() => window.SILT.demo());
    for (const id of d?.fired ?? []) seen.add(id);
    return ['first-ship', 'first-dredge', 'first-death'].filter(id => seen.has(id)).length;
  }, { timeout: 60_000, intervals: [250] }).toBe(3);

  expect([...seen]).toContain('first-ship');
  expect([...seen]).toContain('first-dredge');
  expect([...seen]).toContain('first-death');
});

test('pause holds the game, resume continues it', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  // NOT speed 'off' here: with effects and caption holds disabled the whole
  // 8-round game resolves in about half a second, so a pause lands after the
  // game is already over and proves nothing. This test needs it mid-flight.
  await page.evaluate(() => window.SILT.setSpeed('fast'));
  await page.evaluate(() => window.SILT.watch());
  await page.waitForTimeout(700);
  await page.evaluate(() => window.SILT.demoPause());

  const at = () => page.evaluate(() => ({
    round: window.SILT.state().round,
    log: document.querySelectorAll('#log div').length,
    over: document.getElementById('ov').classList.contains('on'),
  }));

  const before = await at();
  expect(before.over).toBe(false);   // guard: the premise of the test

  // Let the pause settle past any in-flight effect hold, then confirm it sticks.
  await page.waitForTimeout(1500);
  const settled = await at();
  await page.waitForTimeout(1500);
  expect(await at()).toEqual(settled);   // paused means paused, not merely slower

  await page.evaluate(() => window.SILT.demoResume());
  await expect.poll(() => page.evaluate(() =>
    document.querySelectorAll('#log div').length), { timeout: 25_000 })
    .toBeGreaterThan(settled.log);
});

test('"play it myself" hands over a real game', async ({ page }) => {
  await bootWatching(page);
  await page.evaluate(() => window.SILT.watch());
  await expect(page.locator('#tutSkip')).toBeVisible();
  await page.locator('#tutSkip').click();

  // Watch mode is gone and seat 0 is the player's again.
  expect(await page.evaluate(() => window.SILT.demo())).toBeNull();
  expect(await page.evaluate(() => window.SILT.state().players[0].strat)).toBeNull();
  await expect(page.locator('#tut')).not.toHaveClass(/watching/);
  // And the handed-over game is actually playable.
  await page.evaluate(() => window.SILT.program('survey', 'survey'));
  await page.evaluate(() => window.SILT.commit());
  expect(await page.evaluate(() => window.SILT.state().round)).toBe(2);
});

test('quitting to the menu mid-demo leaves nothing running', async ({ page }) => {
  // Mid-demo means mid-demo: at speed 'off' the game is over before the quit
  // lands, and this would pass without ever exercising the teardown it names.
  await bootWatching(page);
  await page.evaluate(() => window.SILT.watch());
  await expect.poll(() => page.evaluate(() => window.SILT.demo()?.active ?? false))
    .toBe(true);
  await page.evaluate(() => window.SILT.demoPause());
  await page.evaluate(() => window.SILT.menu());

  expect(await page.evaluate(() => window.SILT.demo())).toBeNull();
  // A paused demo left running would suspend the next game on a hidden gate.
  await page.evaluate(() => window.SILT.boot(7));
  await page.evaluate(() => window.SILT.program('survey', 'survey'));
  await page.evaluate(() => window.SILT.commit());
  expect(await page.evaluate(() => window.SILT.state().round)).toBe(2);
});

// Speed persists across sessions, and the rest of this suite wipes it on boot —
// so the one state a returning player can actually be in was the one state never
// tested. Anyone who had ever turned animation off got the whole game resolved
// instantly and landed on the final score having seen no narration at all.
test('watch mode narrates even when animation was left off', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('silt.speed', 'off'); } catch { /* private mode */ }
  });
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  await page.evaluate(() => window.SILT.watch());

  await expect(page.locator('#tut')).toHaveClass(/watching/);
  await expect(page.locator('#tutTitle')).not.toBeEmpty();
  // Still mid-game, not already scored.
  await expect(page.locator('#ov')).not.toHaveClass(/on/);
});
