import {surfaceY} from './circuit.js';
import {clamp} from './data.js';
import {impact,redirect} from './contact.js';

// XZ spatial index of the solid parts of the scene. Build it from the same
// positions used for drawing. Y bounds leave clearance under bridges and gantries.
const cell=16,key=(x,z)=>x*65536+z;
export class SceneSolids {
  constructor(){this.cells=new Map();}
  box(x,y,z,yaw,width,height,length,station=null){
    if(height<.08||width<=0||length<=0)return;
    const c=Math.cos(yaw),s=Math.sin(yaw),w=width/2,l=length/2;
    const ob={x,y,z,c,s,w,l,h:height*.5,station};
    const rx=Math.abs(w*c)+Math.abs(l*s)+3.3,rz=Math.abs(w*s)+Math.abs(l*c)+3.3;
    for(let i=Math.floor((x-rx)/cell);i<=Math.floor((x+rx)/cell);i++){
      for(let j=Math.floor((z-rz)/cell);j<=Math.floor((z+rz)/cell);j++){
        const id=key(i,j);if(!this.cells.has(id))this.cells.set(id,[]);this.cells.get(id).push(ob);
      }
    }
  }
  edge(ax,az,bx,bz,bottom,top,station=null){
    const dx=bx-ax,dz=bz-az;
    this.box((ax+bx)/2,(bottom+top)/2,(az+bz)/2,Math.atan2(dx,-dz),.12,top-bottom,Math.hypot(dx,dz),station);
  }
  resolve(track,car){
    const end=car.distance,offset=car.offset;
    const ds=end-(car.oldDistance??end),dl=offset-(car.oldOffset??offset);
    // At 120 Hz a car normally travels less than one metre. Subdivide longer
    // sweeps, including displacement from another car during pile-ups.
    const travel=Math.max(Math.abs(ds),Math.abs(dl));
    if(travel>1){
      const steps=Math.ceil(travel/.8);
      for(let i=1;i<steps;i++){
        car.distance=end-ds*(1-i/steps);car.offset=offset-dl*(1-i/steps);
        if(this.project(track,car))return true;
      }
      car.distance=end;car.offset=offset;
    }
    if(!this.project(track,car))return false;
    for(let pass=0;pass<3&&this.project(track,car);pass++){}
    return true;
  }
  project(track,car){
    const f=track.at(car.distance),yaw=f.yaw+(car.heading||0)+(car.bodyYaw||0),c=Math.cos(yaw),s=Math.sin(yaw);
    // The body's footprint follows the chassis. The response follows the direction of travel.
    const vc=Math.cos(f.yaw+(car.heading||0)),vs=Math.sin(f.yaw+(car.heading||0));
    const x=f.x+f.nx*car.offset+.2*s,z=f.z+f.nz*car.offset-.2*c,y=surfaceY(f,car.offset);
    const nearby=this.cells.get(key(Math.floor(x/cell),Math.floor(z/cell)));if(!nearby)return;
    for(const ob of nearby){
      if(y+.94<ob.y-ob.h||y+.09>ob.y+ob.h)continue;
      if(ob.station!==null){const gap=car.distance-ob.station;
        if(Math.abs(gap-Math.round(gap/track.length)*track.length)<23)continue;}
      let depth=Infinity,nx=0,nz=0;
      for(const [a,b] of [[c,s],[s,-c],[ob.c,ob.s],[ob.s,-ob.c]]){
        const delta=(x-ob.x)*a+(z-ob.z)*b;
        const radius=Math.abs(a*c+b*s)+2.55*Math.abs(a*s-b*c)+ob.w*Math.abs(a*ob.c+b*ob.s)+ob.l*Math.abs(a*ob.s-b*ob.c);
        const overlap=radius-Math.abs(delta);
        if(overlap<=0){depth=0;break;}
        if(overlap<depth){depth=overlap;nx=a*Math.sign(delta||1);nz=b*Math.sign(delta||1);}
      }
      if(!depth)continue;
      car.solidContact=true;
      const along=nx*f.nz-nz*f.nx,across=nx*f.nx+nz*f.nz;
      car.distance+=along*(depth+.01);car.offset+=across*(depth+.01);
      const direction=car.reverse?-1:1;
      const incident=Math.min(0,direction*(nx*vs-nz*vc)),normal=-incident*car.speed;
      if(normal>0){
        const dx=vs-direction*incident*nx,dz=-vc-direction*incident*nz,left=Math.hypot(dx,dz);
        car.speed*=left;
        if(left>.02)redirect(car,Math.atan2(dx*f.nx+dz*f.nz,dx*f.nz-dz*f.nx));
        impact(car,normal,Math.sign(across)||1);
      }
      return true;
    }
    return false;
  }
}
