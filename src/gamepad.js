// Xbox and PlayStation pads on any slot, read in the standard layout whatever the browser reports.
const names={
  xbox:{south:'A',east:'B',west:'X',north:'Y',l1:'LB',r1:'RB',l2:'LT',r2:'RT',select:'View',start:'Menu',stick:'L stick',dpad:'D-pad',up:'D-pad ↑',down:'D-pad ↓'},
  ps:{south:'✕',east:'○',west:'□',north:'△',l1:'L1',r1:'R1',l2:'L2',r2:'R2',select:'Create',start:'Options',stick:'L stick',dpad:'D-pad',up:'D-pad ↑',down:'D-pad ↓'}
};
export const padFamily=id=>/054c|sony|dualsense|dualshock|playstation/i.test(id)?'ps':'xbox';
export const padLabels=family=>names[family]||names.xbox;
// Take up stick drift near the centre and reach full lock just short of the rim.
export const stick=(v,dead=.08)=>Math.abs(v)<=dead?0:Math.sign(v)*Math.min(1,(Math.abs(v)-dead)/(.98-dead));
// Layouts of pads the browser leaves unmapped: raw button order, analogue trigger axes and the D-pad.
const raw={
  ps:{buttons:[1,2,0,3,4,5,6,7,8,9,10,11],triggers:[3,4],hat:9,home:12},
  xbox:{buttons:[0,1,2,3,4,5,,,6,7,9,10],triggers:[2,5],cross:[6,7],home:8}
};
const value=button=>button?button.value||+button.pressed:0;
// A trigger axis rests at −1 but reads 0 until it first moves, so `moved` records the axes seen off zero.
export function readPad(pad,moved=new Set()){
  const family=padFamily(pad.id),axes=pad.axes,layout=pad.mapping!=='standard'&&axes.length>=6?raw[family]:null;
  const buttons=Array.from({length:17},(_,i)=>value(pad.buttons[layout?layout.buttons[i]:i]));
  if(layout){
    layout.triggers.forEach((axis,i)=>{
      if(axes[axis])moved.add(axis);
      if(moved.has(axis))buttons[6+i]=(axes[axis]+1)/2;
    });
    if(layout.cross){
      const [x,y]=layout.cross.map(axis=>axes[axis]||0);
      buttons[12]=+(y<-.5);buttons[13]=+(y>.5);buttons[14]=+(x<-.5);buttons[15]=+(x>.5);
    }else{
      // A hat switch steps clockwise from −1 at the top in sevenths. Its rest value is above 1.
      const hat=axes[layout.hat],at=(from,to)=>+(!!hat&&hat>=from&&hat<=to);
      buttons[12]=at(-1,-.7)||at(.95,1);buttons[15]=at(-.75,-.1);buttons[13]=at(-.2,.45);buttons[14]=at(.4,1);
    }
    buttons[16]=value(pad.buttons[layout.home]);
  }
  return {pad,family,buttons,x:axes[0]||0,y:axes[1]||0};
}
const listed=()=>{try{return [...(navigator.getGamepads?.()||[])];}catch{return [];}};
const seen=new Map();let slot=-1,shaking=false;
globalThis.addEventListener?.('gamepaddisconnected',event=>seen.delete(event.gamepad.index));
// The pad in use: keep the current one until another is pressed while it sits idle.
export function activePad(pads=listed()){
  let first=null,held=null,busy=null;
  for(const pad of pads){
    if(!pad||pad.connected===false||pad.buttons.length<4||pad.axes.length<2)continue;
    if(!seen.has(pad.index))seen.set(pad.index,new Set());
    const state=readPad(pad,seen.get(pad.index));
    state.busy=state.buttons.some(v=>v>.5)||Math.abs(state.x)>.5||Math.abs(state.y)>.5;
    first??=state;if(pad.index===slot)held=state;if(state.busy)busy??=state;
  }
  const chosen=held&&(held.busy||!busy)?held:busy||first;
  slot=chosen?chosen.pad.index:-1;
  return chosen;
}
// The light motor carries kerbs and slides, the heavy one carries contact. Call it several times a second.
export function rumble(pad,weak=0,strong=0){
  const motor=pad?.vibrationActuator;if(!motor?.playEffect)return;
  try{
    if(weak<.03&&strong<.03){if(shaking){shaking=false;motor.reset?.()?.catch?.(()=>{});}return;}
    shaking=true;
    motor.playEffect('dual-rumble',{duration:160,weakMagnitude:Math.min(1,weak),strongMagnitude:Math.min(1,strong)})?.catch?.(()=>{});
  }catch{}
}
