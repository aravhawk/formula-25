// Picks a render scale and frame cadence the display can hold without uneven frames.
// It sees only the time between presented frames, so it runs without a renderer.
export let displayInterval=0;
// Measure the panel in the paddock, where a slow 3D frame cannot look like a slower display.
export function measureDisplay(){
  const samples=[];let last=0;
  const frame=now=>{
    if(document.hidden){last=0;requestAnimationFrame(frame);return;}
    if(last&&now>last)samples.push(now-last);
    last=now;
    if(samples.length<36)requestAnimationFrame(frame);
    else{
      const period=samples.sort((a,b)=>a-b)[8]/1000;
      if(period>=1/500&&period<=1/24)displayInterval=period;
    }
  };
  requestAnimationFrame(frame);
}
export class FramePacer{
  constructor(floor=.6,refresh=displayInterval){
    this.refresh=refresh;this.p95=0;this.mean=0;this.floorWindows=0;
    this.floor=floor;this.scale=1;this.cadence=1;this.interval=1/60;this.measured=false;
    this.samples=[];this.window=0;this.settle=1.5;this.calm=0;this.patience=4;this.probed=false;this.full=0;this.retries=0;
  }
  // Returns true when the scale or cadence changed.
  add(dt){
    if(dt<=0||dt>1){this.samples.length=0;this.window=0;this.settle=Math.max(this.settle,.75);return false;}
    if(this.settle>0){this.settle-=dt;return false;}
    this.samples.push(dt);
    this.window+=dt;
    if(this.samples.length<48&&(this.window<1.2||this.samples.length<12))return false;
    // The interval most frames achieve, and the share that took at least one refresh longer.
    const sorted=[...this.samples].sort((a,b)=>a-b);
    const held=sorted[Math.floor(sorted.length*.2)];
    this.p95=sorted[Math.ceil(sorted.length*.95)-1];
    this.mean=this.window/sorted.length;
    const late=this.samples.filter(v=>v>held*1.45).length/this.samples.length;
    const early=this.samples.filter(v=>v<held*.7).length/this.samples.length;
    const fastest=sorted[0];
    this.samples.length=0;this.window=0;this.interval=held;this.measured=true;
    const scale=this.scale,cadence=this.cadence;
    const target=this.refresh?Math.max(1/120,this.refresh*this.cadence):0;
    const overBudget=target&&this.p95>target*1.30;
    if(overBudget||late>.06||held>1/45){
      // A failed step up waits twice as long before the next attempt.
      if(this.probed)this.patience=Math.min(64,this.patience*2);
      this.calm=this.full=0;
      if(this.refresh>0){
        // Prefer 120 at a lower pixel cost. If even the minimum misses, present on an even refresh divisor.
        this.floorWindows=scale<=this.floor?this.floorWindows+1:0;
        if(this.floorWindows>=3&&cadence===1&&this.refresh<1/80){this.cadence=2;this.floorWindows=0;}
        else this.scale=Math.max(this.floor,scale*Math.max(.75,Math.min(.94,Math.sqrt(target/this.p95))));
      }
      else if(cadence===1&&held<1/90&&scale<.9){this.cadence=2;this.scale=1;}
      else if(held>1/30)this.scale=Math.max(this.floor,scale*Math.max(.5,Math.sqrt(.02/held)));
      else this.scale=Math.max(this.floor,scale-(late>.3?.12:.07));
    }else if(!this.refresh&&early>.06&&cadence===1){
      // Most frames take two refreshes and a few take one: lock to the rate that is being held.
      this.cadence=Math.max(2,Math.round(held/fastest));this.calm=this.full=0;this.retries=2;
    }else{
      this.floorWindows=0;
      if(scale===1&&cadence>1&&++this.full>=40&&this.retries<2){this.cadence=1;this.retries++;this.full=0;}
      else if(++this.calm>=this.patience){this.calm=0;this.scale=Math.min(1,scale+.06);}
    }
    this.probed=this.scale>scale||this.cadence<cadence;
    const changed=this.scale!==scale||this.cadence!==cadence;
    if(changed)this.settle=.6;
    return changed;
  }
}
