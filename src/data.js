export const clamp=(v,a,b)=>Math.max(a,Math.min(v,b));
export const mod=(v,n)=>((v%n)+n)%n;
// Max Verstappen's 2025 Oracle Red Bull Racing RB21.
export const DRIVER={id:'YOU',code:'VER',number:1,name:'Max Verstappen',team:'red_bull',entrant:'Oracle Red Bull Racing'};
export const RB21={id:'rb21',model:'RB21',vmax:338,mass:800,kw:650,grip:2.0,aero:.0007,brake:19.8,gears:8};
export const colors={mclaren:'#ff850e',ferrari:'#e73835',red_bull:'#274996',mercedes:'#12c6b7',williams:'#369cf7',rb:'#6c83ff',haas:'#cdcfd4',aston_martin:'#078369',alpine:'#f18db7',sauber:'#63da39'};
export const points=[25,18,15,12,10,8,6,4,2,1];
export const formatTime=t=>Number.isFinite(t)?Math.floor(t/60)+':'+(t%60).toFixed(3).padStart(6,'0'):'—';
export function read(key,fallback){try{return JSON.parse(localStorage.getItem('formula25.v1.'+key))??fallback;}catch{return fallback;}}
export function write(key,value){
  try{localStorage.setItem('formula25.v1.'+key,JSON.stringify(value));return true;}
  catch{return false;}
}
