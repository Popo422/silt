// Delegated hover help.
//
// Anything carrying data-tip gets a panel after a short delay; data-tip-title is
// an optional heading.
//
// Not the native `title` attribute: that waits about a second, cannot be styled,
// cannot hold a heading, and never appears on touch at all.
//
// Delegated from `document` rather than bound per element, because the UI replaces
// its markup on every render — per-element listeners would be dead within a frame.
// That also means new markup is covered automatically with no re-wiring.

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createTips({ delay = 380, gap = 12, edge = 8 } = {}) {
  const box = document.createElement('div');
  box.id = 'tip';
  document.body.appendChild(box);

  let timer = null, current = null;

  const hide = () => {
    clearTimeout(timer);
    current = null;
    box.classList.remove('on');
  };

  const show = (el) => {
    const tip = el.dataset.tip;
    if (!tip) return;
    const title = el.dataset.tipTitle;
    box.innerHTML = (title ? `<b>${esc(title)}</b>` : '') + `<span>${esc(tip)}</span>`;
    box.classList.add('on');

    // Measure after the content is in, so the size is real rather than stale.
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    let x = r.left - b.width - gap;                 // prefer left of the element
    let y = r.top + r.height / 2 - b.height / 2;
    if (x < edge) x = r.right + gap;                // no room: flip to the right
    if (y < edge) y = edge;
    if (y + b.height > innerHeight - edge) y = innerHeight - b.height - edge;
    box.style.left = `${Math.round(x)}px`;
    box.style.top = `${Math.round(y)}px`;
  };

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el || el === current) return;
    current = el;
    clearTimeout(timer);
    // Long enough not to fire while the pointer merely crosses something, short
    // enough to feel like an answer rather than a wait.
    timer = setTimeout(() => show(el), delay);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('[data-tip]') === current) hide();
  });
  // A tooltip that survives a click is just in the way.
  document.addEventListener('pointerdown', hide);
  document.addEventListener('scroll', hide, true);

  return { hide };
}

// Exported so callers can escape their own tooltip payloads — the strings are
// interpolated into data-tip attributes, which are then re-read as HTML here.
export { esc };
