export const LEVELS={light:.6,on:1,strong:1.4};
const channels=['strong','weak','left','right'];
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:0));
const value=input=>Number.isFinite(input)?input:0;
const shape=x=>1-Math.exp(-1.6*Math.max(0,x));
const empty=()=>({strong:0,weak:0,left:0,right:0});

export class Haptics{
  constructor(level='on',seed=1){this.level=LEVELS[level]??1;this.seed=(seed>>>0)||1;this.reset();}
  reset(){
    this.smooth=empty();this.phases={};this.lastGear=null;this.lastHit=null;this.gearKick=null;this.impact=null;this.randomState=this.seed;
  }
  noise(){this.randomState=(1664525*this.randomState+1013904223)>>>0;return this.randomState/4294967296;}
  update(d={},dt=0){
    dt=clamp(value(dt),0,.1);d??={};
    const speed=Math.max(0,value(d.speed)),rpm=clamp(value(d.rpm)),throttle=clamp(value(d.throttle));
    const braking=clamp(value(d.braking)),longG=value(d.longitudinalG),latG=value(d.lateralG),hit=clamp(value(d.hit));
    const c=empty(),p=empty(),phase=(name,rate,duty=.3)=>{
      const next=((this.phases[name]||0)+dt*rate)%1;this.phases[name]=next;return next<duty?1:0;
    };
    const random=this.noise();
    c.weak+=.02+.08*rpm*(.35+.65*throttle);
    c.strong+=.08*rpm*throttle;
    if(throttle>.05)c.right+=.05+.12*rpm*throttle;
    if(rpm>=.999&&throttle>.5)p.weak+=.45*phase('limiter',10,.35);
    c.strong+=.22*clamp(longG/1.4)*throttle;
    c.strong+=.35*clamp(-longG/4.5);
    if(braking>.05){c.left+=.25*braking+.1*clamp(-longG/4.5);}

    const pit=!!d.pit,locked=pit?0:Math.max(0,...Array.from(d.tyres?.locked||[],v=>clamp(value(v))));
    const wheelspin=pit?0:clamp(value(d.wheelspin));
    c.left+=.9*locked;c.strong+=.2*locked;p.weak+=.7*locked*phase('lock',14,.28);
    c.right+=.9*wheelspin;c.strong+=.3*wheelspin;p.weak+=.55*wheelspin*phase('spin',16,.28);
    c.strong+=.16*clamp(Math.abs(latG)/4.5);

    const slipF=pit?0:Math.abs(value(d.slipF)),slipR=pit?0:Math.abs(value(d.slipR));
    const under=clamp((slipF-.8*.105)/(.6*.105))*clamp(speed/10);
    const over=clamp((slipR-1.1*.105)/(1.5*.105))*clamp(speed/8);
    p.weak+=.35*under*(.4+.6*this.noise());c.strong+=.1*under;
    p.strong+=.65*over*(.6+.4*phase('drift',7,.5));p.weak+=.3*over*(.4+.6*this.noise());

    const surfaces=d.tyres?.surfaces||[],fraction=name=>surfaces.reduce((n,s)=>n+(s===name),0)/4,sp=clamp(speed/40);
    const kerb=fraction('kerb'),kerbPulse=phase('kerb',clamp(speed/5,4,12),.3);
    p.weak+=1.25*kerb*sp*kerbPulse;p.strong+=.8*kerb*sp*kerbPulse;
    const leftKerb=(surfaces[0]==='kerb')+(surfaces[2]==='kerb'),rightKerb=(surfaces[1]==='kerb')+(surfaces[3]==='kerb');
    p.left+=.35*(leftKerb/4)*sp*kerbPulse;p.right+=.35*(rightKerb/4)*sp*kerbPulse;
    const grass=fraction('grass'),gravel=fraction('gravel'),grassScale=grass+1.4*gravel;
    c.weak+=.5*grassScale*sp;c.strong+=.3*grassScale*sp;
    p.weak+=.1*grassScale*sp*this.noise();p.strong+=.06*grassScale*sp*this.noise();
    c.weak+=.1*fraction('runoff')*sp;

    const roadNoise=.7+.3*random;
    c.weak+=.05*clamp(speed/60)*roadNoise;
    const suspension=Array.from(d.suspension?.velocity||[],v=>Math.abs(value(v))).reduce((a,b)=>a+b,0);
    c.strong+=clamp(suspension*.06,0,.35)+.2*clamp(Math.abs(value(d.suspension?.verticalG))-.3);
    c.strong+=.05*clamp((speed-60)/35)*random;
    if(this.lastHit===null)this.lastHit=hit;
    else{if(hit>this.lastHit+.05)this.impact={age:0,amplitude:hit};this.lastHit=hit;}
    c.strong+=.5*hit;
    if(value(d.wallSide)!==0&&speed>1){const scrape=clamp(speed/30);c.weak+=.5*scrape;p.weak+=.1*scrape*this.noise();c.strong+=.3*scrape;}

    const gear=value(d.gear);
    if(this.lastGear!==null&&gear!==this.lastGear)this.gearKick={age:0,strong:gear<this.lastGear ? .6 : .5,weak:gear<this.lastGear ? .35 : .15,right:gear<this.lastGear ? .3 : 0};
    this.lastGear=gear;

    for(const channel of channels){
      const tau=c[channel]>this.smooth[channel] ? .025 : .09;
      this.smooth[channel]+=(c[channel]-this.smooth[channel])*(1-Math.exp(-dt/tau));
    }
    if(this.gearKick){
      const kick=Math.exp(-this.gearKick.age/.04);
      p.strong+=this.gearKick.strong*kick;p.weak+=this.gearKick.weak*kick;p.right+=this.gearKick.right*kick;
      this.gearKick.age+=dt;if(this.gearKick.age>.16)this.gearKick=null;
    }
    if(this.impact){
      const kick=this.impact.amplitude*Math.exp(-this.impact.age/.12);
      p.strong+=2*kick;p.weak+=.9*kick;p.left+=.8*kick;p.right+=.8*kick;
      this.impact.age+=dt;if(this.impact.age>.5)this.impact=null;
    }
    return Object.fromEntries(channels.map(channel=>[channel,shape((this.smooth[channel]+p[channel])*this.level)]));
  }
}
