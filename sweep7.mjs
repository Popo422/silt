import { sweep } from './sweep.mjs';
const BASE = { liveDepthMin:1, contractScale:2, mouthVP:[12,6,2], rightsEnabled:true, tollPerShip:2, rightsVP:3 };
sweep('L. candidate across fields', {
  'competent 4p':   BASE,
}, ['balanced','steward','tollkeeper','expander']);
sweep('M. mirror + heads-up', { 'candidate': BASE }, ['balanced','balanced','balanced','balanced']);
sweep('N. tollkeeper mirror (is it self-defeating?)', { 'candidate': BASE }, ['tollkeeper','tollkeeper','tollkeeper','tollkeeper']);
sweep('O. heads-up', { 'candidate': BASE }, ['balanced','tollkeeper']);
sweep('P. does defector still lose?', { 'candidate': BASE }, ['defector','balanced','tollkeeper','steward']);
