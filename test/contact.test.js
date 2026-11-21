import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Circuit} from '../src/circuit.js';
import {GrandPrix,setupCircuit,STEP} from '../src/racing.js';
import {contain,resolveField,wallLimits} from '../src/contact.js';
import {SceneSolids} from '../src/solids.js';

const load=n=>JSON.parse(readFileSync(new URL('../public/season/'+n+'.json',import.meta.url)));
const events=load('calendar');
function race(round=1){return new GrandPrix(setupCircuit(new Circuit(load(String(round).padStart(2,'0'))),events[round-1]),events[round-1],1);}
function place(car,distance,offset,speed){
  Object.assign(car,{distance,oldDistance:distance,offset,oldOffset:offset,speed,heading:0});
  return car;
}
test('A high speed nose-to-tail hit transfers momentum and stays solid under throttle',()=>{
  const g=race(),p=place(g.player,220,0,89),b=place(g.ai[0],226,0,9);g.players=[p,b];
  const maxGap=()=>b.distance-p.distance;
  for(let i=0;i<120;i++){
    for(const car of g.players){car.oldDistance=car.distance;car.oldOffset=car.offset;car.distance+=car.speed*STEP;}
    p.speed+=.05;resolveField(g,STEP);
    assert(maxGap()>5.09);assert.equal(p.offset,0);
  }
  assert(b.speed>35&&p.speed<65);assert(p.damage>.1);
});
test('A swept overtake cannot jump a stopped car even across the lap seam',()=>{
  const g=race(),L=g.track.length,p=place(g.player,L-7,0,94),b=place(g.ai[0],0,0,0);
  g.players=[p,b];p.distance+=14;resolveField(g,.15);
  assert(p.distance-L<b.distance-5.09);
});
test('A side impact beside a wall separates both bodies in the available space',()=>{
  const g=race(8),p=place(g.player,500,0,42),b=place(g.ai[0],500,0,43);
  const edge=wallLimits(g.track,b).right;
  b.offset=b.oldOffset=edge;p.oldOffset=edge-2.2;p.offset=edge-1.65;
  g.players=[p,b];resolveField(g,STEP);
  assert(b.offset<=edge+.001);assert(b.offset-p.offset>=1.998);
});
test('Two simultaneous contacts resolve in the same step, including AI to AI and pit traffic',()=>{
  const g=race(),p=place(g.player,491,0,76),a=place(g.ai[0],497,0,48),b=place(g.ai[1],503,0,0);
  p.distance+=3;a.distance+=2.5;b.pit={serviced:false,hold:1};g.players=[p,a,b];resolveField(g,1/24);
  assert(a.distance-p.distance>=5.10);assert(b.distance-a.distance>=5.08);
});
test('Both ends of a yawed RB21 stay inside the pit, street and runoff rails',()=>{
  for(const round of [1,8,13,22]){
    const g=race(round),p=g.player;
    for(const side of [-1,1])for(const d of [-285,-221,0,149,632,1070]){
      place(p,d,side*64,54);p.heading=side*.3;contain(g.track,p,STEP);
      const bounds=wallLimits(g.track,p);assert(p.offset>=bounds.left-.01&&p.offset<=bounds.right+.01);
      assert(p.speed<54);assert.equal(p.wallSide,side);
    }
  }
});
test('Solid trackside geometry blocks the nose at speed and leaves overhead clearance',()=>{
  const g=race(),p=g.player,solids=new SceneSolids(),s=400,f=g.track.at(s);
  solids.box(f.x,f.y+.6,f.z,f.yaw,4,1.2,.18);
  place(p,s-2.55,0,85);assert(solids.resolve(g.track,p));assert(p.speed<5);
  place(p,s,0,84);const over=new SceneSolids();over.box(f.x,f.y+6,f.z,f.yaw,18,.7,4);
  assert(!over.resolve(g.track,p));assert.equal(p.speed,84);
});
test('Each tyre loses grip on grass independently and a damaged wing costs cornering load',()=>{
  const g=race(13),d=place(g.player,1100,0,60);
  d.tyres.update(d,STEP);const road=d.tyres.grip;
  d.offset=g.track.width+.02;d.tyres.update(d,STEP);
  assert(d.tyres.grip<road&&d.tyres.grip>road*.5);
  assert(d.tyres.surfaces.includes('track')&&d.tyres.surfaces.some(s=>s!=='track'));
  // At equal speed and tyre temperature the damaged car reaches a lower yaw limit.
  const steerAtDamage=damage=>{
    const car=race(13).player;place(car,1100,0,75);car.damage=damage;car.steer=1;car.heading=-.15;
    car.step(STEP,{steer:1});return car.yawRate;
  };
  assert(steerAtDamage(.9)<steerAtDamage(0));
});
test('A car cannot cross a thin fixed obstacle between samples',()=>{
  const g=race(),s=700,p=place(g.player,s-8,0,90),f=g.track.at(s),solids=new SceneSolids();
  solids.box(f.x,f.y+.5,f.z,f.yaw,5,1,.12);
  p.distance=s+6;
  assert(solids.resolve(g.track,p));assert(p.distance<s-2.5);assert(p.speed<6);
});
test('The introductory run advances from actual vehicle inputs and works in automatic gears',async()=>{
  const {FirstDrive}=await import('../src/first-drive.js'),{FlyingLap}=await import('../src/racing.js');
  const {track,event}=race(),g=new FlyingLap(track,event),d=g.player,lesson=new FirstDrive();
  d.speed=0;d.gear=1;
  function drive(input,frames){for(let i=0;i<frames;i++){g.tick(STEP,input);lesson.update(d,input);}}
  drive({},30);assert.equal(lesson.stage,0);
  drive({throttle:1},200);assert.equal(lesson.stage,1);
  drive({steer:.4},12);drive({steer:-.4},12);assert.equal(lesson.stage,2);
  drive({brake:1},180);assert.equal(lesson.stage,3);
  drive({throttle:1,boost:true},120);assert.equal(lesson.stage,4);assert(!d.manual);
});
test('A stopped car can reverse off a solid wall and drive away without changing its lap score',()=>{
  const g=race(),p=g.player,t=g.track,s=400,f=t.at(s),solids=new SceneSolids();
  g.state='race';g.players=[p];g.ai=[];g.order=[p];g.solids=solids;
  solids.box(f.x,f.y+.6,f.z,f.yaw,6,1.2,.18);
  place(p,s-2.55,0,50);assert(!p.toggleReverse());solids.resolve(t,p);p.speed=0;
  const hit=p.distance;assert(p.toggleReverse());
  for(let i=0;i<210;i++)g.tick(STEP,{throttle:1});
  assert(p.distance<hit-2.6);assert(p.reverse);assert.equal(p.completed,0);
  assert(!p.toggleReverse());
  for(let i=0;i<75;i++)g.tick(STEP,{brake:1});
  assert(p.toggleReverse());assert(!p.reverse);const at=p.distance;
  for(let i=0;i<45;i++)g.tick(STEP,{throttle:1});
  assert(p.distance>at+.1);
});

