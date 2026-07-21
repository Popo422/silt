// Season presentation (Phases 1-4). The two-season game's UI chrome — the header
// banner naming Amihan/Habagat and the incoming-bagyo tag, plus driving the ambient
// Habagat rain — pulled out of ui.js, which had grown past its line budget. Pure
// view logic: it reads game state and the theme, writes the banner element and the
// rain level, and knows nothing about the turn loop.

import { TUNING, bagyoCountdown, bagyoTarget } from './engine.js';
import { seasonLabel } from './theme.js';

// Paint the header season tag. `deps` supplies the bits ui.js owns: $ (id lookup),
// icon (sprite/art html), g (game), T (theme). Hidden entirely in the single-season
// game; in Habagat with a storm coming it also shows the bagyo icon + countdown.
export function paintSeasonBanner({ $, icon, g, T }) {
  const tag = $('seasonTag');
  if (!tag) return;
  if (!TUNING.seasons || !g) { tag.classList.add('hide'); return; }
  const wet = g.season === 'habagat';
  tag.classList.remove('hide');
  let html = ` · ${icon(wet ? 'season-habagat' : 'season-amihan', 'seasonIco')}`
    + seasonLabel(T, g.season);
  const cd = bagyoCountdown(g);
  if (cd !== null) {
    const m = bagyoTarget(g);
    html += ` <span class="stormTag">${icon('bagyo', 'seasonIco')}`
      + (cd === 0 ? `bagyo at ${m}!` : `bagyo → ${m} in ${cd}`) + '</span>';
  }
  tag.innerHTML = html;
}

// Compute the ambient rain level for the board: 0 in the dry season / single-season
// game, ~1 steady through Habagat, ramping toward 2 as a bagyo's landfall nears. The
// caller passes this straight to fx.setRain().
export function rainLevelFor(g) {
  if (!TUNING.seasons || !g || g.season !== 'habagat') return 0;
  const cd = bagyoCountdown(g);
  if (cd === null) return 1;
  return Math.min(2, 1.2 + (4 - Math.min(cd, 4)) * 0.2);
}
