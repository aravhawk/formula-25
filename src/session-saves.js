import {captureSession} from './checkpoint.js';
import {RaceStore,SaveConflict} from './save-store.js';

const store=new RaceStore({open:(...args)=>indexedDB.open(...args)},()=>localStorage);
export const loadRace=()=>store.load();
export const removeRace=owner=>store.commit(owner,null);

// Forced saves also keep a synchronous page-exit copy. Ordinary driving uses
// asynchronous IDB transactions and never queues a backlog behind a slow disk.
export class SessionSaves{
  constructor(setup,onWarning){
    this.setup=setup;this.onWarning=onWarning;this.sequence=0;
    this.owner=Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
    this.enabled=false;this.busy=0;
  }
  record(session){
    return {owner:this.owner,sequence:++this.sequence,
      snapshot:structuredClone(captureSession(session,this.setup))};
  }
  async claim(session,expected){
    await store.commit(expected,this.record(session));this.enabled=true;
  }
  async save(session,final){
    if(!this.enabled||!final&&this.busy)return;
    this.busy++;
    try{
      const record=this.record(session);
      if(final)store.finalCopy(record);
      await store.commit(this.owner,record);this.onWarning('');
    }
    catch(error){
      if(error instanceof SaveConflict){
        this.enabled=false;
        if(session.active)session.hooks.takeover();
      }else this.onWarning('Browser storage is unavailable. Your latest progress may be lost.');
    }finally{this.busy--;}
  }
  async release(session,complete){
    if(!this.enabled)return;
    if(!complete)await this.save(session,true);
    this.enabled=false;
    if(complete){
      try{await removeRace(this.owner);}catch(error){if(!(error instanceof SaveConflict))throw error;}
    }
  }
}
