import { NODES, MOUTHS, CHANNELS, chKey, NODE_BY_ID } from './graph.js';
import {
  newGame, execute, siltPhase, regrowPhase, upkeepPhase, score, seatOrder,
  buildTargets, dredgeTargets, shipOptions, buildCost, TUNING,
} from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
import { createTutorial, stepText } from './tutorial.js';
import { THEMES, applyTheme, nodeLabel, nodeName } from './theme.js';
import { pages, createRulebook } from './rulebook.js';
import { createFX } from './fx.js';

const HUMAN = 0;
const PC = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)'];
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

const BOT_KEYS = ['balanced', 'tollkeeper', 'steward', 'expander', 'turtle', 'defector'];

let g, program, picking, pendingAction, seed, queue, tut, config;
let roundsPlayed = 0;   // rounds fully resolved this game — drives tutorial gating
let stepping = false;   // re-entry guard for the async resolution walker
let T = THEMES.anod;          // active theme (presentation only)
const book = createRulebook();

// Effects overlay. Board coordinates come straight from the graph, so the FX
// layer needs no knowledge of the renderer beyond where a node sits.
const fx = createFX(document.getElementById('fx'), {
  colors: PC,
  nodeAt: (id) => NODE_BY_ID[id],
});

// Animation speed. Playing a round used to be one synchronous blast: every bot
// acted and the board repainted once at the end, so nothing was ever *seen*.
// Now each event gets its moment. 'off' collapses that back to instant, which is
// also what the e2e suite runs at so tests don't wait on animation.
const SPEEDS = { off: 0, fast: 0.5, normal: 1 };
let speed = 'normal';

// Hold time is NOT the effect's full duration. Waiting for every animation to
// finish made one round take 7.4s — a minute of watching per game. Effects are
// allowed to overlap: you need only long enough to register that a thing happened
// before the next actor starts, and the tail plays out underneath. Capped so a
// long shipping route cannot stall the round.
const HOLD_MAX = 420;
const holdFor = (ms) => Math.min(HOLD_MAX, ms * 0.45) * (SPEEDS[speed] ?? 1);
const wait = (ms) => (ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve());

const botName = (k) => T.bots[k].name;
const botDesc = (k) => T.bots[k].desc;

// ---------------------------------------------------------------- sprites

async function loadSprites() {
  const res = await fetch('./assets/sprites.svg');
  $('sprites').innerHTML = await res.text();
}

const icon = (name, cls = '') =>
  `<svg class="${cls}"><use href="#ic-${name}"/></svg>`;
const ico = (slot) => T.icons[slot];

// ---------------------------------------------------------------- menu

function buildMenu() {
  config = { players: 3, rounds: 8, bots: ['tollkeeper', 'balanced', 'expander'] };

  const syncBots = () => {
    const n = config.players - 1;
    $('botRows').innerHTML = Array.from({ length: n }, (_, i) => `
      <div class="botRow">
        <span class="dot" style="background:${PC[i + 1]}"></span>
        <span class="nm">P${i + 2}</span>
        <select data-bot="${i}">
          ${BOT_KEYS.map(k =>
            `<option value="${k}" ${config.bots[i] === k ? 'selected' : ''}>${botName(k)}</option>`).join('')}
        </select>
        <span class="desc" data-desc="${i}">${botDesc(config.bots[i])}</span>
      </div>`).join('');
    for (const sel of document.querySelectorAll('[data-bot]')) {
      sel.addEventListener('change', () => {
        const i = +sel.dataset.bot;
        config.bots[i] = sel.value;
        document.querySelector(`[data-desc="${i}"]`).textContent = botDesc(sel.value);
      });
    }
  };

  for (const b of document.querySelectorAll('[data-pc]')) {
    b.addEventListener('click', () => {
      config.players = +b.dataset.pc;
      document.querySelectorAll('[data-pc]').forEach(x => x.classList.toggle('on', x === b));
      while (config.bots.length < config.players - 1) config.bots.push('balanced');
      syncBots();
    });
  }
  for (const b of document.querySelectorAll('[data-len]')) {
    b.addEventListener('click', () => {
      config.rounds = +b.dataset.len;
      document.querySelectorAll('[data-len]').forEach(x => x.classList.toggle('on', x === b));
    });
  }
  syncBots();

  for (const b of document.querySelectorAll('[data-theme]')) {
    b.addEventListener('click', () => {
      setTheme(b.dataset.theme);
      document.querySelectorAll('[data-theme]').forEach(x => x.classList.toggle('on', x === b));
    });
  }
  $('btnPlay').addEventListener('click', () => start(false));
  $('btnTutorial').addEventListener('click', () => start(true));
  $('btnQuit').addEventListener('click', showMenu);
  $('btnMenu').addEventListener('click', showMenu);
  $('btnAgain').addEventListener('click', () => start(false));
  $('btnSpeed').addEventListener('click', cycleSpeed);
  wireBook();
  wireBoard();
}

