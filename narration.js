// What the demo says, and when.
//
// Split out of demo.js, which had grown past the point of doing one job: the
// controller logic and 200-odd lines of prose are edited for completely
// different reasons and by different kinds of change. This file is the script;
// demo.js is the projector.
//
// Two kinds of line. INTRO teaches the game on a still board before anything
// moves. AMBIENT plays at a fixed {round, slot} boundary. REACTIVE waits for an
// engine event and points at it — those are the ones that feel alive, because
// they describe something that genuinely just happened on screen.
//
// `once` is the default: a concept lands the first time and nags after that.

const actName = (T, k) => T.actions[k].name;

export const INTRO = [
  {
    id: 'intro-goal',
    kicker: 'The goal',
    title: () => 'Move goods downstream to the bays',
    body: (T) => `Water runs top to bottom. Goods that reach a bay fill a `
        + `${T.terms.contract.name.toLowerCase()}, and those are most of your `
        + `score. Eight rounds, highest score wins.`,
  },
  {
    id: 'intro-round',
    kicker: 'A round',
    title: () => 'Two actions, chosen blind',
    body: () => `Everyone secretly picks two actions in order, then all the plans `
        + `flip at once. Every player's first action resolves before anyone's `
        + `second — and you cannot change your mind partway through.`,
  },
  {
    id: 'intro-actions',
    kicker: 'Four actions',
    title: (T) => `${actName(T, 'build')} and ${actName(T, 'ship')} are how you score`,
    body: (T) => `${actName(T, 'build')} founds a settlement, which produces goods. `
        + `${actName(T, 'ship')} carries them down to a bay. Those two are the `
        + `engine; the other two feed them.`,
  },
  {
    id: 'intro-support',
    kicker: 'The other two',
    title: (T) => `${actName(T, 'survey')} tells you what to deliver`,
    body: (T) => `${actName(T, 'survey')} draws contracts, so you know which goods `
        + `are worth moving. ${actName(T, 'dredge')} deepens a channel — and `
        + `whoever dredges it collects a toll from everyone else who passes.`,
  },
  {
    id: 'intro-catch',
    kicker: 'The catch',
    title: () => 'Shipping wears out the river',
    body: (T) => `Every channel a boat crosses gets shallower, and a channel that `
        + `runs dry is gone for good. ${actName(T, 'dredge')} is the only repair, `
        + `but repairing is a round you did not spend earning.`,
  },
  {
    id: 'intro-point',
    kicker: 'Why it matters',
    title: () => 'Nobody is attacking anybody',
    body: () => `There is no card you can play at another player. The map falls `
        + `apart because everyone is doing well. Watch the water — that is the `
        + `real story. Here we go.`,
  },
];

export const AMBIENT = [
  {
    id: 'open',
    round: 1, slot: null,
    kicker: 'Round one',
    title: () => 'Here we go — plans are locked in',
    body: () => `All three players have chosen their two actions. Nothing is hidden `
        + `in this game except timing, and timing turns out to be plenty.`,
  },
  {
    id: 'slot-order',
    round: 1, slot: 0,
    kicker: 'Slot 1',
    title: () => 'Everybody\'s first action goes first',
    body: () => `Notice the order here — we go around the table and resolve every `
        + `player's first pick before anyone gets to their second. So it is not just `
        + `what you chose, it is which one you put first. Put a good idea second and `
        + `the river may not be there when you get to it.`,
  },
  {
    id: 'slot-two',
    round: 1, slot: 1,
    kicker: 'Slot 2',
    title: () => 'And now the second ones',
    body: () => `Here is the tension. We locked these in before any of this happened, `
        + `and there is no changing our minds now. You are watching people find out `
        + `whether they guessed right.`,
  },
  {
    id: 'mid-game',
    round: 4, slot: null,
    kicker: 'Halfway',
    title: () => 'Take a look at the water now',
    body: (T) => `Compare that to round one. Here is the thing — nobody attacked the `
        + `river. Not once. Every bit of missing ${T.terms.depth.name.toLowerCase()} `
        + `is just somebody having a good turn. That is the whole idea of the game, `
        + `right there on the board.`,
  },
  {
    id: 'late',
    round: 7, slot: null,
    kicker: 'Endgame',
    title: () => 'We are running out of river',
    body: (T) => `Now, a ${T.terms.station.name.toLowerCase()} only scores at the end `
        + `if it can still reach the sea. So the players who shipped hardest all game? `
        + `They are the ones most likely to be stranded — in water they used up `
        + `themselves. Let us see how that shakes out.`,
  },
];

