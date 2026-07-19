import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score, shipOptions } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2});
// How much income does a player earn WITHOUT ever building or dredging?
// i.e. what does the free starting position pay over 8 rounds?
let earn=0, ships=0, n=200;
for(let i=0;i<n;i++){
  const g=newGame(2, 5000+i*13);
  g.players.forEach((p,k)=>{p.strat='defector';p.name='d'+k;});
  const p=g.players[0];
  for(g.round=1;g.round<=TUNING.rounds;g.round++){
    // player 0 ONLY ships, never builds
    for(let s=0;s<2;s++){
      const o=shipOptions(g,p)[0];
      if(o){ execute(g,0,'ship',{option:o},new Set()); ships++; }
    }
    siltPhase(g);regrowPhase(g);upkeepPhase(g);g.log=[];
  }
  earn+=p.coins;
}
console.log(`Pure-ship, never build/dredge: avg ${(earn/n).toFixed(1)} coins, ${(ships/n).toFixed(1)} shipments over 8 rounds`);
console.log(`Starting cubes at one station: ${TUNING.cubesPerNode}, regrow ${TUNING.regrowPerRound}/round`);
console.log(`=> a single station supports ~${(TUNING.cubesPerNode/TUNING.shipCubesMax).toFixed(1)} shipments before drying up`);
