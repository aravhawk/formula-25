import test from 'node:test';
import assert from 'node:assert/strict';
import {activePad,padFamily,padLabels,readPad,rumble,stick} from '../src/gamepad.js';
const pad=({id='Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',mapping='standard',index=0,buttons=17,axes=[0,0,0,0],down={}}={})=>({
  id,mapping,index,connected:true,axes,buttons:Array.from({length:buttons},(_,i)=>({pressed:(down[i]||0)>.5,value:down[i]||0}))
});
const sony='054c-0ce6-DualSense Wireless Controller';
test('Controllers are named by family from the identifiers each browser reports',()=>{
  assert.equal(padFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'),'ps');
  assert.equal(padFamily('DUALSHOCK 4 Wireless Controller Extended Gamepad'),'ps');
  assert.equal(padFamily('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'),'xbox');
  assert.equal(padFamily('Unknown Gamepad'),'xbox');
  assert.equal(padLabels('ps').r2,'R2');assert.equal(padLabels('xbox').r2,'RT');assert.equal(padLabels('ps').south,'✕');
});
test('A standard pad passes analogue triggers, buttons and the left stick straight through',()=>{
  const state=readPad(pad({id:sony,axes:[-.5,.25,0,0],down:{0:1,6:.3,7:.8,13:1}}));
  assert.equal(state.family,'ps');assert.equal(state.buttons[6],.3);assert.equal(state.buttons[7],.8);
  assert.equal(state.buttons[0],1);assert.equal(state.buttons[13],1);assert.equal(state.buttons[1],0);
  assert.equal(state.x,-.5);assert.equal(state.y,.25);
});
test('An unmapped PlayStation pad is reordered, with triggers at rest until their axes first move',()=>{
  const moved=new Set(),axes=[0,0,0,0,0,0,0,0,0,9/7];
  // Raw order is Square, Cross, Circle, Triangle.
  let state=readPad(pad({id:sony,mapping:'',buttons:14,axes,down:{1:1,2:1,9:1}}),moved);
  assert.deepEqual(state.buttons.slice(0,4),[1,1,0,0]);assert.equal(state.buttons[9],1);
  assert.equal(state.buttons[6],0);assert.equal(state.buttons[7],0);assert.deepEqual(state.buttons.slice(12,16),[0,0,0,0]);
  axes[4]=.5;axes[3]=-1;axes[9]=-1;
  state=readPad(pad({id:sony,mapping:'',buttons:14,axes}),moved);
  assert.equal(state.buttons[7],.75);assert.equal(state.buttons[6],0);assert.deepEqual(state.buttons.slice(12,16),[1,0,0,0]);
  axes[4]=0;axes[9]=1/7;
  state=readPad(pad({id:sony,mapping:'',buttons:14,axes}),moved);
  assert.equal(state.buttons[7],.5);assert.deepEqual(state.buttons.slice(12,16),[0,1,0,0]);
});
test('An unmapped Xbox pad reads its triggers and D-pad from axes',()=>{
  const moved=new Set(),axes=[.2,0,-1,0,0,1,0,1];
  const state=readPad(pad({id:'045e-0b13-Xbox Wireless Controller',mapping:'',buttons:11,axes,down:{0:1,7:1,6:1}}),moved);
  assert.equal(state.buttons[6],0);assert.equal(state.buttons[7],1);assert.equal(state.buttons[0],1);
  assert.equal(state.buttons[8],1);assert.equal(state.buttons[9],1);assert.deepEqual(state.buttons.slice(12,16),[0,1,0,0]);
});
test('The pad in use is found on any slot and changes only when another is pressed',()=>{
  const idle=pad({index:1}),other=pad({id:sony,index:3});
  assert.equal(activePad([null,null]),null);
  assert.equal(activePad([null,idle,null,other]).pad,idle);
  const pressed=pad({id:sony,index:3,down:{0:1}});
  assert.equal(activePad([null,idle,null,pressed]).family,'ps');
  assert.equal(activePad([null,pad({index:1,down:{7:1}}),null,pressed]).pad.index,3);
  assert.equal(activePad([null,idle,null,other]).pad.index,3);
  assert.equal(activePad([null,pad({index:1,down:{7:1}}),null,other]).pad.index,1);
  assert.equal(activePad([null,null,null,other]).pad,other);
});
test('Stick drift is ignored and full deflection reaches full lock',()=>{
  assert.equal(stick(.07),0);assert.equal(stick(-.05),0);assert.equal(stick(1),1);assert.equal(stick(-1),-1);
  assert(stick(.1)>0&&stick(.1)<.05);assert(Math.abs(stick(-.5)+.4667)<.001);
});
test('Rumble uses dual-rumble when trigger-rumble is unavailable',()=>{
  for(const effects of [undefined,['dual-rumble']]){
    const calls=[],motor={effects,playEffect:(...args)=>{calls.push(args);return Promise.resolve();}};
    rumble({vibrationActuator:motor},{strong:1.2,weak:.5,left:.8,right:.4});
    assert.equal(calls[0][0],'dual-rumble');assert.deepEqual(calls[0][1],{duration:120,startDelay:0,strongMagnitude:1,weakMagnitude:.5,leftTrigger:.8,rightTrigger:.4});
  }
});
test('Rumble adds trigger motors when the actuator supports them',()=>{
  const calls=[],motor={effects:['dual-rumble','trigger-rumble'],playEffect:(...args)=>{calls.push(args);return Promise.resolve();}};
  rumble({vibrationActuator:motor},{strong:.2,weak:.3,left:.4,right:.6});
  assert.equal(calls[0][0],'trigger-rumble');assert.equal(calls[0][1].leftTrigger,.4);assert.equal(calls[0][1].rightTrigger,.6);
  rumble({vibrationActuator:motor});
});
test('Silence resets the actuator once and not on repeated silent calls',()=>{
  const calls=[],motor={effects:['dual-rumble'],playEffect:(...args)=>{calls.push(['play',...args]);return Promise.resolve();},reset:()=>{calls.push(['reset']);return Promise.resolve();}};
  rumble({vibrationActuator:motor},{strong:.2});
  rumble({vibrationActuator:motor});rumble({vibrationActuator:motor});
  assert.deepEqual(calls.map(call=>call[0]),['play','reset']);
});
