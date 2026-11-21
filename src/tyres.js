import {clamp} from './data.js';
import {HALF_TRACK,AXLES,hasKerb,KERB_WIDTH} from './suspension.js';

const gravelRounds=new Set([1,3,7,9,11,13,15,16]);
export function surfaceAt(track,frame,offset){
  const edge=Math.abs(offset)-track.width,side=Math.sign(offset);
  if(edge<=0)return 'track';
  if(side>0&&frame.pitApron)return 'runoff';
  if(edge<=KERB_WIDTH&&hasKerb(frame.curvature,side))return 'kerb';
  if((side>0?frame.rightWall:frame.leftWall)>track.barrier+1.1&&edge>1.65)
    return gravelRounds.has(track.event.round)?'gravel':'runoff';
  return 'grass';
}
const friction={track:1,kerb:.92,runoff:.89,grass:.53,gravel:.46};
const resistance={track:0,kerb:.05,runoff:.09,grass:1.4,gravel:3.8};
const targetTemp={SOFT:91,MEDIUM:94,HARD:98};

export class Tyres{
  constructor(){
    this.coefficient=new Float64Array(4);this.locked=new Float64Array(4);this.spinning=new Float64Array(4);
    this.temp=[82,82,82,82];this.surfaces=['track','track','track','track'];this.grip=1;this.front=1;this.rear=1;this.rolling=0;this.lock=0;
  }
  reset(){this.temp.fill(72);this.locked.fill(0);this.spinning.fill(0);this.lock=0;}
  update(d,dt){
    const v=d.speed,yaw=d.heading+(d.bodyYaw||0),sin=Math.sin(yaw),cos=Math.cos(yaw);

    const lateral=clamp(d.lateralG||0,-5,5),longitudinal=clamp(d.longitudinalG,-5,2);
    const optimum=targetTemp[d.tyre]||94;
    let grip=0,rolling=0,frontGrip=0,rearGrip=0;
    for(let i=0;i<4;i++){
      const axle=i<2?0:1,side=i%2?1:-1;
      const o=d.offset-AXLES[axle]*sin+side*HALF_TRACK*cos;
      const station=d.distance-AXLES[axle]*cos-side*HALF_TRACK*sin;
      const surface=surfaceAt(d.circuit,d.circuit.at(station),o);
      this.surfaces[i]=surface;
      const load=clamp(1-side*lateral*.095+(axle===0?-1:1)*longitudinal*.11,.23,1.8);
      const heat=(.64*Math.abs(lateral)+d.braking*(axle===0?2.9:1.6)+d.throttle*(axle===1?.95:.24)+2*this.locked[i]+2.4*this.spinning[i]+1.6*(d.slip||0))*load;
      this.temp[i]+=dt*(heat*Math.min(1,v/17)-(this.temp[i]-32)*(.010+.00015*v));
      const thermal=clamp(1-.000044*(this.temp[i]-optimum)**2,.73,1);
      grip+=thermal*friction[surface]*load**.88;
      // The handling model moves load between the axles itself, so each axle's grip only counts the side-to-side transfer.
      const share=thermal*friction[surface]*clamp(1-side*lateral*.095,.23,1.8)**.88*.5;
      this.coefficient[i]=share;
      if(axle===0)frontGrip+=share;else rearGrip+=share;
      rolling+=resistance[surface];
    }
    this.grip=grip*.25;this.front=frontGrip;this.rear=rearGrip;this.rolling=rolling*.25;
  }
}
