import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,crc32,dualsense,effects} from '../src/dualsense.js';
test('CRC-32 matches the standard check value',()=>{assert.equal(crc32(new TextEncoder().encode('123456789')),0xCBF43926);});
const force=e=>e[3]+e[4]*2**8+e[5]*2**16+e[6]*2**24;
const zone=(e,i)=>Math.floor(force(e)/2**(3*i))&7;
test('Resistance packs one active bit and one three-bit strength per zone',()=>{
  const e=effects.resistance([0,0,5,5,5,5,5,5,5,5]);
  assert.equal(e.length,11);assert.equal(e[0],0x21);
  assert.equal(e[1]|e[2]<<8,0b1111111100);
  for(let i=0;i<10;i++)assert.equal(zone(e,i),i>=2?4:0);
});
test('A ramp keeps its own strength in each zone',()=>{
  const e=effects.resistance([1,2,3,4,5,6,7,8,8,8]);
  assert.equal(e[1]|e[2]<<8,0x3ff);
  assert.deepEqual(Array.from({length:10},(_,i)=>zone(e,i)+1),[1,2,3,4,5,6,7,8,8,8]);
});
test('Vibration buzzes every zone and carries its frequency',()=>{
  const e=effects.vibration(6,40);
  assert.equal(e[0],0x26);assert.equal(e[1]|e[2]<<8,0x3ff);assert.equal(e[9],40);assert.equal(zone(e,0),5);
});
test('Zero strength, zero frequency or no zones turn the effect off',()=>{
  const off=[...effects.off()];
  assert.deepEqual([...effects.vibration(0,40)],off);
  assert.deepEqual([...effects.vibration(5,0)],off);
  assert.deepEqual([...effects.resistance(new Array(10).fill(0))],off);
  assert.equal(effects.off()[0],0x05);
});
test('Out of range values are clamped, not wrapped',()=>{
  assert.equal(zone(effects.resistance([99]),0),7);
  assert.equal(effects.vibration(3,9999)[9],255);
  assert.equal(effects.resistance([NaN])[0],0x05);
});
test('A USB report carries rumble and both trigger effects after the report id',()=>{
  const left=effects.resistance([4,4,4,4,4,4,4,4,4,4]),right=effects.vibration(5,25);
  const {id,data}=buildReport({transport:'usb',strong:1,weak:.5,left,right});
  assert.equal(id,0x02);assert.equal(data.length,62);
  assert.equal(data[0],0x0f);assert.equal(data[2],128);assert.equal(data[3],255);assert.equal(data[38],0x04);
  assert.deepEqual([...data.slice(10,21)],[...right]);assert.deepEqual([...data.slice(21,32)],[...left]);
});
test('Trigger flags stay clear when the effects are unchanged',()=>{
  assert.equal(buildReport({triggers:false}).data[0],0x03);
});
test('A Bluetooth report has a sequence tag, the same payload and a valid CRC over the 0xA2 seed',()=>{
  const left=effects.resistance([4,4,4,4,4,4,4,4,4,4]),right=effects.off();
  const {id,data}=buildReport({transport:'bluetooth',seq:5,strong:.2,left,right});
  assert.equal(id,0x31);assert.equal(data.length,77);
  assert.equal(data[0],0x50);assert.equal(data[1],0x10);
  assert.equal(data[2],0x0f);assert.deepEqual([...data.slice(2+21,2+32)],[...left]);
  const signed=Uint8Array.from([0xa2,0x31,...data.slice(0,73)]);
  assert.equal(new DataView(data.buffer).getUint32(73,true),crc32(signed));
  assert.equal(buildReport({transport:'bluetooth',seq:21}).data[0],0x50);
});
test('Without WebHID the connection reports unsupported and sends nothing',()=>{
  assert.equal(dualsense.supported,false);assert.equal(dualsense.ready,false);
  assert.doesNotThrow(()=>dualsense.send({strong:1}));
});
const fake=(bluetooth,sent)=>({opened:false,collections:[{outputReports:[{reportId:bluetooth?0x31:0x02}]}],
  async open(){this.opened=true;},receiveFeatureReport:async id=>{sent.push(['feature',id]);},
  sendReport:(id,data)=>new Promise(resolve=>{sent.push([id,data]);setTimeout(resolve,5);})});
test('A Bluetooth pad is detected from its output report and woken with the calibration report',async()=>{
  const sent=[],device=fake(true,sent);await dualsense.open(device);
  assert.equal(dualsense.transport,'bluetooth');assert.deepEqual(sent,[['feature',0x05]]);
  assert.equal(dualsense.ready,true);
});
test('A USB pad needs no wake-up and writes are queued so the newest one is never dropped',async()=>{
  const sent=[],device=fake(false,sent);await dualsense.open(device);
  assert.equal(dualsense.transport,'usb');assert.equal(sent.length,0);
  dualsense.send({strong:1},{left:effects.resistance([4])});
  dualsense.send({strong:.5});dualsense.send({});
  assert.equal(sent.length,1);assert.equal(sent[0][0],0x02);
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(sent.length,2);
  const last=sent[1][1];assert.equal(last[3],0);assert.deepEqual([...last.slice(21,32)],[...effects.off()]);assert.equal(last[0]&0x0c,0x0c);
  dualsense.send({});await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(sent[2][1][0],0x03);
  dualsense.device=null;
});
test('The test sequence ends with the triggers released, and a failed write is kept for the settings screen',async()=>{
  const sent=[],device=fake(false,sent);await dualsense.open(device);
  const finished=dualsense.test();
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(sent[0][1][10],0x21);assert.equal(sent[0][1][21],0x21);
  await finished;await new Promise(resolve=>setTimeout(resolve,20));
  const last=sent.at(-1)[1];assert.equal(last[10],0x05);assert.equal(last[21],0x05);
  const warn=console.warn;console.warn=()=>{};
  device.sendReport=()=>Promise.reject(new Error('blocked'));
  dualsense.send({});await new Promise(resolve=>setTimeout(resolve,10));
  console.warn=warn;
  assert.equal(dualsense.error?.message,'blocked');
  dualsense.device=null;dualsense.error=null;
});
