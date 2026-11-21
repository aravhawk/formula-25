import {clamp,mod,colors} from './data.js';
export class WorldLite{
  constructor(root,game){this.backend='Canvas';this.game=game;this.canvas=document.createElement('canvas');root.replaceChildren(this.canvas);this.ctx=this.canvas.getContext('2d');}
  resize(w,h){const r=Math.min(1.3,devicePixelRatio||1);this.canvas.width=w*r;this.canvas.height=h*r;this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';}
  dispose(){this.canvas.remove();}
  render(d,eye,line){
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height,track=this.game.track,e=track.event;
    const night=e.light==='night',desert=e.land==='desert'||e.land==='dunes',urban=['city','strip','coast','harbour'].includes(e.land);
    const focal=h*.5/Math.tan(eye.fov*Math.PI/360),co=Math.cos(eye.yaw),si=Math.sin(eye.yaw);
    const horizon=h*.5+eye.pitch*focal;
    const project=(s,o,y=0)=>{const [x,alt,z]=track.position(s,o,y),dx=x-eye.x,dz=z-eye.z;
      const depth=dx*si-dz*co;if(depth<.12)return null;
      return {x:w/2+(dx*co+dz*si)*focal/depth,y:horizon-(alt-eye.y)*focal/depth,k:focal/depth};};
    const poly=(points,color)=>{if(points.some(p=>!p))return;c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill();};
    const sky=c.createLinearGradient(0,0,0,h*.59);sky.addColorStop(0,night?'#040a1b':e.light==='dusk'?'#525781':'#5178a5');sky.addColorStop(1,night?'#374259':e.light==='dusk'?'#dfad8a':'#d6e2e2');
    c.fillStyle=sky;c.fillRect(0,0,w,h);c.fillStyle=night?'#3e4047':desert?'#bfa888':'#687a5b';c.fillRect(0,horizon,w,h);
    const near=d.distance,dir=Math.cos(eye.yaw-track.at(near).yaw)>=0?1:-1;
    const first=Math.floor(dir*near/5)*5;
    const rivals=this.game.ai.map(r=>({r,gap:mod(dir*(r.distance-near),track.length)})).filter(o=>o.gap<490).sort((a,b)=>b.gap-a.gap);
    let ri=0;
    for(let i=97;i>=0;i--){
      const a=dir*Math.max(dir*near+.70,first+5*i),b=dir*(first+5*(i+1)),shoulder=track.width;
      if(dir*(b-a)<=0)continue;
      const strip=(l,r,y,fill)=>poly([project(a,l,y),project(a,r,y),project(b,r,y),project(b,l,y)],fill);
      strip(-shoulder,shoulder,0,Math.floor(a/5)%2?'#454a50':'#474c51');
      for(const side of [-1,1]){
        strip(side*(shoulder-.14),side*shoulder,.014,'#f3f1e7');
        if(Math.abs(track.at(a).curvature)>.003)strip(side*shoulder,side*(shoulder+.65),.033,i%2?'#e2ded5':'#b23a3d');
        const f=track.at(a),rail=side*(side>0?f.rightWall:f.leftWall);const endRail=side*track.wallAt(b,side);poly([project(a,rail),project(b,endRail),project(b,endRail,.77),project(a,rail,.77)],urban?(i%4?'#b8bcc1':'#ae4046'):'#a1a5a3');
        if(Math.floor(a/5)%7===0){
          const s=b,seed=Math.abs(Math.sin(Math.floor(s/35)*184.360+side)),o=endRail+side*(11+seed*28);
          const p=project(s,o,urban?10:7);if(p){
            const k=p.k;
            if(urban){c.fillStyle=night?'#354058':'#88929b';c.fillRect(p.x-4*k,p.y-seed*14*k,8*k,(10+seed*14)*k);}
            else if(!desert){c.fillStyle=night?'#24332f':'#385a36';c.beginPath();c.ellipse(p.x,p.y,3.1*k,(3.9+seed*2)*k,0,0,7);c.fill();}
            if(night){c.fillStyle='#ffebbb';c.fillRect(p.x,p.y-3*k,1.1*k,.3*k);}
          }
        }
      }
      if(line&&i%2===0){const o=track.at(a).line;strip(o-.17,o+.17,.05,this.game.pace(a)<d.speed?'#ea6744':'#6bc198');}
      while(ri<rivals.length&&rivals[ri].gap>=dir*(a-near)){
        const {r,gap}=rivals[ri++];const p=project(near+dir*gap,r.offset,.05);if(!p)continue;
        const k=p.k,x=p.x,y=p.y; c.fillStyle='#202127';c.fillRect(x-k,y-.69*k,.44*k,.69*k);c.fillRect(x+.56*k,y-.69*k,.44*k,.69*k);
        c.fillStyle=colors[r.team]||'#586389';c.fillRect(x-.59*k,y-.49*k,1.18*k,.34*k);c.fillRect(x-.58*k,y-.99*k,1.16*k,.19*k);
        c.fillStyle='#1e252a';c.fillRect(x-.11*k,y-.83*k,.22*k,.56*k);c.fillStyle='#ec4238';c.fillRect(x-.045*k,y-.31*k,.09*k,.10*k);
      }
    }
    const sn=Math.sin(d.heading),cs=Math.cos(d.heading);
    for(const side of [-1,1]){
      const p=project(d.distance+1.8*cs-side*.84*sn,d.offset+1.8*sn+side*.84*cs,.35);
      if(p){c.fillStyle='#202026';c.beginPath();c.roundRect(p.x-.19*p.k,p.y-.32*p.k,.38*p.k,.53*p.k,.065*p.k);c.fill();}
    }
    return night?.49:1;
  }
}
