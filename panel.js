// Contract hand rendering.
//
// Split out of ui.js's render(), which had grown to six unrelated jobs in one
// function — board, header, player rows, action buttons, slots and contracts.
// This is the piece with the least to do with the rest: it reads one player's
// hand and paints it, and it needs no game state beyond that.
//
// Same contract as board.js: reads no globals, everything arrives as arguments,
// dependencies point one way only (ui.js imports this, never the reverse).

// Written as a sentence. "30  4 kalakal · 3 urìs → Kanluran" packed four facts
// into notation with no verb — you had to already know the game to parse it.
export function renderContracts({ el, player, T, tuning, nodeLabel, esc }) {
  // Hand size against the limit: you can hold a bounded number, and hitting the
  // cap silently discards a Survey draw.
  el('ctCount').textContent = player.contracts.length
    ? `${player.contracts.length}/${tuning.handLimit}` : '';

  el('cts').innerHTML = player.contracts.length
    ? player.contracts.map(c => {
        const pts = Math.round(c.vp * tuning.contractScale);
        // English inside an English sentence. "to kahit saáng look" mixed the
        // two mid-clause and parsed as neither; themed vocabulary belongs on
        // labels and proper nouns, not spliced into running prose.
        const where = c.mouth ? nodeLabel(T, c.mouth) : 'any bay';
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
}

// The player rows: who is in the game, what they committed, and their standing.
//
// This is a game with NO hidden information — what everyone committed IS the
// game — and before these rows existed the only way to learn it was to catch
// log lines as they scrolled past. Slots stay face-down until the round is
// committed, so it never leaks a decision early, then stay revealed for the
// whole round: "what did everyone just do" is the main input to planning the
// next one. Gating on the resolution queue instead made the programs vanish the
// instant the last action resolved, which is exactly when you want to look.
// The turn-order reminder under the board: silt settles only after BOTH actions, so
// you cannot ship a channel and dredge it back the same round. Pure theme copy — it
// belongs with the other panel text, not inside render().
export function orderHintHTML(T) {
  const shipW = T.actions.ship.name, dredgeW = T.actions.dredge.name;
  return T.id === 'anod'
    ? `Parehong kikilos ayon sa pagkakasunod. Ang <b>anod ay dumarating pagkatapos `
      + `ng dalawa</b> — hindi mo mabubuksan sa ${dredgeW} ang sapàng gagamitin mo `
      + `sa ${shipW} ngayong taon.`
    : `Both actions resolve in the order you set. <b>Silt settles after both</b> — `
      + `you can't ${shipW} a river and ${dredgeW} it back the same round.`;
}

// Would the committed program waste a Build — no reachable node the player can afford?
// The engine reads (buildTargets/buildCost/buildStepCost) arrive as args so this file
// stays engine-free like the rest of the panel helpers. A ship-then-build is exempt:
// the ship may free the gold the build needs.
export function wastedBuildWarning(g, human, program, { buildTargets, buildCost, buildStepCost }) {
  const me = g.players[human];
  const buildSlot = program.indexOf('build');
  if (buildSlot === -1 || (program[0] === 'ship' && buildSlot === 1)) return false;
  return !buildTargets(g, me).some(n => me.coins >= buildCost(me) + buildStepCost(g, me, n));
}

export function renderPlayers({ el, players, human, revealed, colors, T, tuning, icon, ico, esc }) {
  el('pls').innerHTML = players.map((p, i) => `
    <div class="pl ${i === human ? 'me' : ''}">
      <span class="dot" style="background:${colors[i]}"></span>
      <span class="nm">${p.name}</span>
      <span class="prog" data-tip-title="${esc(p.name)}'s program"
            data-tip="${esc(revealed
              ? `Committed ${p.program.filter(Boolean).map(a => T.actions[a].name).join(' then ') || 'nothing'} this round.`
              : 'Face down until everyone commits. Nothing is hidden — you just cannot see it before you decide.')}">
        ${[0, 1].map(s => {
          const a = revealed ? p.program[s] : null;
          return a
            ? `<i class="pslot on" style="border-color:${colors[i]}">${icon(ico(a), 'pico')}</i>`
            : `<i class="pslot"></i>`;
        }).join('')}
      </span>
      <span class="st">
        <b data-tip="${esc('Gold. Spent on dredging, founding settlements and paying tolls.')}"
           data-tip-title="Gold">${p.coins}<i>gold</i></b>
        <b data-tip="${esc(`Settlements held. Each works its node; beyond ${tuning.freeStations} you pay upkeep every round.`)}"
           data-tip-title="${esc(T.terms.station.name)}">${p.stations.length}<i>${
             T.id === 'anod' ? 'balangay' : 'sites'}</i></b>
        <b data-tip="${esc('Contracts fulfilled. These are most of the final score.')}"
           data-tip-title="Contracts done">${p.done.length}<i>done</i></b>
        ${(p.hukay ?? 0) > 0 ? `<b class="hukayStat"
           data-tip-title="Hukay (shovel) tokens"
           data-tip="${esc('Earned by surveying. Spend one while dredging to dig a living channel deep (+2) or revive a dead one back to depth 1.')}"
           >🔨${p.hukay}<i>hukay</i></b>` : ''}
      </span>
    </div>`).join('');
}

// Prepare the claims list from raw game state: every owned channel, its owner's
// marker count and the top challenger's. Ownership is most-markers (ties to most
// recent dredger), so a rival level or one behind can flip it with a single dredge.
// Pure read — no engine import, no mutation — so it belongs beside its renderer
// rather than bloating ui.js's render(). Sorted yours-first, then most-contested.
export function buildClaims(g, human, T, nodeLabel) {
  return Object.keys(g.rights)
    .filter(k => g.rights[k] !== null && g.depth[k] > 0)
    .map(k => {
      const owner = g.rights[k];
      const marks = g.markers[k] ?? {};
      const ownerN = marks[owner] ?? 0;
      let rival = null, rivalN = 0;
      for (const [idx, cnt] of Object.entries(marks)) {
        if (+idx !== owner && cnt > rivalN) { rivalN = cnt; rival = +idx; }
      }
      const [a, b] = k.split('>');
      return {
        key: k, owner, ownerN, rival, rivalN,
        mine: owner === human,
        ownerName: owner === human ? 'You' : g.players[owner]?.name,
        rivalName: rival === null ? null : (rival === human ? 'You' : g.players[rival]?.name),
        label: `${nodeLabel(T, a)}→${nodeLabel(T, b)}`,
        takeable: rival !== null && rivalN > 0 && rivalN >= ownerN - 1,
      };
    })
    .sort((x, y) => (y.mine - x.mine) || (y.takeable - x.takeable) || (y.rivalN - x.rivalN));
}

// The dredging-rights tug-of-war, listed. The board shows only who owns each
// channel now; this shows the marker counts behind that ownership, so a player can
// read how safe their own claims are and how close a rival's is to flipping. Ties
// go to the most recent dredger, so "level on markers" still means takeable.
//
// `claims` is prepared by buildClaims above as a plain array so this stays a pure
// renderer: [{ key, label, owner, ownerName, ownerN, rival, rivalName, rivalN, mine,
// takeable }]. Sorted yours-first, then most-contested.
export function renderClaims({ el, claims, colors, T, esc }) {
  const box = el('claims');
  if (!box) return;
  if (!claims.length) {
    box.innerHTML = `<div class="claim empty">No channels claimed yet — `
      + `${T.actions.dredge.name} one to collect a ${T.terms.toll.name} from everyone who passes.</div>`;
    return;
  }
  box.innerHTML = claims.map(cl => {
    // Owner cubes, then challenger cubes: a stack of small pips per marker in each
    // player's colour, so "they have 2, I have 1" reads as two stacks, no numbers.
    const pips = (n, col) => Array.from({ length: n },
      () => `<i class="pip" style="background:${col}"></i>`).join('');
    const rival = cl.rival !== null && cl.rivalN > 0;
    return `<div class="claim ${cl.mine ? 'mine' : ''} ${cl.takeable ? 'hot' : ''}"
         data-tip-title="${esc(cl.label)} — ${esc(cl.mine ? 'yours' : cl.ownerName + '’s')}"
         data-tip="${esc(
           `${cl.mine ? 'You hold' : cl.ownerName + ' holds'} this with ${cl.ownerN} `
           + `marker${cl.ownerN === 1 ? '' : 's'}.`
           + (rival
             ? ` ${cl.rivalName} ${cl.rivalName === 'You' ? 'have' : 'has'} ${cl.rivalN}` +
               (cl.takeable ? ' — one more dredge ties and takes it.' : ' — behind on markers.')
             : ' Dredge it twice and a single counter-dredge cannot take it back.'))}">
      <span class="claimEnds">${esc(cl.label)}</span>
      <span class="claimMarks">
        <span class="stack" style="--c:${colors[cl.owner]}">${pips(cl.ownerN, colors[cl.owner])}</span>
        ${rival ? `<span class="vs">vs</span>
          <span class="stack" style="--c:${colors[cl.rival]}">${pips(cl.rivalN, colors[cl.rival])}</span>` : ''}
      </span>
      ${cl.takeable ? '<span class="claimHot">flippable</span>' : ''}
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------- action copy
//
// Plain-English one-liners. These used to be notation — "+1 lalim · 1g · singil",
// "≤2 → Look" — which reads as an API signature, not a game. A new player cannot
// decode that, and it was the first thing they saw on every button.
//
// Numbers still come from TUNING so the copy cannot drift from the rules.
export function actionDescriptions(tuning, cost) {
  // "gold" is a mass noun — no plural. This was a ternary with two identical
  // branches, left over from treating it like a countable.
  const coin = (n) => `${n} gold`;
  return {
    dredge: `Deepen a channel by ${tuning.dredgeAmount}. Costs ${coin(tuning.dredgeCoins)}, `
          + `then others pay you to pass.`,
    build:  `Settle any node you can reach by water. ${coin(cost)} + ${coin(tuning.buildStepGold)}/step of distance.`,
    ship:   `Carry up to ${tuning.shipCubesMax} goods downstream to the sea.`,
    survey: `Take ${coin(tuning.surveyCoins)} and draw ${tuning.surveyDraw} contracts, keep 1.`,
  };
}

// The longer "why would I do this" explanation, shown on hover. The one-liner
// says what an action does; this says when it is the right call and what it
// costs you — the part a rulebook would cover and a button cannot.
export function actionTips(tuning, cost) {
  return {
    dredge: `Repairs one channel and claims it. While it stays deep, every other `
          + `player pays you ${tuning.tollPerShip} gold each time they ship through, `
          + `and you score ${tuning.rightsVP} points for it at the end. `
          + `Dredging is how you turn other people's traffic into income.`,
    build:  `Settles ANY empty node your network can reach over living water — not `
          + `just a neighbour — so a wall of rival towns can never box you in. Costs `
          + `${cost} gold plus ${tuning.buildStepGold} per channel of distance, and `
          + `rises with each settlement you own. Beyond ${tuning.freeStations} you pay `
          + `${tuning.upkeepPerStation} gold upkeep each per round, or abandon them.`,
    ship:   `Moves up to ${tuning.shipCubesMax} goods from one of your settlements to `
          + `the sea, paying ${tuning.shipPerCube} gold per good plus `
          + `${tuning.shipPerChannel} per channel crossed. This is how contracts get `
          + `filled — and every channel you use silts up by ${tuning.siltPerShip}.`,
    survey: `Draws ${tuning.surveyDraw} contracts and lets you keep one, plus `
          + `${tuning.surveyCoins} gold. Contracts are most of your score, so a hand `
          + `with nothing in it is usually worth fixing before anything else.`,
  };
}

// The four action buttons.
//
// `want` is the action a gated tutorial step is teaching: during one, only that
// action stays live. Letting a first-time player pick something else strands
// them — the step never completes, the hint keeps asking for an action whose
// slot is already spent, and the only way out is the skip button. Guidance that
// can be wandered off is not guidance.
//
// `target`/`replacing` say where the click will land. Picking with both slots
// full replaces one of them, and finding that out afterwards — by watching the
// wrong plan resolve — is the worst possible time to learn it.
export function renderActions({ el, T, desc, tips, want, disabled, target, replacing, icon, ico, esc, onPick }) {
  el('acts').innerHTML = ['dredge', 'build', 'ship', 'survey'].map(a => `
    <button class="act${want && want !== a ? ' dimmed' : ''}"
            data-act="${a}"
            ${disabled || (want && want !== a) ? 'disabled' : ''}
            aria-label="${esc(T.actions[a].name)} — ${
              replacing ? `replaces slot ${target + 1}` : `into slot ${target + 1}`}"
            data-tip="${esc(tips[a])}"
            data-tip-title="${esc(T.actions[a].name)}${
              T.actions[a].gloss ? ` — ${esc(T.actions[a].gloss)}` : ''}">
      ${icon(ico(a))}
      <span class="txt"><span class="t">${T.actions[a].name}${
        T.actions[a].gloss ? `<em>${T.actions[a].gloss}</em>` : ''}</span>
      <span class="d">${desc[a]}</span></span>
      <span class="dest${replacing ? ' warn' : ''}">${
        replacing ? 'replaces' : 'to'} ${target + 1}</span>
    </button>`).join('');
  el('go').textContent = T.id === 'anod' ? 'Itakdâ at tuparín' : 'Commit & resolve';
  for (const b of document.querySelectorAll('.act')) {
    b.addEventListener('click', () => onPick(b.dataset.act));
  }
}

// The two program slots.
//
// The slot number stays visible even when filled, because resolution order is
// half the decision. A filled slot also needs a way out: overwriting used to be
// the only escape, which made "I want just one action this round" unreachable.
export function renderSlots({ el, program, T, target, pendingAction, icon, ico }) {
  [0, 1].forEach(i => {
    const s = el('s' + i);
    const a = program[i];
    const w = i === 0
      ? (T.id === 'anod' ? 'UNA' : 'SLOT 1')
      : (T.id === 'anod' ? 'IKALAWA' : 'SLOT 2');
    const clr = a && !pendingAction
      ? `<button class="clr" tabindex="-1" aria-label="Clear slot ${i + 1}"
                 data-tip="Clear this slot">&times;</button>`
      : '';
    s.innerHTML = a
      ? `<div class="n">${w}</div>${clr}${icon(ico(a))}<div class="a">${T.actions[a].name}</div>` +
        (T.actions[a].gloss ? `<div class="g">${T.actions[a].gloss}</div>` : '')
      : `<div class="n">${w}</div><div class="a">—</div>`;
    s.classList.toggle('on', target === i && !pendingAction);
    s.classList.toggle('filled', !!a);
    s.setAttribute('data-tip', a
      ? `${T.actions[a].name} is queued here. Click to aim the next pick at this slot, or × to clear it.`
      : 'Empty. Click to aim your next action pick at this slot.');
  });
}

// What the board wants from you right now, while a target is pending. Themed,
// because the words name buttons and pieces the player has to find on screen.
const AIM_HINTS = {
  anod: {
    dredge: 'Pindutín ang gintóng sapà — hukayin at angkinín ang singil.',
    build: 'Pindutín ang tanáw na lugár upang magtayô ng balangay.',
    ship: 'Pindutín ang iyóng balangay upang maglayág.',
    // Stage two of shipping: an origin is chosen, its routes are lit.
    shipTo: 'Sundán ang mga daán — pindutín ang look na paglálayágan.',
  },
  plain: {
    dredge: 'Click a gold channel to dredge it and claim its toll.',
    build: 'Click a highlighted node to build there.',
    ship: 'Click one of your settlements to ship from it.',
    shipTo: 'Follow the routes — click the bay to ship to. Every channel a route '
      + 'crosses will silt.',
  },
};

// The hint is the only thing on screen that belongs to the aiming state, so the
// way out lives here too — a hint that tells you what to click without telling
// you how to stop is half an instruction.
//
// `stage` distinguishes the two halves of shipping: pick an origin, then pick a
// destination bay. The rest of the actions have one stage and ignore it.
// Title + cost text for a clicked-but-uncommitted BUILD, so the confirm bar can
// show what pressing Confirm costs. Only build confirms (its distance premium is
// the surprising cost); dredge and ship resolve on the click. Pure formatting —
// takes the engine helpers it needs rather than importing them.
export function confirmMeta({ g, human, T, nodeLabel, choice, buildCost, buildStepCost }) {
  const p = g.players[human];
  const step = buildStepCost(g, p, choice.node);
  const cost = buildCost(p) + step;
  return {
    title: `${T.actions.build.name} ${nodeLabel(T, choice.node)}`,
    detail: `Costs ${cost} gold${step ? ` (incl. ${step} for distance)` : ''}.`,
  };
}

export function renderAimHint({ el, pendingAction, T, stage, confirm, esc, hukay = 0, hukayArmed = false }) {
  const hint = el('hint');
  if (!pendingAction) { hint.style.display = 'none'; return; }
  hint.style.display = 'block';

  // A target is clicked but not committed: show what it will do and cost, with
  // Confirm to spend, Pick another to re-aim (undo the click), Skip to decline. The
  // player can always change their mind here — nothing has been spent yet.
  if (confirm) {
    // A compact bar, not a stack of full-width buttons: the cost on one line, then
    // a single row — Confirm takes the space, re-aim and cancel are small icon
    // buttons beside it. Tapping another lit target re-aims too (see wireBoard).
    hint.innerHTML = `
      <span class="aimTxt confirmTxt"><b>${esc(confirm.title)}</b> — ${esc(confirm.detail)}</span>
      <div class="confirmRow">
        <button id="confirmYes" class="confirmYes"
                data-tip="Do it. This spends the cost shown and resolves the action.">
          Confirm
        </button>
        <button id="confirmNo" class="confirmMini"
                data-tip-title="Pick another" data-tip="Change your mind — nothing has been spent. Pick a different target.">↻</button>
        <button id="skipAim" class="confirmMini"
                data-tip-title="Skip" data-tip="Decline this action entirely. The slot is spent, but no target is used.">✕</button>
      </div>`;
    return;
  }

  // When dredging with a hukay in hand, offer the shovel toggle: armed, the next dredge
  // on a LIVING channel digs deep (+2). A DEAD channel always spends the token to revive
  // it (nothing else can), armed or not — so the toggle only governs the live-channel case.
  const showHukay = pendingAction === 'dredge' && hukay > 0;
  const hukayBtn = showHukay
    ? `<button id="hukayToggle" class="hukayToggle${hukayArmed ? ' on' : ''}"
              data-tip-title="Hukay (${hukay} banked)"
              data-tip="Arm the shovel: your next dredge on a LIVING channel digs deep (+2 instead of +1) and spends one hukay. A DEAD channel always spends a hukay to revive it, armed or not.">
        🔨 ${hukayArmed ? 'Hukay ON' : 'Use hukay'}
      </button>`
    : '';
  hint.innerHTML = `<span class="aimTxt"></span>
    ${hukayBtn}
    <button id="skipAim" class="skipAim"
            data-tip="Decline this action without a target. It is already in play, so
                      the slot is spent either way — this just declines to use it.">
      Skip <kbd>Esc</kbd>
    </button>`;
  const key = pendingAction === 'ship' && stage === 'dest' ? 'shipTo' : pendingAction;
  hint.querySelector('.aimTxt').textContent =
    (AIM_HINTS[T.id] ?? AIM_HINTS.plain)[key] ?? '';
}

// The final score table.
//
// Every column carries an explanation of where its number came from. They used
// to be four-letter truncations with none — "Barâ", "Lupà", "Kasund" — on the
// one screen every single player reaches, and the rulebook page that defines
// them sits behind a button nobody has a reason to press once the game is over.
// One column is negative and never said so.
export function renderFinalScore({ el, rows, players, T, tuning, esc }) {
  const best = Math.max(...rows.map(x => x.total));
  const anod = T.id === 'anod';
  const cols = [
    [T.terms.player.name, '', ''],
    [anod ? 'Kasund' : 'Contracts', 'Contracts filled',
      'Goods delivered to the bay a contract named. Usually most of the score.'],
    [T.terms.mouth.name, 'Bay majorities',
      `Each bay is scored separately: ${tuning.mouthVP.join(' / ')} points for `
      + 'first, second and third by goods delivered there. Ties share.'],
    [anod ? 'Lupà' : 'Sites', 'Live settlements',
      'Settlements that can still reach the sea at the end. A settlement cut off '
      + 'by dead water scores nothing.'],
    [T.terms.toll.name, 'Channels you own',
      `${tuning.rightsVP} points for each channel you dredged that is still at `
      + `depth ${tuning.rightsDepthMin} or more at the end. Let one silt below `
      + 'that and it scores you nothing.'],
    // The Hansa-style network bonus. Distinct from the per-channel toll column:
    // this rewards them being CONNECTED, not just owned.
    [anod ? 'Ugnáy' : 'Network', 'Connected network',
      `${tuning.vpNetworkChannel} extra point for every channel in your single `
      + 'largest connected run of owned channels — a corridor beats scattered tolls.'],
    [T.terms.coins.name, 'Leftover gold', 'Unspent gold, converted at the end.'],
    [T.terms.silted.name, 'Dead water penalty',
      `You LOSE ${tuning.siltedPenaltyVP} point for every dead channel touching `
      + 'one of your settlements — this column is negative.'],
    [anod ? 'Kabuoán' : 'Total', 'Final score', ''],
  ];
  el('final').innerHTML = `<table>
    <tr>${cols.map(([label, title, tip]) => (tip
      ? `<th class="hasTip" data-tip-title="${esc(title)}" data-tip="${esc(tip)}">${label}</th>`
      : `<th>${label}</th>`)).join('')}</tr>
    ${rows.map(x => `<tr class="${x.total === best ? 'win' : ''}">
      <td>${esc(players[x.i].name)}</td><td>${x.contracts}</td><td>${x.mouth}</td>
      <td>${x.network}</td><td>${x.held}</td><td>${x.netBonus}</td>
      <td>${x.coin}</td><td>${x.silt}</td>
      <td>${x.total}</td></tr>`).join('')}
  </table>`;
}

// The badge above the board naming who is acting and what they are doing.
//
// Bots resolving in sequence is unreadable without it — you see effects with no
// author. It used to show the name ALONE, which was half an answer: it said who,
// never what, so the only place to learn the move was the log, and you had to
// catch that as it scrolled.
export function renderActor({ el, pi, action, T, colors, who }) {
  const b = el('actor');
  if (!b) return;
  if (pi === null) { b.classList.remove('on'); return; }
  const verb = action && T.actions[action] ? T.actions[action].name : '';
  b.textContent = verb ? `${who} — ${verb}` : who;
  b.style.color = colors[pi];
  b.classList.add('on');
}

// The Survey picker: draw three contracts, keep one.
//
// This is the whole point of the action, and it used to happen with no player
// input at all — the engine silently kept the highest-VP card, so +gold looked
// like Survey's only effect. Now the three sit in the sidebar above your hand,
// so you choose WITH the board and your existing contracts in view: which one is
// worth chasing depends on where your settlements are and which bays you can
// reach, and a modal that hid the board would take away exactly that context.
// The survey picker normally lives in the sidebar. On a phone it becomes a fixed
// bottom sheet — but #survey sits inside #top's stacking context, which the action
// bar (#bar) paints over, so a fixed z-index cannot lift it clear. Reparenting it
// to <body> while active escapes that context entirely; it goes home when dismissed.
function placeSurvey(box) {
  const mobile = matchMedia('(max-width: 820px), (pointer: coarse) and (max-width: 1024px)').matches;
  if (mobile && box.parentElement !== document.body) {
    box._home = box.nextSibling ? { parent: box.parentElement, before: box.nextSibling }
      : { parent: box.parentElement, before: null };
    document.body.appendChild(box);
  }
}
function homeSurvey(box) {
  if (box._home && box.parentElement === document.body) {
    box._home.parent.insertBefore(box, box._home.before);
    box._home = null;
  }
}

export function renderSurvey({ el, draw, T, tuning, nodeLabel, esc, onKeep }) {
  const box = el('survey');
  if (!draw) { box.classList.remove('on'); box.innerHTML = ''; homeSurvey(box); return; }
  const card = (c, i) => {
    const pts = Math.round(c.vp * tuning.contractScale);
    const where = c.mouth ? nodeLabel(T, c.mouth) : 'any bay';
    const kinds = c.types > 1 ? `${c.types} different kinds` : 'any one kind';
    return `<button class="surveyCard" data-keep="${i}">
      <span class="vp">${pts}</span>
      <span class="cbody">Deliver <b>${c.need}</b> goods, <b>${esc(kinds)}</b>,
        to <b>${esc(where)}</b></span>
    </button>`;
  };
  box.innerHTML = `<div class="surveyHead">${esc(T.actions.survey.name)} — keep one</div>
    <div class="surveyCards">${draw.map(card).join('')}</div>
    <button class="surveySkip" data-skip>Keep the best <kbd>Esc</kbd></button>`;
  box.classList.add('on');
  placeSurvey(box);   // lift to a body-level bottom sheet on a phone
  for (const b of box.querySelectorAll('[data-keep]')) {
    b.addEventListener('click', () => onKeep(draw[+b.dataset.keep]));
  }
  // Skip lives IN the picker — it was landing in the aim-hint slot far bottom-
  // right, nowhere near the cards it dismisses. `null` means keep-best default.
  box.querySelector('[data-skip]').addEventListener('click', () => onKeep(null));
}