function setTheme(id) {
  T = THEMES[id] ?? THEMES.anod;
  applyTheme(T);
  paintMenuText();
  paintGlossary();
  if (book.open) renderBook();
  if (g && !$('game').classList.contains('hide')) render();
}

function paintMenuText() {
  $('mTitle').textContent = T.title;
  $('mPitch').innerHTML = T.pitch;
  $('hTitle').textContent = T.title;
  document.querySelectorAll('[data-logo]').forEach(u => u.setAttribute('href', `#ic-${ico('logo')}`));
  $('legDeep').textContent = T.legend.deep;
  $('legMid').textContent = T.legend.mid;
  $('legShallow').textContent = T.legend.shallow;
  $('legDead').textContent = T.legend.dead;
  $('hPlayers').textContent = T.id === 'anod' ? 'Mga Datu' : 'Players';
  $('hProgram').textContent = T.id === 'anod' ? 'Ang Plano' : 'Your program';
  $('hContracts').textContent = T.terms.contract.name;
  $('hWater').textContent = T.id === 'anod' ? 'Ang Tubig' : 'The water';
  const bs = document.querySelector('#botRows');
  if (bs) {
    document.querySelectorAll('[data-bot]').forEach(sel => {
      const i = +sel.dataset.bot;
      sel.innerHTML = BOT_KEYS.map(k =>
        `<option value="${k}" ${config.bots[i] === k ? 'selected' : ''}>${botName(k)}</option>`).join('');
      document.querySelector(`[data-desc="${i}"]`).textContent = botDesc(config.bots[i]);
    });
  }
}

// A short glossary so the Tagalog on screen is learnable rather than opaque.
function paintGlossary() {
  const el2 = $('glossBody');
  if (!el2) return;
  if (T.id !== 'anod') {
    $('gloss').style.display = 'none';
    return;
  }
  $('gloss').style.display = '';
  const row = (o) => `<dt>${o.name}</dt><dd>${o.gloss}</dd>`;
  el2.innerHTML = `
    <h5>What you do</h5>
    <dl>${Object.values(T.actions).map(a =>
      `<dt>${a.name}</dt><dd>${a.gloss} — ${a.note}</dd>`).join('')}</dl>
    <h5>What you move</h5>
    <dl>${Object.values(T.goods).map(row).join('')}</dl>
    <h5>On the board</h5>
    <dl>${['station','mouth','channel','silted','coins','toll','player']
      .map(k => row(T.terms[k])).join('')}</dl>
    <p><b>The setting.</b> The Pasig and Pampanga rivers empty into Manila Bay
    through a shifting delta. Before Spanish contact, rival polities —
    <b>Tundó</b>, <b>Maynilà</b>, <b>Namayan</b> — sat on that water and taxed the
    trade moving through it. The place names on the board are theirs. The river
    really does silt up, and dredging it really was the price of keeping a port.</p>
    <p style="color:var(--dim2)">Place names and terms are best-effort and worth a
    check by a native speaker before this is more than a prototype.</p>`;
}

// ---------------------------------------------------------------- rulebook

function renderBook() {
  const P = pages(T);
  const pg = P[book.i];
  $('book').classList.toggle('on', book.open);
  if (!book.open) return;
  $('bkTitle').textContent = pg.title;
  $('bkSub').textContent = pg.sub;
  $('bkBody').innerHTML = pg.body;
  $('bkBody').scrollTop = 0;
  $('bkPrev').disabled = book.i === 0;
  $('bkNext').disabled = book.i === P.length - 1;
  $('bkDots').innerHTML = P.map((p, i) =>
    `<button data-page="${i}" class="${i === book.i ? 'on' : ''}" title="${p.title}"></button>`).join('');
  for (const b of $('bkDots').querySelectorAll('[data-page]')) {
    b.addEventListener('click', () => { book.go(+b.dataset.page); renderBook(); });
  }
}

function openBook(i = 0) { book.show(i); renderBook(); }
function closeBook() { book.hide(); renderBook(); }

