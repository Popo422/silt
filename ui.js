import { NODE_BY_ID } from './graph.js';
import {
  newGame, execute, siltPhase, regrowPhase, upkeepPhase, score, seatOrder,
  buildTargets, dredgeTargets, shipOptions, buildCost, TUNING,
} from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
import { createTutorial, stepText } from './tutorial.js';
import { createDemo, paintCaption, wireDemo, DEMO_SEED, DEMO_BOTS } from './demo.js';
import { THEMES, applyTheme, nodeLabel } from './theme.js';
import { pages, createRulebook } from './rulebook.js';
import { createFX } from './fx.js';
import { createPanZoom } from './panzoom.js';
import { createTips, esc } from './tips.js';
import { createSpeech } from './speech.js';
import { drawBoard as paintBoard, el, insetRadius } from './board.js';
import {
  renderContracts, renderPlayers, renderActions, renderSlots, renderAimHint,
  renderFinalScore, renderActor,
  actionDescriptions, actionTips,
} from './panel.js';

const HUMAN = 0;
const PC = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)'];
const $ = (id) => document.getElementById(id);

const BOT_KEYS = ['balanced', 'tollkeeper', 'steward', 'expander', 'turtle', 'defector'];

let g, program, picking, pendingAction, seed, queue, tut, config;
// Watch mode. When active, seat 0 is driven by a bot like every other seat, so
// the resolution walker never stops for input and the game plays itself. The
// demo object owns only the commentary laid over that — never the moves.
let demo = null;
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

// 1× -> 2× -> off. Persisted: someone who turns animation off wants it to stay
// off, not to re-disable it every session.
//
// Declared here with the rest of the speed state rather than beside cycleSpeed():
// renderTutorial() reads SPEED_LABEL far above that point, which worked only
// because render never runs during module evaluation. That is a crash waiting for
// someone to move a call.
const SPEED_ORDER = ['normal', 'fast', 'off'];
const SPEED_LABEL = { normal: '1×', fast: '2×', off: 'off' };

// Spoken captions for watch mode. Off by default and remembered; see speech.js
// for why it cannot start on its own.
const speech = createSpeech();

// Hold time is NOT the effect's full duration — effects are allowed to overlap,
// and the tail of one plays out under the start of the next. But the previous
// numbers (0.45x, capped at 420ms) overlapped them almost to nothing: a dredge
// animates for 950ms and got 420 of it, the silt sweep animates for 1400ms and
// got 420. With three players resolving in turn, every effect was cut off before
// it read and the round looked like flicker.
//
// That was an overcorrection. Waiting for every animation to FINISH made a round
// take 7.4s, which is a minute of watching per game — so this keeps the overlap
// but gives each effect most of its own time. A round lands around 3.5s: long
// enough to follow, short enough not to drag.
//
// The floor matters as much as the ceiling. A short effect that resolves in
// 260ms still needs a beat afterwards or two fast actions read as one event.
const HOLD_MIN = 420;
const HOLD_MAX = 900;
const holdFor = (ms) =>
  Math.min(HOLD_MAX, Math.max(HOLD_MIN, ms * 0.8)) * (SPEEDS[speed] ?? 1);
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
  $('btnWatch').addEventListener('click', startDemo);
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
    // Escape means "get me out of the thing I am in". The rulebook is modal so it
    // wins; otherwise it backs out of aiming, which is the only other state that
    // traps input.
    if (!book.open) {
      if (e.key === 'Escape' && pendingAction) { e.preventDefault(); skipAim(); }
      return;
    }
    if (e.key === 'Escape') closeBook();
    if (e.key === 'ArrowRight') { book.next(pages(T).length); renderBook(); }
    if (e.key === 'ArrowLeft')  { book.prev(); renderBook(); }
  });
}

function showMenu() {
  stopDemo();
  $('menu').classList.remove('hide');
  $('game').classList.add('hide');
  $('ov').classList.remove('on');
}

// Everything a new game clears, whether it is played or watched. Extracted
// because the demo needs the identical reset: two copies drifted the moment one
// of them forgot `stepping`, and a stale walker flag wedges the next round.
function resetGame(players, s) {
  stopDemo();   // a running demo would keep driving the board underneath
  seed = s;
  g = newGame(players, seed);
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
}

function start(tutorial, s = Math.floor(Math.random() * 1e9)) {
  TUNING.rounds = config.rounds;
  resetGame(config.players, s);
  g.players.forEach((p, i) => {
    p.strat = i === HUMAN ? null : config.bots[i - 1];
    p.name = i === HUMAN ? (T.id === 'anod' ? 'Ikáw' : 'You') : botName(p.strat);
  });
  if (tutorial) tut.start();
  say(`${T.terms.round.name} 1 — seed ${seed}`, 'hd');
  render();
}

