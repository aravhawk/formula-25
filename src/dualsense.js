// DualSense output over WebHID: rumble and adaptive trigger effects, on USB and Bluetooth.
// The Gamepad API cannot reach the trigger motors, so this talks to the controller directly.
const SONY=0x054c,FILTERS=[{vendorId:SONY,productId:0x0ce6},{vendorId:SONY,productId:0x0df2}];
const USB_REPORT=0x02,BT_REPORT=0x31,CALIBRATION=0x05,COMMON=47;
const off=()=>Uint8Array.of(0x05,0,0,0,0,0,0,0,0,0,0);
const zones=(position,value)=>{let active=0,force=0;for(let i=position;i<10;i++){active|=1<<i;force+=value*2**(3*i);}return [active,force];};
const clamp=(value,low,high)=>Math.min(high,Math.max(low,Number.isFinite(value)?Math.round(value):low));
// Effects are a mode byte followed by ten parameter bytes, using Sony's zones: ten steps of trigger travel.
export const effects={
  off,
  // Steady resistance from `position` to the end of travel. Strength runs 1 to 8.
  feedback(position,strength){
    strength=clamp(strength,0,8);if(!strength)return off();
    const [active,force]=zones(clamp(position,0,9),strength-1),out=new Uint8Array(11);
    out[0]=0x21;out[1]=active&255;out[2]=active>>8;
    for(let i=0;i<4;i++)out[3+i]=Math.floor(force/2**(8*i))&255;
    return out;
  },
  // Buzz from `position` to the end of travel. Amplitude runs 1 to 8, frequency is in Hz.
  vibration(position,amplitude,frequency){
    amplitude=clamp(amplitude,0,8);frequency=clamp(frequency,0,255);if(!amplitude||!frequency)return off();
    const out=effects.feedback(position,amplitude);out[0]=0x26;out[10]=0;out[9]=frequency;return out;
  }
};
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xEDB88320^n>>>1:n>>>1;return n>>>0;});
export function crc32(bytes){let crc=0xFFFFFFFF;for(const byte of bytes)crc=table[(crc^byte)&255]^crc>>>8;return (~crc)>>>0;}
const motor=value=>clamp((Number.isFinite(value)?value:0)*255,0,255);
// The data that follows the report id. `triggers` marks the trigger effects as changed, so they are only rewritten when they move.
export function buildReport({transport='usb',seq=0,strong=0,weak=0,left=off(),right=off(),triggers=true}={}){
  const common=new Uint8Array(COMMON);
  common[0]=0x03|(triggers?0x0c:0);common[2]=motor(weak);common[3]=motor(strong);
  common.set(right,10);common.set(left,21);common[38]=0x04;
  if(transport!=='bluetooth')return {id:USB_REPORT,data:Uint8Array.from([...common,...new Uint8Array(15)])};
  const data=new Uint8Array(77);
  data[0]=(seq&15)<<4;data[1]=0x10;data.set(common,2);
  const signed=new Uint8Array(75);signed.set([0xA2,BT_REPORT]);signed.set(data.subarray(0,73),2);
  new DataView(data.buffer).setUint32(73,crc32(signed),true);
  return {id:BT_REPORT,data};
}
const hid=()=>globalThis.navigator?.hid;
const wanted=device=>FILTERS.some(f=>f.vendorId===device.vendorId&&f.productId===device.productId);
class DualSense{
  device=null;transport='usb';seq=0;busy=false;queued=null;sent=null;refreshAt=0;
  get supported(){return !!hid();}
  get ready(){return !!this.device?.opened;}
  async connect(){const [device]=await hid().requestDevice({filters:FILTERS});if(device)await this.open(device);}
  // Pads the player allowed on an earlier visit reopen on their own.
  async restore(){
    if(this.ready||!this.supported)return;
    for(const device of await hid().getDevices().catch(()=>[])){
      if(!wanted(device))continue;
      try{await this.open(device);return;}catch{}
    }
  }
  async open(device){
    if(!device.opened)await device.open();
    const bluetooth=device.collections.some(c=>c.outputReports?.some(r=>r.reportId===BT_REPORT));
    // Over Bluetooth the pad starts in a basic mode and ignores full output reports until it is asked for its calibration data.
    if(bluetooth)await device.receiveFeatureReport(CALIBRATION).catch(()=>{});
    this.device=device;this.transport=bluetooth?'bluetooth':'usb';this.sent=null;this.busy=false;
  }
  // One write at a time. A write that arrives mid-flight waits its turn and replaces any older one, so a stop is never lost.
  send(motors={},effects={}){
    if(!this.ready)return;
    if(this.busy){this.queued=[motors,effects];return;}
    const {strong=0,weak=0}=motors,{left=off(),right=off()}=effects,now=performance.now();
    const key=left.join()+'|'+right.join(),triggers=key!==this.sent||now>=this.refreshAt;
    const report=buildReport({transport:this.transport,seq:this.seq,strong,weak,left,right,triggers});
    this.seq=(this.seq+1)&15;this.busy=true;
    this.device.sendReport(report.id,report.data).then(()=>{if(triggers){this.sent=key;this.refreshAt=now+1000;}},()=>{this.sent=null;}).finally(()=>{
      this.busy=false;const next=this.queued;this.queued=null;if(next)this.send(...next);
    });
  }
}
export const dualsense=new DualSense();
hid()?.addEventListener('disconnect',event=>{if(event.device===dualsense.device)dualsense.device=null;});
hid()?.addEventListener('connect',event=>{if(!dualsense.ready&&wanted(event.device))dualsense.open(event.device).catch(()=>{});});
