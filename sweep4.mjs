import { sweep } from './sweep.mjs';
const VP = { liveDepthMin: 1, contractScale: 2, mouthVP: [12,6,2] };
console.log('Does Dredging Rights create strategic branching?');
sweep('G. rights on/off, mixed field', {
  'rights OFF':        { ...VP, rightsEnabled: false },
  'rights ON toll 1':  { ...VP, rightsEnabled: true, tollPerShip: 1 },
  'rights ON toll 2':  { ...VP, rightsEnabled: true, tollPerShip: 2 },
}, ['balanced','steward','expander','tollkeeper']);

sweep('H. tollkeeper vs the old field', {
  'rights OFF':        { ...VP, rightsEnabled: false },
  'rights ON toll 1':  { ...VP, rightsEnabled: true, tollPerShip: 1 },
  'rights ON toll 2':  { ...VP, rightsEnabled: true, tollPerShip: 2 },
}, ['balanced','expander','turtle','tollkeeper']);
