// ANOD / SILT — in-game rulebook.
// Pages are built from the live TUNING values so the book can never drift out of
// sync with the engine, and from the active theme so the vocabulary matches the
// board the player is looking at.

import { TUNING } from './engine.js';
import { CHANNELS } from './graph.js';

const c = (T) => (T.terms.coins.name === 'ginto' ? 'g' : 'c');

export function pages(T) {
  const money = c(T);
  const A = T.actions, G = T.goods, X = T.terms;
  const anod = T.id === 'anod';

  return [
    {
      title: anod ? 'Ang Larô' : 'The Game',
      sub: 'what you are doing',
      body: `
        <p>You are a <b>${X.player.name.toLowerCase()}</b> on a river delta. Move
        goods downstream to the ${X.mouth.name.toLowerCase()} and score by filling
        <b>${X.contract.name.toLowerCase()}</b>.</p>
        <p class="warn">Every shipment you make <b>silts the channels it used</b>.
        Deep water becomes shallow; shallow water dies for good. The map degrades
        because everyone is doing well — and repairing it costs actions that you
        would rather spend earning.</p>
        <p>There are no hidden cards and nothing you can play at another player.
        You lose because you misread the board, not because you were ambushed.</p>
        <p><b>${TUNING.rounds} ${anod ? 'taon' : 'rounds'}.</b> Highest score wins.</p>`,
    },
    {
      title: anod ? 'Ang Ikot' : 'The Round',
      sub: 'six phases, in order',
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
          <li><b>${anod ? 'Gugol' : 'Upkeep'}</b> — pay <b>${TUNING.upkeepPerStation}${money}</b>
            for each ${X.station.name.toLowerCase()} beyond your first
            <b>${TUNING.freeStations}</b>. Cannot pay? You abandon one.</li>
        </ol>
        <p class="tip">Because you commit two actions blind, the real skill is
        predicting which channels will still be open when your second action fires.</p>`,
    },
    {
      title: anod ? 'Mga Kilos' : 'The Actions',
      sub: 'four things you can do',
      body: `
        <dl class="acts">
          <dt>${A.dredge.name}<em>${A.dredge.gloss || 'dredge'}</em></dt>
          <dd>Raise one channel by <b>${TUNING.dredgeAmount}</b> depth for
            <b>${TUNING.dredgeCoins}${money}</b>. You also <b>claim</b> that channel —
            see the next page. A dead channel can never be reopened.</dd>

          <dt>${A.build.name}<em>${A.build.gloss || 'build'}</em></dt>
          <dd>Place a ${X.station.name.toLowerCase()} on an empty node next to one you
            already hold. Costs <b>${TUNING.buildBase}${money} + 1 per
            ${X.station.name.toLowerCase()} you own</b>. It arrives with
            <b>${TUNING.buildCubeBonus}</b> goods and produces
            <b>${TUNING.stationYield}</b> more each round.</dd>

          <dt>${A.ship.name}<em>${A.ship.gloss || 'ship'}</em></dt>
          <dd>Move up to <b>${TUNING.shipCubesMax}</b> goods from one of your nodes
            to a ${X.mouth.name.toLowerCase()}. Pays
            <b>${TUNING.shipPerCube}${money}</b> per good plus
            <b>${TUNING.shipPerChannel}${money}</b> per channel crossed. Long routes
            pay more — and silt more.</dd>

          <dt>${A.survey.name}<em>${A.survey.gloss || 'survey'}</em></dt>
          <dd>Take <b>${TUNING.surveyCoins}${money}</b> and draw
            <b>${TUNING.surveyDraw}</b> ${X.contract.name.toLowerCase()},
            keeping <b>1</b>. Hand limit ${TUNING.handLimit}.</dd>
        </dl>
        <p class="tip">You may program the same action twice.</p>`,
    },
    {
      title: anod ? 'Ang Tubig' : 'The Water',
      sub: 'depth, silt, and death',
      body: `
        <p>Every channel has a depth from <b>${TUNING.maxDepth}</b> down to <b>0</b>.</p>
        <table class="depth">
          <tr><td><i class="d3"></i></td><td><b>3</b></td>
            <td>${anod ? 'malalim' : 'deep'} — healthy</td></tr>
          <tr><td><i class="d2"></i></td><td><b>2</b></td>
            <td>worn, still fine</td></tr>
          <tr><td><i class="d1"></i></td><td><b>1</b></td>
            <td>${anod ? 'mababaw' : 'shallow'} — one more trip kills it</td></tr>
          <tr><td><i class="d0"></i></td><td><b>0</b></td>
            <td><b>${X.silted.name.toUpperCase()}</b> — gone permanently</td></tr>
        </table>
        <p>Cargo can cross any channel at depth <b>1 or more</b>. A silted channel
        blocks shipping <i>and</i> blocks building across it, so a node can be
        stranded with no route to the sea.</p>
        <p class="warn">There are <b>${CHANNELS.length}</b> channels. Nodes at the
        edge of the delta often have only <b>one</b> route out — lose it and that
        settlement is dead for the rest of the game.</p>`,
    },
    {
      title: anod ? 'Singil' : 'Tolls',
      sub: 'why anyone repairs anything',
      body: `
        <p>Dredging is not charity. When you dredge a channel you <b>claim</b> it,
        and a marker in your colour appears on it.</p>
        <ul>
          <li>Anyone may still use that channel — nothing is blocked.</li>
          <li>But when another player ships through it, they pay you
            <b>${TUNING.tollPerShip}${money}</b>.</li>
          <li>At the end, every claimed channel still at depth <b>2+</b> scores you
            <b>${TUNING.rightsVP}</b> points.</li>
          <li>Dredging a channel someone else holds <b>takes</b> the claim from them.</li>
          <li>If a channel silts out completely, the claim is lost.</li>
        </ul>
        <p class="tip">This is the heart of the game. Maintaining the route everyone
        needs is a business, not a favour — and the busiest channel is the one most
        worth owning <i>and</i> the one dying fastest.</p>`,
    },
    {
      title: anod ? 'Mga Kasunduan' : 'Contracts',
      sub: 'where the points are',
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
        <p>Deliveries accumulate across rounds. They fill automatically the moment
        you have enough, and the goods used are <b>spent</b> — they cannot pay for a
        second ${X.contract.name.toLowerCase()}.</p>
        <p class="tip">The three goods —
        <b>${G.timber.name}</b>, <b>${G.grain.name}</b>, <b>${G.salt.name}</b> —
        grow in different parts of the delta, so a 3-kind contract forces you to
        reach across the map.</p>`,
    },
    {
      title: anod ? 'Puntos' : 'Scoring',
      sub: 'at the end of the last round',
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
          <dd><b>${TUNING.rightsVP}</b> per claimed channel still at depth 2+</dd>
          <dt>${X.coins.name}</dt>
          <dd>1 point per <b>${TUNING.vpPerCoins}</b></dd>
          <dt class="neg">Neglect</dt>
          <dd><b>−${TUNING.siltedPenaltyVP}</b> for every dead channel touching one
            of your ${X.station.name.toLowerCase()}s</dd>
        </dl>
        <p class="warn">Holding land is worth nothing on its own. Only settlements
        that still reach the sea score.</p>`,
    },
    {
      title: anod ? 'Payo' : 'Advice',
      sub: 'for a first game',
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
          <li><b>Long routes pay more and die faster.</b> That tension is the game.</li>
          <li><b>Check what a contract needs before you ship.</b> Goods delivered to
            the wrong ${X.mouth.name.toLowerCase()} still count for majority, but
            not for a contract naming a different one.</li>
        </ul>`,
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
