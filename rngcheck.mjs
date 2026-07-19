import { rng } from './engine.js';
// neighbouring seeds must diverge immediately
let bad=0;
for(let s=0;s<500;s++){
  const a=rng(s), b=rng(s+1);
  const A=Array.from({length:5},a), B=Array.from({length:5},b);
  if(A.every((v,i)=>v===B[i])) bad++;
}
console.log('identical neighbouring streams:', bad);
// distribution sanity
const r=rng(99), buckets=Array(10).fill(0);
for(let i=0;i<100000;i++) buckets[Math.floor(r()*10)]++;
console.log('decile spread:', buckets.map(b=>(b/1000).toFixed(1)).join(' '));
