import test from 'node:test';
import assert from 'node:assert/strict';
import {Triggers} from '../src/triggers.js';

const dt=1/60;
const drive=()=>({speed:60,rpm:.5,throttle:0,braking:0,gear:3,longitudinalG:0,wheelspin:0,hit:0,tyres:{locked:new Float64Array(4)}});
const zone=(e,i)=>Math.floor((e[3]+e[4]*2**8+e[5]*2**16+e[6]*2**24)/2**(3*i))&7;
const strengths=e=>Array.from({length:10},(_,i)=>(e[1]|e[2]<<8)>>i&1?zone(e,i)+1:0);
const rising=list=>list.every((v,i)=>!i||v>=list[i-1]);

test('Both triggers push back from the very first zone and build to the end of travel',()=>{
  const {left,right}=new Triggers('on').update(drive(),dt);
  for(const e of [left,right]){
    assert.equal(e[0],0x21);assert.equal(e[1]&1,1);
    const s=strengths(e);assert(s.every(v=>v>=1));assert(rising(s));assert(s[9]>s[0]);
  }
  assert(strengths(left)[0]>=4);assert(strengths(right)[0]>=2);
});
test('The brake is heavier than the throttle and stiffens with speed and braking load',()=>{
  const t=new Triggers('on'),slow=drive(),fast=drive(),braking=drive();
  slow.speed=5;fast.speed=80;braking.speed=80;braking.longitudinalG=-4.5;
  const at=(d,key)=>strengths(t.update(d,dt)[key]);
  assert(at(slow,'left')[0]>at(slow,'right')[0]);
  assert(at(fast,'left')[0]>at(slow,'left')[0]);
  assert(at(braking,'left')[9]>=at(fast,'left')[9]);
  assert(at(braking,'left').reduce((a,b)=>a+b)>at(fast,'left').reduce((a,b)=>a+b));
});
test('The throttle stiffens with revs and speed',()=>{
  const t=new Triggers('on'),idle=drive(),flat=drive();idle.rpm=.1;idle.speed=2;flat.rpm=.95;flat.speed=80;
  const sum=d=>strengths(t.update(d,dt).right).reduce((a,b)=>a+b);
  assert(sum(flat)>sum(idle));
});
test('A locked tyre makes the brake trigger judder at speed but not at a crawl',()=>{
  const d=drive();d.tyres.locked[0]=1;
  const {left}=new Triggers('on').update(d,dt);
  assert.equal(left[0],0x26);assert.equal(left[9],30);
  d.speed=2;assert.equal(new Triggers('on').update(d,dt).left[0],0x21);
});
test('Wheelspin and the rev limiter buzz the throttle trigger',()=>{
  const spin=drive();Object.assign(spin,{throttle:1,wheelspin:1});
  assert.equal(new Triggers('on').update(spin,dt).right[9],25);
  const limiter=drive();Object.assign(limiter,{throttle:1,rpm:1});
  assert.equal(new Triggers('on').update(limiter,dt).right[9],40);
});
test('A gear change buzzes the throttle trigger briefly, then the spring returns',()=>{
  const t=new Triggers('on'),d=drive();
  t.update(d,dt);d.gear=4;
  assert.equal(t.update(d,dt).right[0],0x26);
  let right;for(let i=0;i<10;i++)right=t.update(d,dt).right;
  assert.equal(right[0],0x21);
});
test('An impact buzzes both triggers',()=>{
  const d=drive();d.hit=1;
  const {left,right}=new Triggers('on').update(d,dt);
  assert.equal(left[0],0x26);assert.deepEqual([...left],[...right]);
});
test('Intensity scales resistance and bad input stays safe',()=>{
  const total=level=>strengths(new Triggers(level).update(drive(),dt).left).reduce((a,b)=>a+b);
  assert(total('light')<total('on'));assert(total('on')<=total('strong'));
  assert.doesNotThrow(()=>new Triggers().update({speed:NaN,rpm:'x',tyres:{locked:[NaN]}},NaN));
  assert.doesNotThrow(()=>new Triggers().update(undefined,dt));
});
