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
//
// THEMED TEXT: title/body/hint are functions of the theme, not fixed strings.
// They used to be hardcoded English ("pick SHIP") while the button beside them
// rendered T.actions.ship.name ("Bangka") — the tutorial was telling players to
// click a word that appeared nowhere on screen. Any label the player has to find
// must come from the same source the UI paints from.
//
// House style for a themed term: Tagalog first, gloss in parens on first use —
// "Bangka (ship)" — then bare Tagalog afterwards. That is the whole pitch of
// this edition: you pick the word up because you needed it to play.

// Name + gloss, e.g. "Bangka (ship)". Collapses to a single word on the plain
// theme, where name and gloss are identical and the parens would be noise.
const withGloss = (o) =>
  o.gloss && o.gloss.toLowerCase() !== o.name.toLowerCase()
    ? `${o.name} (${o.gloss})` : o.name;

const act = (T, k) => withGloss(T.actions[k]);
const term = (T, k) => withGloss(T.terms[k]);
// Bare name, for the second mention onward once the gloss has been given.
const actName = (T, k) => T.actions[k].name;
// Goods read as the everyday English word — "bamboo, rice and salt" on ANOD.
// PLAIN leaves gloss empty, so fall back to the name or the sentence loses its
// nouns entirely ("You move ,  and  downstream").
const good = (T, k) => (T.goods[k].gloss || T.goods[k].name).toLowerCase();
// Naive plural, enough for the handful of terms the tutorial pluralises.
const plural = (w) => (/s$/i.test(w) ? w : `${w}s`);
const contracts = (T) => plural(T.terms.contract.name.toLowerCase());

export const STEPS = [
  {
    id: 'welcome',
    title: () => 'Your river is also your problem',
    body: (T) => `You move ${good(T, 'timber')}, ${good(T, 'grain')} and `
        + `${good(T, 'salt')} downstream to the ${term(T, 'mouth')}. Every trip `
        + `silts the ${T.terms.channel.name} you used. Nothing is hidden — you lose `
        + `by misreading the board, not by ambush.`,
    highlight: null,
    check: null,
  },
  {
    id: 'your-station',
    title: (T) => `This ${T.terms.station.name} is yours`,
    body: (T) => `The pulsing ${term(T, 'station')} is your starting position. The `
        + `badge above a node shows how many goods are sitting there, and which kind.`,
    highlight: () => ({ kind: 'node', ids: 'own' }),
    check: null,
  },
  {
    id: 'mouths',
    title: (T) => `Sell at the ${T.terms.mouth.name}`,
    body: (T) => `The three islands at the bottom are the ${term(T, 'mouth')} — open `
        + `water. Everything you ship ends at one of them. That is where `
        + `${contracts(T)} are filled and points are scored.`,
    highlight: () => ({ kind: 'node', ids: ['A', 'B', 'C'] }),
    check: null,
  },
  {
    id: 'pick-ship',
    title: (T) => `Now do it — pick ${actName(T, 'ship')}`,
    body: (T) => `You choose two actions each round, before anyone reveals. Click `
        + `${act(T, 'ship')} to put it in your first slot.`,
    highlight: () => ({ kind: 'ui', sel: '[data-act="ship"]' }),
    check: (g, ui) => ui.program.includes('ship'),
    hint: (T) => `Click the ${actName(T, 'ship')} button in the panel on the right.`,
  },
  {
    id: 'pick-second',
    title: () => 'Fill the second slot',
    body: (T) => `Anything works. ${act(T, 'dredge')} reopens a `
        + `${T.terms.channel.name} and lets you charge others `
        + `${T.terms.toll.name} to pass. ${act(T, 'build')} raises a new `
        + `${T.terms.station.name}. ${act(T, 'survey')} takes `
        + `${T.terms.coins.name} and ${contracts(T)}.`,
    highlight: () => ({ kind: 'ui', sel: '#acts' }),
    check: (g, ui) => !!ui.program[0] && !!ui.program[1],
    hint: () => 'Pick any second action.',
  },
  {
    id: 'commit',
    title: () => 'Commit — this is the locked-in part',
    body: () => 'Press commit. Everyone reveals at once and resolves in order. You '
        + 'cannot change your mind halfway through, which is the whole tension of '
        + 'the game.',
    highlight: () => ({ kind: 'ui', sel: '#go' }),
    check: (g, ui) => ui.roundsPlayed >= 1,
    hint: () => 'Press "Commit & resolve" to play the round out.',
  },
  {
    id: 'read-water',
    title: () => 'Read the water',
    body: (T) => `Look at the ${T.terms.channel.name.toLowerCase()} now. Thick means `
        + `deep. Thin and pale means ${T.terms.depth.name} 1 — one more trip kills `
        + `it. Dashed brown is ${term(T, 'silted')} permanently, and nothing can `
        + `reopen it.`,
    highlight: () => ({ kind: 'legend' }),
    check: null,
  },
  {
    id: 'tolls',
    title: (T) => `${actName(T, 'dredge')} is a business`,
    body: (T) => `When you ${actName(T, 'dredge')}, you claim that `
        + `${T.terms.channel.name} and a dot in your colour appears on it. Everyone `
        + `else pays you ${term(T, 'toll')} to ship through it, and you score it at `
        + `the end if you keep it deep.`,
    highlight: () => ({ kind: 'rights' }),
    check: null,
  },
  {
    id: 'free',
    title: () => 'That is the whole game',
    body: (T) => `Fill ${contracts(T)} before the water you need disappears. Press `
        + `Rules any time for the full rulebook — it lists every term. Good luck, `
        + `${T.terms.player.name}.`,
    highlight: null,
    check: null,
  },
];

// Resolve a step's text against the active theme. Plain strings still work, so a
// future step can be written either way without breaking the caller.
export function stepText(s, T) {
  const f = (v, fb) => (typeof v === 'function' ? v(T) : (v ?? fb));
  return {
    title: f(s.title, ''),
    body: f(s.body, ''),
    hint: f(s.hint, null),
  };
}

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
