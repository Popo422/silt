import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
for (const opp of ['tollkeeper','expander','steward']) {
  const acc={}; ['defector',opp].forEach(s=>acc[s]={contracts:0,mouth:0,network:0,coin:0,silt:0,held:0,total:0,st:0});
  const N=300;
  for(let i=0;i<N;i++){
    const r=playGame(['defector',opp], 6000+i*29);
    r.scores.forEach((s,k)=>{const st=[ 'defector',opp][k];
      for(const key of ['contracts','mouth','network','coin','silt','held','total']) acc[st][key]+=s[key];
      acc[st].st+=s.stations;});
  }
  console.log(`\ndefector vs ${opp}`);
  for(const s of ['defector',opp]){
    const a=acc[s];
    console.log(`  ${s.padEnd(11)} total ${(a.total/N).toFixed(1).padStart(5)}  ctr ${(a.contracts/N).toFixed(1).padStart(5)}  mouth ${(a.mouth/N).toFixed(1).padStart(5)}  net ${(a.network/N).toFixed(1).padStart(5)}  coin ${(a.coin/N).toFixed(1).padStart(4)}  held ${(a.held/N).toFixed(1).padStart(4)}  silt ${(a.silt/N).toFixed(1).padStart(5)}  st ${(a.st/N).toFixed(1)}`);
  }
}
