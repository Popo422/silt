# SILT — Two-Season Roadmap (Amihan → Habagat)

The idea: a game is a **Taon** (year) split into two halves. **Amihan** (dry NE
monsoon) is a one-way ratchet — the delta silts, water only gets worse, you prep.
**Habagat** (wet SW monsoon) refills the channels but brings the danger: silt now
*travels* (Anód), and a **Bagyo** builds visibly toward a finale. **Tanáw** (survey)
is upgraded to forecast the water, so the whole second half rewards reading it and
punishes misreading it. Balangay and dredge-claims persist across the turn; contracts
may not (open question).

Design bar for every feature: **"you lose because you misread the water."** Anything
that's pure dice (unforecastable) gets cut or made readable via Tanáw.

## Locked keepers (from brainstorm)

1. Two-season structure (Amihan dry ratchet → Habagat wet).
2. **Cascading Anód** — in Habagat, a silting channel pushes sediment downstream.
3. **Tanáw forecasts** — survey reveals what the flood/bagyo will hit next.
4. **Bagyo** — one scripted, visible, escalating typhoon that lands late.

Cut/parked (bloat or redundant): Baha double-silt (folded into cascade), debris,
carved channels, portage, famine, salt-line, tidal rhythm, asymmetric datu abilities.

---

## Why phased

This touches the core: the round loop (`sim.mjs` / `ui.js` share
`silt→bayBonus→regrow→upkeep`), `TUNING`, `newGame` state, scoring cadence, the UI's
season/forecast display, AND the MCTS bot — whose rollouts must know the new rules or
it plays the wet season like the dry one and gets dumb again. Each phase below is
**independently shippable and reversible behind a flag**, with a checkpoint to feel it
before committing to the next.

Guardrails carried through every phase:
- Gate new rules behind a `TUNING.seasons` (and per-feature) flag so `main` stays
  playable and sims can A/B with/without.
- After any rules change, **re-run `npm run sim`** and confirm MCTS still wins
  ~70%+ vs the ladder bots. A rules change that makes the game shallower is the main
  risk — the sim is the tripwire.
- Keep the 118-test line-count / boundary guards green; split modules if a file grows.

---

## Phase 0 — Design lock & scaffolding  *(no gameplay change)*  ✅ DONE

**Goal:** agree the numbers on paper; add the flag + season plumbing with dry-season
behavior identical to today.

Decisions locked: **6+6 (12 total)**, contracts persist, reckoning off, tide parked.

Shipped:
- `TUNING.seasons=false`, `TUNING.roundsPerSeason=6`; helpers `totalRounds()`,
  `seasonOf(round)`, `isSeasonTurn(round)` in engine.js; `g.season` on state.
- All three round loops (sim.mjs, ui.js, mcts.js rollout) now use `totalRounds()` and
  refresh `g.season` each round. The mcts clone carries `season`. **This was load-
  bearing for the bot** — its rollout previously hard-stopped at `TUNING.rounds` (8)
  and would have mis-evaluated every position once the game is 12 rounds.
- 17 new tests in `seasons.test.js`: flag-off byte-identity, flag-on exact-halves,
  boundary/off-by-one at the season seam, cross-cutting invariants, and full-game
  integration (incl. an mcts game that must complete over 12 rounds). All 135 green.

⚠️ **ui.js is at the 1100-line cap.** The boundary guard fired repeatedly during this
phase. Phase 1+ adds real season UI (banner, later forecast highlights) and there is NO
room — **the first Phase-1 UI task must be to split something out of ui.js**, not shave
comments. The guard's own note says "split, not bump again."

**Checkpoint:** ✅ flag off → identical play & sims (verified by test + manual). Flag on
→ 12 rounds, visits both seasons, no errors, mcts still completes.

## Phase 1 — The transition (Amihan → Habagat refill)  ✅ CORE DONE

**Goal:** the pivot moment. Water comes back; what you built persists.

Shipped:
- `floodPhase(g)` in engine.js — fires once on the season turn (no-op otherwise, so all
  three round loops call it unconditionally at the top of the round). Refills every
  living channel by `TUNING.floodRefill` (capped at maxDepth); dead channels get a
  seeded ~50% `floodRevive` back to depth 1 as a FRESH contest (owner + markers
  cleared). Stations and living-channel claims are deliberately untouched.
- Wired into sim.mjs, ui.js (its own flush = a visible "rains arrive" beat), and the
  mcts rollout (clone now carries `g.rand` so the seeded revive works in search).
- First ui.js split done to make room: `glossaryHTML(T)` moved to theme.js (ui.js
  1100 → 1085). Headroom restored.
- 10 new flood tests: inert off-turn / seasons-off, cap at maxDepth, stations+claims
  untouched, revive clears ownership, revive-off keeps dead dead, determinism, single
  event, and a full-game "depth higher just after the turn" check. 145 total green.

Verified by hand: a seasons-on game ratchets down through Amihan (avg depth 2.86→2.05,
dead climbing), the R7 flood lifts it back (2.05→2.68, dead 5→2), then Habagat resumes
the decline — the intended prep-then-relief rhythm.

Still TODO in this phase (polish, not blocking):
- A real flood **animation** (currently the `flood` fx event falls through to the
  no-op default; reuse the silt-sweep renderer in reverse) + a **season banner** in
  the UI so the player is told Habagat has begun. Art budget is available for this.