function wireBook() {
  $('btnRules').addEventListener('click', () => openBook(0));
  $('btnRulesMenu').addEventListener('click', () => openBook(0));
  $('bkClose').addEventListener('click', closeBook);
  $('bkNext').addEventListener('click', () => { book.next(pages(T).length); renderBook(); });
  $('bkPrev').addEventListener('click', () => { book.prev(); renderBook(); });
  $('book').addEventListener('click', (e) => { if (e.target.id === 'book') closeBook(); });
  document.addEventListener('keydown', (e) => {
    if (!book.open) return;
    if (e.key === 'Escape') closeBook();
    if (e.key === 'ArrowRight') { book.next(pages(T).length); renderBook(); }
    if (e.key === 'ArrowLeft')  { book.prev(); renderBook(); }
  });
}

function showMenu() {
  $('menu').classList.remove('hide');
  $('game').classList.add('hide');
  $('ov').classList.remove('on');
}

function start(tutorial, s = Math.floor(Math.random() * 1e9)) {
  seed = s;
  TUNING.rounds = config.rounds;
  g = newGame(config.players, seed);
  g.players.forEach((p, i) => {
    p.strat = i === HUMAN ? null : config.bots[i - 1];
    p.name = i === HUMAN ? (T.id === 'anod' ? 'Ikáw' : 'You') : botName(p.strat);
  });
  program = [null, null];
  picking = null;
  pendingAction = null;
  queue = null;
  stepping = false;   // a quit mid-resolution would otherwise wedge the next game
  roundsPlayed = 0;
  fx.clear();
  setActor(null);
  $('log').innerHTML = '';
  $('ov').classList.remove('on');
  $('menu').classList.add('hide');
  $('game').classList.remove('hide');

  tut = createTutorial();
  if (tutorial) tut.start();

  say(`${T.terms.round.name} 1 — seed ${seed}`, 'hd');
  render();
}

// ---------------------------------------------------------------- board

const depthColor = (d) =>
  d === 0 ? 'var(--dead)' : ['', 'var(--water1)', 'var(--water2)', 'var(--water3)'][d];

function el(t, a = {}) {
  const e = document.createElementNS(NS, t);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
}

function use(href, x, y, size, color, cls = '') {
  const u = el('use', { href, x: x - size / 2, y: y - size / 2, width: size, height: size });
  u.style.color = color;
  if (cls) u.setAttribute('class', cls);
  return u;
}

