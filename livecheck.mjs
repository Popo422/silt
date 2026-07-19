import { newGame, score, TUNING, canReachMouth } from './engine.js';
const g = newGame(4, 1234);
// give everyone a healthy network
g.players[0].stations = ['M1','M2','M3'];
console.log('depths all 3 →', Object.values(g.depth).every(d=>d===3));
console.log('canReachMouth M1 @2:', canReachMouth(g,'M1',2));
TUNING.vpLiveStation = 2; console.log('live=2 network:', score(g)[0].network, 'live count:', score(g)[0].live);
TUNING.vpLiveStation = 3; console.log('live=3 network:', score(g)[0].network, 'live count:', score(g)[0].live);
TUNING.vpLiveStation = 2;
