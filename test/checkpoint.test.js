import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {GrandPrix,FlyingLap,setupCircuit,STEP} from '../src/racing.js';
import {Circuit} from '../src/circuit.js';
import {captureGame,restoreGame,validateCheckpoint} from '../src/checkpoint.js';
import {RaceStore,SaveConflict} from '../src/save-store.js';
import {recordResult} from '../src/championship.js';
import {SessionSaves,loadRace} from '../src/session-saves.js';

const json=name=>JSON.parse(readFileSync(new URL('../public/season/'+name+'.json',import.meta.url)));
const event=json('calendar')[0],track=setupCircuit(new Circuit(json('01')),event);
const drive={throttle:.85,steer:.06,boost:true};
function savedGame(game){
  return {version:1,setup:{round:1,mode:'season',sprint:false,distance:'3',difficulty:'race',kind:'race',gridSlot:2},
    game:captureGame(game),cockpit:{phase:'driving',acc:0,before:{distance:0,offset:0,heading:0},eye:{lateral:0,longitudinal:0,lookIn:0}}};
}
function browser(){
  const database=new IDBFactory(),local=new Map();
  const storage={getItem:key=>local.get(key),setItem:(key,v)=>local.set(key,v),removeItem:key=>local.delete(key)};
  return ()=>new RaceStore(database,()=>storage);
}

test('Recovery of all 20 cars gives identical subsequent physics, timing and race order',async()=>{
  const game=new GrandPrix(track,event,3,'race',2);
  for(let i=0;i<1371;i++)game.tick(STEP,drive);
  const open=browser(),writer=open();
  await writer.commit(null,{owner:'first',sequence:1,snapshot:savedGame(game)});
  const data=validateCheckpoint((await open().load()).snapshot);
  const restored=new GrandPrix(track,event,3,'race',2);
  restoreGame(restored,data.game);
  assert.deepEqual(captureGame(restored),captureGame(game));
  for(let i=0;i<600;i++){game.tick(STEP,drive);restored.tick(STEP,drive);}
  assert.deepEqual(captureGame(restored),captureGame(game));
  assert(restored.order.includes(restored.player));
});

test('Pit service resumes on the same tick and issues its compound once',()=>{
  const game=new GrandPrix(track,event,3);game.state='race';
  game.player.distance=track.length-250;game.player.speed=21;game.requestPit();
  for(let i=0;i<8000&&!(game.player.pit?.hold>.1);i++)game.tick(STEP);
  assert(game.player.pit.hold>.1);
  const resumed=new GrandPrix(track,event,3);restoreGame(resumed,structuredClone(captureGame(game)));
  for(let i=0;i<360;i++){game.tick(STEP);resumed.tick(STEP);}
  assert.equal(resumed.player.stops,1);assert.deepEqual(captureGame(resumed),captureGame(game));
});

test('Final page copy preserves typed arrays, tyre history and infinite sector times',async()=>{
  const open=browser(),store=open(),game=new FlyingLap(track,event);
  await store.commit(null,{owner:'one',sequence:1,snapshot:savedGame(game)});
  game.tick(STEP,drive);game.drsZone=track.zones[0];
  store.finalCopy({owner:'one',sequence:2,snapshot:savedGame(game)});
  const restored=new FlyingLap(track,event);restoreGame(restored,(await open().load()).snapshot.game);
  assert.deepEqual(captureGame(restored),captureGame(game));
  assert.equal(restored.drsZone,track.zones[0]);
  assert.equal(restored.bestSectors[0],Infinity);assert(restored.player.used.has('MEDIUM'));
});

test('Stale writes, discarded sessions and older final copies cannot replace a newer checkpoint',async()=>{
  const open=browser(),writer=open(),other=open();
  const rec=(owner,sequence)=>({owner,sequence,snapshot:{sequence}});
  await writer.commit(null,rec('a',0));
  await writer.commit('a',rec('a',3));await writer.commit('a',rec('a',1));
  writer.finalCopy(rec('a',2));assert.equal((await other.load()).sequence,3);
  await other.commit('a',rec('b',0));
  await assert.rejects(writer.commit('a',rec('a',4)),SaveConflict);
  writer.finalCopy(rec('a',5));assert.equal((await other.load()).owner,'b');
  await other.commit('b',null);assert.equal(await writer.load(),null);
  await assert.rejects(writer.commit('a',rec('a',6)),SaveConflict);
});

