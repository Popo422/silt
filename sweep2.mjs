import { sweep } from './sweep.mjs';
console.log('Combining downstream silt with a scaled VP economy.');
sweep('D. downstream silt + VP scale', {
  'downstream only':                 { siltDownstream: true },
  'ds + ctr x2':                     { siltDownstream: true, contractScale: 2 },
  'ds + ctr x2 + mouth up':          { siltDownstream: true, contractScale: 2, mouthVP: [12,6,2] },
  'ds + ctr x2.5 + mouth up':        { siltDownstream: true, contractScale: 2.5, mouthVP: [12,6,2] },
  'ds + ctr x2 + mouth up + live3':  { siltDownstream: true, contractScale: 2, mouthVP: [12,6,2], vpLiveStation: 3 },
});
sweep('E. dredge economy under downstream silt', {
  'dredge1 @1c':  { siltDownstream: true, contractScale: 2, mouthVP: [12,6,2], dredgeAmount: 1, dredgeCoins: 1 },
  'dredge2 @1c':  { siltDownstream: true, contractScale: 2, mouthVP: [12,6,2], dredgeAmount: 2, dredgeCoins: 1 },
  'dredge2 @2c':  { siltDownstream: true, contractScale: 2, mouthVP: [12,6,2], dredgeAmount: 2, dredgeCoins: 2 },
  'dredge2 @0c':  { siltDownstream: true, contractScale: 2, mouthVP: [12,6,2], dredgeAmount: 2, dredgeCoins: 0 },
});
