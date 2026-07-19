// SILT / ANOD — the watchable game.
//
// WHY THIS EXISTS: the rulebook explains the rules and the tutorial makes you
// perform them, but neither shows you a *game* — the shape of eight rounds, a
// delta closing up, someone paying a toll on water they used to own for free.
// That is the thing a video would show, and it is the thing that was missing.
//
// DESIGN RULE: this module authors NO moves. The demo is a real game, played by
// the real bots, resolved by the real walker in ui.js. Everything here is
// commentary laid over it. That is deliberate: a hand-scripted demo is a second
// copy of the rules, and it goes stale the first time TUNING changes. This one
// cannot, because there is nothing in it to go stale.
//
// The narration therefore has to survive not knowing what happens next. Beats
// are matched against the engine's own event stream — which already carries the
// geometry, see the note at engine.js:265 — and the seed is chosen so the
// interesting ones actually occur. If a beat never matches, the demo is quieter
// than intended but never wrong.

// How long a caption stays up before the game moves on. Scaled by the UI's
// speed setting, and skipped entirely with effects off — long enough to read a
// sentence, short enough that eight rounds stay watchable.
const READ_MS = 2600;

// How often to check whether the voice has finished. Short enough not to add a
// noticeable gap after the last word, long enough to be free.
const SPEECH_POLL_MS = 120;

// ---------------------------------------------------------------- narration
//
// Two kinds of line. AMBIENT plays at a fixed point in the game and explains a
// concept the viewer needs before they can read what follows. REACTIVE waits for
// an engine event and points at it — those are the ones that feel alive, because
// they are describing something that genuinely just happened on screen.
//
// `once` is the default: a concept lands the first time and nags after that.

const actName = (T, k) => T.actions[k].name;

// Ambient beats, keyed to {round, slot} boundaries. `slot: null` means the beat
// fires before the round resolves at all — the planning moment.
export const AMBIENT = [
  {
    id: 'open',
    round: 1, slot: null,
    kicker: 'The delta',
    title: () => 'Let us take a look at the river',
    body: () => `Three of us are playing, and we have each picked two actions in `
        + `order — face down, but only until everybody has chosen. Nothing stays `
        + `secret in this game except timing, and timing turns out to be plenty. `
        + `Water runs top to bottom here, headwaters down to the three bays. Watch `
        + `it while we play.`,
  },
  {
    id: 'slot-order',
    round: 1, slot: 0,
    kicker: 'Slot 1',
    title: () => 'Everybody\'s first action goes first',
    body: () => `Notice the order here — we go around the table and resolve every `
        + `player's first pick before anyone gets to their second. So it is not just `
        + `what you chose, it is which one you put first. Put a good idea second and `
        + `the river may not be there when you get to it.`,
  },
  {
    id: 'slot-two',
    round: 1, slot: 1,
    kicker: 'Slot 2',
    title: () => 'And now the second ones',
    body: () => `Here is the tension. We locked these in before any of this happened, `
        + `and there is no changing our minds now. You are watching people find out `
        + `whether they guessed right.`,
  },
  {
    id: 'mid-game',
    round: 4, slot: null,
    kicker: 'Halfway',
    title: () => 'Take a look at the water now',
    body: (T) => `Compare that to round one. Here is the thing — nobody attacked the `
        + `river. Not once. Every bit of missing ${T.terms.depth.name.toLowerCase()} `
        + `is just somebody having a good turn. That is the whole idea of the game, `
        + `right there on the board.`,
  },
  {
    id: 'late',
    round: 7, slot: null,
    kicker: 'Endgame',
    title: () => 'We are running out of river',
    body: (T) => `Now, a ${T.terms.station.name.toLowerCase()} only scores at the end `
        + `if it can still reach the sea. So the players who shipped hardest all game? `
        + `They are the ones most likely to be stranded — in water they used up `
        + `themselves. Let us see how that shakes out.`,
  },
];

