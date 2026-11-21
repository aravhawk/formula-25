import {clamp} from './data.js';
import {Tyres} from './tyres.js';
import {Suspension,ROAD_HALF,HALF_TRACK} from './suspension.js';
export {ROAD_HALF};
export const BARRIER_LIMIT = 8.65;
const G=9.80665;
// Median engine rpm per km/h for the eight forward ratios in the 2025 car traces.
const RPM_PER_KMH=[116.77,95.11,76.48,61.85,51.79,44.99,39.69,35.44];
const SHIFT_RPM=12100,LIMITER_RPM=13350;
export const FIXED_STEP=1/120;
// Four contact patches. Distances in metres from the centre of mass; GYRATION is yaw inertia over mass.
const WHEELBASE=3.58,CG_FRONT=1.93,CG_REAR=1.65,CG_HEIGHT=.27,GYRATION=1.5,AERO_FRONT=.44,BRAKE_FRONT=.62,BRAKE_MAX=56;
// The wider rear tyres hold a little more than the fronts, so the car pushes wide before the rear lets go.
const REAR_GRIP=1.075;
const PEAK_SLIP=.105,ROLL_FLOOR=3,SUBSTEPS=4,STIFFNESS=Math.tan(Math.PI/2.8)/PEAK_SLIP;
// Lateral force against slip angle: peaks at PEAK_SLIP, then falls to about 80% when fully sliding.
const curve=slip=>Math.sin(1.4*Math.atan(STIFFNESS*slip));
export const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
// Full lock asks for a little more than the tyres can give at the current speed.
export const steerLock=(car,v)=>Math.min(.40,1.1*Math.atan(WHEELBASE*(car.grip+car.aero*v*v)*G/Math.max(v,7)**2)+1.3*PEAK_SLIP);
export class Drive {
  constructor(circuit, car) {
    this.circuit=circuit;this.car=car;this.distance=0;this.offset=0;this.speed=0;
    this.heading=0;this.yawRate=0;this.steer=0;this.elapsed=0;this.contacts=0;this.wallSide=0;
    this.penalties=0;this.slip=0;this.finished=false;this.gear=1;this.reverse=false;this.rpm=.45;this.throttle=0;this.braking=0;
    this.fx=new Float64Array(4);this.fy=new Float64Array(4);this.angles=new Float64Array(4);this.tyres=new Tyres();this.damage=0;this.hit=0;this.bodyYaw=0;
    this.assists={tc:.5,abs:true,steer:true};this.fyF=0;this.fyR=0;this.slipF=0;this.slipR=0;this.ax=0;this.lateralG=0;this.delta=0;this.wheelspin=0;
    this.tow=0;this.energy=1;this.boost=false;this.drs=false;this.wear=0;this.manual=false;this.shiftCut=0;this.longitudinalG=0;this.suspension=new Suspension(car);this.updateGear();
  }
  updateGear(){
    const kmh=this.speed*3.6,previous=this.gear;
    if(!this.manual&&!this.reverse){
      while(this.gear<8&&kmh*RPM_PER_KMH[this.gear-1]>SHIFT_RPM)this.gear++;
      while(this.gear>1&&kmh*RPM_PER_KMH[this.gear-2]<SHIFT_RPM*.88)this.gear--;
      if(this.gear>previous)this.shiftCut=.040;
    }
    this.engineRPM=clamp(Math.max(3900+this.throttle*Math.max(0,1-kmh/90)*5000,kmh*RPM_PER_KMH[this.gear-1]),3900,LIMITER_RPM);
    this.rpm=this.engineRPM/LIMITER_RPM;
  }
  toggleReverse(){
    if(this.speed>.65||this.pit)return false;
    this.reverse=!this.reverse;this.gear=1;this.speed=0;this.heading=wrap(this.heading+this.bodyYaw);this.bodyYaw=0;this.yawRate=0;this.shiftCut=.10;this.updateGear();
    return true;
  }
  shift(direction){
    if(this.car.gears===1||this.shiftCut>0||Math.abs(direction)!==1)return false;
    if(this.reverse)return direction===1&&this.toggleReverse();
    if(direction===-1&&this.gear===1)return this.toggleReverse();
    const next=this.gear+direction;
    if(next<1||next>this.car.gears)return false;
    const redline=LIMITER_RPM/RPM_PER_KMH[next-1]/3.6;
    if(direction<0&&this.speed>redline*.99)return false;
    this.manual=true;this.gear=next;this.shiftCut=.075;
    this.updateGear();
    return true;
  }
  step(dt,input={}) {
    if(this.finished)return;
    const f=this.circuit.at(this.distance),car=this.car,v=this.speed;
    this.tyres.update(this,dt);
    const downforce=car.aero*v*v*(1-.33*this.damage)*(1-.13*this.tow)*(this.drs?.85:1);
    const normalLoad=1+clamp(this.suspension.verticalG,-.48,.50);
    const demand=clamp(input.steer ?? (Number(!!input.right)-Number(!!input.left)),-1,1);
    // Keyboard lock builds progressively. A quick lift or countersteer unloads the tires.
    const reversing=this.steer*demand<0;
    const rate=demand===0||reversing?16:8.5;
    this.steer+=clamp(demand-this.steer,-rate*dt,rate*dt);
    const throttle=clamp(Number(input.throttle||0),0,1),brake=clamp(Number(input.brake||0),0,1);
    this.throttle+=clamp(throttle-this.throttle,-32*dt,22*dt);
    this.braking+=clamp(brake-this.braking,-30*dt,34*dt);
    if(this.reverse){
      this.tyres.locked.fill(0);this.tyres.spinning.fill(0);this.tyres.lock=0;this.wheelspin=0;this.angles.fill(0);
      this.boost=false;this.drs=false;this.shiftCut=Math.max(0,this.shiftCut-dt);
      const drive=this.shiftCut>0?0:3.8*this.throttle*(1-this.braking);
      this.speed=clamp(v+dt*(drive-16*this.braking-this.tyres.rolling-.28+G*(f.grade*Math.cos(this.heading)-f.bank*Math.sin(this.heading))),0,5);
      this.longitudinalG=(v-this.speed)/(dt*G);this.lateralG=0;this.delta=-this.steer*.3;
      this.yawRate=-this.speed*Math.tan(this.steer*.48)/3.6;
      const ds=-this.speed*Math.cos(this.heading)*dt/Math.max(.72,1-f.curvature*this.offset);
      this.heading=wrap(this.heading+this.yawRate*dt-f.curvature*ds);
      this.offset-=this.speed*Math.sin(this.heading)*dt;this.distance+=ds;
      this.slip=0;this.elapsed+=dt;this.updateGear();this.suspension.step(this,dt);
      return;
    }
    // Wheel force is torque-limited at low speed and power-limited at high speed.
    const maxSpeed=car.vmax/3.6, power=(car.kw-(this.boost?0:46))*1000*.94/car.mass;
    const dragK=car.kw*1000*.92/car.mass/(maxSpeed**3)*(this.drs?.80:1)*(1-.14*this.tow)*(1+.055*this.damage);
    const delivery=this.shiftCut>0||this.engineRPM>=LIMITER_RPM?0:this.gear===1?1:clamp(this.rpm/.66,.18,1);
    this.shiftCut=Math.max(0,this.shiftCut-dt);
    const driveDemand=delivery*Math.min(15.4,power/Math.max(v,9))*this.throttle*(1-this.braking);
    const brakeDemand=this.braking*BRAKE_MAX,{tc,abs}=this.assists;
    const lock=steerLock(car,v);
    let delta=this.steer*lock;
    if(this.assists.steer){
      // The assist steers toward a course angle set by the input, follows part of the road's curve and catches a large slide.
      const targetHeading=this.steer*(.25+1.4/(1+v*.12));
      const follow=f.curvature*v/(Math.max(.72,1-f.curvature*this.offset));
      const desiredYaw=follow*.68+wrap(targetHeading-this.heading)*5.8;
      const slide=this.bodyYaw-clamp(this.bodyYaw,-.09,.09);
      delta=clamp(Math.atan(WHEELBASE*desiredYaw/Math.max(v,6))-.8*slide,-lock,lock);
      // Past their peak angle the front tyres only scrub, so the assist holds them just beyond it.
      // When the rear steps out it takes lock off, then steers into the slide.
      if(v>4){
        const flow=Math.atan2(CG_FRONT*this.yawRate-v*Math.sin(this.bodyYaw),Math.max(v*Math.cos(this.bodyYaw),ROLL_FLOOR)),limit=1.15*PEAK_SLIP;
        const over=clamp((Math.abs(this.slipR)-.9*PEAK_SLIP)/(.7*PEAK_SLIP),0,1.7),inside=limit*(1-over);
        delta=this.slipR>0?clamp(delta,flow-inside,flow+limit):clamp(delta,flow-limit,flow+inside);
      }
    }
    this.delta=delta;
    const cd=Math.cos(delta),sd=Math.sin(delta),wearGrip=(1-.22*this.wear)*(this.tyre==='SOFT'?1.04:this.tyre==='HARD'?.975:1);
    const staticF=car.grip*normalLoad*CG_REAR/WHEELBASE+downforce*AERO_FRONT,staticR=car.grip*normalLoad*CG_FRONT/WHEELBASE+downforce*(1-AERO_FRONT);
    const slope=Math.sqrt(1+f.grade*f.grade),h=dt/SUBSTEPS,rolling=.12+this.tyres.rolling*Math.min(v/3,1);
    let psi=this.heading+this.bodyYaw,u=v*Math.cos(this.bodyYaw),w=-v*Math.sin(this.bodyYaw),r=this.yawRate;
    let sumX=0,sumY=0,slipF=this.slipF,slipR=this.slipR;
    for(let i=0;i<SUBSTEPS;i++){
      // Braking moves load to the front axle and acceleration to the rear.
      const transfer=car.grip*clamp(this.ax/G,-6,2.5)*CG_HEIGHT/WHEELBASE;
      const front=Math.max(.1,staticF-transfer)*wearGrip*G,rear=Math.max(.1,staticR+transfer)*wearGrip*G*REAR_GRIP;
      const moving=clamp(v/8,0,1);
      let ax=0,ay=0,moment=0;
      for(let wheel=0;wheel<4;wheel++){
        const steerable=wheel<2,fore=steerable?CG_FRONT:-CG_REAR,side=(wheel%2?1:-1)*HALF_TRACK;
        // Contact-patch velocity includes rotation about the centre of mass.
        const c=steerable?cd:1,s=steerable?sd:0,forward=u-r*side,lateral=w+r*fore;
        const along=forward*c+lateral*s;
        const angle=Math.atan2(lateral*c-forward*s,Math.max(Math.abs(along),ROLL_FLOOR));
        this.angles[wheel]=angle;
        const cap=(steerable?front:rear)*this.tyres.coefficient[wheel];
        const corner=curve(angle);
        const lateralUse=Math.abs(angle)>=PEAK_SLIP?.98:Math.min(.98,Math.abs(corner));
        const reserve=cap*Math.sqrt(1-lateralUse*lateralUse);
        let brake=.5*brakeDemand*(steerable?BRAKE_FRONT:1-BRAKE_FRONT);
        let drive=steerable?0:.5*driveDemand;
        if(abs&&brake>0){
          const loose=Math.min(1,Math.abs(slipR)/PEAK_SLIP);
          const turn=.62*Math.min(1,Math.abs(angle)/PEAK_SLIP)*(1-loose**3);
          brake=Math.min(brake,steerable?cap*.97*Math.sqrt(1-turn*turn):reserve*.86);
        }
        if(tc&&drive>0)drive=Math.min(drive,tc>=1?reserve*.88:Math.min(.9*cap,reserve+.30*(cap-reserve)));
        const demand=drive-brake*(along<-.2?-1:1),use=Math.abs(demand)/cap;
        const fx=use<=1?demand:Math.sign(demand)*cap*(.92-.14*Math.min(1,(use-1)*2));
        const fy=-cap*corner*(use<1?Math.max(.16,Math.sqrt(1-use*use)):.16);
        const x=fx*c-fy*s,y=fx*s+fy*c;
        this.fx[wheel]=fx;this.fy[wheel]=fy;
        this.tyres.locked[wheel]=brake>drive?clamp((use-1)*2.5,0,1)*moving:0;
        this.tyres.spinning[wheel]=drive>brake?clamp((use-1)*2.5,0,1):0;
        ax+=x;ay+=y;moment+=fore*y-side*x;
      }
      slipF=(this.angles[0]+this.angles[1])*.5;slipR=(this.angles[2]+this.angles[3])*.5;
      this.fyF=this.fy[0]+this.fy[1];this.fyR=this.fy[2]+this.fy[3];
      const speed=Math.hypot(u,w),resist=speed>.05?(dragK*speed*speed+rolling)/speed:0;
      this.ax+=(ax-this.ax)*(1-Math.exp(-h*28));sumX+=ax-resist*u;sumY+=ay;
      const before=u;
      const cs=Math.cos(psi),sn=Math.sin(psi);
      u+=h*(ax-resist*u+w*r+G*(f.bank*sn-f.grade*cs));
      w+=h*(ay-resist*w-before*r+G*(f.bank*cs+f.grade*sn));
      r+=h*moment/GYRATION;
      // Brakes and drag bring the car to rest. They cannot push it the other way.
      if(driveDemand<.05&&Math.hypot(u,w)<.45&&(before*u<=0||Math.hypot(u,w)<.3)){u=0;w=0;if(Math.abs(r)<.4)r=0;}
      const now=Math.hypot(u,w),course=psi+Math.atan2(w,u);
      const ds=now*Math.cos(course)*h/(slope*Math.max(.72,1-f.curvature*this.offset));
      this.offset+=now*Math.sin(course)*h;this.distance+=ds;psi+=r*h-f.curvature*ds;
    }
    let speed=Math.hypot(u,w);
    if(speed>maxSpeed*1.075){u*=maxSpeed*1.075/speed;w*=maxSpeed*1.075/speed;speed=maxSpeed*1.075;}
    const beta=speed>.25?Math.atan2(w,u):0;
    this.slipF=slipF;this.slipR=slipR;this.speed=speed;this.yawRate=r;this.heading=wrap(psi+beta);this.bodyYaw=wrap(-beta);
    this.longitudinalG=sumX/(SUBSTEPS*G);this.lateralG=sumY/(SUBSTEPS*G);
    const moving=clamp(speed/8,0,1);
    this.tyres.lock=Math.max(...this.tyres.locked);
    this.wheelspin=Math.max(this.tyres.spinning[2],this.tyres.spinning[3]);
    const slide=clamp((Math.max(Math.abs(slipF),Math.abs(slipR))-1.3*PEAK_SLIP)/(2*PEAK_SLIP),0,1)*moving;
    this.slip=Math.max(this.tyres.lock*.83,this.wheelspin*.7,slide);
    this.elapsed+=dt;
    this.updateGear();
    this.suspension.step(this,dt);
  }
}
