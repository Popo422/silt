// Spoken captions for watch mode, via the browser's built-in speechSynthesis.
//
// No dependency, no audio files, no cost: this uses whatever voices the viewer's
// OS already ships. That is also the honest limitation — the default Windows and
// Android voices sound like a screen reader, not like someone presenting a board
// game. Recorded audio would sound better; this is what fits in a repo with no
// build step and no asset budget.
//
// Speech is OFF by default. It is an accessibility-adjacent feature that some
// people want and others find intrusive, and a page that starts talking on its
// own is the second kind. The preference persists, like the speed toggle.
//
// Browsers block audio until the user has interacted with the page, so this can
// only start from a real click. Watch mode is entered by clicking Watch, which
// satisfies that — but calling speak() during page load would silently do
// nothing, which is why nothing here runs at module scope.

const KEY = 'silt.speech';

// Voice preference. Scored rather than matched by exact name: the previous
// version listed five specific names, and a Windows box with only the three
// stock SAPI5 voices (David, Mark, Zira) matched NONE of them, so it fell
// through to "first English voice" — David, the most robotic of the three.
//
// Quality tiers, roughly:
//   Natural/Neural  — Microsoft's modern voices, genuinely close to human.
//                     Free to install: Settings > Time & Language > Speech.
//   Online/remote   — Edge exposes ~100 cloud neural voices Chrome does not.
//   Google *        — Chrome's own bundled voices, decent.
//   Everything else — the old SAPI5 engines. Robotic, but they always exist.
const VOICE_SCORE = [
  [/natural|neural/i, 100],
  [/online/i, 80],
  [/^Google/, 60],
  [/Daniel|Samantha|Alex|Karen|Moira/, 50],   // macOS/iOS, markedly better
  [/Mark/, 12],                               // least bad of the stock three
  [/Zira/, 10],
  [/David/, 8],
];

const scoreVoice = (v) => {
  let s = 0;
  for (const [re, n] of VOICE_SCORE) if (re.test(v.name)) { s = Math.max(s, n); }
  if (/^en[-_]?GB/i.test(v.lang)) s += 3;   // tie-break, nothing more
  return s;
};

export function createSpeech() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  let enabled = false;
  try {
    enabled = localStorage.getItem(KEY) === 'on';
  } catch { /* private mode: stay off */ }

  let voice = null;
  // The beat currently being spoken. Callers repaint far more often than the
  // caption changes, so tracking it here keeps every call site idempotent
  // instead of making each one remember to compare ids first.
  let spoken = null;

  // Voices load asynchronously in Chrome — getVoices() returns [] on first call
  // and fills in later, so this has to be re-run rather than read once.
  const pickVoice = () => {
    if (!synth) return;
    const all = synth.getVoices();
    if (!all.length) return;
    const en = all.filter(v => /^en/i.test(v.lang ?? ''));
    const pool = en.length ? en : all;
    voice = pool.reduce((best, v) =>
      (scoreVoice(v) > scoreVoice(best) ? v : best), pool[0]);
  };
  if (synth) {
    pickVoice();
    synth.addEventListener?.('voiceschanged', pickVoice);
  }

  return {
    // False when the platform has no speech support at all, so the UI can hide
    // the control rather than offer a button that does nothing.
    available: !!synth,
    get enabled() { return enabled; },

    setEnabled(on) {
      enabled = !!on;
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* ignore */ }
      if (!enabled) this.stop();
      // Turning it on mid-beat should speak what is already on screen rather
      // than staying silent until the next beat happens to fire.
      else spoken = null;
    },

    toggle() { this.setEnabled(!enabled); return enabled; },

    // Say this beat if it is not the one already being said. This is the call
    // site's whole interaction: it can run on every repaint and only the first
    // one per beat reaches the synthesiser.
    narrate(id, title, body, paused) {
      if (id !== spoken) {
        spoken = id;
        this.speak(title, body);
      }
      if (paused) this.stop();
    },

    // True while an utterance is in progress. The demo holds a caption on a
    // fixed timer, which is far shorter than it takes to read 40 words aloud —
    // without this the next beat arrives and cuts the voice off mid-sentence.
    speaking() {
      if (!enabled || !synth) return false;
      return !!(synth.speaking || synth.pending);
    },

    // Forget what was spoken, so the next narrate() starts fresh. Used when the
    // demo tears down: a new run must not be silenced by the old run's last id.
    reset() { spoken = null; this.stop(); },

    // Say one caption, replacing whatever was mid-sentence. Beats can arrive
    // faster than they can be read aloud — a busy round fires several — and
    // queueing them would drift further and further behind the board until the
    // voice is describing something that happened ten seconds ago. The caption
    // on screen is the truth; speech follows it or says nothing.
    speak(title, body) {
      if (!enabled || !synth) return;
      this.stop();
      if (!voice) pickVoice();
      const text = [title, body].filter(Boolean).join('. ');
      if (!text) return;
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = 1.05;    // default is a touch slower than a person presenting
      u.pitch = 1;
      u.volume = 1;
      try { synth.speak(u); } catch { /* nothing to do about a refused utterance */ }
    },

    stop() {
      if (!synth) return;
      try { synth.cancel(); } catch { /* ignore */ }
    },
  };
}