- **Reckoning** stays parked/off per the locked decisions.

**Checkpoint:** ✅ transition feels like relief-then-opportunity (verified numerically).
✅ MCTS re-sim: seasons OFF mcts 75% vs 2bal; seasons ON mcts **100%** vs 2bal, **90%**
vs smart. The two-season game is DEEPER, not shallower — the ladder bots play the wet
season like the dry one and get crushed, the search bot plans across the transition.
Note: 100% vs the ladder means those bots are no longer a useful seasons-mode
benchmark; mcts-vs-mcts becomes the real balance test once seasons are default.

## Phase 2 — Cascading Anód  *(the intensity core)*  ✅ CORE DONE

**Goal:** make the game's namesake literal in the wet season.

Shipped:
- In `siltPhase`, Habagat-only: after the primary silting, each channel that dropped
  drags its DOWNSTREAM neighbours down by `TUNING.cascadeDrop`. Single non-recursive
  wave — a `cascaded` set caps each channel to one hit per sweep, so no avalanche.
  Dropped entries carry a `cause` ('ship' | 'cascade'); the silt event carries a
  `cascade` count. Cleared claims on a cascade-killed channel, same as a normal death.
- Gated behind `TUNING.cascadeAnod` (+ seasons + habagat). No effect in Amihan or with
  the flag off, verified.
- 7 cascade tests: no-cascade in Amihan / flag-off, one-hop downstream, downstream-only
  (never upstream), single-wave cap, the political bite (silts a channel you never
  shipped), and cascade-kills-and-clears-claim. 152 total green.

**Art (this phase):** generated 4 season assets via Together.ai/FLUX (`node
gen-assets.mjs seasons`, ~$0.01): `season-amihan` (dry sun / cracked earth),
`season-habagat` (monsoon rain / swollen sea), `flood-surge`, `anod-cascade` (brown
silt bleeding into teal — literally the cascade). Promoted the pair into assets/art/,
registered in art.js, and built a **season banner** in the header (icon + "Amihan —
dry" / "Habagat — wet"), hidden in the single-season game. `seasonLabel()` extracted to
theme.js (second ui.js split — back under the line cap). Verified live in the browser:
banner renders with art, flood fires, zero page errors.

Still TODO (polish, non-blocking): a distinct **cascade fx animation** (the silt event
now carries `cause`/`cascade` so fx.js can tint cascade drops differently) and a
flood-surge animation on the transition. The `flood`/cascade fx currently fall through
to the no-op default.

**Checkpoint:** ✅ one ship visibly silts a channel downstream you never touched — the
second half is now political. Sim guardrail (silted count, bay reachability, MCTS win%
with cascade on): PENDING — run before Phase 3.

## Phase 3 — Tanáw forecasts  *(the legitimizer)*

**Goal:** convert wet-season danger from dice into skill.

- Survey (Tanáw) gains: reveal next round's silt/cascade hotspots and/or the Bagyo's
  path & landfall round.
- Store a `g.forecast` the UI can render (highlight at-risk channels) and the bot can
  read.
- **MCTS must use it** — the search already simulates the engine, so if forecasts are
  real state, rollouts see them; verify the bot dredges defensively ahead of a hit.

**Checkpoint:** does surveying now feel powerful (not a filler action)? Does ignoring a
forecast get you punished? Re-sim.

## Phase 4 — Bagyo  *(the climax)*

**Goal:** an ending, not a stopping point.

- A storm builds over the last Habagat rounds; on a set (forecastable) round it hits a
  region and kills channels outright (depth→0). Visible countdown.
- Interacts with Phase 3: you can *see it coming* and dredge/route around it or race to
  cash contracts before landfall.

**Checkpoint:** does the finale spike tension? Is it survivable-if-you-read-it? Full
playtest + sim, MCTS re-verified end to end.

## Phase 5 — Re-balance & bot hardening  *(make it stick)*

**Goal:** tune the whole two-season arc as one system; confirm the bot is still sharp.

- Sweep the new `TUNING` knobs (season length, cascade fraction, bagyo severity,
  forecast depth) with `sweep.mjs`.
- Re-run the full tournament; ensure MCTS wins ~70%+ across matchups WITH seasons on.
- Update `ARCHITECTURE.md` / `rulebook.js` so the printed rules match the engine.

**Checkpoint:** seasons on by default; bot still hard; rules doc accurate.

---

## Open questions (decide in Phase 0)

1. **Game length:** two 8-round seasons (16 total) or split the current 8 into 4+4?
2. **Contracts across the turn:** persist, or do dry-season buyers leave and wet-season
   buyers arrive wanting different goods (forcing a mid-game pivot)?
3. **Reckoning at the turn:** yes/no — pay-or-lose upkeep at the season pivot?
4. **Wet-season texture:** climax-focused (Bagyo, as planned) is locked; do we ever
   want the tidal rhythm instead, or is that permanently cut?

## Risks

- **Length:** 16 rounds may drag. Phase 0 checkpoint must judge pacing before we build
  on top.
- **Bot regression:** every rules phase can make the game shallower; the sim tripwire
  after each phase is mandatory, not optional.
- **Reachability:** cascade + bagyo both threaten to strand bays — the exact failure the
  braided map fixed. Watch that metric in Phases 2 and 4.
- **Scope creep:** the parked ideas will keep looking tempting. The bar holds: does it
  serve "misread the water"? If not, it stays parked.
