import './style.css';
import {restoreGame,restoreSession,validateCheckpoint} from './checkpoint.js';
import {SessionSaves,loadRace,removeRace} from './session-saves.js';
import {SaveConflict} from './save-store.js';
import {measureDisplay} from './frame-pacer.js';
import {Circuit} from './circuit.js';
import {GrandPrix,FlyingLap,qualifyingSlot,setupCircuit} from './racing.js';
import {seasonData as json} from './assets.js';
import {mod,colors,formatTime,read,write,DRIVER} from './data.js';
import {championshipTable} from './championship.js';
import {controlsPanel,wireControls,controlCard} from './controls.js';
import {input,blip,moveFocus,watchGamepad,hintBar,glyph,fullscreen} from './menu.js';
measureDisplay();
const $=id=>document.getElementById(id),pad=i=>String(i).padStart(2,'0'),safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache=new Map();
const saved=read('championship',[]);let rounds=Array.isArray(saved)?saved:[];
const savedSprints=read('sprintResults',[]);
let sprintResults=Array.isArray(savedSprints)?savedSprints:[],sprints={},isSprint=false;
let events=[],references=[],outlines=[],idx=0,mode='gp',view='race',track=null,active=null,dialogClose=null,loading=false,gridSlot=9,qualResult=null;
const teams={red_bull:'Red Bull Racing',mclaren:'McLaren',ferrari:'Ferrari',mercedes:'Mercedes',williams:'Williams',rb:'Racing Bulls',haas:'Haas',aston_martin:'Aston Martin',alpine:'Alpine',sauber:'Kick Sauber'};
const tips=['Brake in a straight line, then ease off as you turn in.','ERS recharges under braking. Spend it on the exit of slow corners.','DRS only opens inside a zone. Braking closes the wing.','Soft tyres are quickest but wear fastest. Hard tyres last longest.','Kerbs unsettle the car. Use them on exit and keep off them under braking.','Stopped against a barrier? Press R to select reverse.'];
const day=e=>new Date(e.date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
const longDay=e=>new Date(e.date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:'UTC'});
const icon=name=>'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-'+name+'"/></svg>',arrow=icon('right');
const light=e=>({day:'Daylight',night:'Floodlit',dusk:'Dusk'}[e.light]||'Daylight');
const bind=(id,fn)=>$(id).onclick=fn;
function outline(round,marker){
  const line=outlines[round-1];if(!line)return '';
  let d='M';for(let i=0;i<line.length;i+=2)d+=(i?'L':'')+line[i]+' '+line[i+1];
  d+='Z';
  return '<svg viewBox="0 0 1000 600"><path class="trace" pathLength="1" d="'+d+'"/>'+(marker?'<circle r="12"><animateMotion dur="18s" repeatCount="indefinite" path="'+d+'"/></circle>':'')+'</svg>';
}
function hints(){
  const open=$('sheet').open;
  $('sheetHints').innerHTML=hintBar([['nav','Navigate'],['ok','Select'],['back',active?.paused?'Resume':'Back']]);
  $('hints').innerHTML=hintBar([['nav','Navigate'],['ok','Select'],['tabs','Switch screen'],...(view==='race'&&mode==='gp'?[['circuit','Change circuit']]:[]),view==='race'?['controls','Controls']:['back','Back']])+
    '<span class="legal">Unofficial fan game</span>';
  for(const el of document.querySelectorAll('[data-glyph]'))el.innerHTML=input.device==='touch'?'':glyph(el.dataset.glyph);
  if(!open&&view==='controls'&&$('controlsBody').firstChild?.dataset.show!==input.device)controlsView();
}
input.changed=hints;
function show(tag,title,content,after,kind=''){
  const keep=$('sheet').open&&document.activeElement?.id;
  $('dialogTag').textContent=tag;$('dialogTitle').textContent=title;$('sheetBody').innerHTML=content;$('sheet').className=kind;
  dialogClose=after||null;if(!$('sheet').open)$('sheet').showModal();$('sheet').scrollTop=0;
  (keep&&$('sheetBody').querySelector('#'+keep)||$('sheetBody').querySelector('[data-first]')||$('sheetBody').querySelector('button')||$('closeSheet')).focus();
  hints();
}
function close(){if(!$('sheet').open)return;$('sheet').close();const fn=dialogClose;dialogClose=null;fn?.();hints();}
$('closeSheet').onclick=close;$('sheet').oncancel=e=>{e.preventDefault();close();};
$('sheet').addEventListener('click',e=>{if(e.target===$('sheet'))close();});
// Show a short list of options as one row of buttons. The select stays the source of truth.
function chips(id,focus=false){
  const select=$(id);let row=select.nextElementSibling;
  if(!row?.classList.contains('chips')){
    row=document.createElement('div');row.className='chips';row.setAttribute('role','group');
    row.setAttribute('aria-label',select.getAttribute('aria-label'));select.hidden=true;select.after(row);
  }
  row.replaceChildren(...[...select.options].map(option=>{
    const button=document.createElement('button');button.type='button';
    button.textContent=option.dataset.short||option.textContent;button.title=option.textContent;
    button.setAttribute('aria-pressed',option.value===select.value);button.disabled=select.disabled;
    button.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change'));chips(id,true);};
    return button;
  }));
  if(focus)row.querySelector('[aria-pressed=true]')?.focus();
}
const views={race:null,calendar:calendarView,standings:standingsView,controls:controlsView,settings:settingsView};
// Remember a focus the menu chose itself, so it can move to Race once the circuit has loaded.
let chosen=null;
for(const type of ['keydown','pointerdown'])addEventListener(type,()=>{chosen=null;},true);
function focusFirst(){
  const scope=$('sheet').open?$('sheetBody'):$('view-'+view);
  chosen=scope.querySelector('[data-first]:not(:disabled)')||scope.querySelector('[aria-current]')||scope.querySelector('button:not(:disabled)');
  chosen?.focus({preventScroll:true});
}
function go(name){
  view=name;$('garage').dataset.view=name;
  for(const id of Object.keys(views))$('view-'+id).hidden=id!==name;
  for(const b of $('tabs').querySelectorAll('button'))b.dataset.view===name?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current');
  views[name]?.();hints();scrollTo(0,0);focusFirst();
}
for(const b of $('tabs').querySelectorAll('button'))b.onclick=()=>go(b.dataset.view);
bind('openControls',()=>go('controls'));
function gridLabel(){
  const option=$('grid').options[0];
  option.textContent='P'+(gridSlot+1)+(qualResult?' · set by your qualifying lap':' · Verstappen’s 2025 '+(isSprint?'Sprint ':'')+'grid slot');option.dataset.short='Start P'+(gridSlot+1);
}
async function select(index,format='gp',savedSprint){
  if(!events.length)return;
  idx=mod(index,24);const e=events[idx],champ=mode==='season';
  const sprint=sprints[e.round];
  isSprint=Boolean(sprint&&(savedSprint??(champ?!sprintResults.some(r=>r.round===e.round)&&rounds.length<e.round:format==='sprint')));
  $('formatWrap').hidden=!sprint||champ;$('format').value=isSprint?'sprint':'gp';
  $('start').disabled=$('school').disabled=true;track=null;qualResult=null;
  gridSlot=Math.max(0,isSprint?sprint.grid.indexOf(DRIVER.code):e.grid.findIndex(c=>c.id===DRIVER.code));
  $('grid').disabled=isSprint;
  if(isSprint)$('grid').value='race';
  $('venue').textContent=e.name;
  $('roundLabel').textContent='Round '+e.round+' of 24 · '+day(e)+(isSprint?' · Sprint':'');$('circuitName').textContent=e.circuit;
  $('conditions').textContent='Dry, '+light(e).toLowerCase();
  $('factLength').textContent=(e.length/1000).toFixed(3)+' km';$('factLaps').textContent=(isSprint?sprint.laps:e.laps)+' laps';$('factLaps').previousElementSibling.textContent=isSprint?'Sprint':'Grand Prix';
  $('prev').disabled=$('next').disabled=champ;
  $('gpMode').setAttribute('aria-pressed',!champ);$('seasonMode').setAttribute('aria-pressed',champ);
  $('trackMap').innerHTML=outline(e.round,true);
  gridLabel();updateDistance();setStartLabel();hints();
  try{
    if(!cache.has(e.round))cache.set(e.round,json(pad(e.round)).then(data=>setupCircuit(new Circuit(data),e)));
    const fetched=await cache.get(e.round);if(events[idx]!==e)return;
    track=fetched;$('school').disabled=false;$('start').disabled=champ&&rounds.length>=24;
    if(view==='race'&&!$('sheet').open&&[document.body,chosen].includes(document.activeElement))focusFirst();
  }catch(err){cache.delete(e.round);if(events[idx]===e)show('Circuit','Unable to load circuit','<p class="sheet-text">Reload the page to retry the circuit download.</p>');}
}
const laps=()=>{const choice=$('distance').value,full=isSprint?sprints[events[idx].round].laps:events[idx].laps;return choice==='full'?full:choice==='half'?Math.ceil(full/2):Number(choice);};
function updateDistance(){const e=isSprint?sprints[events[idx].round]:events[idx];$('distance').options[2].textContent='50% · '+Math.ceil(e.laps/2)+' laps';$('distance').options[3].textContent='Full · '+e.laps+' laps';}
function setStartLabel(){
  const done=mode==='season'&&rounds.length===24,qualify=$('grid').value==='qualify',count=laps();
  $('start').innerHTML='<span><small>'+(done?'All 24 rounds scored':safe(events[idx].name)+' · '+(qualify?'one flying lap':count+(count===1?' lap':' laps')+' from P'+(gridSlot+1)))+'</small><strong>'+
    (done?'Season complete':qualify?'Qualify':isSprint?'Start Sprint':'Race')+'</strong></span>'+icon('go');
  for(const id of ['distance','difficulty','grid','format'])chips(id);
  if(!restoringSetup)write('weekend',weekend());

}
$('start').dataset.first='';
$('format').onchange=()=>select(idx,$('format').value);
bind('prev',()=>select(idx-1));bind('next',()=>select(idx+1));bind('gpMode',()=>{mode='gp';select(idx);});
bind('seasonMode',()=>{mode='season';select(Math.min(23,rounds.length));if(rounds.length===24)go('standings');});
$('grid').onchange=$('difficulty').onchange=$('distance').onchange=setStartLabel;
function calendarDetail(i){
  const e=events[i],times=references[e.round-1]||{},best=Object.entries(times).sort((a,b)=>a[1]-b[1])[0],sprint=sprints[e.round];
  const surname=id=>(e.grid.find(c=>c.id===id)?.name||id).split(' ').slice(1).join(' ');
  const fact=(label,value)=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>';
  $('calDetail').innerHTML=outline(e.round)+'<p class="label">Round '+e.round+' · '+longDay(e)+'</p><h3>'+safe(e.name)+'</h3><p class="where">'+safe(e.circuit)+', '+safe(e.city)+'</p><dl class="facts">'+
    fact('Lap',(e.length/1000).toFixed(3)+' km')+fact('Grand Prix',e.laps+' laps')+(sprint?fact('Sprint',sprint.laps+' laps'):'')+fact('Light',light(e))+
    (best?fact('Fastest in qualifying',safe(surname(best[0]))+' '+formatTime(best[1])):'')+
    fact('Verstappen','Grid P'+(e.grid.findIndex(c=>c.id===DRIVER.code)+1)+(times[DRIVER.code]?' · '+formatTime(times[DRIVER.code]):''))+'</dl>';
}
function calendarView(){
  const champ=mode==='season';
  $('calendarNote').textContent=champ?'The championship runs in calendar order. Choosing a round here sets up a single race.':'';
  $('calList').innerHTML=events.map((e,i)=>{
    const done=champ&&i<rounds.length,tag=done?'Done':sprints[e.round]?'Sprint':'';
    return '<button class="round" data-round="'+i+'"'+(idx===i?' aria-current="true"':'')+'><span class="no">'+pad(e.round)+'</span><span><strong>'+safe(e.name)+'</strong><small>'+safe(e.city)+'</small></span><time>'+(tag?'<em>'+tag+'</em>':'')+day(e)+'</time></button>';
  }).join('');
  for(const b of $('calList').children){
    b.onclick=()=>{mode='gp';select(+b.dataset.round);go('race');};
    b.onfocus=b.onpointerenter=()=>calendarDetail(+b.dataset.round);
  }
  calendarDetail(idx);
}
bind('chooseMap',()=>go('calendar'));
function teamCell(r){return '<i style="--team:'+(colors[r.team]||'#aaa')+'"></i>'+safe(r.id===DRIVER.id?DRIVER.name:r.name);}
function standingsView(){
  const rows=championshipTable([...rounds,...sprintResults]),top=Math.max(1,rows[0]?.points||0);
  $('standingsTag').textContent=rounds.length+' of 24 rounds scored';
  $('standingsActions').innerHTML=rows.length?'<button id="newSeason" class="secondary">Reset championship</button>':'<button id="enterSeason" class="primary" data-first>Enter championship'+arrow+'</button>';
  $('standingsBody').innerHTML=rows.length?'<table class="board"><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Wins</th><th>Points</th></tr></thead><tbody>'+rows.map((r,i)=>
    '<tr class="'+(r.id===DRIVER.id?'you':'')+'"><td>'+pad(i+1)+'</td><td>'+teamCell(r)+'</td><td>'+(teams[r.team]||'')+'</td><td>'+r.places[0]+'</td><td><span class="pts" style="--p:'+(r.points/top).toFixed(3)+'"></span>'+r.points+'</td></tr>').join('')+'</tbody></table>':
    '<p class="empty">No rounds scored yet. The championship runs all 24 Grands Prix and the six Sprints in calendar order, and saves your results in this browser.</p><table class="board entry"><thead><tr><th>No.</th><th>Driver</th><th>Team</th></tr></thead><tbody>'+
    Object.keys(teams).flatMap(team=>(events[0]?.grid||[]).filter(c=>c.team===team)).map((c,i)=>'<tr class="'+(c.id===DRIVER.code?'you':'')+'"><td>'+pad(i+1)+'</td><td>'+teamCell(c)+'</td><td>'+teams[c.team]+'</td></tr>').join('')+'</tbody></table>';
  if($('enterSeason'))bind('enterSeason',()=>{mode='season';select(0);go('race');});
  if($('newSeason'))bind('newSeason',()=>{show('Championship','Reset championship?','<p class="sheet-text">This removes the saved results from all '+rounds.length+' completed rounds on this browser.</p><div class="sheet-actions"><button class="secondary" id="keep" data-first>Keep results</button><button class="primary" id="reset">Reset'+arrow+'</button></div>',null,'narrow');
    bind('keep',close);bind('reset',async()=>{
      const record=await loadRace().catch(()=>null);
      if(record?.snapshot?.setup?.mode==='season'){
        try{await removeRace(record.owner);}catch{close();await refreshContinue();return;}
      }
      await refreshContinue();rounds=[];sprintResults=[];write('sprintResults',sprintResults);write('championship',rounds);close();mode='season';select(0);standingsView();});});
}
function controlsView(){$('controlsBody').innerHTML=controlsPanel(input.device);wireControls($('controlsBody'));}
const prefs=[
  ['Graphics',[
    ['quality','Quality',[['auto','Adaptive'],['ultra','Ultra'],['performance','Performance']],'auto','Ultra adds sharper shadows and mirrors and a higher resolution ceiling. Resolution adjusts to target 120 fps on high-refresh displays.'],
    ['backend','Renderer',[['auto','Automatic'],['webgpu','WebGPU'],['webgl','WebGL 2'],['canvas','Canvas']],'auto','Automatic uses hardware WebGPU when it is available, then WebGL 2, then Canvas. If the picture stutters, try WebGL 2.'],
    ['readout','Frame readout',[['on','On'],['off','Off']],'on','Shows resolution, average fps and p95 frame time. At 120 fps each frame has 8.33 ms.']]],
  ['Driving',[
    ['traction','Traction control',[['full','Full'],['medium','Medium'],['off','Off']],'medium','Full keeps the rear tyres from spinning. Medium lets the rear slide under power. Off is how the real car runs: too much throttle in a low gear spins it.'],
    ['abs','Anti-lock brakes',[['on','On'],['off','Off']],'on','Off is how the real car runs. Full brake pressure at low speed locks the front tyres and the car goes straight on.'],
    ['steering','Steering assist',[['on','On'],['off','Off']],'on','On follows part of each corner for you and catches a slide, which suits a keyboard. Off steers the front wheels directly.'],
    ['gearbox','Gearbox',[['auto','Automatic'],['manual','Manual']],'auto','Automatic shifts for you. A paddle press takes manual control at any time.'],
    ['line','Racing line',[['on','On'],['off','Off']],'on','Draws the recorded 2025 line on the road.'],
    ['sound','Sound',[['on','On'],['off','Off']],'on','Engine, tyre and menu sound.']]]
];
function settingsView(){
  $('settingsBody').innerHTML='<div class="prefs"><div>'+prefs.map(([title,rows])=>'<h3>'+title+'</h3>'+rows.map(([id,label,options,,note])=>
    '<div class="pref"><span>'+label+'</span><select id="'+id+'" aria-label="'+label+'">'+options.map(([value,name])=>'<option value="'+value+'">'+name+'</option>').join('')+'</select><p>'+note+'</p></div>').join('')).join('')+
    '<h3>Display</h3><button id="fullscreen" class="pref"><span>Fullscreen</span><kbd>F</kbd></button>'+(installPrompt?'<button id="install" class="pref"><span>Install as an app</span>'+arrow+'</button>':'')+
    '<h3>About</h3><button id="credits" class="pref"><span>Circuit and car data</span>'+arrow+'</button></div><aside class="pref-note" id="prefNote"></aside></div>';
  for(const [,rows] of prefs)for(const [id,,,fallback] of rows){
    $(id).value=id==='sound'?(read('mute',false)?'off':'on'):read(id,fallback);
    $(id).onchange=()=>id==='sound'?write('mute',$(id).value==='off'):write(id,$(id).value);chips(id);
  }
  const body=$('settingsBody'),note=target=>{
    const row=target.closest?.('div.pref');if(!row)return;
    for(const el of body.querySelectorAll('.pref'))el.classList.toggle('on',el===row);
    $('prefNote').innerHTML='<h4>'+row.firstChild.textContent+'</h4><p>'+row.querySelector('p').textContent+'</p>';
  };
  body.onpointerover=body.onfocusin=event=>note(event.target);note(body.querySelector('.pref'));
  bind('credits',credits);bind('fullscreen',fullscreen);
  if($('install'))bind('install',async()=>{await installPrompt.prompt();installPrompt=null;settingsView();});
}
// Chrome and Edge offer an install prompt once the offline cache is ready.
// The hosted preview's sign-in proxy refuses worker scripts, so the cache is only registered elsewhere.
let installPrompt=null;
addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if(view==='settings')settingsView();});
if(import.meta.env.PROD&&'serviceWorker' in navigator&&!location.hostname.endsWith('.devinapps.com'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
function firstDrive(){
  show('Driver briefing','Your first drive','<div class="intro-visual"></div><p class="sheet-text">Take Verstappen’s RB21 out alone at '+safe(events[idx].city)+'. Your race engineer talks you through throttle, steering, braking and battery deployment, and the controls stay on screen.</p><div class="sheet-actions"><button class="primary" id="train" data-first>Begin first drive'+arrow+'</button><button class="secondary" id="skip">Go straight to the grid</button></div>',null,'narrow');
  bind('train',()=>{close();return launch(true);});
  bind('skip',()=>{write('briefed',true);close();return launch();});
}
bind('school',()=>{if(track)firstDrive();});
function debrief(s){
  const complete=s.training.stage===4;
  show('First drive',complete?'Ready for the grid':'Race briefing',
    '<ul class="lesson-list"><li><strong>Gearbox</strong><span>Automatic by default. Q / E or the gamepad bumpers take manual control.</span></li><li><strong>Rear wing</strong><span>Hold Space, gamepad B or DRS inside an eligible zone. In a race, follow within one second from lap two. Brake to close it.</span></li><li><strong>Pit strategy</strong><span>T cycles compounds and B calls the crew. On gamepad use Y then X. Both are also in the pause menu. Soft tyres wear fastest. Hard tyres last longest.</span></li></ul><div class="sheet-actions"><button class="primary" id="fromSchool" data-first>Enter race weekend'+arrow+'</button><button class="secondary" id="returnSchool">Back to garage</button></div>',leave,'narrow');
  if(complete)write('briefed',true);
  bind('fromSchool',async()=>{write('briefed',true);await leave();return launch();});
  bind('returnSchool',leave);
}
const credits=()=>show('About the simulation','Circuit & car data','<p class="sheet-text">You drive Max Verstappen’s No. 1 Oracle Red Bull Racing RB21 in a 20-car field. The car follows the published 2025 specification: Honda RBPTH003 1.6-litre turbo hybrid V6, 15,000 rpm limit, eight-speed gearbox and 800 kg minimum weight. Performance, tyre behaviour, damage and AI are game simulations. <a href="https://global.honda/en/F1/machine/2025_RedBullRB21/" target="_blank" rel="noreferrer">Honda specifications ↗</a></p><p class="sheet-text">All 24 road layouts align 2025 RB21 GPS laps with geographic circuit maps. The driving line, speed trace and eight forward ratios use recorded telemetry. Elevation, sector timing and observed DRS usage come from qualifying laps, with practice traces for Baku and Las Vegas. Road width, banking, pit lanes, trackside buildings and landmarks are approximations. <a href="https://openf1.org/" target="_blank" rel="noreferrer">OpenF1 ↗</a></p><p class="sheet-text">The calendar, grids and qualifying times come from Jolpica. Grands Prix score 25–18–15–12–10–8–6–4–2–1 points and the six Sprints 8–7–6–5–4–3–2–1. <a href="https://api.jolpi.ca/ergast/f1/2025.json" target="_blank" rel="noreferrer">Jolpica ↗</a></p><p class="sheet-text">Terrain uses AWS Terrain Tiles and modified Copernicus Sentinel-2 data (2025). Mapped building footprints © OpenStreetMap contributors, via OpenMapTiles and OpenFreeMap, ODbL 1.0. Circuit maps © Tomislav Bacinger. Facades, grandstands and vegetation are illustrative. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Map credits ↗</a></p><p class="sheet-text">Independent fan game. Not affiliated with Formula 1, the FIA, Red Bull Racing or Honda.</p>',null,'narrow');
let restoringSetup=false;
function weekend(){
  return {round:idx+1,mode,sprint:isSprint,distance:$('distance').value,difficulty:$('difficulty').value,
    grid:$('grid').value,gridSlot,qualResult};
}
async function applyWeekend(setup,exact=false){
  restoringSetup=true;
  try{
    mode=setup.mode==='season'?'season':'gp';
    const index=mode==='season'&&!exact?Math.min(23,rounds.length):setup.round-1;
    await select(index,setup.sprint?'sprint':'gp',exact?setup.sprint:undefined);
    for(const key of ['distance','difficulty','grid']){
      if([...$(key).options].some(o=>o.value===setup[key]))$(key).value=setup[key];
    }
    if(isSprint)$('grid').value='race';
    if(index===setup.round-1&&isSprint===setup.sprint&&(exact||Number.isFinite(setup.qualResult))){
      gridSlot=setup.gridSlot;qualResult=setup.qualResult;gridLabel();
    }
    setStartLabel();
  }finally{restoringSetup=false;}
}
function storageWarning(message){
  $('saveWarning').textContent=message;$('saveWarning').hidden=!message;
}
let savedOwner=null;
async function refreshContinue(){
  const button=$('continueSession'),discard=$('discardSession');
  let record;
  try{record=await loadRace();}catch{button.hidden=discard.hidden=true;return;}
  savedOwner=record?.owner??null;button.hidden=discard.hidden=!record;
  button.toggleAttribute('data-first',!!record);
  if(!record)return;
  try{
    const snap=validateCheckpoint(record.snapshot);
    const event=events[snap.setup.round-1],player=snap.game.cars.find(c=>c.id===DRIVER.id);
    const title=snap.cockpit.phase==='results'?'View result':snap.setup.kind==='practice'?'Resume first drive':
      snap.setup.kind==='qualify'?'Resume qualifying':snap.setup.sprint?'Resume Sprint':'Resume race';
    button.textContent=title+' · '+event.city+' · Lap '+Math.min(snap.game.race.laps,1+player.state.completed);
    button.title=formatTime(snap.game.race.raceTime)+' elapsed';
  }catch{button.textContent='Manage unreadable saved session';}
}
async function discardSession(owner){
  try{await removeRace(owner);close();}
  catch(error){
    if(error instanceof SaveConflict)close();
    else show('Browser save','Unable to discard save','<p class="sheet-text">Check the browser’s storage permissions and try again.</p>',null,'narrow');
  }finally{await refreshContinue();}
}
bind('discardSession',()=>{
  const owner=savedOwner;
  show('Browser save','Discard this session?','<p class="sheet-text">This removes the saved drive. Championship results and settings are kept.</p><div class="sheet-actions"><button class="secondary" id="keepSave" data-first>Keep save</button><button class="primary" id="discard">Discard session</button></div>',null,'narrow');
  bind('keepSave',close);bind('discard',()=>discardSession(owner));
});
bind('continueSession',async()=>{
  if(loading||active)return;
  let record;
  try{
    record=await loadRace();if(!record){await refreshContinue();return;}
    const snapshot=validateCheckpoint(record.snapshot);
    loading=true;await applyWeekend(snapshot.setup,true);loading=false;
    await launch(snapshot.setup.kind==='practice',record,record.owner);
  }catch{
    loading=false;
    show('Browser save','Saved session unavailable','<p class="sheet-text">Your saved session could not be restored. You can keep it or discard it to start again.</p><div class="sheet-actions"><button class="secondary" id="keepSave" data-first>Keep save</button><button class="primary" id="discard">Discard save</button></div>',null,'narrow');
    bind('keepSave',close);bind('discard',()=>record?discardSession(record.owner):close());
  }
});
async function leave(){
  if(active){
    const s=active;active=null;s.dispose();
    try{await s.saves.release(s,s.phase!=='driving');}catch{storageWarning('Unable to update browser save.');}
  }
  if($('sheet').open)$('sheet').close();dialogClose=null;go('race');await refreshContinue();
}
function paused(s){
  void s.saves.save(s,true);
  const g=s.game,d=g.player;
  const item=(id,label,value='',first='')=>'<button id="'+id+'" class="menu-item"'+first+'><span>'+label+'</span><em>'+value+'</em></button>';
  const stat=(label,value)=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>';
  show(g.event.city+' · Lap '+Math.min(g.laps,d.completed+1)+' of '+g.laps,'Paused','<div class="pause-grid"><div><div class="menu">'+item('resume','Resume','',' data-first')+
    (!g.qualifying?item('pit',d.pit?'Pit service':d.requested?'Cancel pit call':'Box this lap')+item('tyre','Next tyres',g.nextTyre):'')+
    item('pausedgearbox','Gearbox',d.manual?'Manual':'Automatic')+item('pausedline','Racing line',s.line?'On':'Off')+item('pausedsound','Sound',s.audio.muted?'Off':'On')+
    (d.speed<=.65&&!d.pit?item('reverse',d.reverse?'Select first gear':'Select reverse'):'')+item('exit',s.saves.enabled?'Save and return to garage':'Return to garage')+'</div>'+
    '<dl class="stats">'+stat('Renderer',s.world.backend)+stat('Quality',s.world.ultra?'Ultra':s.world.software?'Performance':s.world.backend==='Canvas'?'Lightweight':'Adaptive')+(s.world.status?stat('Resolution · rate',s.world.status):'')+'</dl></div>'+
    '<div>'+($('saveWarning').hidden?'':'<p>'+safe($('saveWarning').textContent)+'</p>')+controlsPanel(input.device)+'</div></div>',()=>s.resume(),'wide');
  wireControls($('sheetBody'));
  if($('reverse'))bind('reverse',()=>{d.toggleReverse();close();});
  bind('resume',close);bind('exit',()=>{leave();});
  bind('pausedgearbox',()=>{d.manual=!d.manual;if(!d.manual)d.updateGear();write('gearbox',d.manual?'manual':'auto');paused(s);});
  bind('pausedline',()=>{s.line=!s.line;write('line',s.line?'on':'off');paused(s);});
  bind('pausedsound',()=>{s.audio.muted=!s.audio.muted;write('mute',s.audio.muted);paused(s);});
  if($('pit')){bind('pit',()=>{g.requestPit();paused(s);});bind('tyre',()=>{g.pickTyre();paused(s);});}
}
function finish(s){
  const g=s.game,e=g.event,last=g.player.lapTimes.at(-1);
  if(g.qualifying){
    const slot=qualifyingSlot(e.grid,references[e.round-1],last);
    gridSlot=slot??Math.max(0,e.grid.findIndex(driver=>driver.id===DRIVER.code));
    qualResult=slot===null?null:last;gridLabel();$('grid').value='race';setStartLabel();
    const comparison=slot===null?'Qualifying times are unavailable. Your start uses Verstappen’s recorded grid slot.':'Your grid position compares this lap with each rival’s best recorded qualifying time.';
    show('Qualifying · '+e.city,'P'+(gridSlot+1)+' on the grid','<p class="sheet-text">Flying lap <b>'+formatTime(last)+'</b>. '+comparison+'</p><div class="sheet-actions"><button class="primary" id="toRace" data-first>Start Grand Prix'+arrow+'</button></div>',leave,'narrow');
    bind('toRace',async()=>{await leave();launch();});return;
  }
  const rows=g.classification(),you=rows.find(r=>r.id===DRIVER.id);
  if(mode==='season'){
    rounds=read('championship',rounds);sprintResults=read('sprintResults',sprintResults);
  }
  if(mode==='season'&&rounds.length===e.round-1){
    if(g.event.sprint){if(!sprintResults.some(r=>r.round===e.round)){sprintResults.push({round:e.round,rows,sprint:true});write('sprintResults',sprintResults);}}
    else{rounds.push({round:e.round,rows});write('championship',rounds);}
  }
  const winner=rows[0],table=rows.map((r,i)=>'<tr class="'+(r.id===DRIVER.id?'you':'')+'" style="--i:'+i+'"><td>'+pad(r.position)+'</td><td>'+teamCell(r)+'</td><td>'+(teams[r.team]||'')+'</td><td>'+(r.position===1?formatTime(r.time):r.laps<winner.laps?'+'+(winner.laps-r.laps)+' lap': '+'+(r.time-winner.time).toFixed(3))+(r.penalty?' (+30s)':'')+'</td><td>'+r.points+'</td></tr>').join('');
  const reset=async()=>{await leave();if(mode==='season'){select(Math.min(23,rounds.length));if(rounds.length===24)go('standings');}};
  const stat=(label,value)=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>';
  show('Chequered flag · '+e.city,'P'+you.position+' · '+DRIVER.name,'<dl class="stats">'+stat('Best lap',formatTime(Math.min(...g.player.lapTimes)))+stat('Started','P'+(gridSlot+1))+stat('Pit stops',g.player.stops)+stat('Points',you.points)+'</dl><div class="sheet-actions"><button id="continue" class="primary" data-first>'+(mode==='season'&&rounds.length<24?'Next Grand Prix':'Return to garage')+''+arrow+'</button></div><table class="board"><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Race time</th><th>Pts</th></tr></thead><tbody>'+table+'</tbody></table>',reset,'wide');
  bind('continue',close);
}
async function launch(practice=false,record=null,expected){
  if(loading||!track||active||!record&&!practice&&mode==='season'&&rounds.length===24)return;
  if(expected===undefined&&savedOwner!==null){
    const owner=savedOwner;
    show('Browser save','Replace saved session?','<p class="sheet-text">Starting a new session replaces your unfinished drive on this browser.</p><div class="sheet-actions"><button class="secondary" id="keepDrive" data-first>Keep saved session</button><button class="primary" id="replaceDrive">Start new session</button></div>',null,'narrow');
    bind('keepDrive',close);bind('replaceDrive',()=>{close();launch(practice,null,owner);});return;
  }
  const e=events[idx],sprint=sprints[e.round],qualify=record?record.snapshot.setup.kind==='qualify':!practice&&$('grid').value==='qualify';
  $('loadTag').textContent='Round '+e.round+' · '+(practice?'First drive':qualify?'Qualifying':isSprint?'Sprint':'Grand Prix');
  $('loadTitle').textContent=e.name;$('loadSub').textContent=e.circuit;$('loadMap').innerHTML=outline(e.round);$('loadTip').textContent=tips[e.round%tips.length];
  loading=true;$('loading').hidden=false;
  try{
    const {Session,audio}=await import('./session.js');
    audio.muted=read('mute',false);audio.arm();
    const event=isSprint?{...e,sprint:true,laps:sprint.laps,grid:sprint.grid.map(id=>e.grid.find(c=>c.id===id))}:e;
    const game=practice||qualify?new FlyingLap(track,event):new GrandPrix(track,event,laps(),$('difficulty').value,gridSlot);
    if(practice){game.practice=true;game.player.speed=0;game.player.gear=1;game.player.updateGear();}
    else game.player.manual=read('gearbox','auto')==='manual';
    game.player.assists={tc:{full:1,medium:.5,off:0}[read('traction','medium')],abs:read('abs','on')==='on',steer:read('steering','on')==='on'};
    if(record)restoreGame(game,record.snapshot.game);
    const setup=record?.snapshot.setup??{...weekend(),kind:practice?'practice':qualify?'qualify':'race'};
    const saves=new SessionSaves(setup,storageWarning);storageWarning('');
    active=await Session.create(game,{pause:paused,finish,briefing:debrief,
      save:(s,final)=>saves.save(s,final),
      takeover:async()=>{await leave();show('Browser save','Session continued in another tab','<p class="sheet-text">The other tab is saving this drive. Use Resume in the garage to continue it here.</p>',null,'narrow');}
    });
    active.saves=saves;active.audio=audio;active.line=read('line','on')==='on';
    if(record)restoreSession(active,record.snapshot);
    try{await saves.claim(active,expected??null);savedOwner=saves.owner;}
    catch(error){
      if(error instanceof SaveConflict)throw error;
      storageWarning('Autosave is unavailable. Check browser storage permissions.');
    }
    if(active.phase==='results')finish(active);
    else if(active.phase==='briefing')debrief(active);
    else active.resume();
  }catch(err){console.error(err);
    if(active){active.dispose();active=null;}
    await refreshContinue();
    if(record&&!(err instanceof SaveConflict))throw err;
    if(err instanceof SaveConflict){show('Browser save','Session changed in another tab','<p class="sheet-text">Return to the garage to continue the latest save.</p>',null,'narrow');return;}
    $('race').hidden=true;$('garage').hidden=false;show('Session','Grid unavailable','<p class="sheet-text">Reload to try again, or launch using the lightweight graphics renderer.</p><a class="secondary" href="?lite=1">Use lightweight graphics</a>',null,'narrow');}
  finally{loading=false;$('loading').hidden=true;}
}
bind('start',()=>read('briefed',false)?launch():firstDrive());
// Menus respond to arrows or W A S D, the D-pad and the left stick.
const inMenu=()=>!loading&&($('sheet').open||!$('garage').hidden);
function act(name){
  const open=$('sheet').open,scope=open?$('sheet'):$('garage');
  const turn={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[name];
  if(turn)moveFocus(scope,...turn);
  else if(name==='ok'){if(scope.contains(document.activeElement))document.activeElement.click();}
  else if(name==='back'||open&&name==='start'){if(open)close();else if(view!=='race')go('race');blip('back');}
  else if(open)return;
  else if(name==='start'){if(view==='race')$(savedOwner?'continueSession':'start').click();}
  else if(name==='tabPrev'||name==='tabNext'){const names=Object.keys(views);go(names[mod(names.indexOf(view)+(name==='tabNext'?1:-1),names.length)]);blip();}
  else if(name==='controls')go('controls');
  else if(name.startsWith('circuit')&&view==='race'&&mode==='gp'){select(idx+(name==='circuitNext'?1:-1));blip();}
}
const keyAction={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right',KeyQ:'tabPrev',KeyE:'tabNext',Comma:'circuitPrev',Period:'circuitNext',KeyC:'controls'};
addEventListener('keydown',event=>{
  if(!inMenu()||event.ctrlKey||event.metaKey||event.altKey)return;
  const open=$('sheet').open,name=keyAction[event.code];
  if(name){event.preventDefault();act(name);}
  else if(event.code==='KeyF')fullscreen();
  else if(event.code==='Escape'&&!open&&view!=='race'){go('race');blip('back');}
  else if(event.code==='Enter'&&!open&&view==='race'&&document.activeElement===document.body)$('start').click();
});
addEventListener('click',event=>{if(inMenu()&&event.target.closest?.('button,a'))blip('ok');},true);
watchGamepad(inMenu,act);
if(matchMedia('(pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const art=document.querySelector('.backdrop i');
  $('garage').addEventListener('pointermove',event=>{art.style.setProperty('--px',(event.clientX/innerWidth-.5).toFixed(3));art.style.setProperty('--py',(event.clientY/innerHeight-.5).toFixed(3));});
}
$('keys').innerHTML=$('loadKeys').innerHTML=controlCard();
hints();
Promise.all([json('calendar'),json('qualifying'),json('sprints'),json('outlines')]).then(async([list,q,sp,lines])=>{
  events=list;references=q;sprints=sp;outlines=lines;await refreshContinue();const setup=read('weekend',null);
  if(setup&&Number.isInteger(setup.round)&&setup.round>=1&&setup.round<=24)await applyWeekend(setup);else await select(0);go('race');
}).catch(()=>show('Garage','Season data unavailable','<p class="sheet-text">Serve the game over HTTP and reload this page.</p>',null,'narrow'));
