// Reduce each circuit to a small outline for the menus.
import {readFile,writeFile} from 'node:fs/promises';
const out=[];
for(let round=1;round<=24;round++){
  const {points}=JSON.parse(await readFile('public/season/'+String(round).padStart(2,'0')+'.json','utf8'));
  const step=points.length/180,xs=points.map(p=>p[0]),zs=points.map(p=>p[2]);
  const x0=Math.min(...xs),z0=Math.min(...zs),w=Math.max(...xs)-x0,h=Math.max(...zs)-z0,scale=Math.min(960/w,560/h);
  const line=[];
  for(let i=0;i<180;i++){const p=points[Math.floor(i*step)];line.push(Math.round(500+(p[0]-x0-w/2)*scale),Math.round(300+(p[2]-z0-h/2)*scale));}
  out.push(line);
}
await writeFile('public/season/outlines.json',JSON.stringify(out));