// Reactive beats. `when(ev, ctx)` gets one engine event plus {g, T, round}.
// Ordered by priority — the first match on a given event wins, so the rarest and
// most instructive beats sit at the top.
export const REACTIVE = [
  {
    id: 'first-death',
    once: true,
    when: (ev) => ev.type === 'silt' && (ev.dropped ?? []).some(d => d.to === 0),
    kicker: 'A channel just died',
    title: () => 'And that water is gone for good',
    body: (T) => `Down to zero — and here is the part that hurts: we cannot dredge it `
        + `back. ${actName(T, 'dredge')} deepens water that still exists, and there is `
        + `nothing left to deepen. Everybody who was using that route goes around now, `
        + `for the rest of the game.`,
  },
  {
    id: 'first-toll',
    once: true,
    when: (ev) => ev.type === 'ship' && (ev.tolls ?? []).length > 0,
    kicker: 'A toll',
    title: () => 'Somebody just paid rent on the river',
    body: () => `See that little circle in somebody else's colour? That channel is `
        + `claimed. Whoever dredged it owns it, and the rest of us pay every time we `
        + `pass through. So fixing up the river is not charity in this game — it is how `
        + `you put a tollbooth on everyone else's route.`,
  },
  {
    id: 'first-blocked',
    once: true,
    when: (ev) => ev.type === 'blocked',
    kicker: 'Blocked',
    title: () => 'Ooh — that plan just fell apart',
    body: () => `The route silted shut before the action even fired. They committed to `
        + `that two slots ago and there was no calling it back. That is the cost of `
        + `choosing blind, and everybody at the table pays it eventually.`,
  },
  {
    id: 'first-dredge',
    once: true,
    when: (ev) => ev.type === 'dredge' && ev.claimed,
    kicker: 'Claim',
    title: (T) => `${actName(T, 'dredge')} fixes the river — and claims it`,
    body: () => `One gold, one extra depth, and watch — a marker goes down. That is `
        + `theirs now. It collects tolls from here on out, and if the channel is still `
        + `deep at the end of the game, it is worth points too. Two birds.`,
  },
  {
    id: 'first-ship',
    once: true,
    when: (ev) => ev.type === 'ship',
    kicker: 'Shipping',
    title: () => 'Goods do not count until they hit a bay',
    body: () => `We pay for each good and for every channel we cross, so a long haul `
        + `is expensive. But here is what I really want you to watch — the wake. Every `
        + `channel that boat just touched gets shallower at the end of the round. `
        + `Earning and wearing out the river are the exact same move.`,
  },
  {
    id: 'first-contract',
    once: true,
    when: (ev) => ev.type === 'contract',
    kicker: 'Contract filled',
    title: (T) => `A ${T.terms.contract.name.toLowerCase()} — and this is most of the score`,
    body: () => `That fills the moment the goods arrive, highest value first — no `
        + `action needed, it just happens. And those points are banked. Even if the `
        + `whole route dries up next round, they keep them.`,
  },
  {
    id: 'first-build',
    once: true,
    when: (ev) => ev.type === 'build',
    kicker: 'New settlement',
    title: () => 'Each one of these costs more than the last',
    body: (T) => `A new ${T.terms.station.name.toLowerCase()} has to go next to one they `
        + `already have, across water they can actually still get through. Spreading out `
        + `reaches more bays — but past four of them you are paying upkeep every single `
        + `round, so there is a real question about how far is too far.`,
  },
  {
    id: 'abandon',
    once: true,
    when: (ev) => ev.type === 'abandon',
    kicker: 'Abandoned',
    title: () => 'They could not make upkeep',
    body: () => `Too many settlements, not enough gold, and one of them has to go. `
        + `Overextending here does not just slow you down — it actively takes things `
        + `off the board.`,
  },
];

// ---------------------------------------------------------------- controller
//
// Owns presentation state — which beat is showing, whether we are paused, which
// one-shots have fired — plus the round-driving loop. The game itself is played
// by ui.js's ordinary resolution walker, exactly as it is for a human.
//
// `host` is the seam back to the UI. It is deliberately small: everything the
// demo needs from ui.js is listed there, so this module can be read without
// knowing how the board is painted, and ui.js does not grow a second game loop.
//
//   host.render()        repaint
//   host.step()          drain the current queue (the shared walker)
//   host.newRound(r)     set programs, build the slot-0 queue, log the header
//   host.roundOf()       current engine round
//   host.rounds()        TUNING.rounds
//   host.wait(ms)        speed-scaled sleep
//   host.silent()        true when effects are off, so caption holds collapse
//   host.finished()      the game reached its end and finish() has run

