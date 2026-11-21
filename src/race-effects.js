import * as T from 'three';
import {mod} from './data.js';
import {AXLES,HALF_TRACK} from './suspension.js';

// Stamped on the road plane in world space. Marks stay where the driver locked up.
export class TyreMarks{
  constructor(scene){
    this.mesh=new T.InstancedMesh(new T.PlaneGeometry(.28,1).rotateX(-Math.PI/2),
      new T.MeshBasicMaterial({color:0x231f20,transparent:true,opacity:.43,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),640);
    this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(this.mesh);this.cursor=0;this.last=Array(4).fill(null);this.pose=new T.Object3D();
  }
  snapshot(){
    const {mesh,cursor,last}=this;
    return {cursor,last,count:mesh.count,matrices:mesh.instanceMatrix.array.slice(0,mesh.count*16)};
  }
  restore({cursor,last,count,matrices}){
    if(count>this.mesh.instanceMatrix.count||matrices.length!==count*16)return;
    this.cursor=cursor;this.last=last;this.mesh.count=count;
    this.mesh.instanceMatrix.array.set(matrices);this.mesh.instanceMatrix.needsUpdate=true;
  }
  update(d){
    const track=d.circuit,road=track.at(d.distance),cs=Math.cos(d.heading),sn=Math.sin(d.heading);
    for(let wheel=0;wheel<4;wheel++){
      const surface=d.tyres.surfaces[wheel];
      if(d.speed<4||d.pit||surface==='grass'||surface==='gravel'||(
        d.tyres.locked[wheel]<.55&&d.tyres.spinning[wheel]<.55&&Math.abs(d.angles[wheel])<.22)){
        this.last[wheel]=null;continue;
      }
      const z=AXLES[wheel>>1],x=(wheel%2?1:-1)*HALF_TRACK,offset=d.offset-z*sn+x*cs;
      const station=d.distance+(-z*cs-x*sn)/Math.max(.72,1-road.curvature*d.offset);
      const current=track.position(station,offset,.024),prev=this.last[wheel];
      if(!prev){this.last[wheel]=current;continue;}
      const dx=current[0]-prev[0],dy=current[1]-prev[1],dz=current[2]-prev[2],span=Math.hypot(dx,dy,dz);
      if(span<.5)continue;
      this.last[wheel]=current;
      if(span>8)continue;
      this.pose.position.set(prev[0]+dx*.5,prev[1]+dy*.5,prev[2]+dz*.5);
      this.pose.rotation.set(Math.atan2(dy,Math.hypot(dx,dz)),-Math.atan2(dx,-dz),-Math.atan(road.bank),'YXZ');this.pose.scale.z=span+.04;
      this.pose.updateMatrix();this.mesh.setMatrixAt(this.cursor,this.pose.matrix);
      this.cursor=(this.cursor+1)%this.mesh.instanceMatrix.count;
      this.mesh.count=Math.min(this.mesh.count+1,this.mesh.instanceMatrix.count);
      this.mesh.instanceMatrix.needsUpdate=true;
    }
  }
}

export class Floodlights{
  constructor(scene,track){
    this.track=track;
    this.lights=Array.from({length:5},(_,i)=>{
      const light=new T.PointLight(i%2?0xe9f1ff:0xffeed1,550,74,2);
      scene.add(light);return light;
    });
  }
  update(distance){
    const t=this.track,station=Math.floor(mod(distance,t.length)/48)*48;
    if(this.station===station)return;
    this.station=station;
    // Match the poles after wrapping at the timing line, including the short last interval.
    const count=Math.ceil(t.length/48);
    this.lights.forEach((l,i)=>{
      const k=mod(Math.round(station/48)+i-1,count),s=k*48,side=k%2?1:-1;
      l.position.set(...t.position(s,side*(t.wallAt(s,side)+1.4),11.6));
    });
  }
}
