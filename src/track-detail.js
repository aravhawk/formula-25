import * as T from 'three';
import {Surface} from './track-mesh.js';

function texture(w,h,paint){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  paint(canvas.getContext('2d'));
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;
  return map;
}
const boardColors=['#165747','#a63235','#9d2a37','#6c2539','#124f48','#157c83','#a63732','#9c252d',
  '#a93929','#af3236','#a92d34','#22483d','#574647','#276244','#bb5323','#1b604c',
  '#27536b','#3e427b','#36446d','#23634e','#236b54','#673c80','#6f3045','#277685'];

export function raceBoards(parent,event){
  const map=texture(1024,128,c=>{
    const tone=boardColors[event.round-1];
    c.fillStyle=tone;c.fillRect(0,0,1024,128);
    for(let x=0;x<195;x+=34){
      c.fillStyle='rgba(255,255,255,.12)';c.beginPath();c.moveTo(x,0);c.lineTo(x+24,0);
      c.lineTo(x-38,128);c.lineTo(x-62,128);c.fill();
    }
    c.fillStyle='#faf8ee';c.font='italic bold 75px sans-serif';c.textAlign='center';
    c.fillText(event.city.toUpperCase(),532,85,690);
    c.fillStyle='rgba(0,0,0,.26)';c.fillRect(0,119,1024,9);
    c.fillStyle='#1d252b';c.fillRect(975,0,49,119);
    c.fillStyle='#f3f0e8';c.font='bold 24px monospace';c.fillText(String(event.round).padStart(2,'0'),1000,74);
  });
  return new Surface(parent,new T.MeshLambertMaterial({map,side:T.DoubleSide}));
}

export function rubberDeposits(parent){
  const map=texture(80,256,c=>{
    let seed=19;
    const rand=()=>((seed=Math.imul(16807,seed)>>>0)/4294967296);
    for(let i=0;i<740;i++){
      const x=rand()*80,fade=Math.sin(x/80*Math.PI);
      c.fillStyle='rgba(25,24,23,'+(rand()*.45*fade)+')';
      c.fillRect(x,rand()*256,1+rand()*3,6+rand()*44);
    }
  });
  return new Surface(parent,new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,opacity:.36}));
}

export function trackLighting(parent){
  const map=texture(64,64,c=>{
    const g=c.createRadialGradient(32,32,0,32,32,32);
    for(const [t,v] of [[0,'#fffefa'],[.08,'#fff2ceee'],[.21,'#ffffe95e'],[.52,'#dfedff12'],[1,'#cedaff00']])g.addColorStop(t,v);
    c.fillStyle=g;c.fillRect(0,0,64,64);
  });
  return new Surface(parent,new T.MeshBasicMaterial({map,blending:T.AdditiveBlending,transparent:true,side:T.DoubleSide,forceSinglePass:true,depthWrite:false,toneMapped:false}));
}
