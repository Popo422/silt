// ANOD — Filipino theme layer.
//
// Setting: the Pasig–Pampanga delta into Manila Bay, c. 1400s, before Spanish
// contact. Rival barangay polities — Tondo, Maynila, Namayan and their neighbours
// — controlled river access and taxed the trade moving through it. Chinese junks
// came for gold, and the river silted shut a little more every year.
//
// This is a presentation layer only. graph.js/engine.js never import it, so the
// rules and every balance measurement stay identical.
//
// TERMINOLOGY NOTES (flagged where I am not certain):
//  - "balangay" is both the plank-built boat and the community it carried; the
//    settlement sense is where "barangay" comes from. Used here for a station.
//  - "datu" is the chief of a barangay. Used for players.
//  - "anod" means drift / carried-away-by-current. Chosen for the silting theme.
//    A native speaker may prefer "putik" (mud) or "banlik" (silt deposit) —
//    worth checking before this is more than a prototype.
//  - Place names below are real delta-region settlements. I have kept them to
//    ones that are well attested; the upstream Pampanga names are the shakiest
//    part and should be reviewed.

export const THEME = {
  id: 'anod',
  title: 'ANOD',
  subtitle: 'drift · silt · the river carries it away',
  pitch: `A delta euro set in the Pasig before Spanish sails. You are rival <b>datu</b>
    moving <b>kalakal</b> down to the bay — and every trip you make chokes the
    channel behind you. <b>The river dies because everyone is prospering.</b>
    No hidden cards. You lose because you misread the water.`,

  // --- actions -------------------------------------------------------------
  // name = Tagalog label, gloss = what it does in English.
  actions: {
    dredge: { name: 'Hukay',  gloss: 'dredge',  note: 'dig the channel open, claim its toll' },
    build:  { name: 'Tayô',   gloss: 'settle',  note: 'raise a new balangay' },
    ship:   { name: 'Bangka', gloss: 'ship',    note: 'run cargo down to the bay' },
    survey: { name: 'Tanáw',  gloss: 'survey',  note: 'scout for trade agreements' },
  },

  // --- goods ---------------------------------------------------------------
  goods: {
    timber: { name: 'Kawayan', gloss: 'bamboo', icon: 'kawayan' },
    grain:  { name: 'Palay',   gloss: 'rice',   icon: 'grain'   },
    salt:   { name: 'Asin',    gloss: 'salt',   icon: 'salt'    },
  },

  // --- pieces / concepts ---------------------------------------------------
  terms: {
    station:  { name: 'Balangay', gloss: 'settlement' },
    coins:    { name: 'ginto',    gloss: 'gold' },
    toll:     { name: 'singil',   gloss: 'toll' },
    contract: { name: 'Kasunduan',gloss: 'agreement' },
    mouth:    { name: 'Look',     gloss: 'bay' },
    channel:  { name: 'Sapa',     gloss: 'channel' },
    silted:   { name: 'Barâ',     gloss: 'blocked' },
    depth:    { name: 'lalim',    gloss: 'depth' },
    round:    { name: 'Taon',     gloss: 'year' },
    player:   { name: 'Datu',     gloss: 'chief' },
  },

  // --- map ------------------------------------------------------------------
  // Upstream (tier 0-2) are Pampanga/Laguna-side settlements; tier 3-4 are the
  // Pasig delta proper; the three mouths are real bay-side landmarks.
  nodes: {
    S:  'Wawa',        // "river mouth/gorge" — the headwater gorge
    U1: 'Angat',       // Angat river, a real Pampanga tributary
    U2: 'Bulakan',
    U3: 'Kalumpit',    // Calumpit, junction of the Pampanga and Angat
    U4: 'Meycauayan',
    U5: 'Marilaw',     // Marilao
    U6: 'Bocaue',
    U7: 'Hagonoy',
    M1: 'Malabon',
    M2: 'Tundó',       // Tondo — the great rival polity
    M3: 'Maynilà',     // Maynila — the central chokepoint, fittingly
    M4: 'Namayan',     // Namayan/Sapa, upriver polity on the Pasig
    M5: 'Taytáy',
    L1: 'Navotas',     // "taboan" fishing settlements on the bay edge
    L2: 'Tambobong',
    L3: 'Pasay',       // from Pasay, a Namayan-affiliated settlement
    L4: 'Parañaque',
    A:  'Look Kanluran',   // western bay
    B:  'Look Gitna',      // middle bay
    C:  'Look Silangan',   // eastern bay
  },

  // Short label for the board (the full names are too long at node size).
  short: {
    S: 'Wawa', U1: 'Angat', U2: 'Bulakan', U3: 'Kalumpit', U4: 'Meycau',
    U5: 'Marilaw', U6: 'Bocaue', U7: 'Hagonoy', M1: 'Malabon', M2: 'Tundó',
    M3: 'Maynilà', M4: 'Namayan', M5: 'Taytáy', L1: 'Navotas', L2: 'Tambobong',
    L3: 'Pasay', L4: 'Parañaque', A: 'Kanluran', B: 'Gitna', C: 'Silangan',
  },

  // --- bots -----------------------------------------------------------------
  bots: {
    balanced:   { name: 'Mangangalakal', gloss: 'trader',
                  desc: 'settles early, trades steadily, patches what is failing' },
    tollkeeper: { name: 'Maniningil',    gloss: 'toll-taker',
                  desc: 'digs the channels you need and charges you to pass' },
    steward:    { name: 'Tagapag-alaga', gloss: 'caretaker',
                  desc: 'keeps its own waters deep above all else' },
    expander:   { name: 'Manlulupa',     gloss: 'land-taker',
                  desc: 'settles relentlessly, thin on upkeep' },
    turtle:     { name: 'Nakatanim',     gloss: 'rooted',
                  desc: 'three balangay by the bay, never leaves' },
    defector:   { name: 'Taga-labas',    gloss: 'outsider',
                  desc: 'never digs, rides on everyone else\'s work' },
  },

  // --- palette --------------------------------------------------------------
  // Warmer and more tropical than the original cold slate: river browns, bamboo
  // greens, and a gold drawn from pre-colonial goldwork rather than the old amber.
  palette: {
    '--bg':      '#0f1512',
    '--panel':   '#16201b',
    '--panel2':  '#111a16',
    '--line':    '#25352b',
    '--line2':   '#354c3c',
    '--ink':     '#eae6d9',
    '--dim':     '#93a08c',
    '--dim2':    '#6b7a68',
    '--water3':  '#3c7f78',
    '--water2':  '#4a6f5c',
    '--water1':  '#6b6a4a',
    '--dead':    '#4a3620',
    '--gold':    '#e8b552',
    '--p0':      '#e8b552',
    '--p1':      '#6fb8c4',
    '--p2':      '#9ac96b',
    '--p3':      '#d98a72',
    '--timber':  '#9dbb6a',
    '--grain':   '#e0c96a',
    '--salt':    '#cfe4e0',
  },

  // Sprite ids used for board furniture and the action buttons.
  icons: {
    station: 'balangay', mouth: 'look', logo: 'river', dead: 'silted',
    dredge: 'hukay', build: 'tayo', ship: 'bangka', survey: 'ginto',
  },

  // Rules text shown on the menu, in the game's own vocabulary.
  legend: { deep: 'malalim', mid: '2', shallow: '1 — mababaw', dead: 'barâ' },
};

