// Adaptive trigger plan for a DualSense: what the brake and throttle triggers should feel like right now.
import {effects} from './dualsense.js';
import {LEVELS} from './haptics.js';
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:0));
export class Triggers{
  constructor(level='on'){this.scale=LEVELS[level]??1;this.reset();}
  reset(){this.lastGear=null;this.shift=0;}
  update(d={},dt=0){
    d??={};dt=clamp(dt,0,.1);
    const speed=Math.max(0,Number.isFinite(d.speed)?d.speed:0),rpm=clamp(d.rpm),throttle=clamp(d.throttle),hit=clamp(d.hit),pit=!!d.pit;
    const longG=(Number.isFinite(d.longitudinalG)?d.longitudinalG:0)*(d.reverse?-1:1);
    const locked=pit?0:Math.max(0,...Array.from(d.tyres?.locked||[],v=>clamp(v))),wheelspin=pit?0:clamp(d.wheelspin);
    const gear=Number.isFinite(d.gear)?d.gear:0,s=this.scale;
    if(this.lastGear!==null&&gear!==this.lastGear)this.shift=.12;
    this.lastGear=gear;
    const shifting=this.shift>0;this.shift=Math.max(0,this.shift-dt);
    // The brake pedal pushes back harder as the car loads up under braking. A locking tyre makes it judder.
    let left=effects.feedback(2,(3+4*clamp(-longG/4.5))*s),right;
    if(locked>.15&&speed>5)left=effects.vibration(2,(2+6*locked)*s,30);
    // The throttle is a light spring that stiffens with revs, and it buzzes on wheelspin, the limiter and gear changes.
    if(wheelspin>.15&&throttle>.05)right=effects.vibration(3,(2+5*wheelspin)*s,25);
    else if(rpm>=.999&&throttle>.5)right=effects.vibration(4,4*s,40);
    else if(shifting)right=effects.vibration(0,5*s,45);
    else right=effects.feedback(3,(1+2*rpm)*s);
    if(hit>.1){const kick=effects.vibration(0,(3+5*hit)*s,50);left=kick;right=kick;}
    return {left,right};
  }
}
