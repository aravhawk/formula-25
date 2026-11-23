// Adaptive trigger plan for a DualSense: what the brake and throttle triggers should feel like right now.
import {effects} from './dualsense.js';
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:0));
const SCALE={light:.75,on:1,strong:1.2};
// Resistance that builds from the first touch to the end of travel, so the trigger pushes back at every depth.
const ramp=(from,to,scale)=>effects.resistance(Array.from({length:10},(_,i)=>Math.max(1,(from+(to-from)*i/9)*scale)));
export class Triggers{
  constructor(level='on'){this.scale=SCALE[level]??1;this.reset();}
  reset(){this.lastGear=null;this.shift=0;}
  update(d={},dt=0){
    d??={};dt=clamp(dt,0,.1);
    const speed=clamp((Number.isFinite(d.speed)?d.speed:0)/80),rpm=clamp(d.rpm),hit=clamp(d.hit),pit=!!d.pit;
    const throttle=clamp(d.throttle),longG=(Number.isFinite(d.longitudinalG)?d.longitudinalG:0)*(d.reverse?-1:1);
    const locked=pit?0:Math.max(0,...Array.from(d.tyres?.locked||[],v=>clamp(v))),wheelspin=pit?0:clamp(d.wheelspin);
    const gear=Number.isFinite(d.gear)?d.gear:0,s=this.scale;
    if(this.lastGear!==null&&gear!==this.lastGear)this.shift=.12;
    this.lastGear=gear;
    const shifting=this.shift>0;this.shift=Math.max(0,this.shift-dt);
    // The brake pedal is heavy, and gets heavier with speed and with load transfer under braking. A locking tyre makes it judder.
    const pressure=clamp(speed*.5+clamp(-longG/4.5)*.5);
    let left=ramp(4+2*pressure,7+pressure,s);
    if(locked>.15&&speed>.06)left=effects.vibration((5+3*locked)*s,30);
    // The throttle is a spring that stiffens with engine load. It buzzes on wheelspin, the rev limiter and gear changes.
    const load=clamp(rpm*.5+speed*.5);
    let right=ramp(2+3*load,5+3*load,s);
    if(wheelspin>.15&&throttle>.05)right=effects.vibration((4+4*wheelspin)*s,25);
    else if(rpm>=.999&&throttle>.5)right=effects.vibration(5*s,40);
    else if(shifting)right=effects.vibration(6*s,45);
    if(hit>.1){const kick=effects.vibration((4+4*hit)*s,50);left=kick;right=kick;}
    return {left,right};
  }
}