// The original English theme, so the two can be switched at runtime.
export const PLAIN = {
  id: 'silt',
  title: 'SILT',
  subtitle: 'a river delta game',
  pitch: `A river delta euro. You ship goods to the sea — and every shipment chokes
    the channel it used. <b>The map dies because everyone is winning.</b>
    No hidden cards, no take-that. You lose because you misread the board.`,
  actions: {
    dredge: { name: 'Dredge', gloss: '', note: 'restore depth, claim its toll' },
    build:  { name: 'Build',  gloss: '', note: 'new station' },
    ship:   { name: 'Ship',   gloss: '', note: 'cargo to the sea' },
    survey: { name: 'Survey', gloss: '', note: 'draw contracts' },
  },
  goods: {
    timber: { name: 'Timber', gloss: '', icon: 'timber' },
    grain:  { name: 'Grain',  gloss: '', icon: 'grain'  },
    salt:   { name: 'Salt',   gloss: '', icon: 'salt'   },
  },
  terms: {
    station: { name: 'Station', gloss: '' }, coins: { name: 'coins', gloss: '' },
    toll: { name: 'toll', gloss: '' }, contract: { name: 'Contract', gloss: '' },
    mouth: { name: 'Mouth', gloss: '' }, channel: { name: 'Channel', gloss: '' },
    silted: { name: 'Silted', gloss: '' }, depth: { name: 'depth', gloss: '' },
    round: { name: 'Round', gloss: '' }, player: { name: 'Player', gloss: '' },
  },
  nodes: null,    // null = use raw graph ids
  short: null,
  bots: {
    balanced:   { name: 'balanced',   gloss: '', desc: 'expands early, ships, patches what is dying' },
    tollkeeper: { name: 'tollkeeper', gloss: '', desc: 'dredges the routes you need and charges you' },
    steward:    { name: 'steward',    gloss: '', desc: 'maintains its own network above all' },
    expander:   { name: 'expander',   gloss: '', desc: 'builds relentlessly, thin on maintenance' },
    turtle:     { name: 'turtle',     gloss: '', desc: 'three stations by a mouth, never leaves' },
    defector:   { name: 'defector',   gloss: '', desc: 'never dredges, rides on everyone else' },
  },
  palette: {
    '--bg':'#0b1316','--panel':'#111d21','--panel2':'#0c1619','--line':'#1e3238',
    '--line2':'#2a464f','--ink':'#e4eef0','--dim':'#7e969c','--dim2':'#5d757b',
    '--water3':'#2f7d9e','--water2':'#2b5f75','--water1':'#4a5a55','--dead':'#3a2818',
    '--gold':'#e0a458','--p0':'#e0a458','--p1':'#7fb2d9','--p2':'#8fce7a','--p3':'#d97f9e',
    '--timber':'#c07f43','--grain':'#d9c765','--salt':'#a9dfe6',
  },
  icons: {
    station: 'station', mouth: 'mouth', logo: 'river', dead: 'silted',
    dredge: 'dredge', build: 'build', ship: 'ship', survey: 'survey',
  },
  legend: { deep: 'deep 3', mid: '2', shallow: '1 — fragile', dead: 'silted' },
};

export const THEMES = { anod: THEME, silt: PLAIN };

export function applyTheme(t) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.palette)) root.style.setProperty(k, v);
  document.title = t.id === 'anod'
    ? 'ANOD — a river delta game' : 'SILT — a river delta game';
}

// Node label for the board.
export const nodeLabel = (t, id) => t.short?.[id] ?? id;
// Full name for tooltips / log.
export const nodeName  = (t, id) => t.nodes?.[id] ?? id;