// Watch a game play itself. The ONLY structural difference from start() is that
// seat 0 gets a strategy instead of null — that one field is what makes the
// resolution walker never stop for input, because its human branch is guarded
// on `pi === HUMAN && !p.strat`. Everything else here is presentation.
function startDemo() {
  TUNING.rounds = 8;
  resetGame(DEMO_BOTS.length, DEMO_SEED);
  g.players.forEach((p, i) => { p.strat = DEMO_BOTS[i]; p.name = botName(p.strat); });

  // The demo owns its own loop; this object is the whole surface it needs from
  // the UI, which is what keeps a second game loop out of this module.
  demo = createDemo({
    render,
    step: () => step(),
    roundOf: () => g.round,
    rounds: () => TUNING.rounds,
    // Watch mode always runs at full pace, whatever the speed toggle says.
    //
    // These captions are 40-word paragraphs and they are the entire reason the
    // mode exists, so the viewer needs time to actually read one. Speed 'off'
    // persists across sessions, so anyone who had ever turned animation off then
    // clicked Watch got all 8 rounds in under 100ms and landed on the final score
    // having seen nothing at all.
    //
    // Note these multipliers run the other way to intuition: 'fast' is 0.5, so
    // LARGER means slower. Flooring with Math.max against SPEEDS.fast picked the
    // smaller value and cut every caption to 1.3s — still unreadable.
    wait: (ms) => wait(ms * SPEEDS.normal),
    silent: () => false,
    // Lets the demo hold a caption until the voice has finished saying it.
    speaking: () => speech.speaking(),
    // The theme, so the demo can measure its own caption length. Everything
    // else it needs it already has.
    theme: () => T,
    newRound: (r) => {
      for (const p of g.players) p.program = STRATEGIES[p.strat](g, p);
      committedThisRound = true;
      say(`Round ${r}`, 'hd');
      queue = { slot: 0, order: seatOrder(g), idx: 0, claimed: new Set() };
      render();
    },
  });
  demo.start();
  say(`${T.terms.round.name} 1 — watching`, 'hd');
  render();
  demo.run();
}

// ---------------------------------------------------------------- board

// ---------------------------------------------------------------- panel

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
  renderPlayers({
    el: $, players: g.players, human: HUMAN, revealed: committedThisRound,
    colors: PC, T, tuning: TUNING, icon, ico, esc,
  });

  const target = aimed();
  renderActions({
    el: $, T,
    desc: actionDescriptions(TUNING, buildCost(g.players[HUMAN])),
    tips: actionTips(TUNING, buildCost(g.players[HUMAN])),
    want: tut?.active ? tut.step()?.requires : null,
    disabled: !!pendingAction,
    target, replacing: !!program[target],
    icon, ico, esc, onPick: setSlot,
  });

  renderSlots({ el: $, program, T, target, pendingAction, icon, ico });

  renderContracts({
    el: $, player: g.players[HUMAN], T, tuning: TUNING, nodeLabel, esc,
  });
  $('go').disabled = !(program[0] && program[1]) || !!pendingAction;
  renderAimHint({ el: $, pendingAction, T });
  $('skipAim')?.addEventListener('click', skipAim);
  renderTutorial();
}

