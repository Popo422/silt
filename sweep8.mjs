import { sweep } from './sweep.mjs';
const B = (rv, toll) => ({ liveDepthMin:1, contractScale:2, mouthVP:[12,6,2], rightsEnabled:true, tollPerShip:toll, rightsVP:rv });
sweep('Q. dial rights back — competent field', {
  'rv1 toll1': B(1,1), 'rv1 toll2': B(1,2),
  'rv2 toll1': B(2,1), 'rv2 toll2': B(2,2),
  'rv3 toll1': B(3,1),
}, ['balanced','steward','tollkeeper','expander']);
sweep('R. same configs, broad field', {
  'rv1 toll1': B(1,1), 'rv1 toll2': B(1,2),
  'rv2 toll1': B(2,1), 'rv2 toll2': B(2,2),
}, ['balanced','expander','turtle','tollkeeper']);
