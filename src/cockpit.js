import {assetUrl} from './assets.js';
import {clamp} from './data.js';

const HUB_X=384,HUB_Y=217;
const INK='#e8f1ed',MUTED='#93a4a7';
const tint='#ffbd36';

async function artwork(name){
  const img=new Image();
  img.src=assetUrl(name);
  await img.decode();
  return img;
}

// Map a horizontal UV strip onto the two triangles between adjacent arm joints.
function fabric(ctx,texture,lo,hi,row,rows){
  const top=row*texture.height/rows,height=texture.height/rows,width=texture.width;
  const triangles=[[lo.left,lo.right,hi.left,0],[hi.right,hi.left,lo.right,1]];
  for(const [a,b,c,reverse] of triangles){
    ctx.save();
    const sign=reverse?-1:1;
    const xx=(b.x-a.x)*sign/width,xy=(b.y-a.y)*sign/width;
    const yx=(c.x-a.x)*sign/height,yy=(c.y-a.y)*sign/height;
    const x0=reverse?a.x-xx*width-yx*height:a.x;
    const y0=reverse?a.y-xy*width-yy*height:a.y;
    ctx.transform(xx,xy,yx,yy,x0,y0);
    // A small shared edge covers antialiasing between neighboring triangles.
    ctx.beginPath();
    if(reverse){ctx.moveTo(width+1,height+.8);ctx.lineTo(-2,height+.8);ctx.lineTo(width+1,-1);}
    else{ctx.moveTo(-1,-.8);ctx.lineTo(width+2,-.8);ctx.lineTo(-1,height+1);}
    ctx.closePath();ctx.clip();
    ctx.drawImage(texture,0,top,width,height,0,-.4,width,height+.8);
    ctx.restore();
  }
}

function sleeve(ctx,texture,side,angle,bottom){
  const co=Math.cos(angle),si=Math.sin(angle);
  // The wrist lives inside the glove cuff. The elbow stays beside the driver's seat.
  const dx=side*305,dy=119;
  const wx=HUB_X+dx*co-dy*si,wy=HUB_Y+dx*si+dy*co;
  const ex=HUB_X+side*442,ey=Math.max(bottom+165,wy+150);
  const reach=clamp((ey-wy)*.46,80,220);
  const tx=side*.25*co-.968*si,ty=side*.25*si+.968*co;
  const bx=wx+reach*tx,by=wy+reach*ty;
  const cx=ex-side*28,cy=ey-Math.min(185,(ey-wy)*.38);
  const sections=12;
  let previous;
  for(let i=0;i<=sections;i++){
    const t=i/sections,u=1-t;
    const x=u*u*u*wx+3*u*u*t*bx+3*u*t*t*cx+t*t*t*ex;
    const y=u*u*u*wy+3*u*u*t*by+3*u*t*t*cy+t*t*t*ey;
    const vx=u*u*(bx-wx)+2*t*u*(cx-bx)+t*t*(ex-cx);
    const vy=u*u*(by-wy)+2*t*u*(cy-by)+t*t*(ey-cy);
    const half=(46+11*Math.min(1,t*5)+24*Math.sin(t*Math.PI*.55))/Math.max(.01,Math.hypot(vx,vy));
    const joint={left:{x:x-vy*half,y:y+vx*half},right:{x:x+vy*half,y:y-vx*half}};
    if(previous&&Math.min(previous.left.y,previous.right.y,joint.left.y,joint.right.y)<bottom+1)
      fabric(ctx,texture,previous,joint,i-1,sections);
    previous=joint;
  }
}

