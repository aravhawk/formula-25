import {contain,resolveField} from './contact.js';
import {Drive} from './physics.js';
import {RB21,DRIVER,clamp,mod,points} from './data.js';
import {paceProfile} from './pace.js';
export const STEP=1/120;
const compounds=['MEDIUM','HARD','SOFT'];
export const tyreColor={MEDIUM:'#ffcd37',HARD:'#efefed',SOFT:'#ff4949'};
export function setupCircuit(track,event){
  track.width=event.round===8?4.9:['city','strip','harbour'].includes(event.land)?6:7.0;
  track.barrier=track.width+(['city','strip','harbour','coast'].includes(event.land)?1.1:5.3);
  track.event=event;
  const street=['city','coast','strip','harbour','island'].includes(event.land);
  const frames=track.frames;
  for(let i=0;i<frames.length;i++){
    const f=frames[i],s=i*track.step;
    if(event.round===15){
      const bank=(center,spread,angle)=>angle*Math.exp(-.5*((s-center)/spread)**2);
      f.bank+=bank(840,40,-.23)+bank(3780,109,.28);
    }
    const curvature=frames[(frames.length+i-9)%frames.length].curvature;
    for(const side of [-1,1]){
      let extra=street?0:clamp(-side*curvature*1100,0,28);
      // Leave clearance where two sections of the circuit pass close together.
      for(let j=0;extra>0&&j<frames.length;j+=6){
        const gap=Math.abs(j-i)*track.step;
        if(Math.min(gap,track.length-gap)<95)continue;
        const p=track.points[i],q=track.points[j],dist=Math.hypot(q[0]-p[0],q[2]-p[2]);
        if(dist<2*(extra+track.barrier+4))extra=Math.max(0,dist*.5-track.barrier-4);
      }
      f[side>0?'rightWall':'leftWall']=track.barrier+extra;
    }
  }

  // Taper the outer pit rail into the shared boundary before entry and exit.
  for(let i=0;i<frames.length;i++){
    const s=mod(i*track.step+320,track.length),blend=clamp(Math.min(s/45,(510-s)/45),0,1);
    frames[i].pitApron=pitStrip(i*track.step,track.length);
    frames[i].rightWall+=(track.width+7.6-frames[i].rightWall)*blend;
  }
  // On the inside of a bend a rail must stay short of the centre of curvature, or it folds across itself.
  for(let i=0;i<frames.length;i++)for(const side of [-1,1]){
    let inside=0;
    for(let j=-3;j<=3;j++)inside=Math.max(inside,side*frames[mod(i+j,frames.length)].curvature);
    const key=side>0?'rightWall':'leftWall';
    if(inside>0)frames[i][key]=Math.min(frames[i][key],Math.max(track.barrier,.74/inside));
  }
  // A rail closes in on the road at no more than 24 degrees, so a car sliding along it meets a taper, not a step.
  const taper=track.step*.45,count=frames.length;
  for(const key of ['leftWall','rightWall'])for(let pass=0;pass<2;pass++){
    // Distance along the rail shrinks on the inside of a bend and grows on the outside.
    const side=key==='leftWall'?-1:1,run=i=>taper*clamp(1-side*frames[i].curvature*frames[i][key],.25,1.5);
    for(let i=0;i<count;i++)frames[i][key]=Math.min(frames[i][key],frames[mod(i-1,count)][key]+run(i));
    for(let i=count-1;i>=0;i--)frames[i][key]=Math.min(frames[i][key],frames[(i+1)%count][key]+run(i));
  }
  // Round the remaining corners of each rail so a car sliding along it follows a curve.
  for(const key of ['leftWall','rightWall'])for(let pass=0;pass<3;pass++){
    const before=frames.map(f=>f[key]);
    for(let i=0;i<count;i++)frames[i][key]=(before[mod(i-1,count)]+2*before[i]+before[(i+1)%count])/4;
  }
  for(let i=0;i<frames.length;i++){
    let minimum=Infinity;
    for(let j=-2;j<=2;j++){const f=frames[mod(i+j,frames.length)];minimum=Math.min(minimum,f.leftWall,f.rightWall);}
    frames[i].clearance=minimum;
  }
  track.rails={};
  for(const [key,side] of [['left',-1],['right',1]]){
    track.rails[key]=frames.map((f,i)=>{
      const offset=side*f[key+'Wall'],p=track.points[i];
      return {x:p[0]+Math.cos(f.yaw)*offset,z:p[2]+Math.sin(f.yaw)*offset};
    });
  }
  return track;
}
export function inZone(distance,zone,length){
  const span=zone[1]-zone[0];
  return mod(distance-zone[0],length)<span;
}
export const pitStrip=(d,l)=>inZone(d,[-270,145],l);
export class GrandPrix{
  constructor(track,event,laps=3,difficulty='race',gridSlot=9){
    this.track=track;this.event=event;this.laps=laps;this.difficulty=difficulty;
    this.pace=paceProfile(track,RB21);this.clock=0;this.state='grid';this.lights=0;this.startDelay=4.45;
    this.player=new Drive(track,RB21);
    this.players=event.grid.filter(x=>x.id!=='VER').map(x=>({...x}));
    this.players.splice(clamp(gridSlot,0,19),0,this.player);
    Object.assign(this.player,{id:DRIVER.id,name:DRIVER.name,team:DRIVER.team});
    this.players.forEach((c,i)=>{
      Object.assign(c,{distance:-8*(i+1),offset:(i%2?1:-1)*2.45,speed:0,slot:i,wear:0,tyre:'MEDIUM',stops:0,
        pit:null,lapTimes:[],used:new Set(['MEDIUM']),lapStart:0,completed:0,finishTime:null,
        paceScale:(difficulty==='expert'?1.02:difficulty==='rookie'?.83:.93)-i*.0025+.008*Math.sin(i*13+event.round),
        reaction:.16+i*.027,targetLane:(i%2?1:-1)*2.45,targetSpeed:0,pitLap:Math.max(1,Math.round(laps*(.42+.11*Math.sin(i*3))))});
    });
    this.ai=this.players.filter(c=>c!==this.player);
    this.order=this.players.slice();this.sector=1;this.sectorTime=0;this.bestSectors=[Infinity,Infinity,Infinity];
    this.drsReady=false;this.nextTyre='HARD';this.message='';this.messageUntil=0;this.raceTime=0;this.tactics=0;
  }
  say(text,seconds=2){this.message=text;this.messageUntil=this.clock+seconds;}
  requestPit(){
    const d=this.player;if(d.pit||this.state!=='race')return;
    d.requested=!d.requested;this.say(d.requested?'Box this lap · '+this.nextTyre:'Pit call cancelled');
  }
  pickTyre(){if(!this.player.pit){this.nextTyre=compounds[(compounds.indexOf(this.nextTyre)+1)%3];this.say('Next set · '+this.nextTyre);}}
  gap(a,b){return mod(b.distance-a.distance,this.track.length);}
  standings(){return this.order;}
  decide(){
    this.order.sort((a,b)=>b.distance-a.distance||a.slot-b.slot);
    const L=this.track.length,d=this.player;
    // Sideways speed of every car, so a rival can tell when a slower car is drifting into its path.
    for(const car of this.players){
      const course=car.heading||0,body=course+(car.bodyYaw||0),sign=car.reverse?-1:1;
      car.trackSpeed=sign*car.speed*Math.cos(course);
      car.drift=car===d?sign*car.speed*Math.sin(course):(car.laneVelocity||0);
      car.halfWidth=Math.abs(Math.cos(body))+2.55*Math.abs(Math.sin(body));
      car.halfLength=2.55*Math.abs(Math.cos(body))+Math.abs(Math.sin(body));
    }
    for(const car of this.players){
      if(car.pit||(car===d&&car.finishTime!==null))continue;
      let ahead=null,gap=Infinity,aligned=null,clear=Infinity,aheadLow=0,aheadHigh=0,trafficLimit=Infinity;
      for(const other of this.players){
        if(other===car)continue;
        const g=this.gap(car,other);
        // Where the other car will be, sideways, by the time this one reaches it.
        const closing=car.trackSpeed-other.trackSpeed;
        const room=g-car.halfLength-other.halfLength;
        const reach=car!==d&&g<180?clamp(room/Math.max(4,closing),0,1.3):0;
        const future=other.offset+other.drift*reach;
        const low=Math.min(other.offset,future)-other.halfWidth,high=Math.max(other.offset,future)+other.halfWidth;
        if(g<gap){ahead=other;gap=g;aheadLow=low;aheadHigh=high;}
        const ownFuture=car.offset+clamp((car.targetLane??car.offset)-car.offset,-3*reach,3*reach);
        if(Math.max(car.offset,ownFuture)<low-1.25||Math.min(car.offset,ownFuture)>high+1.25)continue;
        if(g<clear){aligned=other;clear=g;}
        if(car===d||g>=180)continue;
        // Reserve the distance used while the driver reacts and the leader brakes.
        const safeRoom=Math.max(0,room-1.2-Math.max(0,closing)*.32);
        const lead=Math.max(0,other.trackSpeed+clamp(other.longitudinalG||0,-4,0)*9.81*.36);
        trafficLimit=Math.min(trafficLimit,Math.sqrt(lead*lead+28*safeRoom));
      }
      if(car===d){
        this.intervalAhead=ahead?gap/Math.max(d.speed,12):Infinity;
        d.tow=aligned?clamp(1-clear/70,0,1)*clamp((aligned.speed-18)/32,0,1):0;
        const zone=this.track.zones.find(z=>inZone(d.distance,z,L));
        if(!zone)this.drsReady=false;
        else if(this.drsZone!==zone)this.drsReady=d.completed>=1&&this.intervalAhead<=1;
        this.drsZone=zone;
        continue;
      }
      const f=this.track.at(car.distance+car.speed*.32);
      let lane=car.distance<100?(car.slot%2?1:-1)*2.45:f.line+Math.sin(car.slot*8.4)*.37;
      const maxLane=this.track.width-1.28;
      // After the flag a rival slows to a cool-down lap and still drives round the cars it meets.
      let target=this.pace(car.distance+car.speed*.23)*car.paceScale*(1-car.wear*.16)*(1-.12*(car.damage||0))*(car.finishTime!==null?.62:1);
      // A much slower car ahead is seen from further back, in time to go round it or stop.
      if(ahead&&gap<Math.max(17,car.speed*.73,(car.speed-ahead.speed)*1.7)&&car.distance>45){
        const left=aheadLow-1.65,right=aheadHigh+1.65;
        const open=x=>Math.abs(x)<maxLane&&!this.players.some(o=>o!==car&&o!==ahead&&!o.pit&&Math.abs(o.offset-x)<2.2&&
          Math.abs(mod(o.distance-car.distance+L/2,L)-L/2)<7);
        const preferRight=car.offset>=(aheadLow+aheadHigh)/2;
        if(open(preferRight?right:left))lane=preferRight?right:left;
        else if(open(preferRight?left:right))lane=preferRight?left:right;
      }
      if(aligned&&clear<5.7+car.speed*.31)target=Math.min(target,Math.max(0,aligned.speed+(clear-5.8)*1.7));
      target=Math.min(target,trafficLimit);
      car.targetSpeed=target;car.targetLane=clamp(lane,-maxLane,maxLane);
    }
  }
  pitStep(car,dt){
    const L=this.track.length,isPlayer=car===this.player;
    const station=mod(car.distance,L);
    if(!car.pit){
      const scheduled=!isPlayer&&!this.event.sprint&&this.laps>=10&&(car.completed>=car.pitLap-1&&car.stops===0||
        this.event.round===8&&car.completed>=Math.floor(this.laps*.72)&&car.stops===1);
      if(car.reverse||car.distance<0||station<L-265||station>L-222||!(car.requested||scheduled))return false;
      // Give each constructor a pit box along the apron. Team-mates queue
      // in the same lane while other teams can complete their service.
      const teamBox=[...new Set(this.event.grid.map(c=>c.team))].indexOf(car.team);
      car.pit={entry:car.distance,stopAt:135+teamBox*12,hold:0,serviced:false,compound:isPlayer?this.nextTyre:car.tyre==='MEDIUM'?'HARD':'MEDIUM'};
      car.requested=false;if(isPlayer){car.drs=false;car.boost=false;this.say('Pit limiter · crew ready');}
    }
    const pit=car.pit,progress=car.distance-pit.entry,advance=dt*2.8;
    const lane=this.track.width+2.55;
    car.offset+=(lane*clamp(progress/65,0,1)*clamp((404-progress)/92,0,1)-car.offset)*Math.min(1,advance);
    if(progress>=pit.stopAt&&!pit.serviced){
      car.speed=0;pit.hold+=dt;
      if(pit.hold>=2.55+(car.slot%4)*.09+(car.damage||0)*4){car.wear=0;car.damage=0;car.tyres?.reset();car.tyre=pit.compound;car.stops++;car.used.add(car.tyre);pit.serviced=true;
        if(isPlayer){this.nextTyre=car.tyre==='HARD'?'MEDIUM':'HARD';this.say('Go · '+car.tyre+' tyres');}}
    }else{
      const limit=!pit.serviced?Math.min(22.22,Math.sqrt(Math.max(1,2*15*(pit.stopAt+1-progress)))):22.22;
      car.speed+=clamp(limit-car.speed,-26*dt,9*dt);car.distance+=car.speed*dt;
    }
    if(isPlayer){car.heading*=Math.exp(-dt*5);car.bodyYaw*=Math.exp(-dt*5);car.yawRate=0;car.longitudinalG=0;car.lateralG=0;car.delta=0;car.fyF=car.fyR=0;car.steer=0;car.throttle=0;car.braking=car.speed>22.3?.7:0;
      car.updateGear();car.suspension.step(car,dt);car.elapsed+=dt;}
    if(progress>=404)car.pit=null;
    return true;
  }
  tick(dt,input={}){
    if(this.state==='finished')return;
    this.clock+=dt;
    if(this.state==='grid'){
      const pedal=clamp(Number(input.throttle||0),0,1);
      this.player.throttle+=(pedal-this.player.throttle)*(1-Math.exp(-dt*28));
      this.player.updateGear();
      this.lights=Math.min(5,Math.floor(this.clock/.62));
      if(this.clock>=this.startDelay){this.state='race';this.lights=0;}
      return;
    }
    this.raceTime+=dt;
    const d=this.player,L=this.track.length;
    this.tactics-=dt;if(this.tactics<=0){this.decide();this.tactics=.09;}
    const sectorBefore=this.sector;
    for(const c of this.players){
      c.oldDistance=c.distance;c.oldOffset=c.offset;c.hit=(c.hit||0)*Math.exp(-dt*9);
      c.fieldContact=c.railContact=c.solidContact=false;c.laneVelocity=0;
    }
    for(const car of this.players){
      if(car.finishTime!==null&&car===d){car.distance+=car.speed*dt;continue;}
      if(car.finishTime!==null||!this.pitStep(car,dt)){
        if(car===d){
          d.boost=!d.reverse&&!!input.boost&&d.energy>.003&&d.throttle>.55&&d.braking<.08;
          d.drs=!!input.drs&&this.drsReady&&!input.brake&&d.speed>23;
          d.energy=clamp(d.energy+dt*((d.braking*.050+(1-d.throttle)*.004)-(d.boost?.060:0)),0,1);
          d.step(dt,input);
        }else if(this.raceTime>car.reaction){
          const accel=Math.min(15,775/Math.max(18,car.speed))*(1-(car.speed/99)**3);
          const change=clamp(car.targetSpeed-car.speed,-dt*(16+.0040*car.speed**2),accel*dt);
          car.longitudinalG=change/(dt*9.81);
          car.speed+=change;
          car.distance+=car.speed*dt;
          const maxDrift=Math.min(2.9,car.speed*.32);
          const desiredDrift=clamp((car.targetLane-car.offset)*2.8,-maxDrift,maxDrift);
          car.steerVelocity=(car.steerVelocity||0)+clamp(desiredDrift-(car.steerVelocity||0),-9*dt,9*dt);
          car.steerVelocity=clamp(car.steerVelocity,-maxDrift,maxDrift);
          const next=car.offset+dt*car.steerVelocity;
          const blocked=this.players.some(o=>{
            if(o===car||Math.abs(o.offset-next)>=Math.abs(o.offset-car.offset))return false;
            const gap=mod(o.distance-car.distance+L/2,L)-L/2;
            const future=gap+((o.trackSpeed??o.speed)-car.speed)*.35;
            return Math.min(Math.abs(gap),Math.abs(future),gap*future<=0?0:Infinity)<2.8+(o.halfLength??2.55)&&
              Math.abs(o.offset-next)<1.32+(o.halfWidth??1);
          });
          if(blocked)car.steerVelocity=0;
          else car.offset=next;
        }
      }
      if(car!==d){
        car.laneVelocity=(car.offset-car.oldOffset)/dt;
        // Rival speed is measured along the track. Face the resultant path during a pass.
        const yaw=Math.atan2(car.laneVelocity,Math.max(4,car.speed));
        car.bodyYaw=(car.bodyYaw||0)+(yaw-(car.bodyYaw||0))*(1-Math.exp(-dt*10));
      }
      // Hold the car inside its own rail first, so its nose cannot reach a neighbouring section's barrier through it.
      contain(this.track,car,dt);
      if(this.solids?.resolve(this.track,car))contain(this.track,car,dt);
    }
    resolveField(this,dt);
    for(const car of this.players){
      if(car.finishTime!==null)continue;
      const old=car.oldDistance;
      car.wear=clamp(car.wear+Math.max(0,car.distance-old)/L*(car.tyre==='HARD'?.015:car.tyre==='SOFT'?.039:.024),0,1);
      const lap=Math.floor(car.distance/L);
      if(lap>car.completed){
        const cross=this.raceTime-dt*(car.distance-lap*L)/Math.max(.0001,car.distance-old);
        car.lapTimes.push(cross-car.lapStart);car.lapStart=cross;car.completed=lap;
        if(lap>=this.laps||this.chequered){
          this.chequered=true;car.finishTime=cross;
          if(car===d)this.state='finished';
        }
      }
    }
    const s=mod(d.distance,L);
    this.sector=d.distance<0?1:s<this.track.sectors[0]?1:s<this.track.sectors[1]?2:3;
    if(d.distance>0&&sectorBefore!==this.sector){
      const split=this.raceTime-this.sectorTime;this.sectorTime=this.raceTime;
      this.bestSectors[sectorBefore-1]=Math.min(this.bestSectors[sectorBefore-1],split);
      this.say('S'+sectorBefore+'   '+split.toFixed(3),2);
    }
    if(this.state==='finished')this.decide();
  }
  settle(){
    if(this.state!=='finished')return;
    this.state='classifying';
    // Run the back markers to their next flag, then apply sporting penalties.
    for(let i=0;i<12000&&this.ai.some(c=>c.finishTime===null);i++)this.tick(1/30);
    this.state='finished';
    this.order=this.classification().map(row=>this.players.find(c=>c.id===row.id));
  }
  classification(){
    // Timed classification at the player's flag. Full-distance races enforce compound changes.
    const full=!this.event.sprint&&this.laps===this.event.laps;
    const result=this.players.map(c=>{
      const required=this.event.round===8?2:1;
      const penalty=full&&(c.used.size<2||c.stops<required)?30:0;
      const time=(c.finishTime??(this.raceTime+Math.max(0,this.laps*this.track.length-c.distance)/Math.max(28,c.speed)))+penalty;
      return {id:c.id,name:c.name,team:c.team,time,penalty,laps:c.completed,atFlag:c.finishTime!==null,distance:c.distance};
    });
    result.sort((a,b)=>b.laps-a.laps||a.time-b.time||b.distance-a.distance);
    return result.map((c,i)=>({...c,position:i+1,points:this.event.sprint?Math.max(0,8-i):(points[i]||0)}));
  }
}

export function qualifyingSlot(grid,times,lap){
  const rivals=grid.filter(driver=>driver.id!==DRIVER.code)
    .map(driver=>times?.[driver.id]).filter(Number.isFinite);
  if(!rivals.length||!Number.isFinite(lap))return null;
  return rivals.filter(time=>time<lap).length;
}

export class FlyingLap extends GrandPrix{
  constructor(track,event){
    super(track,event,1);
    this.qualifying=true;this.players=[this.player];this.order=[this.player];this.ai=[];this.state='race';
    Object.assign(this.player,{distance:0,offset:track.frames[0].line,speed:this.pace(0),tyre:'SOFT'});
    this.player.updateGear();
  }
  decide(){this.drsReady=this.track.zones.some(zone=>inZone(this.player.distance,zone,this.track.length));}
  settle(){}
  requestPit(){this.say('Flying lap in progress');}
}
