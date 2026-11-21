// Advance the pit engineer's prompts from actual car state and pedal inputs.
export class FirstDrive{
  constructor(){this.stage=0;this.left=false;this.right=false;}
  update(d,input){
    if(this.stage===0&&d.speed>=60/3.6)this.stage++;
    else if(this.stage===1){
      if(input.steer<-.15)this.left=true;
      if(input.steer>.15)this.right=true;
      if(d.speed>2&&this.left&&this.right)this.stage++;
    }else if(this.stage===2&&d.braking>.3&&d.speed<=25/3.6)this.stage++;
    else if(this.stage===3&&d.boost&&d.energy<.995)this.stage++;
    return this.stage;
  }
  prompt(device){
    const keys=device==='pad'?['RT','left stick','LT','RT + A']:device==='touch'?['THR','‹ and ›','BRK','THR + ERS']:['W or ↑','A and D or ← and →','S or ↓','W + Shift'];
    return [
      ['Build up to 60 km/h','Apply throttle with '+keys[0]+'. The gearbox shifts automatically.'],
      ['Feel the steering','Use '+keys[1]+' to make a gentle correction in each direction.'],
      ['Brake to 25 km/h','Straighten the wheel, then slow down with '+keys[2]+'.'],
      ['Deploy the battery','Accelerate out of the braking zone and hold '+keys[3]+'.']
    ][this.stage];
  }
}
