// SILT / ANOD — guided first game.
//
// Design rule: teach by doing. Every step is either a one-line orientation note
// or a single concrete instruction that the player completes on the real board.
// Nothing here explains a rule the player cannot act on immediately — that is
// what the rulebook is for.
//
// `check(g, ui)` is polled after each render. Returning true advances the step.
// A step with no `check` shows a Next button instead.
//
// The `ui` object carries UI-owned state (program, roundsPlayed). Do NOT gate on
// transient engine state like g.log — flush() clears it before polling, which is
// exactly how the old 'commit' step became impossible to complete.

export const STEPS = [
  {
    id: 'welcome',
    title: 'Your river is also your problem',
    body: 'You move goods downstream to the sea. Every trip silts the channel you '
        + 'used. Nothing is hidden — you lose by misreading the board, not by ambush.',
    highlight: null,
    check: null,
  },
  {
    id: 'your-station',
    title: 'This one is yours',
    body: 'The pulsing settlement is your starting position. The badge above a node '
        + 'shows how many goods are sitting there, and which kind.',
    highlight: () => ({ kind: 'node', ids: 'own' }),
    check: null,
  },
  {
    id: 'mouths',
    title: 'Sell at the bottom',
    body: 'The three islands at the bottom are the sea. Everything you ship ends at '
        + 'one of them. That is where contracts are filled and points are scored.',
    highlight: () => ({ kind: 'node', ids: ['A', 'B', 'C'] }),
    check: null,
  },
  {
    id: 'pick-ship',
    title: 'Now do it — pick SHIP',
    body: 'You choose two actions each round, before anyone reveals. '
        + 'Click the SHIP action to put it in your first slot.',
    highlight: () => ({ kind: 'ui', sel: '[data-act="ship"]' }),
    check: (g, ui) => ui.program.includes('ship'),
    hint: 'Click the SHIP button in the panel on the right.',
  },
  {
    id: 'pick-second',
    title: 'Fill the second slot',
    body: 'Anything works. DREDGE repairs a channel and lets you charge others to '
        + 'use it. SETTLE builds a new site. SURVEY takes money and contracts.',
    highlight: () => ({ kind: 'ui', sel: '#acts' }),
    check: (g, ui) => !!ui.program[0] && !!ui.program[1],
    hint: 'Pick any second action.',
  },
  {
    id: 'commit',
    title: 'Commit — this is the locked-in part',
    body: 'Press commit. Everyone reveals at once and resolves in order. You cannot '
        + 'change your mind halfway through, which is the whole tension of the game.',
    highlight: () => ({ kind: 'ui', sel: '#go' }),
    check: (g, ui) => ui.roundsPlayed >= 1,
    hint: 'Press "Commit & resolve" to play the round out.',
  },
  {
    id: 'read-water',
    title: 'Read the water',
    body: 'Look at the channels now. Thick means deep. Thin and pale means depth 1 — '
        + 'one more trip kills it. Dashed brown is dead permanently, and nothing can '
        + 'reopen it.',
    highlight: () => ({ kind: 'legend' }),
    check: null,
  },
  {
    id: 'tolls',
    title: 'Dredging is a business',
    body: 'When you dredge, you claim that channel and a dot in your colour appears '
        + 'on it. Everyone else pays you to ship through it, and you score it at the '
        + 'end if you keep it deep.',
    highlight: () => ({ kind: 'rights' }),
    check: null,
  },
  {
    id: 'free',
    title: 'That is the whole game',
    body: 'Fill contracts before the water you need disappears. Press Rules any time '
        + 'for the full rulebook. Good luck.',
    highlight: null,
    check: null,
  },
];

export function createTutorial() {
  return {
    active: false,
    i: 0,
    start() { this.active = true; this.i = 0; },
    stop() { this.active = false; },
    step() { return this.active ? STEPS[this.i] : null; },
    poll(g, ui) {
      if (!this.active) return false;
      const s = STEPS[this.i];
      if (s?.check && s.check(g, ui)) return this.next();
      return false;
    },
    next() {
      if (!this.active) return false;
      if (this.i >= STEPS.length - 1) { this.stop(); return true; }
      this.i++;
      return true;
    },
    isLast() { return this.i >= STEPS.length - 1; },
    progress() { return { i: this.i + 1, n: STEPS.length }; },
  };
}
