import { NODES, MOUTHS, CHANNELS, chKey, NODE_BY_ID } from './graph.js';
import {
  newGame, execute, siltPhase, regrowPhase, upkeepPhase, score, seatOrder,
  buildTargets, dredgeTargets, shipOptions, buildCost, TUNING,
} from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';

const HUMAN = 0;
const BOTS = ['balanced', 'expander', 'steward'];
const PC = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)'];
const $ = (id) => document.getElementById(id);

let g, program, picking, pendingAction, seed;

function boot(s = Math.floor(Math.random() * 1e9)) {
  seed = s;
  g = newGame(4, seed);
  g.players.forEach((p, i) => {
    p.strat = i === HUMAN ? null : BOTS[(i - 1) % BOTS.length];
    p.name = i === HUMAN ? 'You' : `${p.strat} ${i}`;
  });
  program = [null, null];
  picking = null;
  pendingAction = null;
  $('ov').classList.remove('on');
  say(`Round 1 — seed ${seed}`, true);
  render();
}

// ---------- board ----------------------------------------------------------

function depthColor(d) {
  if (d === 0) return 'var(--dead)';
  return ['', '#3d4f4a', '#2f6478', 'var(--water)'][d];
}

function drawBoard() {
  const svg = $('svg');
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const el = (t, a) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); return e; };

  // channels
  for (const [a, b] of CHANNELS) {
    const k = chKey(a, b), d = g.depth[k];
    const A = NODE_BY_ID[a], B = NODE_BY_ID[b];
    const line = el('line', {
      x1: A.x, y1: A.y, x2: B.x, y2: B.y,
      stroke: depthColor(d),
      'stroke-width': d === 0 ? 0.35 : 0.4 + d * 0.42,
      'stroke-linecap': 'round',
      'stroke-dasharray': d === 0 ? '1.1 1.1' : '',
      'data-ch': k, 'data-depth': d,
      class: 'ch',
    });
    if (pendingAction === 'dredge' && d > 0 && d < TUNING.maxDepth) {
      line.setAttribute('stroke', '#e0a458');
      line.style.cursor = 'pointer';
      line.addEventListener('click', () => resolveHuman({ channel: k }));
      const hit = el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: 'transparent',
        'stroke-width': 3, 'data-hit': k, style: 'cursor:pointer' });
      hit.addEventListener('click', () => resolveHuman({ channel: k }));
      svg.appendChild(line); svg.appendChild(hit);
      continue;
    }
    svg.appendChild(line);
  }

  // ship-route highlight
  if (pendingAction === 'ship') {
    for (const o of shipOptions(g, g.players[HUMAN])) {
      for (const k of o.path) {
        const [a, b] = k.split('>');
        const A = NODE_BY_ID[a], B = NODE_BY_ID[b];
        svg.appendChild(el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y,
          stroke: '#e0a458', 'stroke-width': 0.3, opacity: .5, 'stroke-dasharray': '.7 .7' }));
      }
    }
  }

  const owner = {};
  g.players.forEach((p, i) => p.stations.forEach(s => { owner[s] = i; }));

  const btargets = pendingAction === 'build' ? new Set(buildTargets(g, g.players[HUMAN])) : new Set();
  const sfrom = pendingAction === 'ship'
    ? new Set(shipOptions(g, g.players[HUMAN]).map(o => o.from)) : new Set();

  for (const n of NODES) {
    const grp = el('g', { class: 'node', 'data-node': n.id });
    const isMouth = MOUTHS.includes(n.id);
    const r = isMouth ? 3.4 : 2.5;
    const own = owner[n.id];

    let fill = '#16252b', stroke = 'var(--line)', sw = 0.25;
    if (isMouth) { fill = '#1b3038'; stroke = '#3d5f6b'; }
    if (own !== undefined) { stroke = PC[own]; sw = 0.6; }
    if (btargets.has(n.id)) { stroke = '#e0a458'; sw = 0.7; fill = '#243a42'; }
    if (sfrom.has(n.id)) { stroke = '#e0a458'; sw = 0.7; }

    grp.appendChild(el('circle', { cx: n.x, cy: n.y, r, fill, stroke, 'stroke-width': sw }));

    if (!isMouth) {
      const c = g.cubes[n.id];
      for (let i = 0; i < c; i++) {
        const ang = -Math.PI / 2 + (i - (c - 1) / 2) * 0.55;
        grp.appendChild(el('circle', {
          cx: n.x + Math.cos(ang) * 3.6, cy: n.y + Math.sin(ang) * 3.6,
          r: 0.62, fill: `var(--${n.good})`,
        }));
      }
    }

    grp.appendChild(el('text', {
      x: n.x, y: n.y + 0.75, 'text-anchor': 'middle',
      'font-size': isMouth ? 2.4 : 1.9, fill: own !== undefined ? PC[own] : 'var(--dim)',
      'font-weight': own !== undefined ? 700 : 400,
    })).textContent = n.id;

    if (isMouth) {
      const tot = g.players.reduce((s, p) =>
        s + p.delivered[n.id].timber + p.delivered[n.id].grain + p.delivered[n.id].salt, 0);
      if (tot) grp.appendChild(el('text', { x: n.x, y: n.y + 6, 'text-anchor': 'middle',
        'font-size': 2, fill: 'var(--dim)' })).textContent = `${tot}`;
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

// ---------- panel ----------------------------------------------------------

const ACT_DESC = () => {
  const p = g.players[HUMAN];
  return {
    dredge: `+${TUNING.dredgeAmount} depth · ${TUNING.dredgeCoins}c`,
    build: `new station · ${buildCost(p)}c`,
    ship: `≤${TUNING.shipCubesMax} cubes to sea`,
    survey: `+${TUNING.surveyCoins}c · draw ${TUNING.surveyDraw} keep 1`,
  };
};

function render() {
  drawBoard();
  $('rd').textContent = `Round ${g.round} / ${TUNING.rounds}`;
  $('ph').textContent = pendingAction ? `Choose target: ${pendingAction}` : 'Program';

  $('pls').innerHTML = g.players.map((p, i) => `
    <div class="pl ${i === HUMAN ? 'me' : ''}">
      <span class="dot" style="background:${PC[i]}"></span>
      <span class="nm">${p.name}</span>
      <span class="st">${p.coins}c · ${p.stations.length}st · ${p.done.length}✓</span>
    </div>`).join('');

  const d = ACT_DESC();
  $('acts').innerHTML = ['dredge', 'build', 'ship', 'survey'].map(a => `
    <button class="act" data-act="${a}" ${pendingAction ? 'disabled' : ''}>
      <div class="t">${a}</div><div class="d">${d[a]}</div>
    </button>`).join('');
  for (const b of document.querySelectorAll('.act')) {
    b.addEventListener('click', () => setSlot(b.dataset.act));
  }

  [0, 1].forEach(i => {
    const s = $('s' + i);
    s.querySelector('.a').textContent = program[i] ?? '—';
    s.classList.toggle('on', picking === i);
  });

  const p = g.players[HUMAN];
  $('cts').innerHTML = p.contracts.length
    ? p.contracts.map(c => `<div class="ct"><b>${c.vp}vp</b> ${c.kind} — ${c.need} cubes,
        ${c.types} type${c.types > 1 ? 's' : ''}${c.mouth ? ` @ ${c.mouth}` : ''}</div>`).join('')
    : '<div class="ct">none</div>';

  $('go').disabled = !(program[0] && program[1]) || !!pendingAction;

  const hint = $('hint');
  if (pendingAction) {
    hint.style.display = 'block';
    hint.textContent = {
      dredge: 'Click a damaged channel (gold) to dredge it.',
      build: 'Click a highlighted node to build.',
      ship: 'Click one of your stations to ship from.',
    }[pendingAction] ?? '';
  } else hint.style.display = 'none';
}

function setSlot(a) {
  const i = picking ?? (program[0] ? (program[1] ? 0 : 1) : 0);
  program[i] = a;
  picking = i === 0 && !program[1] ? 1 : null;
  render();
}

for (const s of document.querySelectorAll('.slot')) {
  s.addEventListener('click', () => { picking = +s.dataset.slot; render(); });
}

function say(t, hd = false) {
  const d = document.createElement('div');
  if (hd) d.className = 'hd';
  d.textContent = t;
  $('log').appendChild(d);
  $('log').scrollTop = $('log').scrollHeight;
}

// ---------- turn flow ------------------------------------------------------

let queue = null;

$('go').addEventListener('click', () => {
  if (!program[0] || !program[1]) return;
  g.players[HUMAN].program = [...program];
  for (const p of g.players) if (p.strat) p.program = STRATEGIES[p.strat](g, p);
  say(`Round ${g.round}`, true);
  queue = { slot: 0, order: seatOrder(g), idx: 0, claimed: new Set() };
  step();
});

function step() {
  while (queue) {
    if (queue.idx >= queue.order.length) {
      if (queue.slot === 0) { queue = { slot: 1, order: seatOrder(g), idx: 0, claimed: new Set() }; continue; }
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
        (action === 'dredge' && dredgeTargets(g).length) ||
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
  const a = pendingAction;
  pendingAction = null;
  execute(g, HUMAN, a, choice, queue.claimed);
  flush();
  step();
}

function pickShip(from) {
  const opts = shipOptions(g, g.players[HUMAN]).filter(o => o.from === from);
  opts.sort((a, b) => b.payout - a.payout);
  resolveHuman({ option: opts[0] });
}

function flush() {
  for (const l of g.log) say(l);
  g.log = [];
  render();
}

function endRound() {
  siltPhase(g); regrowPhase(g); upkeepPhase(g);
  flush();
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
    <tr><th>Player</th><th>Contr</th><th>Mouth</th><th>Net</th><th>Coin</th><th>Silt</th><th>Total</th></tr>
    ${s.map(x => `<tr class="${x.total === best ? 'win' : ''}">
      <td>${g.players[x.i].name}</td><td>${x.contracts}</td><td>${x.mouth}</td>
      <td>${x.network}</td><td>${x.coin}</td><td>${x.silt}</td><td>${x.total}</td></tr>`).join('')}
  </table>`;
  $('ov').classList.add('on');
  $('ph').textContent = 'Game over';
}

// Test/debug surface — Playwright drives the game through this.
window.SILT = {
  boot,
  state: () => g,
  program: (a, b) => { program = [a, b]; render(); },
  commit: () => $('go').click(),
  pending: () => pendingAction,
  autoResolve: () => {
    // resolve the human's pending choice with the bot heuristic
    const p = g.players[HUMAN];
    const c = chooseTarget(g, p, pendingAction, 'balanced');
    resolveHuman(c ?? {});
  },
  score: () => score(g),
  seed: () => seed,
};

boot(20260719);
