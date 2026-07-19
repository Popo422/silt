# SILT

A river-delta euro board game. 2–4 players, ~60–75 min.

**The pitch:** your shipping lanes are also the thing your shipping destroys. Every cube you move down a channel silts it one step closer to dead. The delta stays navigable only if players collectively pay to dredge it — and any player who defects to pure profit rides free on everyone else's maintenance.

No hidden information. No take-that cards. You lose because you misread the board, not because someone ambushed you.

---

## Play it

```bash
npm install
npm run play      # opens the prototype at localhost:5178
```

You are the gold player against three bots. Program two actions per round, commit, watch it resolve.

---

## The rules

### Round structure

1. **Program** — choose 2 of the 4 actions, in order. Everyone simultaneously.
2. **Reveal** — all programs flip. Locked, no aborts.
3. **Resolve slot 1** in seat order, then **slot 2**.
4. **Silt** — every channel that carried cargo this round drops 1 depth. Max 1 per channel per round.
5. **Regrow** — the emptiest node gains a cube back.
6. **Upkeep** — pay 1c per station beyond your first 4.

Eight rounds.

### Actions

| Action | Effect |
|---|---|
| **Dredge** | +1 depth to one channel. Costs 1c. Cannot revive a SILTED channel. |
| **Build** | Station on an empty adjacent node. Costs 1c + 1 per station owned. Arrives with 2 cubes. |
| **Ship** | Move ≤2 cubes from one of your stations to a mouth. Pays 2c/cube + 1c/channel crossed. |
| **Survey** | +3c, draw 3 contracts keep 1. |

Channels run 3 → 2 → 1 → **SILTED**. Depth 1 is still navigable; SILTED is gone permanently.

### Scoring

- **Contracts** — 5 / 9 / 15 VP (local / regional / delta)
- **Mouth majority** — 8 / 4 / 1 VP per mouth, ties shared
- **Live network** — 2 VP per station still reaching the sea at depth ≥2
- **Coins** — 1 VP per 5
- **Silt penalty** — −1 VP per dead channel touching your stations

Stations score **nothing** on their own. Only working routes count.

---

## Repo layout

| File | What it is |
|---|---|
| `graph.js` | Delta topology — 20 nodes, 31 channels, 3 mouths |
| `engine.js` | Pure rules engine. All tuning constants live in `TUNING` |
| `ai.js` | Five bot archetypes used to stress the balance |
| `index.html` / `ui.js` | Browser prototype (SVG, no build step) |
| `engine.test.js` | 72 unit tests |
| `e2e/game.spec.js` | 27 Playwright tests |
| `sim.mjs` | Headless balance simulator |
| `analyze.mjs` | Topology analysis — chokepoints, route counts |

```bash
npm test          # unit
npm run e2e       # browser
npm run sim       # 400-game balance report
npm run analyze   # map topology
```

---

## Design notes

The bot archetypes exist to answer specific balance questions:

- **defector** never dredges → is freeloading on the commons profitable?
- **steward** over-maintains → is maintenance a sucker's bet?
- **expander** builds relentlessly → is escalating build cost a real brake?
- **turtle** sits on 3 stations near a mouth → can you win by ignoring the map?

Current results (400 games each, competent fields): heads-up is 51/49, the 4-way mirror sits at 26%, and `defector` collapses to 0.8–6% — freeloading loses. `expander` only dominates when its opponents are deliberately crippled bots.

### Known open issues

- **Scores land at ~25–33, below the 45–60 target.** The VP economy is still undertuned.
- **Only 2–7 of 31 channels silt per game.** The delta doesn't degrade as dramatically as the design intends — this is the central premise and it's currently too gentle.
- The `balanced` bot gates building behind `coins >= cost + 2`, which makes it too passive in some fields and skews 3p results.

### Tuning

Everything is in `TUNING` at the top of `engine.js`. Change a value, run `npm run sim`, read the win rates. The simulator is the point — it turns "I think dredging is too strong" into a number in about four seconds.
