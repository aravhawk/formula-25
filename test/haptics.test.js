import test from 'node:test';
import assert from 'node:assert/strict';
import {Haptics,LEVELS} from '../src/haptics.js';

const dt=1/60;
const drive=()=>({speed:0,rpm:0,throttle:0,braking:0,gear:1,longitudinalG:0,lateralG:0,slipF:0,slipR:0,wheelspin:0,hit:0,wallSide:0,
  tyres:{locked:new Float64Array(4),spinning:new Float64Array(4),surfaces:['track','track','track','track']},
  suspension:{velocity:new Float64Array(4),verticalG:0}});
const sequence=(h,d,count=60)=>Array.from({length:count},()=>h.update(d,dt));
const measured=(d,seed=1,count=60)=>{const h=new Haptics('on',seed);sequence(h,d,60);return sequence(h,d,count);};
const mean=(xs,key)=>xs.reduce((sum,x)=>sum+x[key],0)/xs.length;
const peak=(xs,key)=>Math.max(...xs.map(x=>x[key]));
const stdev=(xs,key)=>{const m=mean(xs,key);return Math.sqrt(xs.reduce((sum,x)=>sum+(x[key]-m)**2,0)/xs.length);};
const mix=(d,updates=60)=>measured(d,1,updates);

test('Idle is a faint purr, not silence',()=>{
  const samples=mix(drive());assert(peak(samples,'strong')<=.06);assert(mean(samples,'weak')>=.03&&mean(samples,'weak')<=.10);
});
test('Straight cruise has light engine and road presence',()=>{
  const d=drive();Object.assign(d,{speed:60,rpm:.7,throttle:1});
  const samples=mix(d);assert(mean(samples,'strong')>=.08&&mean(samples,'strong')<=.30);assert(mean(samples,'weak')>=.10&&mean(samples,'weak')<=.30);
});
test('Heavy braking loads the heavy motor and left trigger',()=>{
  const d=drive();Object.assign(d,{speed:80,braking:1,longitudinalG:-4.5});
  const samples=mix(d),cruise=drive();Object.assign(cruise,{speed:60,rpm:.7,throttle:1});
  assert(mean(samples,'strong')>=.35&&mean(samples,'strong')<=.65);assert(mean(samples,'left')>=.25&&mean(samples,'left')<=.55);
  assert(mean(samples,'strong')>mean(mix(cruise),'strong'));
});
test('Lockup pulses the weak motor and loads the left trigger',()=>{
  const d=drive();Object.assign(d,{speed:80,braking:1});d.tyres.locked[0]=d.tyres.locked[1]=1;
  const samples=mix(d);assert(mean(samples,'left')>=.8);assert(peak(samples,'weak')>=.6);assert(stdev(samples,'weak')>=.08);
});
test('Wheelspin loads the right trigger and pulses the weak motor',()=>{
  const d=drive();Object.assign(d,{speed:30,rpm:.8,throttle:1,wheelspin:1});
  const samples=mix(d);assert(mean(samples,'right')>=.8);assert(peak(samples,'weak')>=.5);
});
test('Pit feedback ignores stale lockup, wheelspin and tyre slip',()=>{
  const pit=drive(),clear=drive();Object.assign(pit,{speed:50,pit:{},wheelspin:1,slipF:.2,slipR:.3});Object.assign(clear,{speed:50});
  pit.tyres.locked[0]=pit.tyres.locked[1]=1;
  const a=new Haptics('on',13),b=new Haptics('on',13);
  for(let i=0;i<60;i++){
    const output=a.update(pit,dt),baseline=b.update(clear,dt);
    for(const channel of ['weak','left','right'])assert.equal(output[channel],baseline[channel]);
  }
});
test('Cornering and front scrub build a sustained load',()=>{
  const d=drive();Object.assign(d,{speed:50,lateralG:4,slipF:.11});
  const samples=mix(d);assert(mean(samples,'strong')>=.25&&mean(samples,'strong')<=.55);assert(mean(samples,'weak')>=.2);
});
test('Oversteer pulses strongly while the rear slides',()=>{
  const d=drive();Object.assign(d,{speed:30,slipR:.3});
  const samples=mix(d);assert(peak(samples,'strong')>=.6);assert(stdev(samples,'strong')>=.06);
});
test('Two kerb wheels make crisp, variable pulses',()=>{
  const d=drive();Object.assign(d,{speed:50});d.tyres.surfaces[0]=d.tyres.surfaces[2]='kerb';
  const samples=mix(d);assert(peak(samples,'weak')>=.6);assert(peak(samples,'strong')>=.45);assert(stdev(samples,'weak')>=.1);
});
test('Grass and gravel retain distinct surface intensity',()=>{
  const grass=drive();Object.assign(grass,{speed:40});grass.tyres.surfaces.fill('grass');
  const gravel=drive();Object.assign(gravel,{speed:40});gravel.tyres.surfaces.fill('gravel');
  const g=mix(grass),r=mix(gravel);assert(mean(g,'weak')>=.4&&mean(g,'weak')<=.75);assert(mean(g,'strong')>=.25&&mean(g,'strong')<=.55);
  assert(mean(r,'weak')>mean(g,'weak'));assert(mean(r,'strong')>mean(g,'strong'));
});
test('Gear shifts kick once and decay quickly',()=>{
  const d=drive(),h=new Haptics();Object.assign(d,{speed:45,rpm:.65,throttle:.7});
  sequence(h,d);const baseline=h.update(d,dt);d.gear=2;const up=h.update(d,dt);
  assert(up.strong>=baseline.strong+.3);
  let after;for(let i=0;i<8;i++)after=h.update(d,dt);
  assert(Math.abs(after.strong-baseline.strong)<=.05);
  d.gear=1;const down=h.update(d,dt);assert(down.strong-baseline.strong>=up.strong-baseline.strong);
  assert(down.weak-baseline.weak>up.weak-baseline.weak);
});
test('The rev limiter buzzes with a clear pulse',()=>{
  const d=drive();Object.assign(d,{speed:90,rpm:1,throttle:1});
  const samples=mix(d);assert(peak(samples,'weak')>=.35);assert(stdev(samples,'weak')>=.08);
});
test('Impact has an immediate four-motor kick that decays',()=>{
  const d=drive(),h=new Haptics();sequence(h,d);d.hit=1;
  const kick=h.update(d,dt);assert(kick.strong>=.95);assert(kick.weak>=.7);assert(kick.left>=.6);assert(kick.right>=.6);
  let after;for(let i=1;i<=24;i++){d.hit=Math.exp(-9*i*dt);after=h.update(d,dt);}
  assert(after.strong<.5);
});
test('Wall scrape is strong and rough',()=>{
  const d=drive();Object.assign(d,{speed:30,wallSide:1});
  const samples=mix(d);assert(mean(samples,'weak')>=.45);assert(mean(samples,'strong')>=.3);
});
test('Strength levels scale monotonically and initial gear is not a shift',()=>{
  assert.deepEqual(LEVELS,{light:.6,on:1,strong:1.4});
  const input=drive();Object.assign(input,{speed:55,rpm:.8,throttle:1,gear:5,lateralG:3,slipR:.2});
  const light=new Haptics('light',4),standard=new Haptics('on',4),strong=new Haptics('strong',4);
  for(let i=0;i<90;i++){
    const a=light.update(input,dt),b=standard.update(input,dt),c=strong.update(input,dt);
    for(const channel of ['strong','weak','left','right'])assert(a[channel]<=b[channel]&&b[channel]<=c[channel]);
  }
  const fresh=new Haptics(),ordinary=new Haptics();input.gear=5;
  assert.deepEqual(fresh.update(input,dt),ordinary.update(input,dt));
  fresh.update(input,dt);fresh.reset();assert.deepEqual(fresh.update(input,dt),new Haptics().update(input,dt));
});
test('Two thousand deterministic drive states keep every output finite and bounded',()=>{
  let state=7;const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
  const h=new Haptics('strong',99);
  for(let i=0;i<2000;i++){
    const d=drive();Object.assign(d,{speed:random()*100,rpm:random()*1.1,throttle:random(),braking:random(),gear:1+Math.floor(random()*8),
      longitudinalG:random()*12-6,lateralG:random()*10-5,slipF:random()*.4-.2,slipR:random()*.4-.2,wheelspin:random(),hit:random(),
      wallSide:random()>.8?1:0});
    d.tyres.locked=Float64Array.from({length:4},random);d.tyres.surfaces=Array.from({length:4},()=>['track','kerb','grass','gravel','runoff'][Math.floor(random()*5)]);
    d.suspension.velocity=Float64Array.from({length:4},()=>random()*5-2.5);d.suspension.verticalG=random()*3-1.5;
    for(const value of Object.values(h.update(d,random()*.12)))assert(Number.isFinite(value)&&value>=0&&value<=1);
  }
});
