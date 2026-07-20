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
    title: () => 'A river that dies as you use it',
    body: (T) => `You carry ${good(T, 'timber')}, ${good(T, 'grain')} and `
        + `${good(T, 'salt')} downstream and sell them at the sea. Every trip you `
        + `make fills the ${T.terms.channel.name.toLowerCase()} behind you with silt. `
        + `Nothing is hidden here — you lose by misreading the water, never by ambush.`,
    highlight: null,
    check: null,
  },
  // Orientation: name each region of the screen BEFORE asking for a click. The
  // old flow went from "welcome" straight to "pick SHIP" without ever saying
  // which half of the window was the map.
  {
    id: 'tour-board',
    title: () => 'Left: the delta',
    body: () => `Settlements sit along the channels. Water runs downhill, from the `
        + `headwaters at the top to the three bays across the bottom. Thick channels `
        + `are deep; thin pale ones are nearly gone.`,
    highlight: () => ({ kind: 'board' }),
    check: null,
  },
  {
    id: 'tour-panel',
    title: () => 'Right: everything you control',
    body: () => `Your two actions for the round go at the top, your contracts below `
        + `them, then the other players. Hover anything on this panel and it will `
        + `explain itself.`,
    highlight: () => ({ kind: 'ui', sel: '.pane.primary' }),
    check: null,
  },
  {
    id: 'your-station',
    title: (T) => `The pulsing ${T.terms.station.name} is yours`,
    body: () => `That is where you start. The badge above it shows how many goods `
        + `are waiting there and which kind — that is your stock, and shipping spends it.`,
    highlight: () => ({ kind: 'node', ids: 'own' }),
    check: null,
  },
  {
    id: 'mouths',
    title: () => 'The three bays are where money happens',
    body: () => `Goods only score once they reach a bay. Contracts name which bay `
        + `they want, so a route staying open matters more than a route being short.`,
    highlight: () => ({ kind: 'node', ids: ['A', 'B', 'C'] }),
    check: null,
  },
  {
    id: 'pick-ship',
    title: (T) => `Choose ${actName(T, 'ship')} for your first action`,
    body: (T) => `Every round you pick two actions and lock them in. Click `
        + `${act(T, 'ship')} on the right — it carries goods from your `
        + `${T.terms.station.name.toLowerCase()} down to a bay and pays you for it.`,
    highlight: () => ({ kind: 'ui', sel: '[data-act="ship"]' }),
    // Only this action is clickable while the step is live. A first-timer who
    // picks something else strands the tutorial: the step never completes and the
    // hint keeps asking for an action whose slot is already spent.
    requires: 'ship',
    check: (g, ui) => ui.program.includes('ship'),
    hint: (T) => `Click ${actName(T, 'ship')} in the panel on the right.`,
  },
  {
    id: 'pick-second',
    title: (T) => `Now choose ${actName(T, 'build')}`,
    body: (T) => `Pair shipping with expansion. ${act(T, 'build')} raises a new `
        + `${T.terms.station.name.toLowerCase()} on an empty site next to one you `
        + `hold — more ${T.terms.station.name.toLowerCase()}s means more goods to `
        + `carry. Building costs more with each one you own, so the early ones are `
        + `the cheap ones.`,
    highlight: () => ({ kind: 'ui', sel: '[data-act="build"]' }),
    // Ship + Build, not Ship + Dredge. On round one every channel is at full depth,
    // so Dredge has NO legal target and simply fizzles — the old tutorial taught a
    // dead move. Build works turn one, teaches "grab land early" (which the game
    // rewards), and gives a second station to ship from. Dredge is introduced by
    // the tolls step below, forward-looking, once silt has made a channel worth
    // repairing.
    requires: 'build',
    check: (g, ui) => ui.program.includes('build'),
    hint: (T) => `Click ${actName(T, 'build')} for your second slot.`,
  },
  {
    id: 'commit',
    title: () => 'Lock it in',
    body: (T) => 'Press commit. Everyone reveals at once and resolves in seat order — '
        + 'you cannot change your mind partway through, which is the whole tension '
        + 'of the game. You will be asked to click the board to aim each action. '
        + `And a rule worth knowing now: both your actions resolve first, then silt `
        + `settles only after — so you can never ${actName(T, 'ship')} a channel and `
        + `${actName(T, 'dredge')} it clean again in the same round. Repairs always `
        + `land a turn behind the damage.`,
    highlight: () => ({ kind: 'ui', sel: '#go' }),
    check: (g, ui) => ui.roundsPlayed >= 1,
    hint: () => 'Press "Commit & resolve", then follow the prompts on the board.',
  },
  // Reflect: point at what the player's own actions just did to the board.
  {
    id: 'read-water',
    title: () => 'Look at what that cost',
    body: (T) => `The channels you just used are shallower. At `
        + `${T.terms.depth.name} 1 a channel is one trip from dying, and a dead one `
        + `is dry cracked mud that nobody can reopen — not you, not anyone. `
        + `The small dot on your ${T.terms.station.name.toLowerCase()} tracks this `
        + `for you: green while it still reaches the sea, amber when its route is one `
        + `trip from closing, red once it is cut off and scoring nothing.`,
    highlight: () => ({ kind: 'legend' }),
    check: null,
  },
  {
    id: 'tolls',
    title: (T) => `Next round: ${actName(T, 'dredge')} to earn from others`,
    body: (T) => `Now that channels are shallow, ${act(T, 'dredge')} finally has `
        + `something to do. It deepens a channel AND claims it — a marker in your `
        + `colour appears, and everyone else pays you ${T.terms.toll.name} to pass `
        + `through. Claim the busy water and repairing the river becomes rent, not `
        + `charity. Watch the "Claimed channels" list to see who holds what.`,
    // No highlight on a claim marker: nothing is claimed yet this round (we shipped
    // and built, not dredged), so this teaches Dredge forward-looking, for the round
    // the player is about to take on their own.
    highlight: null,
    check: null,
  },
  {
    id: 'free',
    title: () => 'That is the whole game',
    body: (T) => `Fill ${contracts(T)} before the water you need is gone. Everything `
        + `else is timing. Press Rules any time for the full rulebook. `
        + `Good luck, ${T.terms.player.name}.`,
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