function drawBoard() {
  const svg = $('svg');
  svg.innerHTML = '';

  const hl = tut?.step()?.highlight?.() ?? null;
  const owner = {};
  g.players.forEach((p, i) => p.stations.forEach(s => { owner[s] = i; }));

  const btargets = pendingAction === 'build'
    ? new Set(buildTargets(g, g.players[HUMAN])) : new Set();
  const sfrom = pendingAction === 'ship'
    ? new Set(shipOptions(g, g.players[HUMAN]).map(o => o.from)) : new Set();

  // --- channels
  const tolls = [];
  // Channel click-targets are collected and appended LAST. Drawn inline they sat
  // beneath the node circles, which paint later and swallowed the clicks — dredge
  // became unresolvable and the round hung.
  const hitLayer = [];
  for (const [a, b] of CHANNELS) {
    const k = chKey(a, b), d = g.depth[k];
    const A = NODE_BY_ID[a], B = NODE_BY_ID[b];
    const dredgeable = pendingAction === 'dredge' && d > 0 && d < TUNING.maxDepth;

    svg.appendChild(el('line', {
      x1: A.x, y1: A.y, x2: B.x, y2: B.y,
      stroke: dredgeable ? 'var(--gold)' : depthColor(d),
      'stroke-width': d === 0 ? 0.3 : 0.45 + d * 0.45,
      'stroke-linecap': 'round',
      'stroke-dasharray': d === 0 ? '1.1 1.2' : '',
      opacity: d === 0 ? 0.75 : 1,
      'data-ch': k, 'data-depth': d, 'data-rights': g.rights[k] ?? '',
      class: 'ch',
    }));

    if (dredgeable) {
      const hit = el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y,
        stroke: 'transparent', 'stroke-width': 5, 'data-hit': k,
        'pointer-events': 'stroke' });
      hit.style.cursor = 'pointer';
      hitLayer.push(hit);
    }
    if (g.rights[k] !== null && d > 0) tolls.push([A, B, g.rights[k]]);
  }

  // --- ship route preview
  if (pendingAction === 'ship') {
    for (const o of shipOptions(g, g.players[HUMAN])) {
      for (const k of o.path) {
        const [a, b] = k.split('>');
        const A = NODE_BY_ID[a], B = NODE_BY_ID[b];
        svg.appendChild(el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y,
          stroke: 'var(--gold)', 'stroke-width': 0.28, opacity: .5,
          'stroke-dasharray': '.7 .8' }));
      }
    }
  }

  // --- toll markers (above the water)
  for (const [A, B, o] of tolls) {
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    svg.appendChild(el('circle', { cx: mx, cy: my, r: 0.95, fill: PC[o],
      stroke: 'var(--bg)', 'stroke-width': 0.3, 'data-toll': o,
      class: hl?.kind === 'rights' ? 'pulse' : '' }));
  }

  // --- nodes
  for (const n of NODES) {
    const isMouth = MOUTHS.includes(n.id);
    const own = owner[n.id];
    const grp = el('g', { class: 'node', 'data-node': n.id });

    const highlighted =
      (hl?.kind === 'node' && (hl.ids === 'own'
        ? g.players[HUMAN].stations.includes(n.id)
        : hl.ids?.includes?.(n.id)));

    const r = isMouth ? 4.2 : 3.3;
    let fill = 'var(--panel2)', stroke = 'var(--line2)', sw = 0.28;
    if (isMouth) { fill = 'var(--panel)'; stroke = 'var(--water3)'; }
    if (own !== undefined) { stroke = PC[own]; sw = 0.62; fill = 'var(--panel)'; }
    if (btargets.has(n.id) || sfrom.has(n.id)) {
      stroke = 'var(--gold)'; sw = 0.75;
      fill = 'color-mix(in srgb, var(--panel) 70%, var(--gold) 16%)';
    }

    grp.appendChild(el('circle', { cx: n.x, cy: n.y, r, fill, stroke, 'stroke-width': sw,
      class: highlighted ? 'pulse' : '' }));

    // station or lighthouse art
    if (isMouth) {
      grp.appendChild(use(`#ic-${ico('mouth')}`, n.x, n.y - 0.2, 4.4, 'var(--salt)'));
    } else if (own !== undefined) {
      grp.appendChild(use(`#ic-${ico('station')}`, n.x, n.y - 0.1, 3.9, PC[own]));
    }

    // Goods: one legible badge instead of a scatter of 1.9-unit icons. Counting
    // four tiny sprites at a glance was the single worst readability problem on
    // the board — a count plus one commodity icon reads instantly.
    if (!isMouth) {
      const c = g.cubes[n.id];
      const col = `var(--${n.good})`;
      const bx = n.x, by = n.y - 4.6;
      if (c > 0) {
        grp.appendChild(el('rect', {
          x: bx - 2.9, y: by - 1.55, width: 5.8, height: 3.1, rx: 1.55,
          fill: 'var(--panel2)', stroke: col, 'stroke-width': 0.22, opacity: 0.96,
        }));
        grp.appendChild(use(`#ic-${T.goods[n.good].icon}`, bx - 1.35, by, 2.2, col));
        const cnt = el('text', {
          x: bx + 1.1, y: by + 0.78, 'text-anchor': 'middle',
          'font-size': 2.2, fill: col, 'font-weight': 700,
        });
        cnt.textContent = c;
        grp.appendChild(cnt);
      } else {
        // Empty node: show the commodity ghosted so the map still reads.
        grp.appendChild(use(`#ic-${T.goods[n.good].icon}`, bx, by, 2.1, col, 'empty'));
      }
    }

    // dead-channel marker
    const anyDead = [...(g.out[n.id] ?? []).map(x => chKey(n.id, x)),
                     ...(g.inn[n.id] ?? []).map(x => chKey(x, n.id))]
      .some(k => g.depth[k] === 0);
    if (anyDead && own !== undefined) {
      grp.appendChild(use(`#ic-${ico('dead')}`, n.x + 3.2, n.y + 2.6, 2.4, 'var(--dead)'));
    }

    const label = el('text', {
      x: n.x, y: n.y + (isMouth ? 7.4 : 6.1), 'text-anchor': 'middle',
      'font-size': isMouth ? 2.5 : (nodeLabel(T, n.id).length > 7 ? 1.8 : 2.05),
      fill: own !== undefined ? PC[own] : 'var(--dim)',
      'font-weight': own !== undefined ? 700 : 500,
      // Halo so place names stay readable where they cross a channel.
      stroke: 'var(--bg)', 'stroke-width': 0.6, 'paint-order': 'stroke',
    });
    label.textContent = nodeLabel(T, n.id);
    grp.appendChild(label);

    if (isMouth) {
      const tot = g.players.reduce((s, p) =>
        s + p.delivered[n.id].timber + p.delivered[n.id].grain + p.delivered[n.id].salt, 0);
      if (tot) {
        const t = el('text', { x: n.x, y: n.y + 10.2, 'text-anchor': 'middle',
          'font-size': 2.1, fill: 'var(--dim)' });
        t.textContent = `${tot} delivered`;
        grp.appendChild(t);
      }
    }

    const interactive = btargets.has(n.id) || sfrom.has(n.id);
    if (interactive) {
      grp.style.cursor = 'pointer';
      // Fingers are much bigger than a 2.7-unit node: add a generous invisible
      // hit area so tapping near the node still works.
      grp.appendChild(el('circle', {
        cx: n.x, cy: n.y, r: 6, fill: 'transparent', 'data-hit-node': n.id,
        'data-hit-kind': btargets.has(n.id) ? 'build' : 'ship',
        'pointer-events': 'fill',
      }));
    }
    svg.appendChild(grp);
  }

  // Channel targets go above the nodes so a click near a channel reaches it.
  for (const h of hitLayer) svg.appendChild(h);
}

