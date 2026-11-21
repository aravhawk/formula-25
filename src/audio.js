// Continuous sources avoid clicks during shifts and can be suspended with the tab.
export class MotorAudio {
  constructor(){this.muted=false;}
  async arm(){
    try {
      if(!this.ctx){
        const ctx=new AudioContext();this.ctx=ctx;
        this.out=ctx.createGain();this.out.gain.value=0;this.out.connect(ctx.destination);
        this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.Q.value=.6;this.filter.connect(this.out);
        this.voices=[0,1,2].map((_,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();
          o.type=['sawtooth','triangle','sine'][i];g.gain.value=[.23,.32,.13][i];o.connect(g).connect(this.filter);o.start();return o;});
        const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;
        const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1400;
        this.wind=ctx.createGain();this.wind.gain.value=0;src.connect(lp).connect(this.wind).connect(this.out);src.start();
        const tireNoise=ctx.createBiquadFilter();tireNoise.type='bandpass';tireNoise.frequency.value=170;tireNoise.Q.value=1.4;
        this.rumble=ctx.createGain();this.rumble.gain.value=0;src.connect(tireNoise).connect(this.rumble).connect(this.out);
        const metal=ctx.createBiquadFilter();metal.type='bandpass';metal.frequency.value=1900;metal.Q.value=.9;
        this.scrape=ctx.createGain();this.scrape.gain.value=0;src.connect(metal).connect(this.scrape).connect(this.out);
        this.skid=ctx.createOscillator();this.skid.type='triangle';this.skidGain=ctx.createGain();this.skidGain.gain.value=0;
        this.skid.connect(this.skidGain).connect(this.out);this.skid.start();
      }
      await this.ctx.resume();
    }catch{/* Driving remains available without Web Audio. */}
  }
  silence(){if(this.out)this.out.gain.setTargetAtTime(0,this.ctx.currentTime,.025);}
  update(drive){
    if(!this.out)return;const now=this.ctx.currentTime,ev=drive.car.gears===1;
    const pitch=ev?65+drive.rpm*490:drive.engineRPM/20;
    this.voices.forEach((o,i)=>{const ratios=ev?[1,2.002,4.02]:[1,.501,2.01];o.frequency.setTargetAtTime(pitch*ratios[i],now,.034);});
    const engineLoad=drive.shiftCut>0?0:drive.throttle;
    this.filter.frequency.setTargetAtTime((ev?580:700)+(drive.rpm+engineLoad*.8)*(ev?760:1600),now,.04);
    this.wind.gain.setTargetAtTime(.015+drive.speed*.0027,now,.1);
    const [fl,fr,rl,rr]=drive.suspension.contacts;
    const roughness=Math.max(Math.abs(fl),Math.abs(fr),Math.abs(rl),Math.abs(rr));
    this.rumble.gain.setTargetAtTime(Math.max(0,roughness-.006)*Math.min(1,drive.speed/18)*11,now,.026);
    const contact=drive.wallSide!==0;
    this.scrape.gain.setTargetAtTime(Math.max(drive.hit||0,contact?Math.min(.7,drive.speed*.016):0),now,.025);
    this.skid.frequency.value=740+drive.slip*270;
    this.skidGain.gain.setTargetAtTime(drive.slip*.13,now,.08);
    this.out.gain.setTargetAtTime(this.muted?0:(ev?.095:.15)*(1+drive.throttle*.5),now,.03);
  }
}