test('All four corners clear the visible rail through runoff, hairpins and the timing seam at any yaw',()=>{
  for(const [round,stations] of [[2,[2333]],[8,[0,1450,2076,2725]],[9,[3448]],[16,[895]]]){
    const t=race(round).track;
    for(const station of stations)for(const side of [-1,1])for(let turn=0;turn<24;turn++){
      const yaw=turn*Math.PI/12,sin=Math.sin(yaw),cos=Math.cos(yaw);
      const car={distance:station,offset:side*70,speed:0,heading:yaw};
      contain(t,car);
      const f=t.at(station),i=Math.floor(station/t.step);
      for(const length of [-2.35,2.75])for(const width of [-1,1]){
        const fore=length*cos-width*sin,lateral=length*sin+width*cos+car.offset;
        const x=f.x+fore*f.nz+lateral*f.nx,z=f.z-fore*f.nx+lateral*f.nz;
        let crossed=false;
        for(let k=i-6;k<i+7;k++){
          const rail=s=>t.position(s,side*t.wallAt(s,side));
          const a=rail(k*t.step),b=rail((k+1)*t.step);
          const ax=(a[0]-x)*f.nz-(a[2]-z)*f.nx,bx=(b[0]-x)*f.nz-(b[2]-z)*f.nx;
          if(ax>0||bx<0||bx<=ax)continue;
          const u=-ax/(bx-ax),gap=(a[0]+u*(b[0]-a[0])-x)*f.nx+(a[2]+u*(b[2]-a[2])-z)*f.nz;
          assert(side*gap>=.06,`corner through rail in round ${round}, station ${station}, yaw ${yaw}`);
          crossed=true;break;
        }
        assert(crossed);
      }
    }
  }
});
test('Contact while reversing preserves the chassis and the direction of the post-impact velocity',()=>{
  const g=race(),p=place(g.player,100,0,4),b=place(g.ai[0],94.90,0,0);
  p.reverse=true;p.distance-=.02;g.players=[p,b];resolveField(g,STEP);
  assert(p.speed<4&&p.speed>0);assert(Math.cos(p.heading)>.95);
  assert(Math.cos(p.heading+p.bodyYaw)>.95);
});
test('A rival brakes before a sideways car moving back onto its line',()=>{
  const g=race(11),p=place(g.player,540,-5,28),ai=place(g.ai[0],510,-2,49);
  Object.assign(p,{heading:.2,bodyYaw:.8});ai.targetLane=-3;
  g.players=[ai,p];g.ai=[ai];g.decide();assert(ai.targetSpeed<38);
});