// ---------------------------------------------------------------- panel

function actDesc() {
  const p = g.players[HUMAN];
  const c = T.terms.coins.name === 'ginto' ? 'g' : 'c';
  return {
    dredge: `+${TUNING.dredgeAmount} ${T.terms.depth.name} · ${TUNING.dredgeCoins}${c} · ${T.terms.toll.name}`,
    build: `${T.terms.station.name} · ${buildCost(p)}${c}`,
    ship: `≤${TUNING.shipCubesMax} → ${T.terms.mouth.name}`,
    survey: `+${TUNING.surveyCoins}${c} · ${TUNING.surveyDraw}→1`,
  };
}

function render() {
  drawBoard();
  $('rd').textContent = `${T.terms.round.name} ${g.round} / ${TUNING.rounds}`;
  $('ph').textContent = pendingAction
    ? (T.id === 'anod' ? 'Pumili' : 'Choose a target')
    : (T.id === 'anod' ? 'Magplano' : 'Program');

  $('pls').innerHTML = g.players.map((p, i) => `
    <div class="pl ${i === HUMAN ? 'me' : ''}">
      <span class="dot" style="background:${PC[i]}"></span>
      <span class="nm">${p.name}</span>
      <span class="st">${p.coins}${T.terms.coins.name === 'ginto' ? 'g' : 'c'} · ${p.stations.length}${T.id === 'anod' ? 'b' : 'st'} · ${p.done.length}✓</span>
    </div>`).join('');

  const d = actDesc();
  $('acts').innerHTML = ['dredge', 'build', 'ship', 'survey'].map(a => `
    <button class="act" data-act="${a}" ${pendingAction ? 'disabled' : ''}>
      ${icon(ico(a))}
      <span class="txt"><span class="t">${T.actions[a].name}${
        T.actions[a].gloss ? `<em>${T.actions[a].gloss}</em>` : ''}</span>
      <span class="d">${d[a]}</span></span>
    </button>`).join('');
  $('go').textContent = T.id === 'anod' ? 'Itakdâ at tuparín' : 'Commit & resolve';
  for (const b of document.querySelectorAll('.act')) {
    b.addEventListener('click', () => setSlot(b.dataset.act));
  }

  [0, 1].forEach(i => {
    const s = $('s' + i);
    const a = program[i];
    // Keep the slot number visible even when filled — resolution order matters.
    const slotWord = T.id === 'anod' ? 'UNA' : 'SLOT 1';
    const slotWord2 = T.id === 'anod' ? 'IKALAWA' : 'SLOT 2';
    const w = i === 0 ? slotWord : slotWord2;
    s.innerHTML = a
      ? `<div class="n">${w}</div>${icon(ico(a))}<div class="a">${T.actions[a].name}</div>` +
        (T.actions[a].gloss ? `<div class="g">${T.actions[a].gloss}</div>` : '')
      : `<div class="n">${w}</div><div class="a">—</div>`;
    s.classList.toggle('on', picking === i);
    s.classList.toggle('filled', !!a);
  });

  const p = g.players[HUMAN];
  const anyMouth = T.id === 'anod' ? 'kahit saáng look' : 'any mouth';
  $('cts').innerHTML = p.contracts.length
    ? p.contracts.map(c => `<div class="ct">
        <span class="vp">${Math.round(c.vp * TUNING.contractScale)}</span>
        <span>${c.need} ${T.id === 'anod' ? 'kalakal' : 'cubes'} · ${c.types} ${T.id === 'anod' ? 'urì' : 'type'}${c.types > 1 ? 's' : ''}
        → ${c.mouth ? nodeLabel(T, c.mouth) : anyMouth}</span>
      </div>`).join('')
    : `<div class="ct">${T.id === 'anod' ? `walâ — subukan ang ${T.actions.survey.name}` : 'none — try Survey'}</div>`;

  $('go').disabled = !(program[0] && program[1]) || !!pendingAction;

  const hint = $('hint');
  if (pendingAction) {
    hint.style.display = 'block';
    hint.textContent = (T.id === 'anod' ? {
      dredge: `Pindutín ang gintóng sapà — hukayin at angkinín ang singil.`,
      build: `Pindutín ang tanáw na lugár upang magtayô ng balangay.`,
      ship: `Pindutín ang iyóng balangay upang maglayág.`,
    } : {
      dredge: 'Click a gold channel to dredge it and claim its toll.',
      build: 'Click a highlighted node to build there.',
      ship: 'Click one of your stations to ship from it.',
    })[pendingAction] ?? '';
  } else hint.style.display = 'none';

  renderTutorial();
}

