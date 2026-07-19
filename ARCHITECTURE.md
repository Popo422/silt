# Architecture

How this codebase is arranged, and the rules that keep it from turning into
spaghetti. Read this before adding a feature.

## The shape

```
graph.js      the delta's topology: nodes, channels, tiers. Data only.
engine.js     the rules. Pure functions over game state. No DOM, no rendering.
ai.js         bot strategies. Reads state, returns an action. No DOM.
theme.js      vocabulary and palette. Presentation only — the engine never imports it.
tutorial.js   the guided first game: a list of steps.
rulebook.js   the rules pages, built from live TUNING.

board.js      paints the SVG delta from a state snapshot.
fx.js         animates engine events on an overlay.
panzoom.js    viewBox pan/zoom. Knows nothing about the game.
tips.js       delegated hover help. Knows nothing about the game.
ui.js         everything else: menu, turn flow, the panel, wiring.
```

Dependencies run **one way**: `graph → engine → ai`, and everything presentational
depends on those, never the reverse. `engine.js` must never import `theme.js`,
`ui.js`, or anything that touches the DOM.

## The rules

### 1. The engine stays pure

`engine.js` is state in, state out. No `document`, no timers, no colours. This is
what makes `sim.mjs` able to play 200 games in a second and `sweep.mjs` able to
tune parameters — both would be impossible if the rules needed a browser.

If you are tempted to put a rule in `ui.js` because it's easier there: don't. That
rule then can't be simulated, and every balance number in the repo becomes a lie.

### 2. Presentation never changes behaviour

`theme.js` swaps words and colours. It must never change what an action does or
what anything costs. There is a test asserting the two themes produce identical
game outcomes — keep it that way, or every measurement stops meaning anything.

### 3. Renderers take a context, not globals

`board.js` receives everything it needs as an argument:

```js
paintBoard({ svg, g, human, playerColors, theme, pendingAction, ... })
```

It reads no module-level UI state. This is why it could move to its own file at
all. **When you add something to the board, add it to the ctx — do not reach back
into `ui.js`.**

Same for `fx.js`, `panzoom.js`, `tips.js`. The two places `panzoom` genuinely
needs game state (don't pan while aiming, don't steal keys while the rulebook is
open) arrive as injected predicates.

### 4. Module-level mutable state is the warning sign

`ui.js` accumulated 33 module-level `let`s. Every one is a channel by which two
distant functions can silently couple — and each of the last three bugs in this
file came from exactly that (`committedThisRound` set in one place, read in
another, cleared in two more, timed wrong twice).

Before adding a `let` at module scope, ask whether it can be:
- derived from `g` (the game state) instead of tracked separately
- passed as an argument
- owned by the module that actually cares

### 5. Numbers come from TUNING

Never hardcode a cost, a payout, or a round count in UI copy or the rulebook.
Interpolate from `TUNING` so text cannot drift from rules. The rulebook and the
action descriptions both do this; there is a test that the rulebook quotes live
values.

### 6. Tests assert behaviour, not implementation

This has bitten repeatedly:

- Tests pinned `line.ch` and broke when channels became `<path>` ribbons. The
  contract was "31 channels carrying a depth", not "31 SVG lines".
- Tutorial tests hardcoded `"Step 4 of 9"` and `"click Next three times"`, so
  adding one orientation step broke five tests at once. They navigate by step
  **id** now.
- A commodity test asserted `<use href="#ic-timber">` and broke the moment
  painted art was wired in.

Ask: *if I reimplemented this feature correctly a different way, would the test
still pass?* If no, the test is over-specified.

### 7. Judge assets at the size they ship at

Generated art that looks great at 768px routinely turns to mush at 40px. The
contact sheet in `assets/gen/index.html` renders everything at 64/40/28px for
exactly this reason. Board markers were cut for this — they were beautiful and
illegible.

## Adding things

**A new rule** → `engine.js`, plus unit tests, then run `node sim.mjs` to check it
didn't wreck the balance. Anything that changes win rates by more than a few
points needs a `sweep.mjs` run.

**A new visual** → `board.js` if it's on the map, `fx.js` if it's a moment in
time. Add what you need to the ctx; don't import `ui.js`.

**A new UI panel** → if it's more than ~80 lines, it's a module. `ui.js` is 826
lines and already too big; do not grow it.

**A new theme term** → `theme.js`, and make sure the tutorial and rulebook read it
rather than hardcoding a word. There is a test that the tutorial names actions
exactly as the buttons paint them — it exists because the tutorial once said
"pick SHIP" while the button said "Bangka".

## Running things

```
npx vitest run                 unit tests (rules, copy)
npx playwright test            e2e (140 tests, ~2min)
node sim.mjs                   balance across bot matchups
node sweep.mjs                 parameter sweep
node audit.mjs                 how often each rule actually fires
node gen-assets.mjs            list asset batches + cost
```

`playthrough.spec.js` deliberately runs **with animation on** — its whole job is
proving the game is completable at the speed a human plays. The other suites run
with `speed: 'off'`.

## Known soft spots

- **`ui.js` at 826 lines** still does menu, turn flow, and panel rendering. The
  next split is probably `menu.js` (it only runs before a game starts).
- **Bots never model opponents.** They are hand-written heuristics, so they cannot
  find emergent lines. Turtle wins ~45% in the all-comers field.
- **Place names need a native-speaker check.** The upstream Pampanga names are the
  shakiest part; `theme.js` flags which ones.
