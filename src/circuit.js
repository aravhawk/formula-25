import {clamp} from './data.js';
const wrap = (n,len) => ((n % len) + len) % len;
const angleDiff = x => Math.atan2(Math.sin(x),Math.cos(x));

// Space the stations evenly around the closed lap so road speed stays constant across the timing line.
function evenLoop(points,length){
  const n=points.length,along=[0];
  for(let i=0;i<n;i++){const a=points[i],b=points[(i+1)%n];along.push(along[i]+Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]));}
  const out=[],samples=[];let j=0;
  for(let k=0;k<n;k++){
    const target=k*along[n]/n;
    while(along[j+1]<target)j++;
    const a=points[j],b=points[(j+1)%n],t=(target-along[j])/Math.max(1e-9,along[j+1]-along[j]);
    samples.push({j,t});
    out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
  }
  const sample=values=>values&&samples.map(({j,t})=>values[j]+((values[j+1]??values[0])-values[j])*t);
  // Keep the lap number of gates in a DRS zone that crosses the finish.
  const station=distance=>{
    const lap=Math.floor(distance/length),index=wrap(distance,length)*n/length;
    const i=Math.min(n-1,Math.floor(index));
    return length*(lap+(along[i]+(along[i+1]-along[i])*(index-i))/along[n]);
  };
  return {points:out,sample,station};
}

// Where the lap crosses itself the survey gives the upper road the height of the cutting below it.
// Carry the higher road straight across as a bridge deck.
function spanCrossings(points,step){
  const n=points.length,apart=Math.ceil(120/step),reach=Math.ceil(64/step);
  for(let i=0;i<n;i++)for(let j=i+apart;j<n;j++){
    if(n-j+i<apart)continue;
    const a=points[i],b=points[(i+1)%n],c=points[j],e=points[(j+1)%n];
    if(Math.abs(a[0]-c[0])>2*step||Math.abs(a[2]-c[2])>2*step)continue;
    const rx=b[0]-a[0],rz=b[2]-a[2],sx=e[0]-c[0],sz=e[2]-c[2],den=rx*sz-rz*sx;
    if(Math.abs(den)<1e-9)continue;
    const t=((c[0]-a[0])*sz-(c[2]-a[2])*sx)/den,u=((c[0]-a[0])*rz-(c[2]-a[2])*rx)/den;
    if(t<0||t>=1||u<0||u>=1)continue;
    const level=k=>(points[(k-reach+n)%n][1]+points[(k+reach)%n][1])/2;
    const deck=level(i)>level(j)?i:j,from=points[(deck-reach+n)%n][1],to=points[(deck+reach)%n][1];
    for(let k=-reach;k<=reach;k++){
      const p=points[(deck+k+n)%n];p[1]=Math.max(p[1],from+(to-from)*(k+reach)/(2*reach));
    }
  }
  return points;
}

export const surfaceY=(f,offset)=>f.y-f.bank*clamp(offset,-8,8);

