import {write} from './data.js';

// Publish the new standings in memory only after the browser accepts the write.
export function recordResult(history,result){
  if(history.some(entry=>entry.round===result.round))return history;
  const updated=[...history,result];
  return write(result.sprint?'sprintResults':'championship',updated)?updated:null;
}

export function championshipTable(rounds){
  const entries=new Map();
  for(const race of rounds)for(const row of race.rows){
    let driver=entries.get(row.id);
    if(!driver){driver={id:row.id,name:row.name,team:row.team,points:0,places:Array(20).fill(0)};entries.set(row.id,driver);}
    driver.points+=row.points;if(!race.sprint)driver.places[row.position-1]++;driver.team=row.team;
  }
  return [...entries.values()].sort((a,b)=>{
    if(a.points!==b.points)return b.points-a.points;
    for(let i=0;i<20;i++)if(a.places[i]!==b.places[i])return b.places[i]-a.places[i];
    return a.name.localeCompare(b.name);
  });
}
