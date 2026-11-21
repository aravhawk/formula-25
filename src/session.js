import {FirstDrive} from './first-drive.js';
import {MotorAudio} from './audio.js';
import {DriverView} from './driver-view.js';
import {Cockpit} from './cockpit.js';
import {updateMirrors} from './mirrors.js';
import {graphicsPrefs} from './graphics.js';
import {World} from './world.js';
import {STEP,tyreColor} from './racing.js';
import {clamp,formatTime,read} from './data.js';
import {noteDevice,fullscreen} from './menu.js';
import {wrap} from './physics.js';
export const audio=new MotorAudio();
const $=id=>document.getElementById(id);
// The HUD refreshes twelve times a second. Touch the page only when a value changes.
const shown=new Map();
const put=(id,value,key='textContent')=>{if(shown.get(id)!==value){shown.set(id,value);$(id)[key]=value;}};
const keyFor={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'throttle',KeyW:'throttle',ArrowDown:'brake',KeyS:'brake',ShiftLeft:'boost',ShiftRight:'boost',Space:'drs'};
export class Session{
  static async create(game,hooks){
    const cockpit=await Cockpit.create();
    const world=await World.create($('viewport'),game);
    return new Session(game,hooks,world,cockpit);
  }
  constructor(game,hooks,world,cockpit){
    this.game=game;this.hooks=hooks;this.world=world;this.cockpit=cockpit;this.eye=new DriverView(!matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.pose=Object.create(game.player);
    this.before={distance:game.player.distance,heading:game.player.heading,offset:game.player.offset};
    this.line=true;this.keys=new Set();this.touches=new Map();this.lastButtons=[];this.abort=new AbortController();
    this.paused=false;this.active=true;this.previous=0;this.acc=0;this.hudAfter=0;this.held=0;shown.clear();this.readout=read('readout','on')==='on';
    const on=(target,type,callback)=>target.addEventListener(type,callback,{signal:this.abort.signal});
    on(window,'resize',()=>this.resize());on(window,'blur',()=>this.pause());
    on(document,'visibilitychange',()=>{if(document.hidden)this.pause();});
    on(window,'keydown',event=>{
      if(this.paused||!this.active||document.querySelector('dialog[open]'))return;
      const key=event.code;
      if(keyFor[key]){event.preventDefault();this.keys.add(key);}
      if(event.repeat)return;
      if(key==='Escape'||key==='KeyP'){event.preventDefault();this.pause();}
      if(key==='KeyR')game.player.toggleReverse();
      if(key==='KeyQ')game.player.shift(-1);if(key==='KeyE')game.player.shift(1);
      if(key==='KeyB')game.requestPit();if(key==='KeyT')game.pickTyre();
      if(key==='KeyL')this.line=!this.line;
      if(key==='KeyH')this.toggleHelp();
      if(key==='KeyF')fullscreen();
    });
    on(window,'keyup',event=>this.keys.delete(event.code));
    for(const b of document.querySelectorAll('[data-drive]')){
      on(b,'pointerdown',e=>{b.setPointerCapture(e.pointerId);this.touches.set(e.pointerId,b.dataset.drive);});
      on(b,'lostpointercapture',e=>this.touches.delete(e.pointerId));
      on(b,'pointerup',e=>this.touches.delete(e.pointerId));
    }
    on($('pause'),'click',()=>this.pause());
    $('startLights').replaceChildren(...Array.from({length:5},()=>document.createElement('i')));
    $('hudVenue').textContent=game.event.city.toUpperCase();this.help=null;$('keys').classList.add('show');$('race').hidden=false;$('garage').hidden=true;
    if(game.practice){
      this.training=new FirstDrive();$('coach').hidden=false;
      on($('endPractice'),'click',()=>this.endPractice());
      $('radio').hidden=true;
    }
    this.resize();this.frame=this.frame.bind(this);this.frameId=requestAnimationFrame(this.frame);
  }
  // The control card shows itself on the grid and for the opening seconds. H pins or hides it.
  toggleHelp(){this.help=!$('keys').classList.contains('show');$('keys').classList.toggle('show',this.help);}
  endPractice(){
    cancelAnimationFrame(this.frameId);audio.silence();this.paused=true;
    this.keys.clear();this.touches.clear();this.hooks.briefing(this);
  }
  resize(){
    const w=$('race').clientWidth,h=$('race').clientHeight;
    if(w&&h){this.world.resize(w,h);this.cockpit.resize(w,h);}
  }
  inputs(){
    const held=new Set([...this.keys].map(k=>keyFor[k]).concat([...this.touches.values()]));
    const pad=navigator.getGamepads?.()[0],v=i=>pad?.buttons[i]?.value||0;
    if(pad){const pressed=pad.buttons.map(b=>b.pressed);
      const hit=i=>pressed[i]&&!this.lastButtons[i];
      if(hit(4))this.game.player.shift(-1);if(hit(5))this.game.player.shift(1);
      if(hit(2))this.game.requestPit();if(hit(3))this.game.pickTyre();if(hit(8))this.toggleHelp();if(hit(9))this.pause();
      if(pressed.some(Boolean)||Math.abs(pad.axes[0]||0)>.4)noteDevice('pad');
      this.lastButtons=pressed;}
    const axis=pad?.axes[0]||0;
    const steer=Number(held.has('right'))-Number(held.has('left'))+(Math.abs(axis)>.065?axis:0);
    return {steer:clamp(steer,-1,1),throttle:Math.max(+held.has('throttle'),v(7)),brake:Math.max(+held.has('brake'),v(6)),
      boost:held.has('boost')||v(0)>.5,drs:held.has('drs')||v(1)>.5};
  }
  pause(){if(this.paused||!this.active||this.game.state==='finished')return;
    this.paused=true;cancelAnimationFrame(this.frameId);this.keys.clear();this.touches.clear();audio.silence();this.hooks.pause(this);}
  resume(){if(!this.paused||!this.active)return;this.paused=false;this.previous=0;this.acc=0;this.frameId=requestAnimationFrame(this.frame);}
  async restoreGraphics(){
    if(this.recovering)return;
    this.recovering=true;audio.silence();this.keys.clear();this.touches.clear();
    const backend=this.world.backend==='WebGPU'?'webgl':'canvas';
    try{this.world.dispose();}catch(error){console.warn('Device cleanup',error.message);}
    const replacement=await World.create($('viewport'),this.game,{...graphicsPrefs(),backend});
    if(!this.active){replacement.dispose();return;}
    this.world=replacement;this.recovering=false;this.resize();this.previous=0;this.acc=0;
    this.game.say('Graphics restored · '+replacement.backend,3);
    if(!this.paused)this.frameId=requestAnimationFrame(this.frame);
  }
  hud(){
    const g=this.game,d=g.player;
    put('position',g.practice?'FP':g.qualifying?'Q':'P'+(g.order.indexOf(d)+1));document.querySelector('.bigtime small').hidden=!!g.qualifying;put('lapNum','LAP '+Math.min(g.laps,d.completed+1)+' / '+g.laps);
    put('lapTime',formatTime(Math.max(0,g.raceTime-d.lapStart)));put('sector','SECTOR '+g.sector);
    const ahead=g.order[g.order.indexOf(d)-1],gap=ahead?Math.max(0,ahead.distance-d.distance)/Math.max(d.speed,25):null;
    let interval=g.state==='grid'?'STARTING GRID':ahead?ahead.id+'  +'+gap.toFixed(1)+'s':'RACE LEADER';
    if(g.practice)interval='SOLO PRACTICE';
    else if(g.qualifying){
      const ref=g.track.referenceTime(d.distance),delta=g.raceTime-ref;
      interval=ref===null?'FLYING LAP':'VER REF  '+(delta>=0?'+':'−')+Math.abs(delta).toFixed(2)+'s';
    }
    put('interval',interval);
    put('tyres','<i style="--tyre:'+tyreColor[d.tyre]+'"></i>'+d.tyre+' · '+Math.round(100-d.wear*100)+'%','innerHTML');
    put('condition',(d.damage>.025?'Wing '+Math.round((1-d.damage)*100)+'% · ':'')+Math.round(d.tyres.temp.reduce((a,b)=>a+b)/4)+' °C');
    put('deploy',d.pit?'PIT LIMITER':d.reverse?'REVERSE':d.requested?'BOX · '+g.nextTyre:d.drs?'DRS OPEN':g.drsReady?'DRS AVAILABLE':'ERS '+Math.round(d.energy*100)+'%');
    g.track.drawMap($('raceMap'),d.distance,'#ff6c44');
    $('startLights').hidden=g.state!=='grid';[...$('startLights').children].forEach((l,i)=>l.classList.toggle('on',i<g.lights));
    if(this.help===null)$('keys').classList.toggle('show',g.state==='grid'||g.raceTime<7||!!g.practice);
    put('perf',this.readout?this.world.backend+(this.world.status?' · '+this.world.status:''):'');
    put('radio',g.state==='grid'?'Hold throttle for lights out':g.raceTime<1?'GO':d.pit&&!d.pit.serviced&&d.speed<.5?'Changing tyres':g.clock<g.messageUntil?g.message:'');
  }
  frame(now){
    if(this.paused||!this.active||this.recovering)return;
    if(this.world.lost){void this.restoreGraphics();return;}
    // Hold an even half rate when the display refreshes faster than the scene can be drawn.
    if(this.world.cadence>1&&(this.held=(this.held+1)%this.world.cadence)){this.frameId=requestAnimationFrame(this.frame);return;}
    const dt=this.previous?(now-this.previous)/1000:0;this.previous=now;
    const input=this.inputs();if(this.paused)return;
    this.acc+=Math.min(dt,.19);
    const live=this.game.player;
    while(this.acc>=STEP&&this.game.state!=='finished'){
      this.before.distance=live.distance;this.before.heading=live.heading+live.bodyYaw;this.before.offset=live.offset;
      this.game.tick(STEP,input);this.acc-=STEP;
    }
    const d=this.pose,alpha=Math.min(1,this.acc/STEP);
    d.distance=this.before.distance+(live.distance-this.before.distance)*alpha;d.offset=this.before.offset+(live.offset-this.before.offset)*alpha;
    d.heading=this.before.heading+wrap(live.heading+live.bodyYaw-this.before.heading)*alpha;
    for(const c of this.game.ai){
      c.renderDistance=c.oldDistance===undefined?c.distance:c.oldDistance+(c.distance-c.oldDistance)*alpha;
      c.renderOffset=c.oldOffset===undefined?c.offset:c.oldOffset+(c.offset-c.oldOffset)*alpha;
    }
    if(this.training){
      const stage=this.training.update(live,input);
      if(stage===4||this.game.state==='finished'){this.endPractice();return;}
      const device=navigator.getGamepads?.()[0]?'pad':this.touches.size||matchMedia('(pointer:coarse)').matches?'touch':'keys';
      if(stage!==this.shownStage||device!==this.shownDevice){
        this.shownStage=stage;this.shownDevice=device;
        $('coachStep').textContent='FIRST DRIVE   '+(stage+1)+' / 4';
        [$('coachTitle').textContent,$('coachHint').textContent]=this.training.prompt(device);
      }
    }
    this.eye.update(d,Math.min(.1,dt));
    let light;
    try{light=this.world.render(d,this.eye,this.line,dt);}
    catch(error){
      if(this.world.backend==='Canvas')throw error;
      console.warn(this.world.backend+' frame failed',error.message);void this.restoreGraphics();return;
    }
    this.cockpit.draw(d,this.eye,light);audio.update(d);
    if(now>=this.hudAfter){this.hud();if(!this.world.mirrors)updateMirrors(this.game);this.hudAfter=now+80;}
    if(this.game.state==='finished'){audio.silence();this.game.settle();this.hooks.finish(this);return;}
    this.frameId=requestAnimationFrame(this.frame);
  }
  dispose(){this.active=false;cancelAnimationFrame(this.frameId);audio.silence();this.abort.abort();this.world.dispose();$('coach').hidden=true;$('radio').hidden=false;$('race').hidden=true;$('garage').hidden=false;}
}
