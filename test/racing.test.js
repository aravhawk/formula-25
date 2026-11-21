import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Circuit} from '../src/circuit.js';
import {GrandPrix,STEP,setupCircuit} from '../src/racing.js';
import {control} from './driver.js';
const json=name=>JSON.parse(readFileSync(new URL('../public/season/'+name+'.json',import.meta.url)));
const events=json('calendar');
function create(e,laps=1){return new GrandPrix(setupCircuit(new Circuit(json(String(e.round).padStart(2,'0'))),e),e,laps);}
test('Season has 24 different 2025 tracks and complete rosters',()=>{
 assert.equal(events.length,24);assert.equal(new Set(events.map(e=>e.circuit)).size,24);
 for(const e of events){
  const t=create(e).track;assert.equal(e.grid.length,20);assert.equal(new Set(e.grid.map(c=>c.id)).size,20);
  assert.equal(t.length,e.length);assert(t.zones.length);assert(t.sectors[1]>t.sectors[0]);
  assert.deepEqual(t.position(0),t.position(t.length));assert(Math.max(...t.frames.map(f=>Math.abs(f.grade)))<.43);
 }
});
for(const e of events)test('Classified race at '+e.city,()=>{
 const g=create(e);for(let i=0;i<STEP**-1*350&&g.state!=='finished';i++)g.tick(STEP,control(g));
 assert.equal(g.state,'finished');g.settle();assert(g.ai.every(c=>c.finishTime!==null));
 const results=g.classification();assert.equal(results.length,20);assert.equal(results.reduce((s,c)=>s+c.points,0),101);
 assert.equal(g.player.completed,1);assert(g.player.lapTimes[0]>50);
});
test('Pit service, DRS eligibility, ERS and paddles change the car state',()=>{
 const g=create(events[0],3),d=g.player;g.state='race';d.distance=g.track.length-260;d.speed=42;
 g.requestPit();for(let i=0;i<120*45&&(!d.stops||d.pit);i++)g.tick(STEP,control(g));
 assert.equal(d.tyre,'HARD');assert.equal(d.stops,1);assert.equal(d.pit,null);
 d.completed=1;d.distance=g.track.length+g.track.zones[0][0]+20;d.speed=50;
 g.ai[0].distance=d.distance+24;g.ai[0].offset=-3;g.drsZone=null;g.decide();
 g.tick(STEP,{throttle:1,drs:true});assert(d.drs);
 g.tick(STEP,{brake:1,drs:true});assert(!d.drs);
 for(let i=0;i<100;i++)g.tick(STEP,{boost:true,throttle:1});
 assert(d.energy<1);assert(d.shift(1));assert(d.manual);
});
test('Full-distance Monaco classification counts two pit stops and laps down',()=>{
 const g=create(events[7],78);let called=0;
 for(let i=0;i<420000&&g.state!=='finished';i++){
   if(g.player.completed>=24*(called+1)&&called<2&&!g.player.pit){
     g.nextTyre=called?'SOFT':'HARD';g.requestPit();called++;
   }
   g.tick(1/40,control(g));
 }
 assert.equal(g.state,'finished');g.settle();assert(g.players.every(c=>c.finishTime!==null));
 assert.equal(g.player.stops,2);assert.equal(Math.max(...g.players.map(c=>c.completed)),78);
 assert(g.classification().every(c=>c.penalty===0));
});
test('A solo flying lap produces one valid qualifying time',async()=>{
 const {FlyingLap}=await import('../src/racing.js');const prep=create(events[11]);const g=new FlyingLap(prep.track,prep.event);
 for(let i=0;i<25000&&g.state!=='finished';i++)g.tick(STEP,control(g));
 assert.equal(g.player.lapTimes.length,1);assert.equal(g.state,'finished');assert.equal(g.ai.length,0);
});
test('Championship awards points across rounds and breaks ties by countback',async()=>{
 const {championshipTable}=await import('../src/championship.js');
 const race=(points,pos)=>({rows:[{id:'YOU',name:'You',team:'red_bull',points:points[0],position:pos[0]},
   {id:'NOR',name:'Lando Norris',team:'mclaren',points:points[1],position:pos[1]}]});
 const rows=championshipTable([race([25,18],[1,2]),race([8,15],[6,3])]);
 assert.equal(rows[0].id,'YOU');assert.equal(rows[0].points,33);
});
test('Six sprint weekends use real 20-car grids, sprint points and free tyre choice',()=>{
 const sprints=json('sprints');assert.equal(Object.keys(sprints).length,6);
 for(const [rnd,s] of Object.entries(sprints)){
   const e=events[rnd-1],event={...e,sprint:true,laps:s.laps,grid:s.grid.map(code=>e.grid.find(d=>d.id===code))};
   assert.equal(new Set(event.grid.map(d=>d.id)).size,20);
   const prep=create(e),game=new GrandPrix(prep.track,event,s.laps,'race',s.grid.indexOf('VER'));
   const rows=game.classification();assert.equal(rows.reduce((v,r)=>v+r.points,0),36);assert(rows.every(r=>r.penalty===0));
   assert.equal(game.player.slot,s.grid.indexOf('VER'));
 }
});
test('Geographic terrain, mapped structures and measured pace cover every venue',()=>{
  for(const e of events){
    const id=String(e.round).padStart(2,'0'),src=json(id),buildings=json('buildings-'+id);
    assert.equal(src.line.length,src.points.length);assert.equal(src.speed.length,src.points.length);
    assert(src.line.every(v=>Number.isFinite(v)&&Math.abs(v)<5));
    assert(src.speed.every(v=>v>15&&v<380));assert(buildings.length>0);
    assert.equal(src.terrain.heights.length,src.terrain.rows*src.terrain.columns);
    assert(src.terrain.heights.every(Number.isFinite));
    const track=create(e).track;
    assert.equal(track.referenceTime(0),0);
    assert(Math.abs(track.referenceTime(track.length)-e.reference)<.001);
    assert(track.referenceMs.every((value,i,ms)=>Number.isFinite(value)&&(!i||value>=ms[i-1])));
    const boundary=track.at(track.length-1e-5),start=track.at(0);
    for(const key of ['leftWall','rightWall','line'])assert(Math.abs(boundary[key]-start[key])<.001);
  }
});
test('Eight-speed ratios, aerodynamic braking and tow affect the driven RB21',()=>{
  const race=create(events[0]),driver=race.player;
  driver.speed=300/3.6;driver.gear=8;driver.manual=true;driver.updateGear();
  assert(Math.abs(driver.engineRPM-10632)<2);
  const acceleration=(speed,brake,tow)=>{
    driver.distance=0;driver.gear=8;driver.speed=speed;driver.shiftCut=0;driver.updateGear();driver.offset=0;driver.heading=0;driver.throttle=+!brake;driver.braking=+brake;
    driver.tow=tow;driver.suspension.verticalG=0;driver.step(STEP,{throttle:+!brake,brake:+brake});
    return driver.longitudinalG;
  };
  assert(acceleration(82,true,0)<-4.3);assert(acceleration(30,true,0)>-3.3);
  assert(acceleration(80,false,.9)>acceleration(80,false,0));
});
