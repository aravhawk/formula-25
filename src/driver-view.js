import {surfaceY} from './circuit.js';
import {clamp} from './data.js';

// Eye position and sightline relative to the road. Both renderers use the same seat.
export class DriverView {
  constructor(motion){
    this.motion=motion;
    this.lateral=0;
    this.longitudinal=0;
    this.lookIn=0;
  }
  update(drive,dt){
    const road=drive.circuit.at(drive.distance),ride=drive.suspension;
    const heading=road.yaw+drive.heading,cos=Math.cos(heading),sin=Math.sin(heading);
    const lateral=this.motion?clamp(drive.lateralG||0,-2.5,2.5):0;
    const longitudinal=this.motion?clamp(drive.longitudinalG,-2.4,1.5):0;
    const blend=dt===0?1:-Math.expm1(-dt*8);
    this.lateral+=(lateral-this.lateral)*blend;
    this.longitudinal+=(longitudinal-this.longitudinal)*blend;
    const aim=this.motion?clamp(drive.yawRate*.13,-.071,.071):0;
    this.lookIn+=(aim-this.lookIn)*blend;
    const forward=-.42-this.longitudinal*.022,side=-this.lateral*.027;
    const cs=Math.cos(drive.heading),sn=Math.sin(drive.heading);
    const grade=road.grade*cs-road.bank*sn,bank=road.bank*cs+road.grade*sn;
    this.x=road.x+road.nx*drive.offset+sin*forward+cos*side;
    this.z=road.z+road.nz*drive.offset-cos*forward+sin*side;
    this.y=surfaceY(road,drive.offset)+grade*forward-bank*side+.90+(this.motion?ride.heave*.64:0);
    this.yaw=heading+this.lookIn;
    this.pitch=Math.atan(grade)-.044+(this.motion?ride.pitch*.61:0);
    this.roll=this.motion?-Math.atan(bank)*.72+ride.roll*.37:0;
    this.fov=67+(this.motion?clamp(drive.speed/100,0,1)*3:0);
    this.cellX=this.lateral*.0025-this.lookIn*.28;
    this.cellY=this.longitudinal*.003+(this.motion?ride.heave*.022:0);
    return this;
  }
}
