# Generated art — what shipped and why

Generated with Together.ai / FLUX.1-schnell via `gen-assets.mjs`.
~90 images, about **$0.25** total. Prompts live in the script and are reproducible:
seeds are deterministic, so a rerun gives the same images.

## Shipped

| file | source | why |
|---|---|---|
| `art-ship.png` | `act-ship-1` | best of the whole set — clean silhouette, teal/gold, survives 28px |
| `art-dredge.png` | `act-dredge-2` | paddle + ripples, no stray limbs, matches ship |
| `art-build.png` | `act-build-1` | centered, teal water ties it to the palette |
| `art-survey.png` | `act-survey-1` | flat lens; the only variant that avoided photorealism |
| `art-timber.png` | `good-timber-1` | fills frame, unmistakably bamboo |
| `art-grain.png` | `good-grain-1` | reads as grain by shape AND colour, distinct from timber |
| `art-salt.png` | `good-salt-1` | pale basket, distinct from the other two at small size |
| `art-paper.png` | `paper-washed-2` | cleanest texture, no compass rose or fold lines |
| `basemap.png` | `basemap-1` (2nd batch) | the painted delta ground the channels run over — sea band along the bottom where the bays are, ochre floodplain up top where the river starts, mangrove coast between. See below. |

## The board base (`basemap.png`)

The single biggest change since the first art pass. The board used to be flat
parchment (`art-paper` stretched under everything) with the channels floating on
beige — it read as a node graph on paper. `basemap.png` is a painted top-down
delta the live SVG channels run OVER (`drawTerrain` in board.js), so the board is
finally a map: dry land where the river starts, sea where it ends.

Two batches. The first asked for a "top-down aerial painting of the Manila Bay
delta" and got exactly what PICKS warned about below: rendered "Manila Bay" text,
a compass rose, boats, and **its own inked rivers** — which fight the game's live
channels and lie about the board. The word "map" pulls in map furniture.

The second batch reframed it as a "soft muted painted ground TEXTURE ... no rivers,
no channels" with the sea as a bottom band. Judged composited UNDER the real
channels, not on its own — a base that looks great alone but competes with the
linework is useless here.

### Model tier

The final `basemap.png` is **FLUX.2-pro**, not schnell. Worth the note:

- **schnell** (draft, ~$0.003/img) — fine for roughing out the composition, but too
  crude and saturated for the ground.
- **FLUX.1.1-pro** — sharp and detailed, but reads as a *photograph of a beach*, not
  a painted board. Wrong medium.
- **FLUX.2-pro** — nailed the STYLE brief: matte hand-painted board-game look, warm
  parchment palette, muted enough to sit under the channels. This is the winner.

FLUX.1-dev is **not** serverless on this account (needs a paid dedicated endpoint),
so it is not wired. Use `--pro` (FLUX.1.1-pro) or `--pro2` (FLUX.2-pro) for quality.
Note FLUX.2 has no `negative_prompt` param — say what you don't want in the prompt.

The channels themselves stay live SVG, NOT baked into this image: they change depth,
silt up, die, and light up on click every turn. The split is "painted ground, live
water".

## Cut, and why

**`coin-gold`** — every variant failed. First pass gave photorealistic Greco-Roman
coins with garbled fake Latin; describing the shape instead produced a plain sphere
that reads as a ball. A flat SVG circle is clearer at 20px and costs nothing. Some
things should not be generated.

**`node-settlement`, `node-mouth`, `marker-depth`, `silt-blocked`** — good style,
too intricate. Board markers render at ~40px where fine detail collapses into a
coloured blob. Node markers need to be *simpler* than icons, not more detailed.
The existing flat SVG shapes win here.

**Decorated map backgrounds** (`parchment-map`, `delta-map`) — dropped after the
first pass. A drawn map fights the board's own channels and nodes, and both came
back with invented lettering and stray compass roses.

## What we learned about FLUX

1. **Lead with the medium.** "flat two-tone illustration of X" fixed both the
   spyglass and the coin. Without it the model drifts to product photography for
   anything it has seen photographed often.
2. **Negative prompts are unreliable.** `text, compass rose, border` were all in
   `NEG` and all appeared anyway. Crop or avoid rather than fight.
3. **Never ask for margin.** "generous empty margin" put subjects at ~15% of frame
   — about 6 real pixels at board size. Ask it to fill the frame; add margin in code
   where it can be controlled exactly.
4. **Judge at final size.** Everything cut above looks good at 768px. The 40px
   column in the contact sheet is the only view that matters.

## Reproducing

```
node gen-assets.mjs                    # list batches + cost
node gen-assets.mjs actions --n=4      # four variants of each action icon
node gen-assets.mjs bg goods --dev     # final quality, ~9x cost
```

Raw output goes to `assets/gen/` (gitignored). Only hand-picked winners get
promoted here.
