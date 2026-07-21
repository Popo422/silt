// ANOD / SILT — in-game rulebook.
// Pages are built from the live TUNING values so the book can never drift out of
// sync with the engine, and from the active theme so the vocabulary matches the
// board the player is looking at.

import { TUNING, totalRounds } from './engine.js';
import { CHANNELS } from './graph.js';
import { figDepths, figSilt, figToll, figChoke } from './diagrams.js';

const c = (T) => (T.terms.coins.name === 'ginto' ? 'g' : 'c');

export function pages(T) {
  const money = c(T);
  const A = T.actions, G = T.goods, X = T.terms;
  const anod = T.id === 'anod';

  return [
    {
      title: anod ? 'Ang Larô' : 'The Game',
      sub: 'part one · learn — the idea',
      body: `
        <p>You are a <b>${X.player.name.toLowerCase()}</b> on a river delta. Each
        round you take <b>two</b> actions: you move goods downstream to the
        ${X.mouth.name.toLowerCase()} for gold, and you keep the water deep enough to
        move them. Score by filling <b>${X.contract.name.toLowerCase()}</b>, holding
        the busy channels, and delivering more than your rivals.</p>
        <p class="warn">Here is the catch that names the game. <b>Every shipment silts
        the channels it used.</b> Deep water becomes shallow; shallow water dies for
        good. The map degrades <i>because</i> everyone is trading well — and repairing
        it costs actions you would rather spend earning.</p>
        <p>There are no hidden cards and nothing you can play at another player. You
        lose because you misread the board, not because you were ambushed.</p>
        <p><b>${totalRounds()} ${anod ? 'taon' : 'rounds'}${TUNING.seasons
          ? `, played as two ${TUNING.roundsPerSeason}-round seasons` : ''}.</b>
        Highest score wins. The next three pages teach you a first game; the rest of
        the book is reference — flip to it when you are unsure how something resolves.</p>`,
    },
    {
      title: anod ? 'Simulâ' : 'Setup',
      sub: 'part one · learn — how a game starts',
      body: `
        <p>Everything below is dealt out for you before round 1 — this page is just
        so you know what you are looking at.</p>
        <dl class="acts">
          <dt>${X.player.name}s</dt>
          <dd>Each of the (usually 3) ${X.player.name.toLowerCase()}s starts with
            <b>${TUNING.startCoins}${money}</b>, <b>one</b>
            ${X.station.name.toLowerCase()} drafted onto a mid-delta node, and
            <b>2</b> ${X.contract.name.toLowerCase()} in hand.</dd>
          <dt>The water</dt>
          <dd>Every one of the <b>${CHANNELS.length}</b> channels begins at full
            depth <b>${TUNING.maxDepth}</b>. Nobody owns any of them yet.</dd>
          <dt>The land</dt>
          <dd>Every inland node starts with <b>${TUNING.cubesPerNode}</b> goods on it,
            of the kind that node grows. The three
            ${X.mouth.name.toLowerCase()}s hold none — they only receive.</dd>
          <dt>Seat order</dt>
          <dd>Whoever drafts their ${X.station.name.toLowerCase()} first pays for the
            pick by resolving <b>last</b> in round 1. First player then passes one
            seat each round.</dd>
        </dl>
        <p class="tip">Your opening ${X.station.name.toLowerCase()} was placed to
        reach as many ${X.mouth.name.toLowerCase()}s as possible — a good spot to ship
        from on turn one.</p>`,
    },
    {
      title: anod ? 'Ang Ikot' : 'The Round',
      sub: 'part one · learn — the phases, in order',
      body: `
        <ol>
          <li><b>${anod ? 'Magplano' : 'Program'}</b> — choose <b>2</b> actions, in
            order, before anything resolves. Everyone does this simultaneously.</li>
          <li><b>${anod ? 'Buksán' : 'Reveal'}</b> — all plans are shown. They are
            locked; you cannot abort a step.</li>
          <li><b>${anod ? 'Una' : 'Slot 1'}</b> resolves for every player in seat order.</li>
          <li><b>${anod ? 'Ikalawa' : 'Slot 2'}</b> resolves the same way.</li>
          <li><b>${anod ? 'Anod' : 'Silt'}</b> — every channel that carried cargo this
            round loses <b>${TUNING.siltPerShip}</b> depth. Maximum once per channel,
            no matter how many players used it.</li>
          <li><b>${anod ? 'Bayad-Look' : 'Bay bonus'}</b> — the ${X.mouth.name.toLowerCase()}
            that received the <b>least</b> cargo this round carries a
            <b>${TUNING.bayBonusGold}${money}</b> premium into the next; the first to
            ship there claims it. It is a fresh, single-round pull: an unclaimed
            premium is replaced, not stacked.</li>
          <li><b>${anod ? 'Gugol' : 'Upkeep'}</b> — pay <b>${TUNING.upkeepPerStation}${money}</b>
            for each ${X.station.name.toLowerCase()} beyond your first
            <b>${TUNING.freeStations}</b>. Cannot pay? You <b>abandon</b>
            ${X.station.name.toLowerCase()}s one at a time — each one dropped lowers
            the bill — until you can afford what remains.</li>
          <li><b>${anod ? 'Tubò' : 'Regrow'}</b> — each of your
            ${X.station.name.toLowerCase()}s produces <b>${TUNING.stationYield}</b>
            good, and <b>${TUNING.regrowPerRound}</b> good regrows on the emptiest
            unclaimed node. Nothing grows past <b>${TUNING.cubesPerNode}</b>.</li>
        </ol>
        <p class="warn">A node holds at most <b>${TUNING.cubesPerNode}</b> goods and
        refills only <b>${TUNING.stationYield}</b> a round — but a single shipment
        takes <b>${TUNING.shipCubesMax}</b>. Nodes run dry faster than they fill, so
        you must keep spreading your shipping or expand to new land.</p>
        ${TUNING.seasons ? `<p class="tip">Once per game, at the start of the second
        season (round ${TUNING.roundsPerSeason + 1}), a <b>flood</b> refills every
        channel to full depth before that round is programmed — see “The Two
        Seasons”.</p>` : ''}
        <p class="tip">Because you commit two actions blind, the real skill is
        predicting which channels will still be open when your second action fires.</p>`,
    },
    {
      title: anod ? 'Ang Unang Taon' : 'Your First Round',
      sub: 'part one · learn — a worked example',
      body: `
        <p>Follow one plausible opening so the pieces click together. Your numbers
        will differ, but the shape holds.</p>
        <p><b>You hold:</b> one ${X.station.name.toLowerCase()} on a grain node with
        <b>${TUNING.cubesPerNode}</b> goods on it, and
        <b>${TUNING.startCoins}${money}</b>.</p>
        <ol>
          <li><b>You program, in secret:</b> ${A.ship.name} first, then ${A.build.name}.</li>
          <li><b>Reveal.</b> Everyone's two actions are shown and locked.</li>
          <li><b>Slot 1 — your ${A.ship.name}.</b> You move
            <b>${TUNING.shipCubesMax}</b> grain down a two-channel route to a
            ${X.mouth.name.toLowerCase()}. You earn
            <b>${TUNING.shipCubesMax * TUNING.shipPerCube + 2 * TUNING.shipPerChannel}${money}</b>
            (${TUNING.shipCubesMax}×${TUNING.shipPerCube} for the goods,
            +${2 * TUNING.shipPerChannel} for the two channels). Those two grain are
            now <b>spent</b> and your node is down to
            <b>${TUNING.cubesPerNode - TUNING.shipCubesMax}</b>.</li>
          <li><b>Slot 2 — your ${A.build.name}.</b> You settle an empty neighbour.
            It costs <b>${TUNING.buildBase + 1}${money}</b>
            (${TUNING.buildBase} base + 1 for the ${X.station.name.toLowerCase()} you
            already own) and arrives holding <b>${TUNING.buildCubeBonus}</b> goods.</li>
          <li><b>Silt.</b> Both channels your ${A.ship.name} used drop from
            ${TUNING.maxDepth} to <b>${TUNING.maxDepth - TUNING.siltPerShip}</b>. The
            route still works — but it is one step closer to shallow.</li>
          <li><b>Bay bonus, upkeep, regrow</b> resolve. You own only two
            ${X.station.name.toLowerCase()}s, under the free limit of
            <b>${TUNING.freeStations}</b>, so you pay no upkeep. Your
            ${X.station.name.toLowerCase()}s each grow <b>${TUNING.stationYield}</b>
            good back.</li>
        </ol>
        <p class="tip">Next round the question is already sharper: ship again and let
        that route keep silting, or spend an action to ${A.dredge.name} it back? That
        choice, every round, is the game.</p>`,
    },
    {
      title: anod ? 'Mga Kilos' : 'The Actions',
      sub: 'part two · reference — the four actions',
      body: `
        <dl class="acts">
          <dt>${A.dredge.name}<em>${A.dredge.gloss || 'dredge'}</em></dt>
          <dd>Raise one channel by <b>${TUNING.dredgeAmount}</b> depth for
            <b>${TUNING.dredgeCoins}${money}</b>, up to the maximum of
            <b>${TUNING.maxDepth}</b>. You also <b>claim</b> the channel — see Tolls.
            <span class="edge">A <b>dead</b> channel (depth 0) can never be reopened;
            you can only ${A.dredge.name} water that still has depth 1 or more. Can't
            afford the ${TUNING.dredgeCoins}${money}? The action does nothing.</span></dd>

          <dt>${A.build.name}<em>${A.build.gloss || 'build'}</em></dt>
          <dd>Place a ${X.station.name.toLowerCase()} on <b>any empty node your
            network can reach over living water</b> — not just a neighbour, so a
            wall of rival towns can never box you in. Costs
            <b>${TUNING.buildBase}${money} + 1 per ${X.station.name.toLowerCase()}
            you own</b>, plus <b>${TUNING.buildStepGold}${money} for each channel of
            distance</b> beyond the first. It arrives with
            <b>${TUNING.buildCubeBonus}</b> goods and produces
            <b>${TUNING.stationYield}</b> more each round.
            <span class="edge">If two ${X.player.name.toLowerCase()}s program the same
            node this round, whoever resolves first takes it and the other's
            ${A.build.name} fizzles. You keep your gold when a
            ${A.build.name} fizzles.</span></dd>

          <dt>${A.ship.name}<em>${A.ship.gloss || 'ship'}</em></dt>
          <dd>Move up to <b>${TUNING.shipCubesMax}</b> goods from <b>one</b> of your
            nodes to <b>one</b> ${X.mouth.name.toLowerCase()} — the goods are
            <b>spent</b>, removed from the node for good. Pays
            <b>${TUNING.shipPerCube}${money}</b> per good plus
            <b>${TUNING.shipPerChannel}${money}</b> per channel crossed. Long routes
            pay more — and silt more.
            <span class="edge">You choose the route among all that still reach the
            sea. If any channel on it has silted to <b>0</b> before your action
            fires — because you or a rival shipped through it in slot 1 — the whole
            shipment <b>fails</b> and the goods stay on the node. This is the classic
            blind-programming loss: plan a route with slack.</span></dd>

          <dt>${A.survey.name}<em>${A.survey.gloss || 'survey'}</em></dt>
          <dd>Take <b>${TUNING.surveyCoins}${money}</b> and draw
            <b>${TUNING.surveyDraw}</b> ${X.contract.name.toLowerCase()},
            keeping <b>1</b>. The rest go back into the deck.
            <span class="edge">Hand limit is <b>${TUNING.handLimit}</b>. If your hand
            is already full, you still take the gold but the draw is discarded — so
            clear a ${X.contract.name.toLowerCase()} before you ${A.survey.name}
            again.</span></dd>
        </dl>
        <p class="tip">You may program the same action twice — two
        ${A.ship.name}s, two ${A.dredge.name}s, whatever the round needs.</p>`,
    },
    {
      title: anod ? 'Ang Tubig' : 'The Water',
      sub: 'part two · reference — depth, silt, and death',
      body: `
        <p>Every channel has a depth from <b>${TUNING.maxDepth}</b> down to <b>0</b>.
        You can read it off the board without counting anything.</p>
        ${figDepths(T)}
        <p>Cargo can cross any channel at depth <b>1 or more</b>. A silted channel
        (depth 0) blocks shipping <i>and</i> blocks building across it, so a node can
        be stranded with no route to the sea.</p>
        ${figSilt(T)}
        <p>At round's end, every channel that <b>carried cargo</b> loses
        <b>${TUNING.siltPerShip}</b> depth — <b>once</b>, no matter how many
        ${X.player.name.toLowerCase()}s used it that round. A channel nobody shipped
        through does not silt. One ${A.dredge.name} (+${TUNING.dredgeAmount}) exactly
        offsets one round of silt, so a busy channel needs constant work just to hold
        its depth.</p>
        <p class="warn">There are <b>${CHANNELS.length}</b> channels. Nodes at the
        edge of the delta often have only <b>one</b> route out — lose it and that
        settlement is dead for the rest of the game.</p>
        ${figChoke(T)}`,
    },
    ...(TUNING.seasons ? [{
      title: anod ? 'Ang Dalawang Panahón' : 'The Two Seasons',
      sub: 'part two · reference — the drought, the flood, and the wet year',
      body: `
        <p>The game is one <b>${anod ? 'taon' : 'year'}</b> in two halves of
        <b>${TUNING.roundsPerSeason}</b> rounds each.</p>
        <dl class="acts">
          <dt>${anod ? 'Amihan' : 'Amihan — the dry season'}</dt>
          <dd>Rounds 1–${TUNING.roundsPerSeason}. The ordinary game: you ship, you
            dredge, and every shipment silts the water. The river only gets shallower —
            a one-way drought. Play it as you would any game of ${anod ? 'ANOD' : 'SILT'}.</dd>
          <dt>${anod ? 'Ang Baha' : 'The flood'}</dt>
          <dd>At the turn into the second season the <b>rains arrive and the whole delta
            floods back to full depth</b> — every channel, even ones that had silted
            dead, is deep and open again. This is the one moment the water gets
            <i>better</i> instead of worse.</dd>
          <dt>${anod ? 'Habagat' : 'Habagat — the wet season'}</dt>
          <dd>Rounds ${TUNING.roundsPerSeason + 1}–${totalRounds()}. A second full game
            on the restored river — but you keep everything you built: your
            ${X.station.name.toLowerCase()}s, your claimed channels, your score and
            ${X.contract.name.toLowerCase()}s all carry over. Only the water resets.</dd>
        </dl>
        <p class="warn">What this means for play: the drought punishes overreach — a
        route you silt to death in the first season stays dead until the flood. But the
        flood <b>wipes the slate</b>, so late in Amihan it can be worth spending a
        channel you know the rains will bring back. Position, not water, is what you
        carry across the year.</p>`,
    }] : []),
    {
      title: anod ? 'Singil' : 'Tolls',
      sub: 'part two · reference — why anyone repairs anything',
      body: `
        <p>Dredging is not charity. Each dredge drops a <b>cube</b> in your colour on
        the channel, and whoever has the <b>most cubes</b> owns it — the claim shows
        as a cube track running toward the bay.</p>
        ${figToll(T)}
        <ul>
          <li>Anyone may still use that channel — nothing is blocked.</li>
          <li>But when another player ships through it, they pay you
            <b>${TUNING.tollPerShip}${money}</b>. A ${X.player.name.toLowerCase()}
            too poor to pay the full toll pays whatever they have — you take what
            you can get, and nobody goes into debt.</li>
          <li>At the end, every claimed channel still at depth <b>2+</b> scores you
            <b>${TUNING.rightsVP}</b> points.</li>
          <li><b>Connected claims score extra.</b> On top of that, every channel in
            your <b>largest connected run</b> of claims is worth a further
            <b>${TUNING.vpNetworkChannel}</b> — so a corridor you own end to end
            beats the same number of tolls scattered across the delta.</li>
          <li>Dredging a channel someone else holds adds your cube — <b>match or
            beat their count</b> and the claim flips to you, so a channel they
            dredged twice takes two of yours to take.</li>
          <li>If a channel silts out completely, the claim is lost.</li>
        </ul>
        <p class="tip">This is the heart of the game. Maintaining the route everyone
        needs is a business, not a favour — and the busiest channel is the one most
        worth owning <i>and</i> the one dying fastest.</p>`,
    },
    {
      title: anod ? 'Mga Kasunduan' : 'Contracts',
      sub: 'part two · reference — where the points are',
      body: `
        <p>Each ${X.contract.name.toLowerCase()} asks for a number of goods, of a
        number of different kinds, delivered to a named
        ${X.mouth.name.toLowerCase()} (or any one).</p>
        <dl class="acts">
          <dt>${Math.round(5 * TUNING.contractScale)} pts</dt>
          <dd>2 goods of one kind, any ${X.mouth.name.toLowerCase()}</dd>
          <dt>${Math.round(9 * TUNING.contractScale)} pts</dt>
          <dd>3 goods, at least 2 kinds, named ${X.mouth.name.toLowerCase()}</dd>
          <dt>${Math.round(15 * TUNING.contractScale)} pts</dt>
          <dd>4 goods, all 3 kinds, named ${X.mouth.name.toLowerCase()}</dd>
        </dl>
        <p>Deliveries accumulate at each ${X.mouth.name.toLowerCase()} across rounds.
        A ${X.contract.name.toLowerCase()} fills <b>automatically</b> the moment your
        delivered goods there meet it — you never spend an action to claim it — and
        the goods it uses are then <b>spent</b>, so one delivery cannot pay for two
        ${X.contract.name.toLowerCase()}. When several could fill at once, the
        highest-value one goes first.</p>
        <p class="warn">A ${X.contract.name.toLowerCase()} that <b>names</b> a
        ${X.mouth.name.toLowerCase()} only counts goods delivered <i>there</i>.
        Goods you ship to the wrong ${X.mouth.name.toLowerCase()} still count toward
        that bay's majority (see Scoring) — but they will never fill a
        ${X.contract.name.toLowerCase()} that named a different one. Check the bay
        before you ${A.ship.name}.</p>
        <p class="tip">The three goods —
        <b>${G.timber.name}</b>, <b>${G.grain.name}</b>, <b>${G.salt.name}</b> —
        grow in different parts of the delta, so a 3-kind contract forces you to
        reach across the map.</p>`,
    },
    {
      title: anod ? 'Puntos' : 'Scoring',
      sub: 'part two · reference — at the end of the last round',
      body: `
        <dl class="acts">
          <dt>${X.contract.name}</dt>
          <dd>as printed — usually the largest share of a winning score</dd>
          <dt>${X.mouth.name} majority</dt>
          <dd><b>${TUNING.mouthVP.join(' / ')}</b> to the players who delivered most
            to each ${X.mouth.name.toLowerCase()}. Ties share, rounded down.</dd>
          <dt>Network</dt>
          <dd><b>${TUNING.vpLiveStation}</b> per ${X.station.name.toLowerCase()} that
            can still reach the sea at depth ${TUNING.liveDepthMin}+.
            A stranded one scores <b>nothing</b>.</dd>
          <dt>${X.toll.name}</dt>
          <dd><b>${TUNING.rightsVP}</b> per claimed channel still at depth
            ${TUNING.rightsDepthMin}+, plus <b>${TUNING.vpNetworkChannel}</b> more
            for each channel in your largest connected run of claims</dd>
          <dt>${X.coins.name}</dt>
          <dd>1 point per <b>${TUNING.vpPerCoins}</b></dd>
          <dt class="neg">Neglect</dt>
          <dd><b>−${TUNING.siltedPenaltyVP}</b> for every dead channel touching one
            of your ${X.station.name.toLowerCase()}s</dd>
        </dl>
        <p class="warn">Holding land is worth nothing on its own. Only settlements
        that still reach the sea score.</p>
        <p class="tip">Two different depths matter at the end: a
        ${X.station.name.toLowerCase()} scores if it can reach the sea at depth
        <b>${TUNING.liveDepthMin}+</b>, but a claimed channel only pays its toll VP at
        depth <b>${TUNING.rightsDepthMin}+</b>. A depth-1 channel keeps your
        ${X.station.name.toLowerCase()} alive but earns nothing for the claim.</p>`,
    },
    {
      title: anod ? 'Payo' : 'Advice',
      sub: 'part two · reference — for a first game',
      body: `
        <ul>
          <li><b>Expand early.</b> Costs rise with every settlement you own, so the
            cheap ones are the ones you buy first.</li>
          <li><b>Watch for depth 1 on any route you rely on.</b> That is a channel
            about to die, and it is visible to everyone at the table.</li>
          <li><b>Claim the busy channel, not the convenient one.</b> A toll only
            pays when other people actually use it.</li>
          <li><b>Do not over-dredge.</b> Every action spent repairing is one not
            spent earning; the player who fixes everything usually loses.</li>
          <li><b>Long routes pay more and die faster.</b> Weigh the payout against
            what it costs you to keep the water open.</li>
          <li><b>Chase the bay bonus.</b> When everyone floods one
            ${X.mouth.name.toLowerCase()}, the quietest one pays a premium next round —
            and its route has usually silted from neglect. Being the one who dredges
            in to claim it is often the best gold on the board.</li>
          <li><b>Contracts are a bonus, not the plan.</b> They reward trading well;
            they no longer win the game on their own. Play the river first.</li>
          <li><b>Check what a contract needs before you ship.</b> Goods delivered to
            the wrong ${X.mouth.name.toLowerCase()} still count for majority, but
            not for a contract naming a different one.</li>
        </ul>`,
    },
    {
      title: anod ? 'Mga Salitâ' : 'Glossary',
      sub: 'part two · reference — the words on the board',
      body: anod ? `
        <dl class="acts">
          ${Object.values(A).map(a =>
            `<dt>${a.name}<em>${a.gloss}</em></dt><dd>${a.note}</dd>`).join('')}
          ${Object.values(G).map(x =>
            `<dt>${x.name}</dt><dd>${x.gloss}</dd>`).join('')}
          ${['station', 'mouth', 'channel', 'silted', 'coins', 'toll', 'player', 'round']
            .map(k => `<dt>${X[k].name}</dt><dd>${X[k].gloss}</dd>`).join('')}
        </dl>
        <p class="tip">Every place name on the board is a real settlement of the
        pre-colonial delta. <b>Maynilà</b> sits at the centre because it really did
        control the junction everyone had to cross.</p>` : `
        <p>This variant uses plain English throughout. Switch to <b>Anód</b> from
        the menu for the Filipino setting, its place names and vocabulary.</p>
        <p class="tip">The rules are identical either way — only the words change.</p>`,
    },
    {
      title: anod ? 'Ang Kasaysayan' : 'The Setting',
      sub: 'what this is based on',
      body: `
        <p>The Pasig and Pampanga rivers reach Manila Bay through a delta that has
        always been shifting and silting. Before Spanish contact, the polities on
        that water — <b>Tundó</b>, <b>Maynilà</b>, <b>Namayan</b> and their
        neighbours — grew rich by sitting on the routes that trade had to use, and
        taxing what came through.</p>
        <p>The place names on the board are theirs. <b>Kawayan</b> is bamboo,
        <b>palay</b> is unhusked rice, <b>asin</b> is salt — the everyday goods that
        moved on those rivers. A <b>balangay</b> was both the plank-built boat and
        the community that travelled in it; the modern word <i>barangay</i> comes
        from it. A <b>datu</b> led one.</p>
        <p>The silting is real too. Deforestation upstream, and later the Pinatubo
        lahars of 1991, buried whole channels of the Pampanga delta.</p>
        <p style="color:var(--dim2)">This is a game, not a history lesson, and the
        terms here are best-effort — worth checking with a native speaker before
        anyone treats them as authoritative.</p>`,
    },
  ];
}

export function createRulebook() {
  return {
    open: false,
    i: 0,
    show(i = 0) { this.open = true; this.i = i; },
    hide() { this.open = false; },
    next(n) { this.i = Math.min(n - 1, this.i + 1); },
    prev() { this.i = Math.max(0, this.i - 1); },
    go(i) { this.i = i; },
  };
}
