// Keep identities and immutable circuit geometry in the running simulation. IndexedDB
// preserves Sets, typed arrays and non-finite sector times through structured cloning.
const fixedGame=new Set(['track','event','player','players','ai','order','pace','solids','drsZone']);
const fixedCar=new Set(['car','circuit','tyres','suspension','id','name','team','slot']);
const fields=(object,omit)=>Object.fromEntries(Object.entries(object).filter(([key])=>!omit.has(key)));

export function captureGame(game){
  return {
    race:fields(game,fixedGame),
    cars:game.players.map(car=>({
      id:car.id,state:fields(car,fixedCar),
      tyres:car.tyres&&{...car.tyres},suspension:car.suspension&&{...car.suspension}
    })),
    order:game.order.map(car=>car.id),
    zone:game.track.zones.indexOf(game.drsZone)
  };
}

function apply(target,values,omit){
  for(const [key,value] of Object.entries(values)){
    if(!omit?.has(key)&&!(key in Object.getPrototypeOf(target)))target[key]=value;
  }
}

const finiteFields=(object,keys)=>keys.every(key=>Number.isFinite(object?.[key]));
const wheelArray=(state,key)=>state?.[key] instanceof Float64Array&&state[key].length===4&&state[key].every(Number.isFinite);
function validatePlayer(car){
  const {state,tyres,suspension}=car;
  if(!finiteFields(state,['heading','yawRate','gear','energy','wear','damage'])||
     !['fx','fy','angles'].every(key=>wheelArray(state,key))||
     !['coefficient','locked','spinning'].every(key=>wheelArray(tyres,key))||
     !['contacts','sprung','velocity','rotation'].every(key=>wheelArray(suspension,key))||
     !Array.isArray(tyres.temp)||tyres.temp.length!==4||!tyres.temp.every(Number.isFinite)||
     !Array.isArray(tyres.surfaces)||tyres.surfaces.length!==4)
    throw Error('Invalid player checkpoint.');
}

export function restoreGame(game,saved){
  const roster=new Map(game.players.map(c=>[c.id,c]));
  const sameField=ids=>ids.length===roster.size&&new Set(ids).size===roster.size&&ids.every(id=>roster.has(id));
  if(!sameField(saved.cars.map(c=>c.id))||!sameField(saved.order))throw Error('Saved grid does not match this event.');
  for(const car of saved.cars){
    const target=roster.get(car.id);
    if(!finiteFields(car.state,['distance','offset','speed','completed'])||!(car.state.used instanceof Set)||
      !Array.isArray(car.state.lapTimes))throw Error('Invalid car checkpoint.');
    if(target===game.player)validatePlayer(car);
    apply(target,car.state,fixedCar);
    if(target===game.player){
      apply(target.tyres,car.tyres);apply(target.suspension,car.suspension);
    }
  }
  apply(game,saved.race,fixedGame);
  game.drsZone=game.track.zones[saved.zone];
  game.order=saved.order.map(id=>roster.get(id));
}

export function captureSession(session,setup){
  const {before,acc,line,help,eye,training,phase}=session;
  return {version:1,setup,game:captureGame(session.game),
    cockpit:{before,acc,line,help,eye:{lateral:eye.lateral,longitudinal:eye.longitudinal,lookIn:eye.lookIn},
      training:training&&{...training},phase,marks:session.world.marks?.snapshot()}};
}

export function restoreSession(session,saved){
  const {before,acc,line,help,eye,training,phase,marks}=saved.cockpit;
  Object.assign(session,{before,acc,line,help,phase});
  apply(session.eye,eye);
  if(training&&session.training)apply(session.training,training);
  if(marks)session.world.marks?.restore(marks);
}

export function validateCheckpoint(snapshot){
  const s=snapshot?.setup,r=snapshot?.game?.race,c=snapshot?.cockpit;
  if(snapshot?.version!==1||!s||!Number.isInteger(s.round)||s.round<1||s.round>24||
    !['gp','season'].includes(s.mode)||!['race','qualify','practice'].includes(s.kind)||
    !['1','3','half','full'].includes(s.distance)||!['rookie','race','expert'].includes(s.difficulty)||
    !Number.isInteger(s.gridSlot)||s.gridSlot<0||s.gridSlot>19||
    snapshot.game?.cars?.length!==(s.kind==='race'?20:1)||!Array.isArray(snapshot.game.order)||
    !finiteFields(r,['clock','raceTime','laps','sectorTime'])||!Array.isArray(r.bestSectors)||r.bestSectors.length!==3||
    !['grid','race','finished'].includes(r.state)||!['driving','briefing','results'].includes(c?.phase)||
    !finiteFields(c,['acc'])||c.acc<0||!finiteFields(c.before,['heading','distance','offset'])||
    !finiteFields(c.eye,['lateral','longitudinal','lookIn']))
    throw Error('This saved session cannot be read by this version of Formula 25.');
  return snapshot;
}
