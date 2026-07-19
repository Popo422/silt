import { NODE_BY_ID } from './graph.js';
import {
  newGame, execute, siltPhase, regrowPhase, upkeepPhase, score, seatOrder,
  buildTargets, dredgeTargets, shipOptions, buildCost, TUNING,
} from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
import { createTutorial, stepText } from './tutorial.js';
import { THEMES, applyTheme, nodeLabel } from './theme.js';
import { pages, createRulebook } from './rulebook.js';
import { createFX } from './fx.js';
import { createPanZoom } from './panzoom.js';
import { createTips, esc } from './tips.js';
import { drawBoard as paintBoard, el, insetRadius } from './board.js';

const HUMAN = 0;
const PC = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)'];
const $ = (id) => document.getElementById(id);

const BOT_KEYS = ['balanced', 'tollkeeper', 'steward', 'expander', 'turtle', 'defector'];

let g, program, picking, pendingAction, seed, queue, tut, config;
let roundsPlayed = 0;   // rounds fully resolved this game — drives tutorial gating
let stepping = false;   // re-entry guard for the async resolution walker
let committedThisRound = false;   // programs stay face-up from commit to next round
let panzoom = null;     // created in buildMenu once the DOM exists
// Set by a completed drag so the click that ends a pan does not also resolve a
// target. Lives here rather than in panzoom.js because only the board click
// handler cares.
let suppressClick = false;

// Starting view — must match the viewBox in index.html.
const HOME_VIEW = { x: -6, y: -6, w: 112, h: 112 };
let T = THEMES.anod;          // active theme (presentation only)
const book = createRulebook();

