// SILT — delta topology
// Flow is strictly seaward: every edge goes from a lower tier to a higher tier.
// Tiers: 0 = Source, 1-2 = Upper (Timber), 3 = Mid (Grain), 4 = Lower (Salt), 5 = Mouths
//
// Design intent: the fan must WIDEN then RECONVERGE. Widening gives build room;
// reconvergence at the mouths creates the chokepoints that make silt hurt.

export const NODES = [
  // id, tier, good, x, y  (x,y are layout units, 0..100)
  { id: 'S',  tier: 0, good: 'timber', x: 50, y: 4  },

  { id: 'U1', tier: 1, good: 'timber', x: 30, y: 18 },
  { id: 'U2', tier: 1, good: 'timber', x: 50, y: 18 },
  { id: 'U3', tier: 1, good: 'timber', x: 70, y: 18 },

  { id: 'U4', tier: 2, good: 'timber', x: 18, y: 33 },
  { id: 'U5', tier: 2, good: 'grain',  x: 38, y: 33 },
  { id: 'U6', tier: 2, good: 'grain',  x: 62, y: 33 },
  { id: 'U7', tier: 2, good: 'timber', x: 82, y: 33 },

  { id: 'M1', tier: 3, good: 'grain',  x: 12, y: 50 },
  { id: 'M2', tier: 3, good: 'grain',  x: 31, y: 50 },
  { id: 'M3', tier: 3, good: 'salt',   x: 50, y: 50 },
  { id: 'M4', tier: 3, good: 'grain',  x: 69, y: 50 },
  { id: 'M5', tier: 3, good: 'grain',  x: 88, y: 50 },

  { id: 'L1', tier: 4, good: 'salt',   x: 22, y: 68 },
  { id: 'L2', tier: 4, good: 'salt',   x: 40, y: 68 },
  { id: 'L3', tier: 4, good: 'salt',   x: 60, y: 68 },
  { id: 'L4', tier: 4, good: 'salt',   x: 78, y: 68 },

  { id: 'A',  tier: 5, good: null,     x: 20, y: 88 },
  { id: 'B',  tier: 5, good: null,     x: 50, y: 88 },
  { id: 'C',  tier: 5, good: null,     x: 80, y: 88 },
];

// Directed channels, always downstream (tier N -> tier N+1). 37 total.
//
// The lower tiers BRAID: without the cross-links, each arm of the delta fed only
// one bay, so a mid-tier opening on the edge (M1/M5) could reach just ONE bay even
// on a pristine board — a structural lockout, and any contract naming another bay
// was dead from turn one. The braid channels (marked) let the arms cross toward the
// centre, so every opening reaches at least two bays, and the middle three reach
// all three. Edges still reach fewer than the centre — position matters, but no
// one is boxed out before play begins.
export const CHANNELS = [
  ['S','U1'], ['S','U2'], ['S','U3'],

  ['U1','U4'], ['U1','U5'], ['U2','U5'], ['U2','U6'], ['U3','U6'], ['U3','U7'],

  ['U4','M1'], ['U4','M2'], ['U5','M2'], ['U5','M3'],
  ['U6','M3'], ['U6','M4'], ['U7','M4'], ['U7','M5'],

  ['M1','L1'], ['M2','L1'], ['M2','L2'], ['M3','L2'],
  ['M3','L3'], ['M4','L3'], ['M4','L4'], ['M5','L4'],
  ['M1','L2'], ['M2','L3'], ['M4','L2'], ['M5','L3'],   // braid: arms cross inward

  ['L1','A'],  ['L2','A'],  ['L2','B'],
  ['L3','B'],  ['L3','C'],  ['L4','C'],
  ['L1','B'],  ['L4','B'],                              // braid: edges also feed the centre bay
];

export const MOUTHS = ['A','B','C'];
export const GOODS = ['timber','grain','salt'];

export const chKey = (a, b) => `${a}>${b}`;

export function buildIndex() {
  const out = {}, inn = {};
  for (const n of NODES) { out[n.id] = []; inn[n.id] = []; }
  for (const [a, b] of CHANNELS) { out[a].push(b); inn[b].push(a); }
  return { out, inn };
}

export const NODE_BY_ID = Object.fromEntries(NODES.map(n => [n.id, n]));