function renderTutorial() {
  const box = $('tut');
  document.querySelectorAll('.uiPulse').forEach(e => e.classList.remove('uiPulse'));
  const s = tut?.step();
  if (!s) { box.classList.remove('on'); return; }

  box.classList.add('on');
  const { i, n } = tut.progress();
  // Step text is resolved against the active theme so the words the tutorial
  // tells you to click are the words actually painted on the buttons.
  const txt = stepText(s, T);
  $('tutStep').textContent = `Step ${i} of ${n}`;
  $('tutTitle').textContent = txt.title;
  $('tutBody').textContent = txt.body;
  // A gated step shows what to do, plus an always-available escape so the
  // tutorial can never trap the player if a condition misfires.
  $('tutNext').style.display = s.check ? 'none' : '';
  $('tutNext').textContent = tut.isLast() ? 'Start playing' : 'Next';
  $('tutSkipStep').style.display = s.check ? '' : 'none';
  $('tutWait').textContent = s.check ? (txt.hint ?? 'Complete the action to continue…') : '';

  const hl = s.highlight?.();
  if (hl?.kind === 'ui') document.querySelector(hl.sel)?.classList.add('uiPulse');
  if (hl?.kind === 'legend') $('legendPane')?.classList.add('uiPulse');
}

function setSlot(a) {
  const i = picking ?? (program[0] ? (program[1] ? 0 : 1) : 0);
  program[i] = a;
  picking = i === 0 && !program[1] ? 1 : null;
  render();
  pollTutorial();
}

for (const s of document.querySelectorAll('.slot')) {
  s.addEventListener('click', () => { picking = +s.dataset.slot; render(); });
}

function pollTutorial() {
  if (tut?.poll(g, { program, roundsPlayed })) render();
}

// The engine logs in plain English with raw node ids. Keep the prose English so a
// newcomer can always follow what happened — only swap ids for place names so the
// log matches the board they are looking at.
function localise(line) {
  return line.replace(/\b([SUML]\d|[ABC])\b/g, (m) => nodeLabel(T, m));
}

function say(t, cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = localise(t);
  $('log').appendChild(d);
  $('log').scrollTop = $('log').scrollHeight;
}

// ---------------------------------------------------------------- turn flow

$('go').addEventListener('click', () => {
  if (!program[0] || !program[1] || pendingAction) return;
  g.players[HUMAN].program = [...program];
  for (const p of g.players) if (p.strat) p.program = STRATEGIES[p.strat](g, p);
  say(`Round ${g.round}`, 'hd');
  queue = { slot: 0, order: seatOrder(g), idx: 0, claimed: new Set() };
  step();
});

