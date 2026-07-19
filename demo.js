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

import { INTRO, AMBIENT, REACTIVE } from './narration.js';

// How long a caption stays up before the game moves on. Scaled by the UI's
// speed setting, and skipped entirely with effects off — long enough to read a
// sentence, short enough that eight rounds stay watchable.
const READ_MS = 2600;

// How often to check whether the voice has finished. Short enough not to add a
// noticeable gap after the last word, long enough to be free.
const SPEECH_POLL_MS = 120;

// Ceiling on a caption's hold. The longest intro paragraph needs about 21s to
// read, but a beat that parks the game for half a minute reads as a hang.
const READ_MAX_MS = 16_000;

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
      await this.host.wait(this.readTime(this.words()));
      await this.spoken();
    },

    // How much text the live caption puts on screen. Resolved against the host's
    // theme, because a beat's copy is theme-dependent and the translated version
    // can be a different length.
    words() {
      const t = this.beat && this.text(this.host.theme?.());
      return t ? `${t.title} ${t.body}`.split(/\s+/).filter(Boolean).length : 0;
    },

    // How long the live caption stays up, from how much there is to read.
    //
    // This was a flat READ_MS for every beat, which is 2.6s to read a 70-word
    // paragraph — about a fifth of the time it actually takes. Anyone watching
    // without the voice on saw the teaching captions flash past unread.
    //
    // With the voice ON this only needs to be a floor: spoken() then holds until
    // the utterance actually ends, so the timer should not add dead air on top.
    // Silent, it is the whole budget, and 240wpm is a comfortable adult reading
    // pace for short text you are looking at a board alongside.
    readTime(words) {
      if (!words) return READ_MS;
      const wpm = this.host.speaking?.() ? 400 : 240;
      return Math.min(READ_MAX_MS, Math.max(READ_MS, (words / wpm) * 60_000));
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

    // Teach the game on a still board, before anything moves. Commentary on a
    // running game cannot do this job: by the time the first boat sails, someone
    // who does not know the goal has already lost the thread.
    async intro() {
      for (const b of INTRO) {
        if (!this.active) return;
        this.fired.add(b.id);
        this.beat = b;
        this.host.render();
        await this.hold();
      }
    },

    // Round after round with no commit button. Mirrors the human flow exactly:
    // programs in, queue built, walker drains it, endRound() fires the phases.
    async run() {
      const h = this.host;
      await this.intro();
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