test('Mismatched roster and unknown save versions are rejected',()=>{
  const race=new GrandPrix(track,event);const saved=savedGame(race);
  assert.throws(()=>validateCheckpoint({...saved,version:2}));
  saved.game.cars.pop();assert.throws(()=>restoreGame(race,saved.game));
});

test('An unavailable final-copy store leaves the durable checkpoint readable',async()=>{
  const store=new RaceStore(new IDBFactory(),()=>{throw new DOMException('Quota exceeded','QuotaExceededError');});
  await store.commit(null,{owner:'quota',sequence:1,snapshot:{lap:3}});
  store.finalCopy({owner:'quota',sequence:2,snapshot:{lap:4}});
  assert.equal((await store.load()).snapshot.lap,3);
});

test('Rejected standings writes keep the result checkpoint until a successful retry',async t=>{
  const entries=new Map();
  let full=true;
  const local={
    getItem:key=>entries.get(key),
    setItem:(key,value)=>{
      if(full)throw new DOMException('Storage full','QuotaExceededError');
      entries.set(key,value);
    },
    removeItem:key=>entries.delete(key)
  };
  for(const [key,value] of Object.entries({indexedDB:new IDBFactory(),localStorage:local})){
    const prior=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(prior)Object.defineProperty(globalThis,key,prior);else delete globalThis[key];});
  }
  for(const sprint of [true,false]){
    full=true;
    const game=new GrandPrix(track,event),setup=savedGame(game).setup;
    game.state='finished';
    const session={game,phase:'results',before:{distance:0,offset:0,heading:0},acc:0,
      eye:{lateral:0,longitudinal:0,lookIn:0},world:{}};
    const history=[],result={round:1,rows:game.classification(),sprint};
    const first=new SessionSaves(setup,()=>{});
    await first.claim(session,null);
    session.pendingStandings=recordResult(history,result)===null;
    assert(session.pendingStandings);assert.deepEqual(history,[]);
    await first.release(session);
    const kept=await loadRace();
    assert.equal(validateCheckpoint(kept.snapshot).cockpit.phase,'results');
    const resumed=new SessionSaves(setup,()=>{});
    await resumed.claim(session,kept.owner);
    full=false;
    const updated=recordResult(history,result);
    assert.deepEqual(updated,[result]);
    assert.deepEqual(recordResult(updated,result),[result]);
    assert.deepEqual(JSON.parse(local.getItem('formula25.v1.'+(sprint?'sprintResults':'championship'))),[result]);
    session.pendingStandings=false;
    await resumed.release(session);assert.equal(await loadRace(),null);
  }
});

test('An incompatible cockpit or incomplete wheel state cannot enter the race loop',()=>{
  const race=new GrandPrix(track,event),saved=savedGame(race);
  delete saved.cockpit.before;assert.throws(()=>validateCheckpoint(saved));
  const driver=saved.game.cars.find(car=>car.id==='YOU');
  driver.suspension.rotation=new Float64Array(2);
  assert.throws(()=>restoreGame(race,saved.game));
});

test('A completed Sprint preserves its classification and can be acknowledged once',async()=>{
  const venue=json('calendar')[1],sprint=json('sprints')[2];
  const event={...venue,sprint:true,laps:sprint.laps,grid:sprint.grid.map(id=>venue.grid.find(driver=>driver.id===id))};
  const track=setupCircuit(new Circuit(json('02')),event),create=()=>new GrandPrix(track,event,1,'expert',1);
  const game=create();
  game.state='finished';game.chequered=true;
  for(const car of game.players){car.completed=1;car.finishTime=100+car.slot;car.lapTimes=[car.finishTime];}
  game.settle();
  const open=browser(),cached=savedGame(game);
  Object.assign(cached.setup,{round:2,sprint:true,distance:'1',difficulty:'expert',gridSlot:1});
  cached.cockpit.phase='results';
  await open().commit(null,{owner:'sprint',sequence:1,snapshot:cached});
  const saved=validateCheckpoint((await open().load()).snapshot),restored=create();
  restoreGame(restored,saved.game);
  assert.deepEqual(restored.classification(),game.classification());
  assert.equal(restored.classification().reduce((sum,row)=>sum+row.points,0),36);
  await open().commit('sprint',null);assert.equal(await open().load(),null);
});
