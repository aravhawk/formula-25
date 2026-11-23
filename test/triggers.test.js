import test from 'node:test';
import assert from 'node:assert/strict';
import {Triggers} from '../src/triggers.js';
import {effects} from '../src/dualsense.js';

const dt=1/60;
const drive=()=>({speed:60,rpm:.5,throttle:0,braking:0,gear:3,longitudinalG:0,wheelspin:0,hit:0,tyres:{locked:new Float64Array(4)}});
const same=(a,b)=>assert.deepEqual([...a],[...b]);

test('Coasting gives a light brake spring and a light throttle spring',()=>{
  const {left,right}=new Triggers('on').update(drive(),dt);
  same(left,effects.feedback(2,3));same(right,effects.feedback(3,2));
});
test('Brake resistance stiffens as braking load builds',()=>{
  const d=drive();d.longitudinalG=-4.5;
  same(new Triggers('on').update(d,dt).left,effects.feedback(2,7));
});
test('A locked tyre makes the brake trigger judder',()=>{
  const d=drive();d.tyres.locked[0]=1;
  const {left}=new Triggers('on').update(d,dt);
  assert.equal(left[0],0x26);same(left,effects.vibration(2,8,30));
});
test('Locking at a crawl does not buzz the trigger',()=>{
  const d=drive();d.speed=2;d.tyres.locked[0]=1;
  assert.equal(new Triggers('on').update(d,dt).left[0],0x21);
});
test('Wheelspin and the rev limiter buzz the throttle trigger',()=>{
  const spin=drive();Object.assign(spin,{throttle:1,wheelspin:1});
  same(new Triggers('on').update(spin,dt).right,effects.vibration(3,7,25));
  const limiter=drive();Object.assign(limiter,{throttle:1,rpm:1});
  same(new Triggers('on').update(limiter,dt).right,effects.vibration(4,4,40));
});
test('A gear change buzzes the throttle trigger briefly',()=>{
  const t=new Triggers('on'),d=drive();
  t.update(d,dt);d.gear=4;
  assert.equal(t.update(d,dt).right[0],0x26);
  let right;for(let i=0;i<10;i++)right=t.update(d,dt).right;
  assert.equal(right[0],0x21);
});
test('An impact buzzes both triggers',()=>{
  const d=drive();d.hit=1;
  const {left,right}=new Triggers('on').update(d,dt);
  same(left,effects.vibration(0,8,50));same(right,left);
});
test('Intensity scales strength and bad input stays safe',()=>{
  same(new Triggers('light').update(drive(),dt).left,effects.feedback(2,2));
  same(new Triggers('strong').update(drive(),dt).left,effects.feedback(2,4));
  assert.doesNotThrow(()=>new Triggers().update({speed:NaN,rpm:'x',tyres:{locked:[NaN]}},NaN));
  assert.doesNotThrow(()=>new Triggers().update(undefined,dt));
});
