import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Circuit} from '../src/circuit.js';
import {GrandPrix,FlyingLap,STEP,setupCircuit} from '../src/racing.js';
import {contain} from '../src/contact.js';
import {control} from './driver.js';
const json=name=>JSON.parse(readFileSync(new URL('../public/season/'+name+'.json',import.meta.url)));
const events=json('calendar'),circuit=round=>setupCircuit(new Circuit(json(String(round).padStart(2,'0'))),events[round-1]);
const monza=circuit(16);
// A car on Monza's main straight with direct steering, so the tests see the chassis without the steering assist.
function car(speed,assists={}){
  const d=new GrandPrix(monza,events[15],1).player;
  Object.assign(d,{distance:300,offset:0,speed,heading:0});Object.assign(d.assists,{steer:false,...assists});d.updateGear();
  return d;
}
function run(d,seconds,input){
  let rotation=0,slide=0;
  for(let i=0;i<seconds*120;i++){d.step(STEP,typeof input==='function'?input(d,i/120):input);rotation+=d.yawRate*STEP;slide=Math.max(slide,Math.abs(d.bodyYaw));}
  return {rotation,slide};
}
test('Full throttle on lock in a low gear spins the car without traction control',()=>{
  const {rotation,slide}=run(car(22,{tc:0}),3,{steer:1,throttle:1});
  assert(Math.abs(rotation)>Math.PI,'the car turned '+rotation.toFixed(2)+' rad');assert(slide>1.5);
});
test('Traction control holds the same corner exit',()=>{
  for(const tc of [1,.5]){
    const d=car(22,{tc}),{slide}=run(d,3,{steer:1,throttle:1});
    assert(slide<.25,'slide of '+slide.toFixed(2)+' rad at tc '+tc);assert(d.speed>22);
  }
});
test('A slide is caught by lifting and steering into it, and becomes a spin if ignored',()=>{
  const slideThenCatch=catching=>{
    const d=car(30,{tc:0});let caught=false;
    const result=run(d,6,d=>{
      caught||=Math.abs(d.bodyYaw)>.2;
      return caught&&catching?{steer:Math.max(-1,Math.min(1,-4*d.bodyYaw-.4*d.yawRate)),throttle:0}:{steer:.5,throttle:1};
    });
    return {...result,d};
  };
  const saved=slideThenCatch(true),lost=slideThenCatch(false);
  assert(saved.slide<.7,'peak slide '+saved.slide.toFixed(2));assert(Math.abs(saved.d.bodyYaw)<.03);assert(Math.abs(saved.d.yawRate)<.05);
  assert(lost.slide>1.5);
});
test('Without anti-lock the fronts lock and the car goes straight on; with it the car still turns',()=>{
  const stop=abs=>{
    const d=car(83,{abs});let lock=0,distance=0,peak=0;
    for(let i=0;i<120*12&&d.speed>1;i++){d.step(STEP,{brake:1,steer:.5});lock=Math.max(lock,d.tyres.lock);distance+=d.speed*STEP;peak=Math.min(peak,d.longitudinalG);}
    return {lock,distance,peak,turned:Math.abs(d.heading+d.bodyYaw)};
  };
  const locked=stop(false),assisted=stop(true);
  assert(locked.lock>.9);assert(locked.turned<.2,'locked car turned '+locked.turned.toFixed(2));
  assert.equal(assisted.lock,0);assert(assisted.turned>.8);
  // About 5 to 6 g at 300 km/h, as the real car manages.
  assert(locked.peak<-5&&locked.peak>-6.5,'peak '+locked.peak.toFixed(1)+' g');
});
test('Straight-line performance is in the real car\'s range',()=>{
  const d=car(0,{tc:1});d.gear=1;d.updateGear();let time=0;const at={};
  while(time<20&&!at[300]){d.step(STEP,{throttle:1});time+=STEP;for(const kmh of [100,200,300])if(!at[kmh]&&d.speed*3.6>=kmh)at[kmh]=time;}
  assert(at[100]>2&&at[100]<3,'0-100 in '+at[100]);assert(at[200]>4&&at[200]<5.5,'0-200 in '+at[200]);assert(at[300]>8.5&&at[300]<12,'0-300 in '+at[300]);
  const braking=car(83);let distance=0;
  while(braking.speed>.5){braking.step(STEP,{brake:1});distance+=braking.speed*STEP;}
  assert(distance>85&&distance<140,'300-0 in '+distance.toFixed(0)+' m');assert(Math.abs(braking.bodyYaw)<.02);
});
test('Split-surface braking locks the grass-side front first and pulls toward the asphalt',()=>{
  for(const side of [-1,1]){
    const d=car(36,{abs:false,tc:0}),loose=side<0?0:1;
    Object.assign(d,{distance:350,offset:side*(monza.width-.05),braking:.3});
    run(d,.1,{brake:.3});
    assert.equal(d.tyres.surfaces[loose],'grass');assert(d.tyres.locked[loose]>.6);
    assert.equal(d.tyres.locked[1-loose],0);assert(d.yawRate*side<-.02);
  }
});
test('Cornering grip rises with speed from about 2 g to more than 5 g',()=>{
  const hold=v=>{let best=0;
    for(const steer of [.3,.4,.5,.6,.7]){
      const d=car(v,{tc:1});let sum=0,n=0;
      for(let i=0;i<150;i++){d.step(STEP,{steer,throttle:d.speed<v?1:0});d.offset=0;d.distance=300;if(i>90){sum+=Math.abs(d.lateralG);n++;}}
      best=Math.max(best,sum/n);
    }
    return best;};
  const slow=hold(20),fast=hold(75);
  assert(slow>1.9&&slow<2.5,'slow '+slow.toFixed(2));assert(fast>4.8&&fast<5.9,'fast '+fast.toFixed(2));
});
test('A spinning car is held by the rail and can drive on afterwards',()=>{
  const g=new GrandPrix(monza,events[15],1),d=g.player;g.state='race';
  Object.assign(d,{distance:500,offset:0,speed:55,heading:.5,bodyYaw:1.4,yawRate:3});d.assists.tc=0;
  for(let i=0;i<120*6;i++){
    g.tick(STEP,{throttle:i<240?1:0,steer:1,brake:i>=240?1:0});
    for(const value of [d.distance,d.offset,d.speed,d.heading,d.bodyYaw,d.yawRate])assert(Number.isFinite(value));
    assert(Math.abs(d.offset)<=monza.wallAt(d.distance,Math.sign(d.offset)||1)+.3,'outside the rail at '+d.offset.toFixed(1));
  }
  assert(d.contacts>0);assert(d.speed<1);
  // Point the car down the road again and pull away across the grass.
  Object.assign(d,{heading:0,bodyYaw:0,yawRate:0});const from=d.distance;d.assists.tc=1;
  for(let i=0;i<120*8;i++)g.tick(STEP,control(g));
  assert(d.distance>from+40);
});
test('A car facing the wrong way drives back along the circuit',()=>{
  const d=car(0,{tc:1});Object.assign(d,{heading:Math.PI});const from=d.distance;
  run(d,3,{throttle:1});
  assert(d.distance<from-20);assert(Math.abs(Math.abs(d.heading)-Math.PI)<.1);
});
for(const [label,assists] of [['with every assist',{tc:1,abs:true,steer:true}],['with direct steering and medium traction control',{tc:.5,abs:true,steer:false}]])
  test('The reference driver laps Spa, Suzuka and Silverstone cleanly '+label,()=>{
    for(const round of [13,3,12]){
      const g=new FlyingLap(circuit(round),events[round-1]),d=g.player;Object.assign(d.assists,assists);let slide=0;
      for(let i=0;i<120*200&&g.state!=='finished';i++){g.tick(STEP,control(g));slide=Math.max(slide,Math.abs(d.bodyYaw));}
      assert.equal(g.state,'finished');assert.equal(d.contacts,0,'contacts at round '+round);assert(slide<.6,'slide of '+slide.toFixed(2)+' at round '+round);
      // Within 15% of the real 2025 pole lap.
      const real={13:100.6,3:87.0,12:84.9}[round];assert(d.lapTimes[0]<real*1.15&&d.lapTimes[0]>real*.97,'lap of '+d.lapTimes[0].toFixed(1)+' s at round '+round);
    }
  });
