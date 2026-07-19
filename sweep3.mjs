import { sweep } from './sweep.mjs';
console.log('Baseline silt (no downstream). Fixing the VP economy + live threshold.');
sweep('F. final candidates', {
  'current committed':            {},
  'live@1':                       { liveDepthMin: 1 },
  'live@1 + ctr x2':              { liveDepthMin: 1, contractScale: 2 },
  'live@1 + ctr x2 + mouth up':   { liveDepthMin: 1, contractScale: 2, mouthVP: [12,6,2] },
  'live@1 + ctr x2 + mouth + d2': { liveDepthMin: 1, contractScale: 2, mouthVP: [12,6,2], dredgeAmount: 2, dredgeCoins: 2 },
  'above + live3':                { liveDepthMin: 1, contractScale: 2, mouthVP: [12,6,2], dredgeAmount: 2, dredgeCoins: 2, vpLiveStation: 3 },
  'above + rounds 10':            { liveDepthMin: 1, contractScale: 2, mouthVP: [12,6,2], dredgeAmount: 2, dredgeCoins: 2, vpLiveStation: 3, rounds: 10 },
});
