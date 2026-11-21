import * as T from 'three';
import {instanceTiles} from './track-mesh.js';

// The camera can see well beyond the circuit. Scatter distant canopy clusters
// over dark vegetated pixels of the satellite mosaic and sample the DEM below.
export function woodland(course,track,media,random,software){
  if(!['alpine','forest','hills','park','island','airfield'].includes(track.event.land))return;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(media.land.image,0,0,256,256);
  const pixels=c.getImageData(0,0,256,256).data,dem=track.terrain;
  const [x0,z0,x1,z1]=dem.bounds,matrices=[[],[],[]],pose=new T.Object3D();
  for(let i=0;i<13000;i++){
    const u=random(),v=random(),k=(Math.floor(v*256)*256+Math.floor(u*256))*4;
    const [r,g,b]=[pixels[k],pixels[k+1],pixels[k+2]];
    if(g<r*1.12||g<b*1.20||r+g+b>233)continue;
    const x=x0+(x1-x0)*u,z=z0+(z1-z0)*v;
    // The near trees are individually positioned relative to the racing surface.
    let closest=Infinity;
    for(let j=0;j<track.points.length;j+=15){
      const p=track.points[j];closest=Math.min(closest,(p[0]-x)**2+(p[2]-z)**2);
    }
    if(closest<90**2||closest>1800**2)continue;
    const gx=u*(dem.columns-1),gz=v*(dem.rows-1),col=Math.floor(gx),row=Math.floor(gz);
    const fx=gx-col,fz=gz-row,index=col+row*dem.columns,h=dem.heights;
    const height=(h[index]*(1-fx)+h[index+1]*fx)*(1-fz)+(h[index+dem.columns]*(1-fx)+h[index+dem.columns+1]*fx)*fz;
    const size=11+random()*14;
    for(let j=0;j<2;j++){
      pose.position.set(x+(j-.5)*size*.5,height+.39*size-1,z);
      pose.rotation.set(0,i*.51+j*1.48,0);pose.scale.set(size*1.12,size,1);
      pose.updateMatrix();matrices[i%3].push(pose.matrix.clone());
    }
  }
  for(let i=0;i<3;i++){
    const material=new T.MeshLambertMaterial({map:media.trees[i],side:T.DoubleSide,alphaTest:.48,color:0x939f90});
    const start=course.children.length;
    instanceTiles(course,new T.PlaneGeometry(1,1),material,matrices[i],null,false,600);
    for(let j=start;j<course.children.length;j++)course.children[j].userData.range=software?780:1550;
  }
}

export function buildingShade(track,footprints){
  const [x0,z0,x1,z1]=track.bounds;
  const scale=Math.min(.7,1450/(x1-x0+240),1450/(z1-z0+240));
  const canvas=document.createElement('canvas');canvas.width=Math.ceil((x1-x0+240)*scale);
  canvas.height=Math.ceil((z1-z0+240)*scale);
  const c=canvas.getContext('2d',{willReadFrequently:true});
  c.setTransform(scale,0,0,scale,(120-x0)*scale,(120-z0)*scale);c.fillStyle='#111';
  for(const [,height,,rings] of footprints){
    const ring=rings[0],dx=height*.90,dz=height*.56;
    c.beginPath();
    for(let i=0;i<ring.length;i+=2){
      const j=(i+2)%ring.length;
      c.moveTo(ring[i],ring[i+1]);c.lineTo(ring[i]+dx,ring[i+1]+dz);
      c.lineTo(ring[j]+dx,ring[j+1]+dz);c.lineTo(ring[j],ring[j+1]);c.closePath();
    }
    c.fill();
  }
  const mask=c.getImageData(0,0,canvas.width,canvas.height).data;
  return (x,z)=>{
    const col=Math.floor((x-x0+120)*scale),row=Math.floor((z-z0+120)*scale);
    if(col<0||row<0||col>=canvas.width||row>=canvas.height)return 0;
    return mask[(row*canvas.width+col)*4+3]/255;
  };
}
