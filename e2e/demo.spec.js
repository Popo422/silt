// Watch mode. The failure this suite exists to catch is the walker stalling:
// the demo drives seat 0 with a bot, and if anything still treats seat 0 as the
// human it stops dead waiting for a click that will never come. A stalled demo
// looks identical to a slow one, so every test here asserts on progress.
import { test, expect } from '@playwright/test';

// Watch mode deliberately ignores the speed setting — the captions are the whole
// point of the mode and they need time to be read, so a full 8-round demo runs
// well over two minutes no matter what the toggle says — the teaching intro alone
// is ~130s, and each caption is held long enough to actually be read. Tests that
// wait for it to finish have to budget for that; tests that only need it RUNNING
// should assert on progress and move on. Measured ~190s end to end on a slow box,
// so the budget is generous — a demo that genuinely stalls fails the assertion,
// not the clock.
const FULL_DEMO_MS = 240_000;

const boot = async (page) => {
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  await page.evaluate(() => window.SILT.setSpeed('off'));
};

// Commit and clear whatever prompt the program raises so the round advances.
// Survey opens a keep-1-of-3 picker for the human, so a bare commit() parks
// resolution and the round never ticks over; autoResolve() dismisses it.
async function commitRound(page) {
  await page.evaluate(() => window.SILT.commit());
  for (let i = 0; i < 4; i++) {
    if (!await page.evaluate(() => window.SILT.pending())) break;
    await page.evaluate(() => window.SILT.autoResolve());
  }
}


test('the menu offers a game you can watch', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#btnWatch')).toBeVisible();
});

test('watch mode plays itself to the end with no input', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.SILT.watch());

  // The whole point: nobody touches the page from here.
  test.setTimeout(FULL_DEMO_MS + 30_000);
  await expect(page.locator('#ov')).toHaveClass(/on/, { timeout: FULL_DEMO_MS });

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
  await boot(page);
  await page.evaluate(() => window.SILT.watch());

  // The reactive beats below (first-death in particular) land in the closing
  // rounds, ~190s in, so the whole demo has to run. The default 30s test cap
  // would fire long before the poll's own FULL_DEMO_MS budget was reached.
  test.setTimeout(FULL_DEMO_MS + 30_000);

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
  // first-death lands near the end of a ~45s demo.
  const seen = new Set();
  await expect.poll(async () => {
    const d = await page.evaluate(() => window.SILT.demo());
    for (const id of d?.fired ?? []) seen.add(id);
    return ['first-ship', 'first-dredge', 'first-death'].filter(id => seen.has(id)).length;
  }, { timeout: FULL_DEMO_MS, intervals: [250] }).toBe(3);

  expect([...seen]).toContain('first-ship');
  expect([...seen]).toContain('first-dredge');
  expect([...seen]).toContain('first-death');
});

test('pause holds the game, resume continues it', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.SILT.watch());
  test.setTimeout(120_000);
  // Pause during PLAY, not during the teaching intro: the intro logs nothing, so
  // "did the log stop growing" would be trivially true there and prove nothing.
  await expect.poll(() => page.evaluate(() =>
    document.querySelectorAll("#log div").length), { timeout: 60_000 })
    .toBeGreaterThan(1);
  await page.evaluate(() => window.SILT.demoPause());

  const at = () => page.evaluate(() => ({
    round: window.SILT.state().round,
    log: document.querySelectorAll('#log div').length,
    over: document.getElementById('ov').classList.contains('on'),
  }));

  const before = await at();
  expect(before.over).toBe(false);   // guard: the premise of the test

  // The pause gate is checked between actions, not inside one, so the action
  // already in flight when you click still finishes — expect up to one more log
  // line, then nothing. What matters is that it CONVERGES: a demo that merely
  // slowed down would keep adding lines forever.
  await page.waitForTimeout(3000);
  const settled = await at();
  await page.waitForTimeout(3000);
  expect(await at()).toEqual(settled);   // paused means paused, not merely slower

  await page.evaluate(() => window.SILT.demoResume());
  await expect.poll(() => page.evaluate(() =>
    document.querySelectorAll('#log div').length), { timeout: 45_000 })
    .toBeGreaterThan(settled.log);
});

test('"play it myself" hands over a real game', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.SILT.watch());
  await expect(page.locator('#tutSkip')).toBeVisible();
  await page.locator('#tutSkip').click();

  // Watch mode is gone and seat 0 is the player's again.
  expect(await page.evaluate(() => window.SILT.demo())).toBeNull();
  expect(await page.evaluate(() => window.SILT.state().players[0].strat)).toBeNull();
  await expect(page.locator('#tut')).not.toHaveClass(/watching/);
  // And the handed-over game is actually playable. Survey opens a keep-1 picker
  // now, so committing is not enough — the round only advances once it is cleared.
  await page.evaluate(() => window.SILT.program('survey', 'survey'));
  await commitRound(page);
  expect(await page.evaluate(() => window.SILT.state().round)).toBe(2);
});

