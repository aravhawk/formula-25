// The small head record is compared inside the same transaction as the payload.
// Resuming or replacing a session transfers ownership, fencing out older tabs.
export class SaveConflict extends Error {}
const tailKey=owner=>'formula25.v1.final.'+owner;
function encode(key,value){
  if(value instanceof Set)return {type:'set',values:[...value]};
  if(value instanceof Float64Array||value instanceof Float32Array)return {type:value.constructor.name,values:[...value]};
  if(typeof value==='number'&&!Number.isFinite(value))return {type:'number',value:String(value)};
  return value;
}
function decode(key,value){
  if(value?.type==='set')return new Set(value.values);
  if(value?.type==='Float64Array')return new Float64Array(value.values);
  if(value?.type==='Float32Array')return new Float32Array(value.values);
  if(value?.type==='number')return Number(value.value);
  return value;
}
export class RaceStore{
  constructor(database,storage){this.database=database;this.storage=storage;}
  open(){
    if(!this.connection)this.connection=new Promise((resolve,reject)=>{
      const request=this.database.open('formula25.sessions',1);
      let blocked=false;
      request.onblocked=()=>{blocked=true;reject(Error('Another tab is blocking the save database.'));};
      request.onupgradeneeded=()=>request.result.createObjectStore('checkpoint');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        if(blocked){db.close();return;}
        db.onversionchange=()=>{db.close();this.connection=null;};
        resolve(db);
      };
    }).catch(error=>{this.connection=null;throw error;});
    return this.connection;
  }
  async load(){
    const db=await this.open();
    const record=await new Promise((resolve,reject)=>{
      const req=db.transaction('checkpoint').objectStore('checkpoint').get('race');
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    if(!record)return null;
    try{
      const tail=JSON.parse(this.storage()?.getItem(tailKey(record.owner))||'null',decode);
      if(tail?.owner===record.owner&&tail.sequence>record.sequence)return tail;
    }catch{/* The committed IndexedDB snapshot still works if a final write failed. */}
    return record;
  }
  finalCopy(record){
    try{this.storage()?.setItem(tailKey(record.owner),JSON.stringify(record,encode));}catch{/* Regular checkpoints use IndexedDB. */}
  }
  async commit(expected,record){
    const db=await this.open();
    await new Promise((resolve,reject)=>{
      let tx;
      try{tx=db.transaction('checkpoint','readwrite',{durability:'strict'});}
      catch{tx=db.transaction('checkpoint','readwrite');}
      const store=tx.objectStore('checkpoint'),read=store.get('head');
      let conflict=false;
      read.onsuccess=()=>{
        const head=read.result;
        if((head?.owner??null)!==expected){conflict=true;tx.abort();return;}
        if(record){
          if(head?.owner===record.owner&&head.sequence>=record.sequence)return;
          store.put({owner:record.owner,sequence:record.sequence},'head');store.put(record,'race');
        }else{store.delete('head');store.delete('race');}
      };
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(conflict?new SaveConflict('This race is open in another tab.'):tx.error||Error('Save aborted.'));
    });
    if(expected&&expected!==record?.owner){
      try{this.storage()?.removeItem(tailKey(expected));}catch{/* Storage may be disabled. */}
    }
  }
}
