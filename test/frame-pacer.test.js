import test from 'node:test';
import assert from 'node:assert/strict';
import {FramePacer} from '../src/frame-pacer.js';

// A vsynced display: a frame is shown on the first refresh after the GPU finishes it.
function drive(pacer,refresh,cost,seconds=90){
  let seed=11,time=0,changes=0,lastChange=0;const tail=[];
  const noise=()=>(seed=(seed*16807)%2147483647)/2147483647;
  while(time<seconds){
    const gpu=cost*pacer.scale**2*(.82+.36*noise());
    const dt=Math.max(pacer.cadence,Math.ceil(gpu/refresh))*refresh;
    time+=dt;if(pacer.add(dt)){changes++;lastChange=time;}
    if(time>seconds-10)tail.push(dt);
  }
  const usual=[...tail].sort((a,b)=>a-b)[Math.floor(tail.length*.2)];
  return {changes,lastChange,uneven:tail.filter(v=>v>usual*1.45).length/tail.length,fps:1/usual};
}

test('A GPU with headroom keeps full resolution at the display rate',()=>{
  const pacer=new FramePacer(.7),run=drive(pacer,1/60,.009);
  assert.equal(pacer.scale,1);assert.equal(pacer.cadence,1);assert.equal(run.changes,0);
});

test('A 60 Hz display that misses refreshes trades resolution for even frames',()=>{
  const pacer=new FramePacer(.6),run=drive(pacer,1/60,.021);
  assert(pacer.scale<1&&pacer.scale>=.6);assert.equal(pacer.cadence,1);
  assert(run.uneven<.08,'uneven '+run.uneven);assert(Math.abs(run.fps-60)<1);
});

test('A 120 Hz display that cannot be held settles on an even 60 at full resolution',()=>{
  const pacer=new FramePacer(.7),run=drive(pacer,1/120,.0099,150);
  assert.equal(pacer.cadence,2);assert.equal(pacer.scale,1);
  assert(run.uneven<.02,'uneven '+run.uneven);assert(Math.abs(run.fps-60)<1);
  assert(run.lastChange<110,'still hunting at '+run.lastChange);
});

test('A 120 Hz display within reach is held by a small resolution step',()=>{
  const pacer=new FramePacer(.7),run=drive(pacer,1/120,.0078);
  assert.equal(pacer.cadence,1);assert(pacer.scale>=.8&&pacer.scale<1);
  assert(run.uneven<.08,'uneven '+run.uneven);assert(Math.abs(run.fps-120)<2);
});

test('A renderer far below the display rate drops to its floor and stays there',()=>{
  const pacer=new FramePacer(.5),run=drive(pacer,1/60,.2,60);
  assert.equal(pacer.scale,.5);assert.equal(pacer.cadence,1);assert(run.lastChange<20);
});

test('A pause does not count as slow frames',()=>{
  const pacer=new FramePacer(.6);
  for(let i=0;i<400;i++)pacer.add(1/60);
  for(let i=0;i<30;i++){pacer.add(4);pacer.add(0);for(let j=0;j<20;j++)pacer.add(1/60);}
  assert.equal(pacer.scale,1);
});
test('A known 120 Hz panel recovers from a steady 60 fps GPU bottleneck at lower resolution',()=>{
  const p=new FramePacer(.6,1/120),run=drive(p,1/120,.010,120);
  assert.equal(p.cadence,1);assert.equal(Math.round(run.fps),120);assert(p.scale<1);
  assert(run.uneven<.08,'uneven '+run.uneven);
});