function renderTutorial() {
  const box = $('tut');
  document.querySelectorAll('.uiPulse').forEach(e => e.classList.remove('uiPulse'));
  // Watch mode paints the same box with transport controls instead of steps.
  if (demo?.active) {
    paintCaption(box, demo, {
      T, round: Math.min(g.round, TUNING.rounds), rounds: TUNING.rounds,
      speedLabel: SPEED_LABEL[speed], el: $,
      speech: { available: speech.available, enabled: speech.enabled },
    });
    const t = demo.text(T);
    speech.narrate(demo.beat?.id ?? null, t?.title, t?.body, demo.paused);
    return;
  }
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

// Leave watch mode. Anything that ends the demo comes through here so the flag
// clears before the walker's next pause check — otherwise a paused demo would
// keep the new game suspended on a gate nobody can see.
function stopDemo() {
  if (!demo) return;
  demo.paused = false;
  demo.stop();
  demo = null;
  // Speech outlives the utterance it started, so quitting mid-sentence would
  // leave a voice describing a board that is no longer on screen.
  speech.reset();
  $('tut').classList.remove('watching');
}

// Which slot the next action click lands in. Never null once the board is live:
// an unaimed pick used to silently overwrite slot 1, and with both slots looking
// identical there was no way to tell which one you were about to lose.
function aimed() {
  // `picking` is declared uninitialised, so test for both empties — `undefined`
  // slipping through here would index program[undefined] on the first render.
  if (picking === 0 || picking === 1) return picking;
  if (!program[0]) return 0;
  if (!program[1]) return 1;
  return 0;              // both full — replace the first, and SAY so on the buttons
}

function setSlot(a) {
  const i = aimed();
  program[i] = a;
  // Advance to the empty slot if there is one, otherwise keep aim where it is so
  // the highlight still shows what a second click would replace.
  picking = !program[1] ? 1 : (!program[0] ? 0 : i);
  render();
  pollTutorial();
}

function clearSlot(i) {
  program[i] = null;
  picking = i;
  render();
  pollTutorial();
}

for (const s of document.querySelectorAll('.slot')) {
  s.addEventListener('click', (e) => {
    const i = +s.dataset.slot;
    if (e.target.closest('.clr')) clearSlot(i);
    else { picking = i; render(); }
  });
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
          if (demo?.ambient(g.round, 1)) { render(); await demo.hold(); }
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

      // Watch mode holds between actions so each one can be read as a discrete
      // beat rather than a blur.
      if (demo?.active) await demo.unpaused();
      if (demo && !demo.active) return;   // quit mid-round

      // Seat 0 is only "the human" when nobody is driving it. In watch mode it
      // carries a strategy like every other seat, and this branch must not claim
      // it — otherwise the walker stops dead waiting for a click that never comes.
      if (pi === HUMAN && !p.strat) {
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
      await flush({ actor: pi, action });
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
  await flush({ actor: HUMAN, action: a });
  step();
}

// Aiming was a one-way door: click an action, and the only exit was clicking a
// board target. Changing your mind — or misreading which channel was affordable —
// left you stuck with no visible way out. Resolution is already underway by this
// point, so the action cannot be refunded; it resolves with no target, the same
// path taken when no legal target exists at all. Said plainly on the button.
function skipAim() {
  if (!pendingAction) return;
  say(`${T.actions[pendingAction].name}: skipped.`);
  resolveHuman({});
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
async function flush({ actor = null, action = null } = {}) {
  const me = g.players[HUMAN].name;
  for (const l of g.log) say(l, l.startsWith(me) ? 'me' : '');
  g.log = [];

  const events = g.events ?? [];
  g.events = [];
  render();

  // Commentary is information, not decoration, so it still fires with effects
  // turned off — someone who disabled animation is not asking to be told less.
  // The visual effects below are what 'off' actually suppresses.
  if (!events.length) return;
  if (speed === 'off') return reactToEvents(events);

  if (actor !== null) setActor(actor, action);
  let longest = 0;
  for (const ev of events) longest = Math.max(longest, fx.play(ev));
  await wait(holdFor(longest));
  setActor(null);

  await reactToEvents(events);
}

// Commentary comes AFTER the effect has played: the caption points at something
// the viewer has just watched happen rather than pre-empting it. Only one beat
// per flush — two captions swapping inside a second cannot be read, and the
// rarer beat is the one worth keeping.
async function reactToEvents(events) {
  if (!demo?.active) return;
  for (const ev of events) {
    if (demo.react(ev, { g, T, round: g.round })) { render(); await demo.hold(); return; }
  }
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

// Hoisted, not a const arrow: flush() and resetGame() both call this from above
// its own position in the file, which a const would make a temporal-dead-zone
// crash rather than a working forward reference.
function setActor(pi, action = null) {
  renderActor({
    el: $, pi, action, T, colors: PC,
    who: pi === null ? null : (pi === HUMAN ? 'You' : g.players[pi].name),
  });
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
  renderFinalScore({
    el: $, rows: s, players: g.players, T, tuning: TUNING, esc,
  });
  $('ov').classList.add('on');
  $('ph').textContent = T.id === 'anod' ? 'Tapós na' : 'Game over';
  tut?.stop();
  // A watched game ends like any other: the caption must not sit over the score
  // table still offering to pause a game that is already finished.
  stopDemo();
  renderTutorial();
}

// The tutorial box's three buttons do double duty in watch mode. wireDemo owns
// that branching so this module keeps one binding per control.
wireDemo({
  el: $,
  isWatching: () => !!demo?.active,
  togglePause: () => { demo.paused = !demo.paused; render(); },
  cycleSpeed: () => { cycleSpeed(); render(); },
  // "Play it myself" — the demo exists to make someone want to play, so the
  // exit drops straight into a real game rather than back to the menu.
  takeOver: () => { stopDemo(); start(false); },
  // Turning it on mid-beat speaks the caption already on screen, rather than
  // staying silent until the next one happens to fire.
  toggleSpeech: () => { speech.toggle(); render(); },
  tutNext: () => { tut?.next(); render(); },
  tutStop: () => { tut?.stop(); render(); },
});

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
  // Watch mode. `beat` is the caption currently showing, which is what a test
  // asserts on — the moves themselves are the bots' and are covered elsewhere.
  watch: startDemo,
  demo: () => demo && ({ active: demo.active, paused: demo.paused,
    beat: demo.beat?.id ?? null, fired: [...demo.fired] }),
  demoPause: () => { if (demo) demo.paused = true; render(); },
  demoResume: () => { if (demo) demo.paused = false; render(); },
  demoStop: stopDemo,
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
