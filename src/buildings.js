import * as T from 'three';
import {clamp} from './data.js';
import {Surface} from './track-mesh.js';

function terrainHeight(terrain,x,z){
  const [x0,z0,x1,z1]=terrain.bounds;
  const col=clamp((x-x0)/(x1-x0)*(terrain.columns-1),0,terrain.columns-1);
  const row=clamp((z-z0)/(z1-z0)*(terrain.rows-1),0,terrain.rows-1);
  const i=Math.floor(col),j=Math.floor(row),t=col-i,u=row-j,w=terrain.columns;
  const h=(a,b)=>terrain.heights[Math.min(b,terrain.rows-1)*w+Math.min(a,w-1)];
  return (h(i,j)*(1-t)+h(i+1,j)*t)*(1-u)+(h(i,j+1)*(1-t)+h(i+1,j+1)*t)*u;
}

export function mappedBuildings(course,track,media,solids,clearance){
  const night=track.event.light==='night',monaco=track.event.round===8;
  const walls=[0,1].map(i=>{
    const map=media.buildings[(night?2:0)+i];
    return new Surface(course,new T.MeshLambertMaterial({map,side:T.DoubleSide,vertexColors:true,
      emissiveMap:night?map:null,emissive:night?0xada38c:0,emissiveIntensity:.72}),300);
  });
  const roofs=new Surface(course,new T.MeshLambertMaterial({side:T.DoubleSide,vertexColors:true}),300);
  for(const [index,[bottom,height,station,rings]] of media.footprints.entries()){
    const road=track.points[station],s=station*track.step,nearPits=s<160||s>track.length-270;
    const contours=rings.map(r=>{
      const vs=[];for(let i=0;i<r.length;i+=2)vs.push(new T.Vector2(r[i],r[i+1]));return vs;
    });
    const outer=contours[0];if(outer.length<3)continue;
    const center=outer.reduce((a,v)=>a.add(v),new T.Vector2()).divideScalar(outer.length);
    const dist=Math.hypot(road[0]-center.x,road[2]-center.y);
    if(nearPits&&outer.some(v=>Math.hypot(road[0]-v.x,road[2]-v.y)<39))continue;
    const blend=clamp((dist-20)/95,0,1);
    const terrain=terrainHeight(track.terrain,center.x,center.y);
    const base=road[1]*(1-blend)+terrain*blend-1.1,top=base+height;
    if(contours.some(ring=>ring.some((a,i)=>{
      const b=ring[(i+1)%ring.length];
      return clearance.intersects((a.x+b.x)/2,(a.y+b.y)/2,Math.atan2(b.x-a.x,a.y-b.y),.12,a.distanceTo(b),base+(bottom||-6),top);
    })))continue;
    const mat=walls[(monaco?index%5===0:index%3!==0)?1:0];
    const tint=new T.Color().setScalar(.79+.16*Math.sin(index*9)**2);
    for(const ring of contours){
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],wide=a.distanceTo(b);
        if(wide<.04)continue;
        // Sink the foundation into the coarse terrain mesh on hillsides.
        const y=base+(bottom||-6);
        solids?.edge(a.x,a.y,b.x,b.y,y,top);
        mat.quad([a.x,y,a.y],[b.x,y,b.y],[b.x,top,b.y],[a.x,top,a.y],tint,
          wide/(monaco?27:35),Math.max(.12,(height-bottom)/(monaco?21:28)));
      }
    }
    const triangles=T.ShapeUtils.triangulateShape(outer,contours.slice(1)),vertices=contours.flat();
    const roofTint=new T.Color(monaco?(index%3===0?0xad7d67:0xb6afa3):night?0x353742:0x9a9b94);
    for(const tri of triangles){
      const [a,b,c]=tri.map(i=>[vertices[i].x,top,vertices[i].y]);
      roofs.quad(a,b,c,c,roofTint);
    }
  }
  for(const batch of [...walls,roofs])batch.finish();
}
