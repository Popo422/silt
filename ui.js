import { NODES, MOUTHS, CHANNELS, chKey, NODE_BY_ID } from './graph.js';
import {
  newGame, execute, siltPhase, regrowPhase, upkeepPhase, score, seatOrder,
  buildTargets, dredgeTargets, shipOptions, buildCost, TUNING,
} from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
import { createTutorial } from './tutorial.js';

const HUMAN = 0;
const PC = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)'];
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

const BOTS = {
  balanced:   'Balanced — expands early, ships, patches what is dying',
  tollkeeper: 'Tollkeeper — dredges the routes you need and charges you',
  steward:    'Steward — maintains its own network above all',
  expander:   'Expander — builds relentlessly, thin on maintenance',
  turtle:     'Turtle — three stations by a mouth, never leaves',
  defector:   'Defector — never dredges, rides on everyone else',
};

let g, program, picking, pendingAction, seed, queue, tut, config;

// ---------------------------------------------------------------- sprites

async function loadSprites() {
  const res = await fetch('./assets/sprites.svg');
  $('sprites').innerHTML = await res.text();
}

const icon = (name, cls = '') =>
  `<svg class="${cls}"><use href="#ic-${name}"/></svg>`;

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
          ${Object.keys(BOTS).map(k =>
            `<option value="${k}" ${config.bots[i] === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
        <span class="desc" data-desc="${i}">${BOTS[config.bots[i]].split('—')[1].trim()}</span>
      </div>`).join('');
    for (const sel of document.querySelectorAll('[data-bot]')) {
      sel.addEventListener('change', () => {
        const i = +sel.dataset.bot;
        config.bots[i] = sel.value;
        document.querySelector(`[data-desc="${i}"]`).textContent =
          BOTS[sel.value].split('—')[1].trim();
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

  $('btnPlay').addEventListener('click', () => start(false));
  $('btnTutorial').addEventListener('click', () => start(true));
  $('btnQuit').addEventListener('click', showMenu);
  $('btnMenu').addEventListener('click', showMenu);
  $('btnAgain').addEventListener('click', () => start(false));
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
    p.name = i === HUMAN ? 'You' : `${p.strat} (P${i + 1})`;
  });
  program = [null, null];
  picking = null;
  pendingAction = null;
  queue = null;
  $('log').innerHTML = '';
  $('ov').classList.remove('on');
  $('menu').classList.add('hide');
  $('game').classList.remove('hide');

  tut = createTutorial();
  if (tutorial) tut.start();

  say(`Round 1 — seed ${seed}`, 'hd');
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
        stroke: 'transparent', 'stroke-width': 3.2, 'data-hit': k });
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', () => resolveHuman({ channel: k }));
      svg.appendChild(hit);
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

    const r = isMouth ? 3.6 : 2.7;
    let fill = '#152329', stroke = 'var(--line2)', sw = 0.28;
    if (isMouth) { fill = '#16303a'; stroke = '#3f6b7a'; }
    if (own !== undefined) { stroke = PC[own]; sw = 0.62; fill = '#16272e'; }
    if (btargets.has(n.id) || sfrom.has(n.id)) { stroke = 'var(--gold)'; sw = 0.75; fill = '#243a42'; }

    grp.appendChild(el('circle', { cx: n.x, cy: n.y, r, fill, stroke, 'stroke-width': sw,
      class: highlighted ? 'pulse' : '' }));

    // station or lighthouse art
    if (isMouth) {
      grp.appendChild(use('#ic-mouth', n.x, n.y - 0.2, 3.6, '#8fc3d4'));
    } else if (own !== undefined) {
      grp.appendChild(use('#ic-station', n.x, n.y - 0.15, 3.1, PC[own]));
    }

    // goods cubes as commodity icons
    if (!isMouth) {
      const c = g.cubes[n.id];
      for (let i = 0; i < c; i++) {
        const ang = -Math.PI / 2 + (i - (c - 1) / 2) * 0.5;
        grp.appendChild(use(`#ic-${n.good}`,
          n.x + Math.cos(ang) * 4.1, n.y + Math.sin(ang) * 4.1,
          1.9, `var(--${n.good})`));
      }
    }

    // dead-channel marker
    const anyDead = [...(g.out[n.id] ?? []).map(x => chKey(n.id, x)),
                     ...(g.inn[n.id] ?? []).map(x => chKey(x, n.id))]
      .some(k => g.depth[k] === 0);
    if (anyDead && own !== undefined) {
      grp.appendChild(use('#ic-silted', n.x + 2.6, n.y - 2.4, 2, '#7a5334'));
    }

    const label = el('text', {
      x: n.x, y: n.y + (isMouth ? 6.4 : 4.9), 'text-anchor': 'middle',
      'font-size': isMouth ? 2.3 : 1.95,
      fill: own !== undefined ? PC[own] : 'var(--dim)',
      'font-weight': own !== undefined ? 700 : 400,
    });
    label.textContent = n.id;
    grp.appendChild(label);

    if (isMouth) {
      const tot = g.players.reduce((s, p) =>
        s + p.delivered[n.id].timber + p.delivered[n.id].grain + p.delivered[n.id].salt, 0);
      if (tot) {
        const t = el('text', { x: n.x, y: n.y + 9.2, 'text-anchor': 'middle',
          'font-size': 1.9, fill: 'var(--dim)' });
        t.textContent = `${tot} delivered`;
        grp.appendChild(t);
      }
    }

    if (btargets.has(n.id)) {
      grp.style.cursor = 'pointer';
      grp.addEventListener('click', () => resolveHuman({ node: n.id }));
    }
    if (sfrom.has(n.id)) {
      grp.style.cursor = 'pointer';
      grp.addEventListener('click', () => pickShip(n.id));
    }
    svg.appendChild(grp);
  }
}

