import { sweep } from './sweep.mjs';
const VP = { liveDepthMin: 1, contractScale: 2, mouthVP: [12,6,2], rightsEnabled: true };
sweep('I. how big must the toll be to matter?', {
  'toll 1': { ...VP, tollPerShip: 1 },
  'toll 2': { ...VP, tollPerShip: 2 },
  'toll 3': { ...VP, tollPerShip: 3 },
  'toll 4': { ...VP, tollPerShip: 4 },
  'toll 2 + rights score 2vp each': { ...VP, tollPerShip: 2, rightsVP: 2 },
  'toll 2 + rights score 3vp each': { ...VP, tollPerShip: 2, rightsVP: 3 },
}, ['balanced','steward','expander','tollkeeper']);