// Reactive beats. `when(ev, ctx)` gets one engine event plus {g, T, round}.
// Ordered by priority — the first match on a given event wins, so the rarest and
// most instructive beats sit at the top.
export const REACTIVE = [
  {
    id: 'first-death',
    once: true,
    when: (ev) => ev.type === 'silt' && (ev.dropped ?? []).some(d => d.to === 0),
    kicker: 'A channel just died',
    title: () => 'And that water is gone for good',
    body: (T) => `Down to zero — and here is the part that hurts: we cannot dredge it `
        + `back. ${actName(T, 'dredge')} deepens water that still exists, and there is `
        + `nothing left to deepen. Everybody who was using that route goes around now, `
        + `for the rest of the game.`,
  },
  {
    id: 'first-toll',
    once: true,
    when: (ev) => ev.type === 'ship' && (ev.tolls ?? []).length > 0,
    kicker: 'A toll',
    title: () => 'Somebody just paid rent on the river',
    body: () => `See that little circle in somebody else's colour? That channel is `
        + `claimed. Whoever dredged it owns it, and the rest of us pay every time we `
        + `pass through. So fixing up the river is not charity in this game — it is how `
        + `you put a tollbooth on everyone else's route.`,
  },
  {
    id: 'first-blocked',
    once: true,
    when: (ev) => ev.type === 'blocked',
    kicker: 'Blocked',
    title: () => 'Ooh — that plan just fell apart',
    body: () => `The route silted shut before the action even fired. They committed to `
        + `that two slots ago and there was no calling it back. That is the cost of `
        + `choosing blind, and everybody at the table pays it eventually.`,
  },
  {
    id: 'first-dredge',
    once: true,
    when: (ev) => ev.type === 'dredge' && ev.claimed,
    kicker: 'Claim',
    title: (T) => `${actName(T, 'dredge')} fixes the river — and claims it`,
    body: () => `One gold, one extra depth, and watch — a marker goes down. That is `
        + `theirs now. It collects tolls from here on out, and if the channel is still `
        + `deep at the end of the game, it is worth points too. Two birds.`,
  },
  {
    id: 'first-ship',
    once: true,
    when: (ev) => ev.type === 'ship',
    kicker: 'Shipping',
    title: () => 'Goods do not count until they hit a bay',
    body: () => `We pay for each good and for every channel we cross, so a long haul `
        + `is expensive. But here is what I really want you to watch — the wake. Every `
        + `channel that boat just touched gets shallower at the end of the round. `
        + `Earning and wearing out the river are the exact same move.`,
  },
  {
    id: 'first-contract',
    once: true,
    when: (ev) => ev.type === 'contract',
    kicker: 'Contract filled',
    title: (T) => `A ${T.terms.contract.name.toLowerCase()} — and this is most of the score`,
    body: () => `That fills the moment the goods arrive, highest value first — no `
        + `action needed, it just happens. And those points are banked. Even if the `
        + `whole route dries up next round, they keep them.`,
  },
  {
    id: 'first-build',
    once: true,
    when: (ev) => ev.type === 'build',
    kicker: 'New settlement',
    title: () => 'Each one of these costs more than the last',
    body: (T) => `A new ${T.terms.station.name.toLowerCase()} has to go next to one they `
        + `already have, across water they can actually still get through. Spreading out `
        + `reaches more bays — but past four of them you are paying upkeep every single `
        + `round, so there is a real question about how far is too far.`,
  },
  {
    id: 'abandon',
    once: true,
    when: (ev) => ev.type === 'abandon',
    kicker: 'Abandoned',
    title: () => 'They could not make upkeep',
    body: () => `Too many settlements, not enough gold, and one of them has to go. `
        + `Overextending here does not just slow you down — it actively takes things `
        + `off the board.`,
  },
];