// Resolution is async so each action can be *seen* before the next one starts.
// Guarded against re-entry: resolveHuman() also calls step(), and two overlapping
// walkers would consume the queue twice and skip players. (`stepping` is declared
// with the other module state at the top — start() touches it before this point.)
async function step() {
  if (stepping) return;
  stepping = true;
  try {
    while (queue) {
      if (queue.idx >= queue.order.length) {
        if (queue.slot === 0) {
          queue = { slot: 1, order: seatOrder(g), idx: 0, claimed: new Set() };
          continue;
        }
        queue = null;
        await endRound();
        return;
      }
      const pi = queue.order[queue.idx];
      const p = g.players[pi];
      const action = p.program[queue.slot];
      queue.idx++;
      if (!action) continue;

      if (pi === HUMAN) {
        const needsTarget =
          (action === 'dredge' && dredgeTargets(g).length && p.coins >= TUNING.dredgeCoins) ||
          (action === 'build' && buildTargets(g, p).length && p.coins >= buildCost(p)) ||
          (action === 'ship' && shipOptions(g, p).length);
        if (needsTarget) { pendingAction = action; render(); return; }
        execute(g, pi, action, {}, queue.claimed);
      } else {
        execute(g, pi, action, chooseTarget(g, p, action, p.strat), queue.claimed);
      }
      // Show whose turn it is before the effect fires, otherwise a fast reader
      // sees a boat move with no idea who sent it.
      await flush({ actor: pi });
    }
  } finally {
    stepping = false;
  }
}

// Board clicks are delegated from the <svg> itself rather than bound to each
// element. drawBoard() rebuilds the whole SVG on every render, so per-element
// handlers were being destroyed between the pointerdown and the click — a real
// click could land on a detached node and silently do nothing, which hung the
// game mid-round. One listener on a parent that never gets replaced fixes it.
function wireBoard() {
  $('svg').addEventListener('click', (e) => {
    if (!pendingAction) return;
    const t = e.target.closest?.('[data-hit], [data-hit-node]');
    if (!t) return;
    if (t.dataset.hit) { resolveHuman({ channel: t.dataset.hit }); return; }
    const id = t.dataset.hitNode;
    if (t.dataset.hitKind === 'build') resolveHuman({ node: id });
    else pickShip(id);
  });
}

async function resolveHuman(choice) {
  if (!pendingAction || !queue) return;
  const a = pendingAction;
  pendingAction = null;
  execute(g, HUMAN, a, choice, queue.claimed);
  await flush({ actor: HUMAN });
  step();
}

function pickShip(from) {
  const opts = shipOptions(g, g.players[HUMAN]).filter(o => o.from === from);
  if (!opts.length) return;
  opts.sort((a, b) => b.payout - a.payout);
  resolveHuman({ option: opts[0] });
}

// Drain the log AND the event stream. The log is the transcript; the events are
// what you actually watch. Repaint first so the board underneath is correct, then
// animate on top of it and hold long enough for the effect to be read.
async function flush({ actor = null } = {}) {
  const me = g.players[HUMAN].name;
  for (const l of g.log) say(l, l.startsWith(me) ? 'me' : '');
  g.log = [];

  const events = g.events ?? [];
  g.events = [];
  render();

  if (!events.length || speed === 'off') return;

  if (actor !== null) setActor(actor);
  let longest = 0;
  for (const ev of events) longest = Math.max(longest, fx.play(ev));
  await wait(holdFor(longest));
  setActor(null);
}

// Resolves once the resolution walker is idle — either the round finished or it
// is waiting on the player. Polls rather than exposing internal promises so it
// stays correct no matter how many awaits step() grows.
function settled() {
  return new Promise((res) => {
    const tick = () => (!stepping || pendingAction ? res() : setTimeout(tick, 16));
    tick();
  });
}

// 1× -> 2× -> off. Persisted: someone who turns animation off wants it to stay
// off, not to re-disable it every session.
const SPEED_ORDER = ['normal', 'fast', 'off'];
const SPEED_LABEL = { normal: '1×', fast: '2×', off: 'off' };

function cycleSpeed() {
  speed = SPEED_ORDER[(SPEED_ORDER.indexOf(speed) + 1) % SPEED_ORDER.length];
  try { localStorage.setItem('silt.speed', speed); } catch { /* private mode */ }
  applySpeed();
}

function applySpeed() {
  fx.setEnabled(speed !== 'off');
  if (speed === 'off') fx.clear();
  const b = $('btnSpeed');
  if (b) { b.textContent = SPEED_LABEL[speed]; b.classList.toggle('muted', speed === 'off'); }
}

