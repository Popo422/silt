// SILT — guided first game.
// Each step shows a message and waits for a real condition on game state, so the
// player learns by doing rather than by reading a wall of text. `check` is polled
// after every UI render; when it returns true the step advances.

export const STEPS = [
  {
    id: 'welcome',
    title: 'The delta is your economy and your enemy',
    body: 'You ship goods down a river delta to the sea. Every shipment silts the '
        + 'channels it uses. The map degrades because everyone is succeeding.',
    highlight: null,
    check: null,            // advance on click
  },
  {
    id: 'your-station',
    title: 'This is your station',
    body: 'The glowing dock is yours. The small cubes beside a node are its goods — '
        + 'timber, grain, or salt. Ship those to a lighthouse to score.',
    highlight: () => ({ kind: 'node', ids: 'own' }),
    check: null,
  },
  {
    id: 'mouths',
    title: 'Three mouths, three markets',
    body: 'The lighthouses at the bottom are the sea. Delivering there fills contracts '
        + 'and wins majorities. Every route ends at one of them.',
    highlight: () => ({ kind: 'node', ids: ['A', 'B', 'C'] }),
    check: null,
  },
  {
    id: 'program-ship',
    title: 'Program your first action',
    body: 'You commit TWO actions per round, face down, before anything resolves. '
        + 'Click SHIP to put it in slot 1.',
    highlight: () => ({ kind: 'ui', sel: '[data-act="ship"]' }),
    check: (g, ui) => ui.program[0] === 'ship',
  },
  {
    id: 'program-second',
    title: 'Now fill slot 2',
    body: 'Pick anything. DREDGE repairs a channel and claims its toll. BUILD expands. '
        + 'SURVEY draws contracts. You cannot change these once you commit.',
    highlight: () => ({ kind: 'ui', sel: '#acts' }),
    check: (g, ui) => !!ui.program[0] && !!ui.program[1],
  },
  {
    id: 'commit',
    title: 'Commit and watch',
    body: 'All players reveal at once and resolve in seat order. This is where you '
        + 'find out whether you guessed right about everyone else.',
    highlight: () => ({ kind: 'ui', sel: '#go' }),
    check: (g) => g.round > 1 || g.log.length > 0,
  },
  {
    id: 'silt',
    title: 'Read the water',
    body: 'Thick blue is deep. Thin grey is depth 1 — one more shipment kills it. '
        + 'Dashed brown is SILTED: gone permanently, and it can never be reopened.',
    highlight: () => ({ kind: 'legend' }),
    check: null,
  },
  {
    id: 'tolls',
    title: 'Dredging is an investment',
    body: 'When you dredge, you claim that channel. A coloured dot marks the owner. '
        + 'Anyone else shipping through it pays you a toll, and you score it at the end.',
    highlight: () => ({ kind: 'rights' }),
    check: null,
  },
  {
    id: 'free',
    title: 'You are on your own',
    body: 'Eight rounds. Contracts are worth the most, so plan routes that fill them '
        + 'before the water you need disappears. Good luck.',
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
    // Returns true if the step changed, so the caller knows to re-render.
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
