import {clamp} from './data.js';

export const AXLES=[-1.80,1.78],HALF_TRACK=.81,WHEEL_RADIUS=.36;
export const ROAD_HALF=6.6,KERB_WIDTH=.67;
export const hasKerb=(curvature,side)=>curvature*side>.0018||curvature*side<-.006;

// Contact heights relative to the local road plane, in metres.
function roadHeight(s,offset,f,width){
  const edge=Math.abs(offset)-width,side=Math.sign(offset);
  const grain=.0023*Math.sin(.78*s+offset)+.0017*Math.sin(2.61*s-.8*offset);
  if(edge<=0)return grain;
  if(edge<=KERB_WIDTH&&hasKerb(f.curvature,side)){
    const ramp=edge/KERB_WIDTH;
    return ramp*(.073+.016*Math.cos(2*Math.PI*s/.75));
  }
  return -.045+.024*Math.sin(s*1.19+offset*1.8)+.015*Math.sin(s*2.3-offset);
}

export class Suspension {
  constructor(car){
    this.springRate=285;
    this.contacts=new Float64Array(4);this.sprung=new Float64Array(4);this.velocity=new Float64Array(4);
    this.pitch=0;this.roll=0;this.heave=0;this.steerAngle=0;this.rotation=new Float64Array(4);this.flap=0;this.brakeHeat=0;this.verticalG=0;
  }
  impact(side,normalSpeed){
    const impulse=side*Math.min(.65,.11*normalSpeed);
    for(let i=0;i<4;i++)this.velocity[i]+=(i%2===0?1:-1)*impulse;
  }
  step(drive,dt){
    const {circuit,distance,offset,speed,car}=drive,heading=drive.heading+(drive.bodyYaw||0);
    const cosine=Math.cos(heading),sine=Math.sin(heading);
    const front=circuit.at(distance-AXLES[0]*cosine),rear=circuit.at(distance-AXLES[1]*cosine);
    const lateralG=clamp(drive.lateralG||0,-3.5,3.5),longG=clamp(drive.longitudinalG,-2.6,1.6);
    // A compressed hollow adds wheel load, while a crest unloads both axles.
    const wheelbase=AXLES[1]-AXLES[0];
    const verticalG=clamp((front.grade-rear.grade)*cosine*speed*speed/(wheelbase*9.81),-1.2,2.5);
    this.verticalG+=(verticalG-this.verticalG)*(1-Math.exp(-dt*14));
    const downforce=Math.min(.040,car.aero*speed*speed*.012);
    for(let i=0;i<4;i++){
      const axle=i<2?0:1,z=AXLES[axle],side=i%2===0?-1:1,x=side*HALF_TRACK;
      const f=axle===0?front:rear,station=distance-z*cosine-x*sine;
      const wheelOffset=offset-z*sine+x*cosine;
      const road=roadHeight(station,wheelOffset,f,circuit.width);
      // A short tire response filters sharp edges before they reach the damper.
      this.contacts[i]+=(road-this.contacts[i])*(1-Math.exp(-dt*62));
      const target=this.contacts[i]-downforce-verticalG*.022+side*lateralG*.024-z*longG*.024;
      const travel=target-this.sprung[i],v=this.velocity[i];
      const damping=v*travel>=0?18:21;
      this.velocity[i]+=dt*(travel*this.springRate-v*damping);
      this.sprung[i]=clamp(this.sprung[i]+dt*this.velocity[i],-.17,.18);
    }
    const [fl,fr,rl,rr]=this.sprung;
    this.heave=(fl+fr+rl+rr)/4;
    this.pitch=Math.atan2(fl+fr-rl-rr,2*(AXLES[1]-AXLES[0]));
    this.roll=Math.atan2(fr+rr-fl-rl,4*HALF_TRACK);
    this.steerAngle=clamp(drive.delta||0,-.5,.5);
    const beta=drive.bodyYaw||0,along=(drive.reverse?-1:1)*speed*Math.cos(beta),across=-speed*Math.sin(beta);
    for(let wheel=0;wheel<4;wheel++){
      const side=wheel%2?1:-1,steer=wheel<2?this.steerAngle:0;
      const roll=(along-drive.yawRate*side*HALF_TRACK)*Math.cos(steer)+(across-drive.yawRate*AXLES[wheel>>1])*Math.sin(steer);
      const tread=roll*(1-drive.tyres.locked[wheel])+drive.tyres.spinning[wheel]*15;
      this.rotation[wheel]=(this.rotation[wheel]-tread*dt/WHEEL_RADIUS)%(2*Math.PI);
    }
    const heat=drive.braking*Math.min(1,speed/42);
    this.brakeHeat+=(heat-this.brakeHeat)*(1-Math.exp(-dt/(heat>this.brakeHeat?1.9:9)));
    const open=drive.drs;
    this.flap+=((open?.13:-.085)-this.flap)*(1-Math.exp(-dt*9));
  }
}