// ---------------------------------------------------------------- panel

const ACT_ICON = { dredge: 'dredge', build: 'build', ship: 'ship', survey: 'survey' };

function actDesc() {
  const p = g.players[HUMAN];
  return {
    dredge: `+${TUNING.dredgeAmount} depth · ${TUNING.dredgeCoins}c · claims toll`,
    build: `new station · ${buildCost(p)}c`,
    ship: `≤${TUNING.shipCubesMax} cubes to sea`,
    survey: `+${TUNING.surveyCoins}c · draw ${TUNING.surveyDraw} keep 1`,
  };
}

function render() {
  drawBoard();
  $('rd').textContent = `Round ${g.round} / ${TUNING.rounds}`;
  $('ph').textContent = pendingAction ? `Choose a target` : 'Program';

  $('pls').innerHTML = g.players.map((p, i) => `
    <div class="pl ${i === HUMAN ? 'me' : ''}">
      <span class="dot" style="background:${PC[i]}"></span>
      <span class="nm">${p.name}</span>
      <span class="st">${p.coins}c · ${p.stations.length}st · ${p.done.length}✓</span>
    </div>`).join('');

  const d = actDesc();
  $('acts').innerHTML = ['dredge', 'build', 'ship', 'survey'].map(a => `
    <button class="act" data-act="${a}" ${pendingAction ? 'disabled' : ''}>
      ${icon(ACT_ICON[a])}
      <span class="txt"><span class="t">${a}</span><span class="d">${d[a]}</span></span>
    </button>`).join('');
  for (const b of document.querySelectorAll('.act')) {
    b.addEventListener('click', () => setSlot(b.dataset.act));
  }

  [0, 1].forEach(i => {
    const s = $('s' + i);
    const a = program[i];
    // Keep the slot number visible even when filled — resolution order matters.
    s.innerHTML = a
      ? `<div class="n">SLOT ${i + 1}</div>${icon(ACT_ICON[a])}<div class="a">${a}</div>`
      : `<div class="n">SLOT ${i + 1}</div><div class="a">—</div>`;
    s.classList.toggle('on', picking === i);
    s.classList.toggle('filled', !!a);
  });

  const p = g.players[HUMAN];
  $('cts').innerHTML = p.contracts.length
    ? p.contracts.map(c => `<div class="ct">
        <span class="vp">${Math.round(c.vp * TUNING.contractScale)}</span>
        <span>${c.need} cubes · ${c.types} type${c.types > 1 ? 's' : ''}${c.mouth ? ` → ${c.mouth}` : ' → any mouth'}</span>
      </div>`).join('')
    : '<div class="ct">none — try Survey</div>';

  $('go').disabled = !(program[0] && program[1]) || !!pendingAction;

  const hint = $('hint');
  if (pendingAction) {
    hint.style.display = 'block';
    hint.textContent = {
      dredge: 'Click a gold channel to dredge it and claim its toll.',
      build: 'Click a highlighted node to build there.',
      ship: 'Click one of your stations to ship from it.',
    }[pendingAction] ?? '';
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
  $('tutStep').textContent = `Step ${i} of ${n}`;
  $('tutTitle').textContent = s.title;
  $('tutBody').textContent = s.body;
  $('tutNext').style.display = s.check ? 'none' : '';
  $('tutNext').textContent = tut.isLast() ? 'Start playing' : 'Next';
  $('tutWait').textContent = s.check ? 'Complete the action to continue…' : '';

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
  if (tut?.poll(g, { program })) render();
}

function say(t, cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = t;
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

function step() {
  while (queue) {
    if (queue.idx >= queue.order.length) {
      if (queue.slot === 0) {
        queue = { slot: 1, order: seatOrder(g), idx: 0, claimed: new Set() };
        continue;
      }
      queue = null;
      endRound();
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
    flush();
  }
}

function resolveHuman(choice) {
  if (!pendingAction || !queue) return;
  const a = pendingAction;
  pendingAction = null;
  execute(g, HUMAN, a, choice, queue.claimed);
  flush();
  step();
}

function pickShip(from) {
  const opts = shipOptions(g, g.players[HUMAN]).filter(o => o.from === from);
  if (!opts.length) return;
  opts.sort((a, b) => b.payout - a.payout);
  resolveHuman({ option: opts[0] });
}

function flush() {
  for (const l of g.log) say(l, l.startsWith('You') ? 'me' : '');
  g.log = [];
  render();
}

function endRound() {
  siltPhase(g); regrowPhase(g); upkeepPhase(g);
  flush();
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
    <tr><th>Player</th><th>Contr</th><th>Mouth</th><th>Net</th><th>Toll</th>
        <th>Coin</th><th>Silt</th><th>Total</th></tr>
    ${s.map(x => `<tr class="${x.total === best ? 'win' : ''}">
      <td>${g.players[x.i].name}</td><td>${x.contracts}</td><td>${x.mouth}</td>
      <td>${x.network}</td><td>${x.held}</td><td>${x.coin}</td><td>${x.silt}</td>
      <td>${x.total}</td></tr>`).join('')}
  </table>`;
  $('ov').classList.add('on');
  $('ph').textContent = 'Game over';
  tut?.stop();
  renderTutorial();
}

$('tutNext').addEventListener('click', () => { tut?.next(); render(); });
$('tutSkip').addEventListener('click', () => { tut?.stop(); render(); });

// ---------------------------------------------------------------- test hooks

window.SILT = {
  boot: (s) => start(false, s),
  bootTutorial: (s) => start(true, s),
  menu: showMenu,
  config: () => config,
  setConfig: (c) => Object.assign(config, c),
  state: () => g,
  program: (a, b) => { program = [a, b]; render(); },
  commit: () => $('go').click(),
  pending: () => pendingAction,
  autoResolve: () => {
    const p = g.players[HUMAN];
    resolveHuman(chooseTarget(g, p, pendingAction, 'balanced') ?? {});
  },
  tutorial: () => tut && ({ active: tut.active, ...tut.progress(), id: tut.step()?.id }),
  tutNext: () => { tut?.next(); render(); },
  score: () => score(g),
  seed: () => seed,
};

// Sprites must be in the DOM before any <use> resolves. Expose a readiness flag so
// tests wait on the real thing instead of racing module evaluation.
window.SILT.ready = loadSprites().then(() => {
  buildMenu();
  window.SILT.isReady = true;
});
await window.SILT.ready;
