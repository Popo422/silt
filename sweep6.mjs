import { sweep } from './sweep.mjs';
const VP = { liveDepthMin: 1, contractScale: 2, mouthVP: [12,6,2], rightsEnabled: true, tollPerShip: 2 };
sweep('J. rights that score VP', {
  'rights 0vp (toll only)': { ...VP, rightsVP: 0 },
  'rights 1vp':             { ...VP, rightsVP: 1 },
  'rights 2vp':             { ...VP, rightsVP: 2 },
  'rights 3vp':             { ...VP, rightsVP: 3 },
  'rights 4vp':             { ...VP, rightsVP: 4 },
}, ['balanced','steward','expander','tollkeeper']);
sweep('K. same, broader field', {
  'rights 0vp': { ...VP, rightsVP: 0 },
  'rights 2vp': { ...VP, rightsVP: 2 },
  'rights 3vp': { ...VP, rightsVP: 3 },
}, ['balanced','expander','turtle','tollkeeper']);
