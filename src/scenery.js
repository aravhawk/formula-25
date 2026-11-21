import {surfaceY} from './circuit.js';
import * as T from 'three';
import {clamp,mod} from './data.js';
import {CourseClearance} from './course-clearance.js';
import {Surface,instanceTiles} from './track-mesh.js';
import {woodland,buildingShade} from './landscape.js';
import {mappedBuildings} from './buildings.js';
import {raceBoards,rubberDeposits,trackLighting} from './track-detail.js';
import {hasKerb} from './suspension.js';
import {pitStrip} from './racing.js';

export function canvasMap(w,h,draw){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'));
  const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;return t;
}
function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
class Ribbon {
  constructor(){this.pos=[];this.col=[];this.uv=[];this.index=[];}
  quad(a,b,c,d,color,u=1,v=1,offset=0){
    const n=this.pos.length/3;
    this.pos.push(...a,...b,...c,...d);
    for(let i=0;i<4;i++)this.col.push(color.r,color.g,color.b);
    this.uv.push(0,offset,u,offset,u,v+offset,0,v+offset);
    this.index.push(n,n+1,n+3,n+1,n+2,n+3);
  }
  mesh(material){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.pos,3));
    g.setAttribute('color',new T.Float32BufferAttribute(this.col,3));g.setAttribute('uv',new T.Float32BufferAttribute(this.uv,2));
    g.setIndex(this.index);g.computeVertexNormals();return new T.Mesh(g,material);
  }
}
const pt=(f,o,h=0)=>[f.x+f.nx*o,surfaceY(f,o)+h,f.z+f.nz*o];
const color=hex=>new T.Color(hex);
export function scenery(scene,track,media,software,solids,ultra=false){
  const e=track.event,L=track.length,w=track.width,rand=random(2025+e.round*81);
  const urban=['city','strip','harbour','coast'].includes(e.land);
  const sand=['desert','dunes'].includes(e.land),night=e.light==='night',dusk=e.light==='dusk';
  let sky=media.sky;
  if(night||dusk){
    sky=canvasMap(1024,512,c=>{
      const grad=c.createLinearGradient(0,30,0,285);
      (night?['#02050f','#091229','#26364a']:['#40467d','#908aad','#ecab82']).forEach((v,i)=>grad.addColorStop(i/2,v));
      c.fillStyle=grad;c.fillRect(0,0,1024,512);
      c.globalCompositeOperation='soft-light';c.globalAlpha=night?.23:.74;
      c.drawImage(media.sky.image,0,0,1024,512);c.globalAlpha=1;c.globalCompositeOperation='source-over';
    });sky.mapping=T.EquirectangularReflectionMapping;
  }
  scene.background=sky;scene.backgroundRotation.y=e.round*.83;
  scene.fog=new T.FogExp2(night?0x27324b:dusk?0xc8aba0:0xbbc9d4,night?.0014:.00083);
  scene.add(new T.HemisphereLight(night?0xbacdfc:0xdfedff,night?0x49536a:0xa69e81,night?(software?1.55:.78):1.63));
  const sun=new T.DirectionalLight(night?0xe2ebff:dusk?0xffc897:0xfff3d9,night?(software?1.6:.50):2.13);
  sun.position.set(-48,54,-31);scene.add(sun,sun.target);
  sun.castShadow=!software&&!night;
  if(sun.castShadow){Object.assign(sun.shadow.camera,{left:-45,right:45,top:55,bottom:-45,near:1,far:200});
    sun.shadow.camera.updateProjectionMatrix();sun.shadow.mapSize.setScalar(ultra?3072:2048);
    // The renderer refreshes the map on the frames World asks for.
    sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;sun.shadow.normalBias=.026;sun.shadow.bias=-.00018;}
  scene.environment=software?null:(night||dusk?sky:media.hdr);
  scene.environmentIntensity=night?.38:dusk?.62:.72;
  const course=new T.Group();scene.add(course);
  const surface=hex=>new T.Color(hex),white=surface('#deddd6'),red=surface('#bc3938');
  const grass=surface(sand?'#d4b891':urban?'#96938f':'#98a082');
  const edging=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const roadOptions={map:media.asphalt,vertexColors:true};
  const roadMat=software?new T.MeshLambertMaterial(roadOptions):
    new T.MeshStandardMaterial({...roadOptions,bumpMap:media.asphalt,bumpScale:.014,roughness:.91});
  const terrainMat=new T.MeshLambertMaterial({map:media.grass,vertexColors:true,side:T.DoubleSide});
  const road=new Surface(course,roadMat,240),trim=new Surface(course,edging,220),runoff=new Surface(course,terrainMat,240);
  const strip=(batch,a,b,l,r,h,ink,v,s=0)=>batch.quad(pt(a,l,h),pt(a,r,h),pt(b,r,h),pt(b,l,h),ink,Math.abs(r-l)/5,v,s);
  const railColor=surface(urban?'#a6afbb':'#b6bcc0'),metalDark=surface('#687276');
  const green=surface([4,6,24].includes(e.round)?'#438fa5':'#468161');
  const kerbColors=({1:['#316934','#d7bf50'],10:['#c53536','#ece9e3'],12:['#252930','#ededeb'],22:['#e04452','#eaeaea'],24:['#398cb7','#e6e6df']})[e.round];
  const shadow=night?()=>0:buildingShade(track,media.footprints);
  function roadShade(s,o,rubber,f){
    const pool=night?.57+.40*(.5+.5*Math.cos(s*Math.PI/24+o*.085))**2:1;
    const shoulder=urban?.96:1;
    const level=(.84-rubber*.31)*pool*shoulder*(1-(software?.57:.17)*shadow(f.x+f.nx*o,f.z+f.nz*o));
    return new T.Color().setRGB(level,level*.99,level);
  }
  const rails=new Surface(course,edging,240);
  const barrier=(map)=>new Surface(course,new T.MeshLambertMaterial({map,side:T.DoubleSide}),240);
  const concrete=barrier(media.concrete),steel=barrier(media.guardrail);
  const boards=raceBoards(course,e),deposits=rubberDeposits(course),lighting=trackLighting(course);
  // Small detail is drawn only as far as it can be resolved from the cockpit.
  const reach=(far,usual)=>software?0:ultra?far:usual;
  trim.range=reach(700,520);deposits.range=reach(420,320);boards.range=reach(800,650);
  for(const wall of [rails,concrete,steel])wall.range=reach(1100,800);
  const limit=(frame,side)=>side>0?frame.rightWall:frame.leftWall;
  const railAt=(station,frame,side)=>side*limit(frame,side);
  const gravel=surface(sand?'#c8ae86':'#c2a98a'),asphalt=surface('#989b9c');
  const apron=new Surface(course,new T.MeshLambertMaterial({map:media.asphalt,vertexColors:true,side:T.DoubleSide}));
  const clearance=new CourseClearance(track);
  // Where two parts of a street circuit share a boundary, one part's barrier must not block the other's road.
  const blocked=(s,p,q)=>clearance.crosses(track,s,p[0],p[1],p[2])||clearance.crosses(track,s,q[0],q[1],q[2])||clearance.crosses(track,s,(p[0]+q[0])/2,(p[1]+q[1])/2,(p[2]+q[2])/2);
  for(let i=0;i<track.points.length;i++){
    const s=i*track.step,a=track.at(s),b=track.at(s+track.step),inPit=pitStrip(s,L);
    const lanes=f=>[-w,clamp(f.line-1.65,-w+.08,w-2),f.line-.7,f.line+.7,clamp(f.line+1.65,-w+2,w-.08),w];
    const lo=lanes(a),hi=lanes(b),wear=[0,.8,1,1,.8,0];
    for(let j=0;j<lo.length-1;j++){
      const uv=[lo[j]/6,s/6,lo[j+1]/6,s/6,hi[j+1]/6,(s+track.step)/6,hi[j]/6,(s+track.step)/6];
      road.quad(pt(a,lo[j]),pt(a,lo[j+1]),pt(b,hi[j+1]),pt(b,hi[j]),white,1,1,0,uv,
        [roadShade(s,lo[j],wear[j],a),roadShade(s,lo[j+1],wear[j+1],a),
         roadShade(s+track.step,hi[j+1],wear[j+1],b),roadShade(s+track.step,hi[j],wear[j],b)]);
    }
    for(const side of [-1,1]){
      const pit=side===1&&inPit,r=railAt(s,a,side),endR=railAt(s+track.step,b,side);
      if(limit(a,side)>track.barrier+1.1){
        const gravelTrap=[1,3,7,9,11,13,15,16].includes(e.round);
        const inner=side*(w+1.65);
        apron.quad(pt(a,inner,-.025),pt(a,r,-.025),pt(b,endR,-.025),pt(b,inner,-.025),gravelTrap?gravel:asphalt,
          Math.abs(inner-r)/4,track.step/4,s/4);
      }
      strip(runoff,a,b,side*w,side*(pit?w+7.1:Math.max(Math.abs(r),Math.abs(endR))+15),-.055,grass,track.step/6,s/6);
      if(pit)strip(road,a,b,w,w+7,.006,surface('#a7a8a6'),track.step/6,s/6);
      strip(trim,a,b,side*(w-.16),side*(w-.02),.018,white,1);
      if(!pit&&hasKerb(a.curvature,side)){
        for(let tooth=0;tooth<3;tooth++){
          const start=tooth===0?a:track.at(s+track.step*tooth/3),end=tooth===2?b:track.at(s+track.step*(tooth+1)/3);
          const tint=kerbColors?surface(kerbColors[(i+tooth)%2]):(i+tooth)%2?red:white;
          trim.quad(pt(start,side*w,.012),pt(start,side*(w+.67),.082),pt(end,side*(w+.67),.072),pt(end,side*w,.012),tint);
        }
        if(!urban)strip(trim,a,b,side*(w+.67),side*(w+1.65),.006,green,1);
      }
      if(solids){
        const start=pt(a,r),end=pt(b,endR);
        if(!blocked(s,start,end))solids.edge(start[0],start[2],end[0],end[2],Math.min(start[1],end[1]),Math.max(start[1],end[1])+.91,s);
      }
      if(urban||pit){
        concrete.quad(pt(a,r,.02),pt(b,endR,.02),pt(b,endR,.91),pt(a,r,.91),white,track.step/11,1,0,[s/11,0,(s+track.step)/11,0,(s+track.step)/11,1,s/11,1]);
        rails.quad(pt(a,r,.91),pt(a,r+side*.33,.91),pt(b,endR+side*.33,.91),pt(b,endR,.91),railColor);
      }else{
        rails.quad(pt(a,r+.06*side,.16),pt(b,endR+.06*side,.16),pt(b,endR+.06*side,.74),pt(a,r+.06*side,.74),metalDark);
        steel.quad(pt(a,r,.15),pt(b,endR,.15),pt(b,endR,.76),pt(a,r,.76),white,track.step/8,1,0,[s/8,0,(s+track.step)/8,0,(s+track.step)/8,1,s/8,1]);
      }
      if(!pit&&(s<120||s>L-230||Math.floor(s/115)%4===0)){
        const height=urban?.90:1.04,base=urban?.035:.16;
        boards.quad(pt(a,r-side*.055,base),pt(b,endR-side*.055,base),pt(b,endR-side*.055,height),pt(a,r-side*.055,height),white,
          track.step/9,1,0,[s/9,0,(s+track.step)/9,0,(s+track.step)/9,1,s/9,1]);
      }
    }
    const j=(i+4)%track.points.length;
    if(track.telemetrySpeed[i]-track.telemetrySpeed[j]>3){
      for(const side of [-1,1]){
        const o=a.line+side*.79,other=b.line+side*.79;
        deposits.quad(pt(a,o-.20,.006),pt(a,o+.20,.006),pt(b,other+.20,.006),pt(b,other-.20,.006),white,1,track.step/5,s/5);
      }
    }
  }
  for(const surface of [road,trim,runoff,apron,rails,concrete,steel,boards,deposits])surface.finish();
  const batches=new Map(),temp=new T.Object3D();
  // Scenery is placed by offset from one part of the lap, which can put it inside the rails of another part.
  const fits=(s,o,width,depth,y=1,height=2)=>{
    const f=track.at(s),[x,middle,z]=pt(f,o,y);
    return !clearance.intersects(x,z,f.yaw,width,depth,middle-height/2,middle+height/2);
  };
  // The nearest offset, moving away from the road, where a footprint stands clear of the whole lap.
  const outward=(s,o,width,depth)=>{
    for(const side=Math.sign(o)||1;Math.abs(o)<150;o+=side*3)if(fits(s,o,width,depth))return o;
    return null;
  };
  const box=(s,o,y,width,height,depth,tint)=>{
    const f=track.at(s);temp.position.set(...pt(f,o,y));temp.rotation.set(0,-f.yaw,0);temp.scale.set(width,height,depth);temp.updateMatrix();
    // Anything that would still stand inside the rails is left out, picture and solid together.
    if(height>.1&&!fits(s,o,width,depth,y,height))return;
    // Fence posts stand behind the rail, which already stops the car.
    if(height>.1&&Math.min(width,depth)>.1)solids?.box(temp.position.x,temp.position.y,temp.position.z,f.yaw,width,height,depth);
    if(!batches.has(tint))batches.set(tint,[]);batches.get(tint).push(temp.matrix.clone());
  };
  const sample=track.points.filter((_,i)=>i%10===0);
  function space(s,o,r){
    const f=track.at(s),[x,,z]=pt(f,o);
    return !sample.some(p=>(p[0]-x)**2+(p[2]-z)**2<r*r);
  }
  const [x0,z0,x1,z1]=track.bounds;
  const dem=track.terrain,extentX=dem.bounds[2]-dem.bounds[0],extentZ=dem.bounds[3]-dem.bounds[1];
  const lod=software?2:1,columns=(dem.columns-1)/lod+1;
  const ground=new T.PlaneGeometry(extentX,extentZ,columns-1,(dem.rows-1)/lod).rotateX(-Math.PI/2);
  const vp=ground.attributes.position,uv=ground.attributes.uv;
  for(let i=0;i<vp.count;i++){
    const x=vp.getX(i)+(x0+x1)/2,z=vp.getZ(i)+(z0+z1)/2;
    let near=Infinity,h=0;
    for(const p of sample){const dd=(p[0]-x)**2+(p[2]-z)**2;if(dd<near){near=dd;h=p[1];}}
    const dist=Math.sqrt(near),blend=clamp((dist-21)/94,0,1);
    h=(h-3.2)*(1-blend)+dem.heights[Math.floor(i/columns)*lod*dem.columns+(i%columns)*lod]*blend;
    vp.setXYZ(i,x,h,z);uv.setXY(i,(x-dem.bounds[0])/extentX,1-(z-dem.bounds[1])/extentZ);
  }
  ground.computeVertexNormals();course.add(new T.Mesh(ground,new T.MeshLambertMaterial({map:media.land,color:night?0x64717e:0xe4e1d8})));
  const label=(s,o,h,text,width,height,bg='#14212a',fg='#faf9ef')=>{
    const tex=canvasMap(512,96,c=>{c.fillStyle=bg;c.fillRect(0,0,512,96);c.fillStyle=fg;c.textAlign='center';c.font='italic bold 60px sans-serif';c.fillText(text,256,70,486);});
    const m=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));
    const f=track.at(s);m.position.set(...pt(f,o,h));m.rotation.y=-f.yaw;course.add(m);
  };
  // Grid boxes, timing gantry, garages and the painted speed-limit line in the pits.
  for(let i=0;i<20;i++){const s=-8*(i+1),o=i%2?2.45:-2.45;
    box(s+2.52,o,.033,2.6,.022,.14,'#e3e3ce');
    for(const side of [-1,1])box(s+2.03,o+side*1.24,.035,.095,.026,1.11,'#e3e3ce');}
  for(let i=0;i<26;i++)box(0,(i/26-.5)*w*2,.034,2*w/26,.02,.54,i%2?'#e2ded1':'#33373c');
  box(0,-track.at(0).leftWall-1.1,3.43,.37,6.86,.37,'#47535d');box(0,track.at(0).rightWall+1.2,3.43,.37,6.86,.37,'#47535d');
  box(0,(track.at(0).rightWall-track.at(0).leftWall)/2,6.55,track.at(0).leftWall+track.at(0).rightWall+2.85,1.3,.78,'#1c2732');label(-.47,0,6.54,e.city.toUpperCase(),w*1.92,1.04);
  const facadeFace=new Surface(course,new T.MeshBasicMaterial({map:media.pit,side:T.DoubleSide,color:night?0xa5bad2:0xdfdfdc}));
  for(let s=-252;s<96;s+=18){
    if(!space(s,w+19,w+4)||!fits(s,w+19,10.1,18.05,3.9,7.8))continue;
    const a=track.at(s-9),b=track.at(s+9),o=w+14.45;
    box(s,w+19,3.9,8.8,7.8,17.95,'#999ea0');
    facadeFace.quad(pt(a,o,.04),pt(b,o,.04),pt(b,o,7.9),pt(a,o,7.9),white,.50,1,0,
      [(s+252)/36,0,(s+270)/36,0,(s+270)/36,1,(s+252)/36,1]);
    box(s,w+18.2,8.04,10.1,.27,18.05,'#a9b5bb');
    box(s,w+8.9,1.32,1.4,2.6,5.9,'#35404a');
    box(s,w+8.5,2.63,2.6,.14,6.2,'#78858f');
  }
  facadeFace.finish();
  const crowdMat=new T.MeshBasicMaterial({map:media.crowd,side:T.DoubleSide,color:night?0x999fb0:0xc5c4c1});
  function stand(s,side,len){
    const f=track.at(s);
    let o=side*(limit(f,side)+13);
    while(Math.abs(o)<105){
      const [x,y,z]=pt(f,o);
      if(!clearance.intersects(x,z,f.yaw,18,len+4,y-1,y+9))break;
      o+=side*5;
    }
    if(Math.abs(o)>=105)return;
    // A single rigid stand. Following the bend with its supports would put
    // the posts inside the road on the opposite side of a tight corner.
    const place=(along,across,height)=>{
      const [x,y,z]=pt(f,o+across,height);
      return [x+f.nz*along,y,z-f.nx*along];
    };
    const part=(along,across,y,width,height,depth,tint)=>{
      temp.position.set(...place(along,across,y));temp.rotation.set(0,-f.yaw,0);
      temp.scale.set(width,height,depth);temp.updateMatrix();
      solids?.box(temp.position.x,temp.position.y,temp.position.z,f.yaw,width,height,depth);
      if(!batches.has(tint))batches.set(tint,[]);batches.get(tint).push(temp.matrix.clone());
    };
    const seating=new Ribbon();
    seating.quad(place(-len/2,-side*5,.9),place(len/2,-side*5,.9),place(len/2,side*5,6.8),place(-len/2,side*5,6.8),white,len/13,1);
    course.add(seating.mesh(crowdMat));
    part(0,-side*5,.54,.4,1.08,len,'#7f8991');
    part(0,side*2.4,8.25,13,.38,len+2,'#c4c8c6');
    for(const along of [-.45,0,.45]){
      part(along*len,side*4,4,.24,8,.24,'#66727a');
      part(along*len,0,7.92,11,.2,.14,'#707d85');
    }
    part(0,-side*4.14,8.08,.16,.55,len+2,'#b6c0c5');

  }
  for(let s=-130;s<100;s+=33)stand(s,-1,32);
  if(!urban)for(let i=1;i<=10;i++){const s=L*i/11;stand(s,i%2?1:-1,30+rand()*25);}
  if(e.round===8)for(let i=0;i<5;i++)stand(L*.67+i*34,-1,33);
  // Windows retain their own illumination at the floodlit street venues.
  const cubes=new T.BoxGeometry(1,1,1);
  mappedBuildings(course,track,media,solids,clearance);
  woodland(course,track,media,rand,software);
  const grove=[[],[],[]],treeCount=urban?190:sand?120:1000;
  for(let i=0;i<treeCount;i++){
    const s=rand()*L,side=rand()>.5?1:-1,o=side*(limit(track.at(s),side)+12+rand()*(urban?75:134)),height=7+rand()*13;
    if(!space(s,o,w+8)||s<130||s>L-240)continue;
    const f=track.at(s),p=pt(f,o);
    if(clearance.intersects(p[0],p[2],0,1,1,p[1],p[1]+height))continue;
    solids?.box(p[0],p[1]+height/2,p[2],0,.6,height,.6);
    for(let k=0;k<(software?1:2);k++){temp.position.set(p[0],p[1]+height*.43-1.1,p[2]);temp.rotation.set(0,software?-f.yaw+side*.63:i*.45+k*Math.PI/2,0);temp.scale.set(height*.8,height,1);temp.updateMatrix();grove[i%3].push(temp.matrix.clone());}
  }
  grove.forEach((list,i)=>{const mat=new T.MeshLambertMaterial({map:media.trees[i],alphaTest:.48,side:T.DoubleSide,color:night?0x556476:0xcacbc0});
    instanceTiles(course,new T.PlaneGeometry(1,1),mat,list,null,false,300);});
  // Fences and light standards are placed in road space so they follow elevation.
  const fenceTex=canvasMap(64,64,c=>{c.strokeStyle='#78838a';c.lineWidth=1.8;c.beginPath();c.moveTo(0,0);c.lineTo(64,64);c.moveTo(64,0);c.lineTo(0,64);c.stroke();});
  fenceTex.wrapS=fenceTex.wrapT=T.RepeatWrapping;
  const fence=new Surface(course,new T.MeshBasicMaterial({map:fenceTex,transparent:true,opacity:.45,depthWrite:false,side:T.DoubleSide,forceSinglePass:true}),240);
  fence.range=reach(620,480);
  for(let i=0;i<track.frames.length;i++){
    const s=i*track.step,a=track.at(s),b=track.at(s+track.step);
    for(const side of [-1,1]){
      const o=side*(limit(a,side)+.4),endO=side*(limit(b,side)+.4);
      const start=pt(a,o),end=pt(b,endO);
      const ha=clearance.fenceHeight(track,s,start),hb=clearance.fenceHeight(track,mod(s+track.step,L),end);
      if(i%2===0)box(s,o,ha*.48,.076,ha*.96,.076,'#727d80');
      if(!blocked(s,start,end))solids?.edge(start[0],start[2],end[0],end[2],Math.min(start[1],end[1]),Math.max(start[1]+ha,end[1]+hb),s);
      fence.quad(pt(a,o,.67),pt(b,endO,.67),pt(b,endO,hb),pt(a,o,ha),white,track.step*4.6,12);
    }
  }
  for(let s=0;s<L;s+=48){
    const a=track.at(s);
    if((night||dusk)&&s%48===0){
      const side=s%96?1:-1,o=railAt(s,a,side)+side*2.9;
      box(s,o,6,.19,12,.19,'#9da9b3');box(s,o-side*.8,12,2,.14,.29,'#96a3ac');box(s,o-side*1.5,11.85,1.3,.16,1,'light');
      const lamp=o-side*1.5;lighting.quad(pt(a,lamp-2.8,9.05),pt(a,lamp+2.8,9.05),pt(a,lamp+2.8,14.65),pt(a,lamp-2.8,14.65),white);
    }
  }
  fence.finish();lighting.finish();
  for(const z of track.zones){label(z[0],-track.at(z[0]).leftWall-1,1.8,'DRS',2.8,1,'#f3f1ed','#222a32');}
  let last=-1000;
  for(let s=30;s<L;s+=25){const f=track.at(s);
    if(Math.abs(f.curvature)>.014&&s-last>260){for(const metres of [150,100,50])label(s-metres,-Math.sign(f.curvature)*(limit(track.at(s-metres),-Math.sign(f.curvature))+.8),1.65,String(metres),1.6,1.05,'#faf9e9','#15232e');last=s;}}
  landmarks(course,track,box,stand,label,outward);
  const matrices=[],tints=[];
  for(const [tint,list] of batches){
    if(tint==='light'){instanceTiles(course,cubes,new T.MeshBasicMaterial({color:0xfff5da}),list);continue;}
    matrices.push(...list);tints.push(...list.map(()=>color(tint)));
  }
  instanceTiles(course,cubes,new T.MeshLambertMaterial(),matrices,tints,true);
  const bounded=[];
  for(const o of course.children){
    if(!o.isMesh)continue;
    if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();
    o.updateMatrix();
    const sphere=(o.isInstancedMesh?o.boundingSphere:o.geometry.boundingSphere).clone().applyMatrix4(o.matrix);
    if(sphere.radius<600)bounded.push({o,sphere});
  }
  course.updateMatrixWorld(true);
  course.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});
  let lastX=Infinity,lastZ=Infinity;
  const update=eye=>{
    if(Math.hypot(eye.x-lastX,eye.z-lastZ)>15){
      lastX=eye.x;lastZ=eye.z;
      for(const {o,sphere} of bounded){
        const range=(o.userData.range||(software?350:ultra?1500:950))+sphere.radius;
        o.visible=(sphere.center.x-eye.x)**2+(sphere.center.z-eye.z)**2<range*range;
      }
    }
    if(sun.castShadow){
      sun.target.position.set(Math.round(eye.x/2)*2,eye.y,Math.round(eye.z/2)*2);
      sun.position.copy(sun.target.position);sun.position.x-=48;sun.position.y+=54;sun.position.z-=31;
    }
    return shadow(eye.x,eye.z);
  };
  update.sun=sun.castShadow?sun:null;
  return update;
}
function landmarks(group,track,box,stand,label,outward){
  const {round,land}=track.event,L=track.length,w=track.width;
  const tower=(s,o,h,r,stacks)=>{
    o=outward(s,o,r,r);if(o===null)return o;
    box(s,o,h*.48,r*.72,h*.96,r*.72,'#b2bec2');
    for(let i=0;i<stacks;i++){const y=h*(.38+i*.55/stacks);
      box(s,o,y,r,.76,r,'#d5d6d2');box(s,o,y+.91,r*.94,1.1,r*.94,'#455a69');}
    return o;
  };
  if(round===8){for(let s=L*.397;s<L*.505;s+=6){box(s,0,5.8,w*2+5,.5,6.8,'#626a6e');box(s,track.at(s).rightWall+.9,2.8,.4,5.6,6.4,'#9eaaa9');if(Math.round(s)%3===0)box(s,-w*.75,5.44,.32,.11,4.7,'light');}}
  if(round===3||round===18){
    const f=track.at(round===3?L*.18:L*.91),o=round===3?-120:100,rad=round===3?24:40;
    const wheel=new T.Group();wheel.position.set(...pt(f,o,rad+4));wheel.rotation.y=-f.yaw+.5;group.add(wheel);
    const mat=new T.MeshLambertMaterial({color:round===3?0xd76957:0xb5bccc});
    wheel.add(new T.Mesh(new T.TorusGeometry(rad,.52,6,64),mat));
    for(let i=0;i<16;i++){const a=i*Math.PI/8,spoke=new T.Mesh(new T.BoxGeometry(.22,rad*2,.25),mat);spoke.rotation.z=a;wheel.add(spoke);
      const cab=new T.Mesh(new T.BoxGeometry(2.3,2,2),mat);cab.position.set(rad*Math.sin(a),rad*Math.cos(a),0);wheel.add(cab);}
    box(round===3?L*.18:L*.91,o,rad/2,1.7,rad+5,1.7,'#d2d5d3');
  }
  if(round===22){
    const f=track.at(L*.33),sphere=new T.Mesh(new T.SphereGeometry(36,40,24),new T.MeshBasicMaterial({map:canvasMap(256,128,c=>{
      const grad=c.createLinearGradient(15,8,230,124);grad.addColorStop(0,'#eb3a6c');grad.addColorStop(.50,'#6b38b8');grad.addColorStop(1,'#47d2e4');c.fillStyle=grad;c.fillRect(0,0,256,128);
      c.strokeStyle='#ffffff55';for(let i=0;i<9;i++){c.beginPath();c.ellipse(133,62,35+i*10,8+i*5,-.4,0,7);c.stroke();}
    })}));sphere.position.set(...pt(f,80,24));group.add(sphere);
  }
  if(round===4)tower(-210,65,31,15,7);
  if(round===19){const o=tower(L*.72,62,65,5,4);if(o!==null)for(let i=0;i<12;i++)box(L*.72,o-i*.8,63+i*.17,5,.6,1.1,'#eb5144');}
  if(round===2||round===24){const s=round===2?L*.04:L*.73;for(const side of [-1,1])tower(s,side*(w+7),15,6,3);
    box(s,0,15.1,w*2+24,3.1,10,round===24?'#977cbb':'#9fb5c5');}
  if(round===20){for(let k=0;k<8;k++){const s=L*.82+k*20;stand(s,-1,20);stand(s,1,20);}}
  if(round===12)for(let k=0;k<9;k++)box(-140+k*14,w+18,9.5+k*.31,12,.55,14.5,'#bdcbd1');
  if(round===6)label(L*.27,-33,10,'MIAMI',18,4,'#1e9ba2');
  if(land==='marina'||land==='harbour'||land==='island'){
    const at=round===8?.59:round===10?.40:.63;
    for(let k=0;k<11;k++){const s=L*at+k*11,o=outward(s,31+(k%3)*12,24,12);
      if(o===null)continue;
      box(s,o,-.32,24,.16,12,'#498194');box(s,o,.8,3.8,1,8.2,'#d8dade');box(s,o,1.8,2.5,1.1,3.5,'#eaeaeb');}
  }
}