// Effects overlay. Board coordinates come straight from the graph, so the FX
// layer needs no knowledge of the renderer beyond where a node sits.
const fx = createFX(document.getElementById('fx'), {
  colors: PC,
  nodeAt: (id) => NODE_BY_ID[id],
  // Same inset the board uses. This was duplicated inline; if the two ever
  // disagree, effects draw an X through every node.
  radiusOf: insetRadius,
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
const wait = (ms) => (ms > 0 ? new Promise(r => { setTimeout(r, ms); }) : Promise.resolve());

const botName = (k) => T.bots[k].name;
const botDesc = (k) => T.bots[k].desc;

// ---------------------------------------------------------------- sprites

async function loadSprites() {
  const res = await fetch('./assets/sprites.svg');
  $('sprites').innerHTML = await res.text();
}

// Painted art, keyed by the same names the SVG sprite sheet uses.
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
const ART = {
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
};

const icon = (name, cls = '') =>
  ART[name]
    ? `<img class="art ${cls}" src="${ART[name]}" alt="" draggable="false">`
    : `<svg class="${cls}"><use href="#ic-${name}"/></svg>`;
const ico = (slot) => T.icons[slot];

// SVG <image> for board use. Same signature as use() so the two are swappable.
const artImage = (name, x, y, size) => el('image', {
  href: ART[name], x: x - size / 2, y: y - size / 2,
  width: size, height: size, preserveAspectRatio: 'xMidYMid meet',
});

// ---------------------------------------------------------------- menu

function buildMenu() {
  config = { players: 3, rounds: 8, bots: ['tollkeeper', 'balanced', 'expander'] };

  const syncBots = () => {
    const n = config.players - 1;
    $('botRows').innerHTML = Array.from({ length: n }, (_, i) => `
      <div class="botRow">
        <div class="botTop">
          <span class="dot" style="background:${PC[i + 1]}"></span>
          <select data-bot="${i}">
            ${BOT_KEYS.map(k =>
              `<option value="${k}" ${config.bots[i] === k ? 'selected' : ''}>${botName(k)}</option>`).join('')}
          </select>
        </div>
        <!-- The description used to be squeezed into a 150px right-aligned column
             and truncated. Given its own line it can actually be read. -->
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
  createTips();
  // Pan/zoom knows nothing about the game; the two places it needs game state
  // are injected as predicates so the dependency points one way only.
  panzoom = createPanZoom({
    svg: $('svg'),
    mirrors: [$('fx')],
    home: HOME_VIEW,
    buttons: { in: $('zIn'), out: $('zOut'), fit: $('zFit') },
    canPan: () => !pendingAction,        // never pan while aiming a target
    canKey: () => !book.open,            // the rulebook owns the keyboard when open
    onDragEnd: (moved) => { if (moved) suppressClick = true; },
  });
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
  committedThisRound = false;
  program = [null, null];
  picking = null;
  pendingAction = null;
  queue = null;
  stepping = false;   // a quit mid-resolution would otherwise wedge the next game
  roundsPlayed = 0;
  fx.clear();
  setActor(null);
  panzoom?.reset();   // a new game should not inherit the last one's pan
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

// ---------------------------------------------------------------- panel


// ---------------------------------------------------------------- tooltips
//
// Plain-English one-liners. These used to be notation — "+1 lalim · 1g · singil",
// "≤2 → Look" — which reads as an API signature, not a game. A new player cannot
// decode that, and it was the first thing they saw on every button.
//
// Numbers still come from TUNING so the copy cannot drift from the rules.
function actDesc() {
  const p = g.players[HUMAN];
  // "gold" is a mass noun — no plural. This was a ternary with two identical
  // branches, left over from treating it like a countable.
  const coin = (n) => `${n} gold`;
  return {
    dredge: `Deepen a channel by ${TUNING.dredgeAmount}. Costs ${coin(TUNING.dredgeCoins)}, `
          + `then others pay you to pass.`,
    build:  `Found a new settlement. Costs ${coin(buildCost(p))}.`,
    ship:   `Carry up to ${TUNING.shipCubesMax} goods downstream to the sea.`,
    survey: `Take ${coin(TUNING.surveyCoins)} and draw ${TUNING.surveyDraw} contracts, keep 1.`,
  };
}

// The longer "why would I do this" explanation, shown on hover. The one-liner says
// what an action does; this says when it is the right call and what it costs you —
// the part a rulebook would cover and a button cannot.
function actTip() {
  const p = g.players[HUMAN];
  return {
    dredge: `Repairs one channel and claims it. While it stays deep, every other `
          + `player pays you ${TUNING.tollPerShip} gold each time they ship through, `
          + `and you score ${TUNING.rightsVP} points for it at the end. `
          + `Dredging is how you turn other people's traffic into income.`,
    build:  `Places a settlement on a node you can reach, bringing its goods online. `
          + `Costs ${buildCost(p)} gold now and rises with each one you own. `
          + `Beyond ${TUNING.freeStations} settlements you pay ${TUNING.upkeepPerStation} `
          + `gold upkeep per extra one every round, and you abandon them if you cannot pay.`,
    ship:   `Moves up to ${TUNING.shipCubesMax} goods from one of your settlements to `
          + `the sea, paying ${TUNING.shipPerCube} gold per good plus `
          + `${TUNING.shipPerChannel} per channel crossed. This is how contracts get `
          + `filled — and every channel you use silts up by ${TUNING.siltPerShip}.`,
    survey: `Draws ${TUNING.surveyDraw} contracts and keeps the best one, plus `
          + `${TUNING.surveyCoins} gold. Contracts are most of your score, so a hand `
          + `with nothing in it is usually worth fixing before anything else.`,
  };
}

function render() {
  // The board renderer reads no globals — everything it needs arrives here, which
  // is what lets it live in its own file and be reasoned about on its own.
  paintBoard({
    svg: $('svg'),
    g, human: HUMAN, playerColors: PC, theme: T,
    pendingAction,
    highlight: tut?.step()?.highlight?.() ?? null,
    artImage, ico, nodeLabel, ART,
  });
  $('rd').textContent = `${T.terms.round.name} ${g.round} / ${TUNING.rounds}`;
  $('ph').textContent = pendingAction
    ? (T.id === 'anod' ? 'Pumili' : 'Choose a target')
    : (T.id === 'anod' ? 'Magplano' : 'Program');

  // Tell the player what the panel wants from them right now. Without this the
  // program panel looks identical whether it needs two actions, one, or a click
  // on the board — you had to infer the state from which controls were disabled.
  const filled = program.filter(Boolean).length;
  $('progHint').textContent = pendingAction
    ? (T.id === 'anod' ? 'pumili sa mapa' : 'click the board')
    : filled === 0 ? (T.id === 'anod' ? 'pumili ng dalawa' : 'pick two')
    : filled === 1 ? (T.id === 'anod' ? 'isa pa' : 'one more')
    : (T.id === 'anod' ? 'handa na' : 'ready');

  // "8g · 1b · 0✓" was unreadable without a key. Same numbers, but each is
  // labelled and carries a tooltip naming what it counts.
  //
  // Each row also shows the program that player revealed. This is a game with NO
  // hidden information — what everyone committed IS the game — and until now the
  // only way to learn it was to catch log lines as they scrolled past. Slots stay
  // face-down until the round is committed, so it never leaks a decision early.
  // Stays revealed for the whole round once committed, not just while the queue
  // is draining. Gating on `queue` made the programs vanish the instant the last
  // action resolved — which is exactly when you want to look at what everyone
  // did. Cleared when the next round's programs are wiped.
  const revealed = committedThisRound;
  $('pls').innerHTML = g.players.map((p, i) => `
    <div class="pl ${i === HUMAN ? 'me' : ''}">
      <span class="dot" style="background:${PC[i]}"></span>
      <span class="nm">${p.name}</span>
      <span class="prog" data-tip-title="${esc(p.name)}'s program"
            data-tip="${esc(revealed
              ? `Committed ${p.program.filter(Boolean).map(a => T.actions[a].name).join(' then ') || 'nothing'} this round.`
              : 'Face down until everyone commits. Nothing is hidden — you just cannot see it before you decide.')}">
        ${[0, 1].map(s => {
          const a = revealed ? p.program[s] : null;
          return a
            ? `<i class="pslot on" style="border-color:${PC[i]}">${icon(ico(a), 'pico')}</i>`
            : `<i class="pslot"></i>`;
        }).join('')}
      </span>
      <span class="st">
        <b data-tip="${esc(`Gold. Spent on dredging, founding settlements and paying tolls.`)}"
           data-tip-title="Gold">${p.coins}<i>gold</i></b>
        <b data-tip="${esc(`Settlements held. Each works its node; beyond ${TUNING.freeStations} you pay upkeep every round.`)}"
           data-tip-title="${esc(T.terms.station.name)}">${p.stations.length}<i>${
             T.id === 'anod' ? 'balangay' : 'sites'}</i></b>
        <b data-tip="${esc('Contracts fulfilled. These are most of the final score.')}"
           data-tip-title="Contracts done">${p.done.length}<i>done</i></b>
      </span>
    </div>`).join('');

  const d = actDesc();
  const tips = actTip();
  // During a gated tutorial step, only the action being taught is live. Letting a
  // first-time player pick something else strands them: the step never completes,
  // the hint keeps asking for an action they already spent a slot on, and the only
  // way out is the skip button. Guidance that can be wandered off is not guidance.
  const want = tut?.active ? tut.step()?.requires : null;
  $('acts').innerHTML = ['dredge', 'build', 'ship', 'survey'].map(a => `
    <button class="act${want && want !== a ? ' dimmed' : ''}"
            data-act="${a}"
            ${pendingAction || (want && want !== a) ? 'disabled' : ''}
            data-tip="${esc(tips[a])}"
            data-tip-title="${esc(T.actions[a].name)}${
              T.actions[a].gloss ? ` — ${esc(T.actions[a].gloss)}` : ''}">
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
  // English inside an English sentence. "to kahit saáng look" mixed the two mid
  // clause and parsed as neither; themed vocabulary belongs on labels and proper
  // nouns, not spliced into running prose.
  const anyMouth = 'any bay';
  // Hand size against the limit: you can hold a bounded number, and hitting the
  // cap silently discards a Survey draw.
  $('ctCount').textContent = p.contracts.length
    ? `${p.contracts.length}/${TUNING.handLimit}` : '';
  // Written as a sentence. "30  4 kalakal · 3 urìs → Kanluran" packed four facts
  // into notation with no verb — you had to already know the game to parse it.
  $('cts').innerHTML = p.contracts.length
    ? p.contracts.map(c => {
        const pts = Math.round(c.vp * TUNING.contractScale);
        const where = c.mouth ? nodeLabel(T, c.mouth) : anyMouth;
        const kinds = c.types > 1 ? `${c.types} different kinds` : 'any one kind';
        return `<div class="ct" data-tip-title="Contract — ${pts} points"
             data-tip="${esc(`Deliver ${c.need} goods of ${kinds} to ${where}. `
               + `Goods count once they reach the sea; you keep the points even if `
               + `the route silts up afterwards.`)}">
          <span class="vp">${pts}</span>
          <span class="cbody">Deliver <b>${c.need}</b> goods, <b>${kinds}</b>,
            to <b>${where}</b></span>
        </div>`;
      }).join('')
    : `<div class="ct empty">No contracts yet — use ${T.actions.survey.name} to draw some.</div>`;

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
  if (hl?.kind === 'legend') {
    // Open it first: pulsing a collapsed panel points at nothing.
    $('legendPane')?.setAttribute('open', '');
    $('legendPane')?.classList.add('uiPulse');
  }
  // Orientation steps name a whole region of the screen before asking for
  // anything — the old tutorial jumped straight to "click SHIP" without ever
  // saying which half of the window was the map.
  if (hl?.kind === 'board') $('board')?.classList.add('uiPulse');
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
  committedThisRound = true;   // programs are now public
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
    // The guard at the top of this function is a synchronous check-then-set with
    // no await between, so no other task can interleave. The rule cannot see
    // that. Clearing here is what stops a thrown error wedging every future round.
    // eslint-disable-next-line require-atomic-updates
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
    // A pan ends in a click on whatever the cursor landed on. Without this, a
    // drag that finishes over a node would also resolve the pending action.
    if (suppressClick) { suppressClick = false; return; }
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
  // NOTE: committedThisRound deliberately stays true here. The programs remain
  // face-up while you plan the next round, because "what did everyone just do"
  // is the main input to that decision. It flips back to false on the next
  // commit, when the fresh programs become the ones on show.
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
