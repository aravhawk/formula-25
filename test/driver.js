import {clamp} from '../src/data.js';
import {steerLock,wrap} from '../src/physics.js';
import {lineCurvature} from '../src/pace.js';
const WHEELBASE=3.58,bends=new WeakMap(),stuck=new WeakMap();
// A reference driver for the tests. It follows the racing line and brakes to the pace envelope.
export function control(g,{skill=1,preview=.32,lead=.10,ff=0,brakeGain=2.5,speedLook=.23}={}){
  const d=g.player,t=g.track,v=d.speed,reach=Math.max(6,v*preview),here=t.at(d.distance),ahead=t.at(d.distance+reach);
  if(!bends.has(t))bends.set(t,lineCurvature(t));
  // Stopped against something with the power on: back away, turning the nose toward the road, then drive on.
  const jam=stuck.get(d)||{still:0,backing:0};stuck.set(d,jam);
  if(g.state==='race'&&!d.pit){
    if(d.reverse){
      jam.backing++;
      if(jam.backing>300||(jam.backing>90&&Math.abs(d.heading)<.25)){if(v>.6)return {steer:0,throttle:0,brake:1};d.toggleReverse();jam.backing=0;jam.still=0;}
      else return {steer:clamp(-2*d.heading,-1,1),throttle:1,brake:0};
    }else if(v<.4){if(++jam.still>150&&d.toggleReverse()){jam.still=0;jam.backing=1;}}
    else jam.still=0;
  }
  const curve=bends.get(t),n=curve.length,bend=curve[Math.floor(((d.distance+v*lead)%t.length+t.length)%t.length/t.step)%n];
  // Corner speed follows the grip on offer: compound, wear, and the downforce lost in another car's wake.
  const rubber=(1-.22*(d.wear||0))*(d.tyre==='SOFT'?1:d.tyre==='HARD'?.94:.96);
  let target=g.pace(d.distance+v*speedLook)*skill*(1-.14*(d.damage||0))*Math.sqrt(rubber)*(1-.08*(d.tow||0));
  // Between close walls there is no run-off to use, so leave a margin.
  if(t.frames[Math.floor(((d.distance%t.length)+t.length)%t.length/t.step)%n].clearance<7.5)target*=.95;
  // Hold station behind a car in the way instead of driving into it.
  for(const other of g.players||[]){
    if(other===d||other.pit)continue;
    const gap=((other.distance-d.distance)%t.length+t.length*1.5)%t.length-t.length/2;
    if(gap<=0||gap>Math.max(30,v*1.7))continue;
    const look=clamp((gap-5.1)/Math.max(5,v-other.speed),0,.8);
    const theirOffset=other.offset+(other.laneVelocity||0)*look;
    const ourOffset=d.offset+clamp(ahead.line-d.offset,-3*look,3*look);
    const side=other.offset-d.offset,future=theirOffset-ourOffset;
    if(side*future>0&&Math.min(Math.abs(side),Math.abs(future))>2.5)continue;
    const lead=Math.max(0,other.speed+clamp(other.longitudinalG||0,-5,0)*9.81*.35);
    const room=Math.max(0,gap-7-Math.max(0,v-lead)*.33);
    target=Math.min(target,Math.sqrt(lead*lead+26*room));
  }
  // Course angle, relative to the road, that reaches the line a short way ahead.
  const aim=clamp((ahead.line-d.offset)/reach,-.5,.5);
  let steer;
  // With the assist, the stick asks for a course angle. The road's own curve is already part-followed.
  if(d.assists.steer)steer=(aim+v*(ff*(bend-here.curvature)+.32*here.curvature)/5.8)/(.25+1.4/(1+v*.12));
  else{
    // Direct steering: turn the front wheels for the line's curve, then correct toward the aim.
    const body=wrap(d.heading+d.bodyYaw);
    steer=(Math.atan(WHEELBASE*bend)*(1+v*v*.00035)+1.6*wrap(aim-body)-.10*(d.yawRate-v*bend))/steerLock(d.car,v);
  }
  // After a spin, slow right down and let the car come round to face the road before driving on.
  if(Math.abs(d.heading)>.8||Math.abs(d.bodyYaw)>.45)return {steer:clamp(steer,-1,1),throttle:v<6&&Math.abs(d.bodyYaw)<.45?.45:0,brake:v>9?1:0};
  // Lift when the front tyres are past their peak, as a driver does when the car pushes wide.
  const pushing=Math.abs(d.slipF)>(d.assists.steer?.112:.13);
  // Feed the power in as the corner opens instead of flooring it at the apex.
  const spare=1-Math.abs(d.lateralG)/(d.car.grip+.95*d.car.aero*v*v);
  // Off the road, creep back on part throttle.
  const loose=d.tyres.surfaces.filter(s=>s==='grass'||s==='gravel').length>=2;
  if(loose)return {steer:clamp(steer,-.6,.6),throttle:v<Math.min(target,22)&&!pushing?.4:0,brake:v>target?.5:0};
  return {steer:clamp(steer,-1,1),throttle:v<target&&!pushing?clamp(.15+spare*5,0,1):0,brake:clamp((v-target)/brakeGain,0,1)};
}