function instruments(c,d,speed,gear,lamps){

  c.fillStyle='#0a151a';c.fillRect(259,127,249,108);
  c.fillStyle='#1a2b31';c.fillRect(259,127,249,19);
  c.font='bold 12px monospace';c.textAlign='left';c.fillStyle=tint;
  c.fillText(d.car.model.toUpperCase(),267,141);
  c.textAlign='right';c.fillStyle=INK;
  c.fillText(d.drs?'DRS':d.boost?'DEPLOY':Math.round(d.energy*100)+'% ERS',499,141);
  c.fillStyle='#445458';c.fillRect(334,153,1,56);
  c.textAlign='center';c.font='bold 51px sans-serif';c.fillStyle=INK;c.fillText(gear,298,199);
  c.font='bold 52px monospace';c.fillText(speed,421,199);
  c.fillStyle=MUTED;c.font='bold 10px monospace';
  c.fillText(d.manual?'MANUAL':'GEAR',298,211);c.fillText('KM/H',421,211);
  for(const [x,title,value,color] of [[266,'BRK',d.braking,'#ff826b'],[386,'THR',d.throttle,'#92e6b3']]){
    c.fillStyle=MUTED;c.textAlign='left';c.fillText(title,x,228);
    c.fillStyle='#2e4146';c.fillRect(x+25,222,83,5);
    c.fillStyle=color;c.fillRect(x+25,222,83*value,5);
  }
  for(let i=0;i<lamps;i++){
    c.fillStyle=d.car.gears===1?'#76d8fc':i<5?'#77efa2':i<8?'#ffd265':'#ff6662';
    c.beginPath();c.arc(292+i*17.9,111,4,0,Math.PI*2);c.fill();
  }
}

export class Cockpit {
  static async create(){
    const [cell,wheel,suit]=await Promise.all(['driver-cell','handwheel','nomex'].map(artwork));
    document.querySelector('.driver-cell').style.backgroundImage='url("'+cell.src+'")';
    return new Cockpit(wheel,suit);
  }
  constructor(wheel,suit){
    this.suit=suit;
    this.root=document.getElementById('cockpit');
    this.canvas=document.getElementById('driverRig');
    this.ctx=this.canvas.getContext('2d');
    this.hub=document.getElementById('wheelAssembly');
    this.hub.style.backgroundImage='url("'+wheel.src+'")';
    this.display=this.hub.querySelector('canvas').getContext('2d');
  }
  resize(w,h){
    const cw=Math.min(w,h*1.4),ch=h*.67,ratio=Math.min(devicePixelRatio||1,1.75);
    this.canvas.width=Math.ceil(cw*ratio);this.canvas.height=Math.ceil(ch*ratio);
    this.canvas.style.width=cw+'px';this.canvas.style.height=ch+'px';
    this.scale=Math.min(h*.00106,w/875)*ratio;
    this.hubY=(ch-h*.185)*ratio;
    const scale=this.scale/ratio;
    this.hub.style.width=768*scale+'px';this.hub.style.height=314*scale+'px';
    this.hub.style.left=(w/2-HUB_X*scale)+'px';this.hub.style.top=(h*.815-(HUB_Y-88)*scale)+'px';
    this.height=h;this.previous=null;this.angle=Infinity;
  }
  draw(d,eye,light){
    const angle=1.92*Math.tanh(d.suspension.steerAngle*9.2/1.92);
    const speed=Math.round(d.speed*3.6),gear=d.reverse?'R':d.car.gears===1?'D':String(d.gear);
    const fraction=clamp((d.engineRPM-9200)/2940,0,1);
    const lamps=Math.round(11*fraction);
    const pose=[speed,gear,lamps,Math.round(d.throttle*100),Math.round(d.braking*100),d.drs,d.boost,d.manual,Math.round(d.energy*100)];
    this.root.style.transform='translate3d('+eye.cellX*this.height+'px,'+eye.cellY*this.height+'px,0)';
    const brightness=Math.round(100*(.70+.30*light));
    if(this.brightness!==brightness){
      this.root.style.filter='brightness('+brightness+'%)';
      this.brightness=brightness;
    }
    if(Math.abs(this.angle-angle)>=.001){
      this.angle=angle;this.hub.style.transform='rotate('+angle+'rad)';
      const {ctx:c,canvas,scale}=this;
      c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);
      c.setTransform(scale,0,0,scale,canvas.width/2-HUB_X*scale,this.hubY-HUB_Y*scale);
      const bottom=HUB_Y+(canvas.height-this.hubY)/scale;
      sleeve(c,this.suit,-1,angle,bottom);sleeve(c,this.suit,1,angle,bottom);
    }
    if(!this.previous||pose.some((v,i)=>v!==this.previous[i])){
      this.previous=pose;
      this.display.setTransform(2,0,0,2,-259*2,-104*2);
      this.display.clearRect(259,104,250,132);
      instruments(this.display,d,String(speed),gear,lamps);
    }
  }
}