// The recorded line carries about a metre of GPS jitter. Average it over roughly 20 m so cars do not weave down a straight.
function smoothLine(line){
  if(!line)return line;
  let out=line;
  for(let pass=0;pass<3;pass++){const n=out.length,src=out;out=src.map((v,i)=>(src[(i+n-2)%n]+src[(i+n-1)%n]+v+src[(i+1)%n]+src[(i+2)%n])/5);}
  return out;
}
export class Circuit {
  constructor(data) {
    const loop=evenLoop(data.points,data.length);
    this.line=smoothLine(loop.sample(data.line));this.telemetrySpeed=loop.sample(data.speed);this.terrain=data.terrain;
    this.referenceMs=data.elapsedMs?[...loop.sample(data.elapsedMs),data.elapsedMs.at(-1)]:null;
    this.points=spanCrossings(loop.points,data.step); this.step=data.step; this.length=data.length;
    const count=this.points.length;
    this.frames=this.points.map((p,i)=>{
      const prev=this.points[wrap(i-1,count)],next=this.points[wrap(i+1,count)];
      const dx=next[0]-prev[0],dz=next[2]-prev[2], horizontal=Math.hypot(dx,dz);
      return {line:this.line?.[i]||0,yaw:Math.atan2(dx,-dz),grade:(next[1]-prev[1])/horizontal};
    });
    this.sectors=data.sectors.map(loop.station);
    this.zones=data.zones.map(zone=>zone.map(loop.station));
    this.sections=(data.sections||[[0,'Sector 1'],[data.sectors[0],'Sector 2'],[data.sectors[1],'Sector 3']]).map(([s,name])=>[loop.station(s),name]);
    let section=0;
    this.frames.forEach((f,i)=>{
      if(section+1<this.sections.length && i*this.step>=this.sections[section+1][0])section++;
      f.section=this.sections[section][1];
      f.curvature=angleDiff(this.frames[wrap(i+2,count)].yaw-this.frames[wrap(i-2,count)].yaw)/(4*this.step);
    });
    // Ordinary corners carry a few percent of camber, eased in over the corner entry.
    // Venues with real banking add it in setupCircuit.
    let camber=this.frames.map(f=>clamp(f.curvature*1.6,-.045,.045));
    for(let pass=0;pass<2;pass++)camber=camber.map((_,i)=>{let sum=0;for(let k=-3;k<=3;k++)sum+=camber[wrap(i+k,count)];return sum/7;});
    this.frames.forEach((f,i)=>{f.bank=camber[i];});
    const xs=this.points.map(p=>p[0]), zs=this.points.map(p=>p[2]);
    this.bounds=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
    this.mapCache=new WeakMap();
  }
  at(distance) {
    const n=wrap(distance,this.length)/this.step,i=Math.floor(n),t=n-i,j=(i+1)%this.points.length;
    const a=this.points[i],b=this.points[j],f=this.frames[i],g=this.frames[j];
    const lerp=(v,w)=>v+(w-v)*t;
    const yaw=f.yaw+angleDiff(g.yaw-f.yaw)*t, curvature=lerp(f.curvature,g.curvature);
    return {x:lerp(a[0],b[0]),y:lerp(a[1],b[1]),z:lerp(a[2],b[2]), yaw, nx:Math.cos(yaw),nz:Math.sin(yaw),
      pitApron:f.pitApron,leftWall:lerp(f.leftWall,g.leftWall),rightWall:lerp(f.rightWall,g.rightWall),curvature,line:lerp(f.line,g.line),grade:lerp(f.grade,g.grade),bank:lerp(f.bank,g.bank),section:f.section};
  }
  referenceTime(distance){
    if(!this.referenceMs)return null;
    const n=this.points.length,pos=clamp(distance/this.step,0,n),i=Math.min(n-1,Math.floor(pos));
    return (this.referenceMs[i]+(this.referenceMs[i+1]-this.referenceMs[i])*(pos-i))*.001;
  }
  wallAt(distance,side){
    const n=wrap(distance,this.length)/this.step,i=Math.floor(n)%this.frames.length,t=n-Math.floor(n);
    const key=side<0?'leftWall':'rightWall',a=this.frames[i][key],b=this.frames[(i+1)%this.frames.length][key];
    return a+(b-a)*t;
  }
  position(distance,offset=0,height=0) {
    const f=this.at(distance);
    return [f.x+f.nx*offset, surfaceY(f,offset)+height, f.z+f.nz*offset];
  }
  drawMap(canvas,distance=null,color='#d6ff38') {
    const ctx=canvas.getContext('2d'),[x0,z0,x1,z1]=this.bounds;
    const w=canvas.width,h=canvas.height,pad=8,scale=Math.min((w-pad*2)/(x1-x0),(h-pad*2)/(z1-z0));
    const x=p=>(p-x0)*scale+(w-(x1-x0)*scale)/2,z=p=>(p-z0)*scale+(h-(z1-z0)*scale)/2;
    const tint=distance===null?color:'#f2f3e4';
    let cache=this.mapCache.get(canvas);
    if(!cache||cache.tint!==tint||cache.layer.width!==w||cache.layer.height!==h){
      const layer=document.createElement('canvas');layer.width=w;layer.height=h;
      const line=layer.getContext('2d');
      line.lineJoin='round';line.lineCap='round';line.beginPath();
      for(let i=0;i<this.points.length;i+=4){
        const p=this.points[i];
        if(i===0)line.moveTo(x(p[0]),z(p[2]));else line.lineTo(x(p[0]),z(p[2]));
      }
      line.closePath();line.strokeStyle=tint;line.lineWidth=Math.max(2.3,w/100);line.stroke();
      cache={layer,tint};this.mapCache.set(canvas,cache);
    }
    ctx.clearRect(0,0,w,h);ctx.drawImage(cache.layer,0,0);
    if(distance!==null){const f=this.at(distance);ctx.beginPath();ctx.arc(x(f.x),z(f.z),5.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#141815';ctx.lineWidth=2;ctx.stroke();}
  }
}