test('quitting to the menu mid-demo leaves nothing running', async ({ page }) => {
  // Mid-demo means mid-demo: at speed 'off' the game is over before the quit
  // lands, and this would pass without ever exercising the teardown it names.
  await boot(page);
  await page.evaluate(() => window.SILT.watch());
  await expect.poll(() => page.evaluate(() => window.SILT.demo()?.active ?? false))
    .toBe(true);
  await page.evaluate(() => window.SILT.demoPause());
  await page.evaluate(() => window.SILT.menu());

  expect(await page.evaluate(() => window.SILT.demo())).toBeNull();
  // A paused demo left running would suspend the next game on a hidden gate.
  await page.evaluate(() => window.SILT.boot(7));
  await page.evaluate(() => window.SILT.program('survey', 'survey'));
  await commitRound(page);
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

// Read-aloud captions. speechSynthesis is stubbed because CI has no audio
// device and real utterances are asynchronous and untimed — this asserts the
// wiring (does a beat reach the speech layer), not that sound came out.
//
// NOTE the stub must go in via defineProperty: window.speechSynthesis is a
// read-only accessor, so plain assignment is silently dropped and the module
// keeps a handle on the real one while the page appears to hold a fake.
const stubSpeech = (page) => page.addInitScript(() => {
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => [{ name: 'Google UK English Male', lang: 'en-GB' }],
      speak: (u) => window.__spoken.push(u.text),
      cancel: () => {},
      addEventListener: () => {},
    },
  });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
});

test('watch mode can read its captions aloud, and does not by default', async ({ page }) => {
  await stubSpeech(page);
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  await page.evaluate(() => window.SILT.watch());

  // Silent until asked: a page that starts talking on its own is hostile.
  const toggle = page.locator('#tutSpeak');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__spoken.length)).toBe(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // Speaks the caption already on screen rather than waiting for the next beat.
  await expect.poll(() => page.evaluate(() => window.__spoken.length))
    .toBeGreaterThan(0);
  const first = await page.evaluate(() => window.__spoken[0]);
  expect(first).toContain(await page.locator('#tutTitle').innerText());
});

test('each caption is spoken once, not restarted on every repaint', async ({ page }) => {
  await stubSpeech(page);
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  await page.evaluate(() => window.SILT.watch());
  await page.locator('#tutSpeak').click();

  // render() runs on every effect and repaint. Speaking unconditionally would
  // restart the sentence several times per beat, so utterances must not
  // outnumber the beats that fired.
  await expect.poll(() => page.evaluate(() => window.__spoken.length),
    { timeout: 40_000 }).toBeGreaterThan(1);
  await page.waitForTimeout(3000);
  const spoken = await page.evaluate(() => window.__spoken);
  const fired = await page.evaluate(() => window.SILT.demo()?.fired ?? []);
  expect(spoken.length).toBeLessThanOrEqual(fired.length + 1);
  expect(new Set(spoken).size).toBe(spoken.length);   // no caption said twice
});

// The bug this exists to catch: captions advance on a fixed timer, but reading
// one aloud takes several times longer, so every utterance got cut off partway
// through by the next beat.
//
// The earlier speech stub returned instantly, which made that timing mismatch
// structurally invisible — it asserted that a beat reaches the speech layer,
// never that the demo waits for it. This stub takes real time to "speak", so
// interruption is observable.
test('a caption is not cut off mid-sentence by the next beat', async ({ page }) => {
  await page.addInitScript(() => {
    window.__events = [];
    let speaking = false;
    let timer = null;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        get speaking() { return speaking; },
        get pending() { return false; },
        getVoices: () => [{ name: 'Google UK English Male', lang: 'en-GB' }],
        speak(u) {
          // MUST outlast READ_MS (2600ms), or the stub finishes inside the
          // caption's own hold and interruption can never be observed — the
          // test then passes against the broken code, which is exactly how the
          // first version of it slipped through. Real speech at ~150 wpm takes
          // 12s or so for a caption this long; 5s is enough to prove the point
          // without making the suite crawl.
          window.__events.push({ type: 'start', text: u.text });
          speaking = true;
          clearTimeout(timer);
          timer = setTimeout(() => {
            speaking = false;
            window.__events.push({ type: 'end', text: u.text });
          }, 5000);
        },
        cancel() {
          if (speaking) window.__events.push({ type: 'cut' });
          speaking = false;
          clearTimeout(timer);
        },
        addEventListener: () => {},
      },
    });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  await page.evaluate(() => window.SILT.watch());
  await page.locator('#tutSpeak').click();

  // Let several beats go by.
  await expect.poll(() => page.evaluate(() =>
    window.__events.filter(e => e.type === 'start').length), { timeout: 30_000 })
    .toBeGreaterThan(2);

  const events = await page.evaluate(() => window.__events);
  expect(events.some(e => e.type === 'cut'),
    'a sentence was interrupted before it finished').toBe(false);
});

// Voice selection. The first version matched five exact names, and a stock
// Windows box (David/Mark/Zira only) matched none of them — so it fell through
// to "first English voice", which is David, the most robotic available.
test('picks the best voice on offer rather than the first one', async ({ page }) => {
  await page.addInitScript(() => {
    window.__picked = null;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        // Deliberately ordered worst-first: taking all[0] would pick David.
        getVoices: () => [
          { name: 'Microsoft David - English (United States)', lang: 'en-US' },
          { name: 'Microsoft Zira - English (United States)', lang: 'en-US' },
          { name: 'Microsoft Ava (Natural) - English (United States)', lang: 'en-US' },
        ],
        speak(u) { window.__picked = u.voice?.name ?? null; },
        cancel() {}, get speaking() { return false; }, get pending() { return false; },
        addEventListener: () => {},
      },
    });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  await page.goto('/index.html');
  await page.evaluate(() => window.SILT.ready);
  await page.evaluate(() => window.SILT.watch());
  await page.locator('#tutSpeak').click();

  await expect.poll(() => page.evaluate(() => window.__picked)).toContain('Natural');
});