export function createDemo(host) {
  return {
    active: false,
    paused: false,
    beat: null,          // the beat currently on screen
    fired: new Set(),    // ids of one-shot beats already used
    host,

    start() {
      this.active = true;
      this.paused = false;
      this.beat = null;
      this.fired.clear();
    },
    stop() {
      this.active = false;
      this.beat = null;
    },

    // Suspend between beats rather than tearing the game down, so resuming
    // continues the same game. Polls because the resume signal is a button.
    unpaused() {
      return !this.paused ? Promise.resolve() : new Promise((res) => {
        const tick = () => (!this.paused || !this.active ? res() : setTimeout(tick, 80));
        tick();
      });
    },

    // A caption needs longer on screen than an effect does — you have to read
    // it. Skipped when paused, because the pause gate is already holding.
    //
    // READ_MS is tuned for reading silently. Reading the same paragraph ALOUD
    // takes four or five times as long, so with the voice on this waits for the
    // utterance to finish instead: otherwise the next beat fires on the timer
    // and cuts the sentence off partway through, every single time.
    async hold() {
      if (!this.active) return;
      await this.unpaused();
      if (!this.active || this.host.silent()) return;
      await this.host.wait(READ_MS);
      await this.spoken();
    },

    // Wait out an in-progress utterance. Polled rather than event-driven: the
    // demo can be paused, taken over or quit mid-sentence, and every one of
    // those has to break the wait — an onend handler would strand it.
    async spoken() {
      if (!this.host.speaking) return;
      while (this.active && !this.paused && this.host.speaking()) {
        await this.host.wait(SPEECH_POLL_MS);
      }
    },

    // Round after round with no commit button. Mirrors the human flow exactly:
    // programs in, queue built, walker drains it, endRound() fires the phases.
    async run() {
      const h = this.host;
      while (this.active && h.roundOf() <= h.rounds()) {
        const r = h.roundOf();
        if (this.ambient(r, null)) { h.render(); await this.hold(); }
        if (!this.active) return;

        h.newRound(r);
        await this.unpaused();
        if (!this.active) return;

        if (this.ambient(r, 0)) { h.render(); await this.hold(); }
        await h.step();
        // The walker ends the round itself and advances the counter. If it did
        // not advance, the game is over and finish() has already run.
        if (h.roundOf() === r) return;
      }
    },

    // Fired at a {round, slot} boundary. slot === null is the planning moment.
    ambient(round, slot) {
      if (!this.active) return false;
      const b = AMBIENT.find(x =>
        x.round === round && x.slot === slot && !this.fired.has(x.id));
      if (!b) return false;
      this.fired.add(b.id);
      this.beat = b;
      return true;
    },

    // Fired per engine event during resolution. Returns true if the caption
    // changed, so the caller knows whether it needs to hold longer.
    react(ev, ctx) {
      if (!this.active) return false;
      for (const b of REACTIVE) {
        if (b.once && this.fired.has(b.id)) continue;
        if (!b.when(ev, ctx)) continue;
        this.fired.add(b.id);
        this.beat = b;
        return true;
      }
      return false;
    },

    // Resolve the live beat's text against the theme. Mirrors tutorial.stepText
    // so both boxes render through the same shape.
    text(T) {
      const b = this.beat;
      if (!b) return null;
      const f = (v) => (typeof v === 'function' ? v(T) : (v ?? ''));
      return { kicker: f(b.kicker), title: f(b.title), body: f(b.body) };
    },
  };
}

// ---------------------------------------------------------------- caption
//
// The demo reuses the tutorial box: same element, same mobile behaviour, one
// extra class for the bottom-centre subtitle position. Only the button row
// differs — transport controls instead of step-through, because there is
// nothing here for the viewer to complete.
export function paintCaption(box, demo, { T, round, rounds, speedLabel, el, speech }) {
  const t = demo.text(T);
  box.classList.add('on');
  box.classList.add('watching');
  el('tutStep').textContent = demo.paused
    ? 'Paused'
    : `${T.terms.round.name} ${round} of ${rounds} — watching`;
  el('tutTitle').textContent = t?.title ?? '';
  el('tutBody').textContent = t?.body ?? '';
  // Transport lives in the existing .row, so no new layout is needed: tutNext
  // becomes play/pause, tutSkipStep becomes speed, tutSkip becomes take-over.
  el('tutNext').style.display = '';
  el('tutNext').textContent = demo.paused ? '▶ Resume' : '❚❚ Pause';
  el('tutSkipStep').style.display = '';
  el('tutSkipStep').textContent = `Speed ${speedLabel}`;
  el('tutSkip').textContent = 'Play it myself';
  // Read-aloud toggle. Hidden entirely where the platform has no speech support,
  // rather than offered as a button that quietly does nothing.
  const say = el('tutSpeak');
  if (say) {
    say.style.display = speech?.available ? '' : 'none';
    say.textContent = speech?.enabled ? '🔊 Voice on' : '🔇 Voice off';
    say.setAttribute('aria-pressed', speech?.enabled ? 'true' : 'false');
  }
  // The kicker names the beat and carries the emphasis in this mode.
  el('tutWait').textContent = t?.kicker ?? '';
}

// The tutorial box's three buttons do double duty in watch mode: play/pause,
// speed, and bail-to-a-real-game. Branching here rather than rebinding on mode
// change keeps exactly one listener per control, so a demo started twice cannot
// stack handlers — which is how the old tutorial skip button ended up firing
// three times per click.
export function wireDemo(host) {
  const { el, isWatching } = host;
  el('tutNext').addEventListener('click', () =>
    (isWatching() ? host.togglePause() : host.tutNext()));
  el('tutSkipStep').addEventListener('click', () =>
    (isWatching() ? host.cycleSpeed() : host.tutNext()));
  el('tutSkip').addEventListener('click', () =>
    (isWatching() ? host.takeOver() : host.tutStop()));
  // Watch-mode only, so no tutorial branch: the button is hidden otherwise.
  el('tutSpeak')?.addEventListener('click', () => host.toggleSpeech());
}

// A seed chosen because the game it produces actually contains the beats above —
// an early claim, a toll paid on it, a channel dying mid-game, and a contract
// landing late. Re-check with sim.mjs if TUNING moves; the demo stays correct
// either way, it just gets quieter.
export const DEMO_SEED = 20260719;

// Bots for the three seats. Deliberately not three balanced clones: the whole
// tension of SILT is that these strategies disagree about whether to maintain
// the river, and you can only see that argument if they are actually different.
// steward dredges, defector free-rides on it, expander sprawls and pays upkeep.
export const DEMO_BOTS = ['steward', 'defector', 'expander'];