// Name the player currently acting, above the board. Four bots resolving in
// sequence is unreadable otherwise — you see effects with no author.
function setActor(pi) {
  const b = $('actor');
  if (!b) return;
  if (pi === null) { b.classList.remove('on'); return; }
  const p = g.players[pi];
  b.textContent = pi === HUMAN ? 'You' : p.name;
  b.style.color = PC[pi];
  b.classList.add('on');
}

async function endRound() {
  // Silting gets its own beat. It is the thing the game is named for and it used
  // to happen inside the same repaint as upkeep, so the single most important
  // consequence of the round went by completely unseen.
  siltPhase(g);
  await flush();
  regrowPhase(g); upkeepPhase(g);
  roundsPlayed++;
  await flush();
  pollTutorial();
  if (g.round >= TUNING.rounds) return finish();
  g.round++;
  program = [null, null];
  picking = null;
  render();
}

function finish() {
  const s = score(g).map((x, i) => ({ ...x, i }));
  const best = Math.max(...s.map(x => x.total));
  $('final').innerHTML = `<table>
    <tr><th>${T.terms.player.name}</th><th>${T.id === 'anod' ? 'Kasund' : 'Contr'}</th>
        <th>${T.terms.mouth.name}</th><th>${T.id === 'anod' ? 'Lupà' : 'Net'}</th>
        <th>${T.terms.toll.name}</th><th>${T.terms.coins.name}</th>
        <th>${T.terms.silted.name}</th><th>${T.id === 'anod' ? 'Kabuoán' : 'Total'}</th></tr>
    ${s.map(x => `<tr class="${x.total === best ? 'win' : ''}">
      <td>${g.players[x.i].name}</td><td>${x.contracts}</td><td>${x.mouth}</td>
      <td>${x.network}</td><td>${x.held}</td><td>${x.coin}</td><td>${x.silt}</td>
      <td>${x.total}</td></tr>`).join('')}
  </table>`;
  $('ov').classList.add('on');
  $('ph').textContent = T.id === 'anod' ? 'Tapós na' : 'Game over';
  tut?.stop();
  renderTutorial();
}

$('tutNext').addEventListener('click', () => { tut?.next(); render(); });
$('tutSkip').addEventListener('click', () => { tut?.stop(); render(); });
$('tutSkipStep').addEventListener('click', () => { tut?.next(); render(); });

// ---------------------------------------------------------------- test hooks

window.SILT = {
  boot: (s) => start(false, s),
  bootTutorial: (s) => start(true, s),
  menu: showMenu,
  config: () => config,
  setConfig: (c) => Object.assign(config, c),
  state: () => g,
  program: (a, b) => { program = [a, b]; render(); },
  // These return promises that settle once resolution is idle. Resolution became
  // async when effects were added, so a test that called commit() and read the
  // DOM on the next line was racing the render — it failed only under parallel
  // load, which is the worst way for a race to show up.
  commit: () => { $('go').click(); return settled(); },
  pending: () => pendingAction,
  autoResolve: () => {
    const p = g.players[HUMAN];
    return resolveHuman(chooseTarget(g, p, pendingAction, 'balanced') ?? {}).then(settled);
  },
  tutorial: () => tut && ({ active: tut.active, ...tut.progress(), id: tut.step()?.id }),
  tutNext: () => { tut?.next(); render(); },
  score: () => score(g),
  seed: () => seed,
  theme: () => T,
  themeId: () => T.id,
  setTheme: (id) => setTheme(id),
  openBook, closeBook, tuning: TUNING,
  book: () => ({ open: book.open, page: book.i, total: pages(T).length }),
  // Effects. Tests set speed 'off' so they never wait on animation — the whole
  // suite would otherwise slow to a crawl and start flaking on timing.
  speed: () => speed,
  setSpeed: (s) => { speed = s; applySpeed(); },
  fxCount: () => document.getElementById('fx').childElementCount,
  events: () => g?.events ?? [],
  actor: () => {
    const a = $('actor');
    return a.classList.contains('on') ? a.textContent : null;
  },
};

// Sprites must be in the DOM before any <use> resolves. Expose a readiness flag so
// tests wait on the real thing instead of racing module evaluation.
window.SILT.ready = loadSprites().then(() => {
  buildMenu();
  setTheme('anod');
  try {
    const saved = localStorage.getItem('silt.speed');
    if (saved && SPEEDS[saved] !== undefined) speed = saved;
  } catch { /* private mode: fall back to the default */ }
  applySpeed();
  window.SILT.isReady = true;
});
await window.SILT.ready;
