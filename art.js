// Where the painted art lives.
//
// Split out of ui.js as a table of asset paths — pure data with no logic, which
// is exactly the kind of thing that should not be sitting in the middle of the
// UI controller.
//
// Only covers pieces where a painted sprite beats a flat glyph. Board markers and
// coins are deliberately absent: they render around 40px and below, where painted
// detail collapses into a coloured blob and a crisp SVG shape wins. Anything not
// listed here falls through to the sprite sheet, so this table can grow one entry
// at a time without touching a call site.
//
// Declared BEFORE icon() reads it. It worked either way because icon() is not
// called until after module evaluation, but a const referenced above its
// declaration is a temporal-dead-zone crash waiting for someone to move a call.
export const ART = {
  bangka:  './assets/art/art-ship-cut.png',
  hukay:   './assets/art/art-dredge-cut.png',
  tayo:    './assets/art/art-build-cut.png',
  tanaw:   './assets/art/art-survey-cut.png',
  ship:    './assets/art/art-ship-cut.png',
  dredge:  './assets/art/art-dredge-cut.png',
  build:   './assets/art/art-build-cut.png',
  survey:  './assets/art/art-survey-cut.png',
  kawayan: './assets/art/art-timber-cut.png',
  timber:  './assets/art/art-timber-cut.png',
  grain:   './assets/art/art-grain-cut.png',
  salt:    './assets/art/art-salt-cut.png',
  // Player pieces, one per seat colour. Painted rather than a tinted shared
  // sprite: see the note in board.js.
  'piece-p0': './assets/art/piece-p0-cut.png',
  'piece-p1': './assets/art/piece-p1-cut.png',
  'piece-p2': './assets/art/piece-p2-cut.png',
  'piece-p3': './assets/art/piece-p3-cut.png',
  // Two-season art (Phase 1-2). The amihan/habagat pair heads the season banner; the
  // flood/cascade pieces mark the wet-season beats. Generated via `node gen-assets.mjs
  // seasons` and promoted from assets/gen/.
  'season-amihan':  './assets/art/season-amihan.png',
  'season-habagat': './assets/art/season-habagat.png',
  'flood-surge':    './assets/art/flood-surge.png',
  'anod-cascade':   './assets/art/anod-cascade.png',
  bagyo:            './assets/art/bagyo.png',
};
