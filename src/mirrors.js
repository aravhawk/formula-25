import {colors,mod} from './data.js';
// Each mirror projects the road and cars behind its own mounting point.
export function updateMirrors(game){
  const d=game.player,t=game.track,f=t.at(d.distance),yaw=f.yaw+d.heading+d.bodyYaw,co=Math.cos(yaw),si=Math.sin(yaw);
  for(const canvas of document.querySelectorAll('.mirror')){
    const c=canvas.getContext('2d'),side=canvas.classList.contains('right')?1:-1,w=canvas.width,h=canvas.height;
    const eye=t.position(d.distance,d.offset,.85),night=t.event.light==='night';
    eye[0]+=side*.8*co;eye[2]+=side*.8*si;
    const behind=Math.cos(yaw-f.yaw)>=0?-1:1;
    const proj=(s,o,height)=>{const [x,y,z]=t.position(s,o,height),dx=x-eye[0],dz=z-eye[2],depth=dz*co-dx*si;
      if(depth<=.3)return null;
      return {x:w*.50-side*20+(dx*co+dz*si)*w*.82/depth,y:h*.39-(y-eye[1])*w*.82/depth,k:w*.82/depth};};
    c.fillStyle=night?'#343d53':'#b5c8d4';c.fillRect(0,0,w,h);
    c.fillStyle=night?'#424449':'#6c795b';c.fillRect(0,h*.39,w,h);
    for(let i=17;i>=1;i--){
      const s=d.distance+behind*i*5,front=s-behind*4.7;
      const a=proj(s,-t.width,0),b=proj(s,t.width,0),v=proj(front,t.width,0),z=proj(front,-t.width,0);
      if(!a||!b||!v||!z)continue;
      c.fillStyle=night?'#54545b':'#737476';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineTo(v.x,v.y);c.lineTo(z.x,z.y);c.fill();
      for(const [p,q] of [[a,z],[b,v]]){c.strokeStyle='#b8b9bb';c.lineWidth=1;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();}
    }
    const cars=game.ai.map(r=>({r,gap:mod(behind*(r.distance-d.distance),t.length)})).filter(v=>v.gap<100).sort((a,b)=>b.gap-a.gap);
    for(const {r,gap} of cars){
      const p=proj(d.distance+behind*gap,r.offset,0);if(!p)continue;
      const {k,x,y}=p;c.fillStyle='#202126';c.fillRect(x-.98*k,y-.69*k,.39*k,.69*k);c.fillRect(x+.59*k,y-.69*k,.39*k,.69*k);
      c.fillStyle=colors[r.team]||'#637283';c.fillRect(x-.45*k,y-.68*k,.9*k,.46*k);c.fillRect(x-k,y-.22*k,2*k,.16*k);
    }
  }
}
