// Console-style menu input: focus moves with arrows, D-pad or stick, and the hint bar follows the device in use.
import {read,write} from './data.js';
import {activePad,padLabels} from './gamepad.js';
// The pad family is kept between visits so the right button names show before the first press.
export const input={device:matchMedia('(pointer:coarse)').matches?'touch':'keys',family:read('pad','xbox'),changed:null};
export function noteDevice(device,family=input.family){
  if(input.device===device&&input.family===family)return;
  if(input.family!==family)write('pad',family);
  input.device=device;input.family=family;document.documentElement.dataset.device=device;input.changed?.(device);
}
document.documentElement.dataset.device=input.device;
let sound,armed=false;
const arm=()=>{armed=true;};
addEventListener('pointerdown',event=>{arm();noteDevice(event.pointerType==='touch'?'touch':'keys');delete document.documentElement.dataset.nav;},true);
addEventListener('keydown',()=>{arm();noteDevice('keys');},true);
export function blip(kind='move'){
  if(!armed||read('mute',false))return;
  try{
    sound??=new AudioContext();
    const now=sound.currentTime,gain=sound.createGain(),tone=sound.createOscillator();
    tone.type='triangle';tone.frequency.setValueAtTime(kind==='ok'?660:kind==='back'?330:1180,now);
    if(kind==='ok')tone.frequency.exponentialRampToValueAtTime(990,now+.09);
    gain.gain.setValueAtTime(kind==='move'?.018:.035,now);gain.gain.exponentialRampToValueAtTime(.0001,now+(kind==='move'?.05:.14));
    tone.connect(gain).connect(sound.destination);tone.start(now);tone.stop(now+.16);
  }catch{}
}
const visible=scope=>[...scope.querySelectorAll('button:not(:disabled),a[href],summary')].filter(el=>el.getClientRects().length);
// Move focus to the nearest control in the pressed direction.
export function moveFocus(scope,dx,dy){
  const list=visible(scope),current=list.includes(document.activeElement)?document.activeElement:null;
  document.documentElement.dataset.nav='1';
  if(!current){(list.find(el=>el.matches('[data-first]'))||list[0])?.focus();return;}
  const a=current.getBoundingClientRect(),ax=a.left+a.width/2,ay=a.top+a.height/2;
  let best,score=Infinity;
  for(const el of list){
    if(el===current)continue;
    const b=el.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;
    if((dx?(cx-ax)*dx:(cy-ay)*dy)<=4)continue;
    const gap=Math.max(0,dx?(dx>0?b.left-a.right:a.left-b.right):(dy>0?b.top-a.bottom:a.top-b.bottom));
    const overlap=dx?Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top):Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const across=dx?Math.abs(cy-ay):Math.abs(cx-ax);
    const total=gap+across*(overlap>0?.25:3);
    if(total<score){score=total;best=el;}
  }
  if(best){best.focus();best.scrollIntoView({block:'nearest',inline:'nearest'});blip();}
}
// Poll the gamepad every frame so a press that paused the race is not read again as a menu press.
export function watchGamepad(inMenu,act){
  let last=[],repeatAt=0,heldDirection='';
  const names={0:'ok',1:'back',3:'controls',4:'tabPrev',5:'tabNext',6:'circuitPrev',7:'circuitNext',9:'start'};
  const poll=now=>{
    requestAnimationFrame(poll);
    const pad=activePad();if(!pad)return;
    const pressed=pad.buttons.map(v=>v>.5),menu=inMenu(),{x,y}=pad;
    const direction=pressed[12]||y<-.6?'up':pressed[13]||y>.6?'down':pressed[14]||x<-.6?'left':pressed[15]||x>.6?'right':'';
    if(menu){
      if(pad.busy)noteDevice('pad',pad.family);
      if(direction&&(direction!==heldDirection||now>=repeatAt)){repeatAt=now+(direction!==heldDirection?380:130);act(direction);}
      for(const [index,name] of Object.entries(names))if(pressed[index]&&!last[index])act(name);
    }
    heldDirection=direction;last=pressed;
  };
  requestAnimationFrame(poll);
}
const keyGlyphs={nav:['↑','↓','←','→'],ok:['Enter'],back:['Esc'],tabs:['Q','E'],tabPrev:['Q'],tabNext:['E'],circuit:[',','.'],controls:['C']};
function glyphs(){
  if(input.device!=='pad')return keyGlyphs;
  const p=padLabels(input.family);
  return {nav:[p.dpad],ok:[p.south],back:[p.east],tabs:[p.l1,p.r1],tabPrev:[p.l1],tabNext:[p.r1],circuit:[p.l2,p.r2],controls:[p.north]};
}
// Fullscreen also takes Esc for the game, so it pauses instead of leaving fullscreen. Hold Esc to leave.
export function fullscreen(){
  if(document.fullscreenElement)return document.exitFullscreen();
  document.documentElement.requestFullscreen?.().then(()=>navigator.keyboard?.lock?.(['Escape'])).catch(()=>{});
}
export const glyph=name=>glyphs()[name].map(cap=>'<kbd>'+cap+'</kbd>').join('');
export const hintBar=items=>input.device==='touch'?'':items.map(([name,label])=>'<span>'+glyph(name)+label+'</span>').join('');
