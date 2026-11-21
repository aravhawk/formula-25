// One list of bindings feeds the Controls screen, the pause menu, the loading screen and the cockpit card.
const K=key=>'<kbd>'+key+'</kbd>';
export const bindings=[
  {id:'throttle',label:'Throttle',keys:['W','↑'],pad:'RT',touch:'THR'},
  {id:'brake',label:'Brake',keys:['S','↓'],pad:'LT',touch:'BRK'},
  {id:'steer',label:'Steer',keys:['A','D','←','→'],pad:'L stick',touch:'‹ ›'},
  {id:'ers',label:'ERS overtake',note:'Hold to deploy the battery. Braking recharges it.',keys:['Shift'],pad:'A',touch:'ERS'},
  {id:'drs',label:'DRS',note:'Hold inside a zone. In a race, be within one second of the car ahead from lap two.',keys:['Space'],pad:'B',touch:'DRS'},
  {id:'down',label:'Shift down',note:'Using a paddle switches the gearbox to manual.',keys:['Q'],pad:'LB'},
  {id:'up',label:'Shift up',keys:['E'],pad:'RB'},
  {id:'pit',label:'Box this lap',note:'Press again to cancel. The crew handles pit entry and service.',keys:['B'],pad:'X'},
  {id:'tyre',label:'Next tyre compound',keys:['T'],pad:'Y'},
  {id:'reverse',label:'Reverse',note:'At a standstill. Press again for first gear.',keys:['R']},
  {id:'line',label:'Racing line',keys:['L']},
  {id:'help',label:'Show controls',keys:['H'],pad:'View'},
  {id:'full',label:'Fullscreen',note:'Hold Esc to leave fullscreen.',keys:['F']},
  {id:'pause',label:'Pause',keys:['Esc'],pad:'Start'}
];
const short={throttle:'Throttle',brake:'Brake',steer:'Steer',ers:'ERS',drs:'DRS',down:'Gear −',up:'Gear +',pit:'Pit',tyre:'Tyres',reverse:'Reverse',line:'Line',help:'Help',full:'Full',pause:'Pause'};
const rows=[
  [['Esc',1.4,'pause'],['',9.6,null,'gap'],['↑',1,'throttle']],
  [['Tab',1.5],['Q',1,'down'],['W',1,'throttle'],['E',1,'up'],['R',1,'reverse'],['T',1,'tyre'],['Y'],['U'],['I'],['O'],['P'],['',.5,null,'gap'],['←',1,'steer'],['↓',1,'brake'],['→',1,'steer']],
  [['Caps',1.8],['A',1,'steer'],['S',1,'brake'],['D',1,'steer'],['F',1,'full'],['G'],['H',1,'help'],['J'],['K'],['L',1,'line'],[';']],
  [['Shift',2.3,'ers'],['Z'],['X'],['C'],['V'],['B',1,'pit'],['N'],['M'],[','],['.'],['Shift',1.9,'ers']],
  [['Ctrl',1.4],['Alt',1.4],['Space',6.6,'drs'],['Alt',1.4],['Ctrl',1.4]]
];
function keyboard(){
  return '<div class="kb" aria-hidden="true">'+rows.map(row=>'<div>'+row.map(([cap,width=1,action,kind])=>
    '<i class="'+(kind||'key')+(action?' on':'')+'" style="--w:'+width+'"'+(action?' data-a="'+action+'"':'')+'>'+cap+(action?'<em>'+short[action]+'</em>':'')+'</i>').join('')+'</div>').join('')+'</div>';
}
function gamepad(){
  const tag=(x,y,anchor,button,label)=>'<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'"><tspan class="b">'+button+'</tspan><tspan dx="8">'+label+'</tspan></text>';
  return '<svg class="padmap" viewBox="-150 0 940 350" role="img" aria-label="Gamepad layout">'+
    '<g class="lead"><path d="M185 62V40M455 62V40M150 100H74M490 100h76M179 165H74M452 140h114M477 165l89 9M452 190l114 16M415 177v113M290 156v134M350 144V70"/></g>'+
    '<path class="shell" d="M170 108q150-22 300 0 70 12 95 142 10 70-35 68-35-3-75-68H185q-40 65-75 68-45 2-35-68 25-130 95-142z"/>'+
    '<g class="part"><rect x="150" y="62" width="70" height="24" rx="8" data-a="brake"/><rect x="420" y="62" width="70" height="24" rx="8" data-a="throttle"/><rect x="150" y="92" width="84" height="15" rx="7" data-a="down"/><rect x="406" y="92" width="84" height="15" rx="7" data-a="up"/>'+
    '<circle cx="205" cy="165" r="26" data-a="steer"/><circle cx="375" cy="215" r="26" class="idle"/><path class="idle" d="M256 194h18v12h12v18h-12v12h-18v-12h-12v-18h12z"/>'+
    '<circle cx="440" cy="140" r="12" data-a="tyre"/><circle cx="415" cy="165" r="12" data-a="pit"/><circle cx="465" cy="165" r="12" data-a="drs"/><circle cx="440" cy="190" r="12" data-a="ers"/>'+
    '<rect x="279" y="144" width="22" height="12" rx="6" data-a="help"/><rect x="339" y="144" width="22" height="12" rx="6" data-a="pause"/></g>'+
    '<g class="face"><text x="440" y="145">Y</text><text x="415" y="170">X</text><text x="465" y="170">B</text><text x="440" y="195">A</text></g>'+
    tag(185,30,'middle','LT','Brake')+tag(455,30,'middle','RT','Throttle')+tag(66,105,'end','LB','Shift down')+tag(574,105,'start','RB','Shift up')+
    tag(66,170,'end','L stick','Steer')+tag(574,145,'start','Y','Next tyres')+tag(574,179,'start','B','DRS')+tag(574,211,'start','A','ERS overtake')+
    tag(430,312,'middle','X','Box this lap')+tag(300,312,'end','View','Show controls')+tag(350,60,'middle','Start','Pause')+'</svg>';
}
function touchpad(){
  return '<div class="touchmap" aria-hidden="true"><div><i>‹</i><i>›</i></div><div><i>ERS</i><i>DRS</i><i class="stop">BRK</i><i class="thr">THR</i></div></div>'+
    '<p class="sheet-text">Steer with the left thumb and use the pedals with the right. The gearbox shifts automatically. Pit calls, tyre choice, reverse and the racing line are in the pause menu.</p>';
}
const legend=device=>'<ul class="legend">'+bindings.filter(b=>device==='keys'?b.keys:device==='pad'?b.pad:b.touch).map(b=>
  '<li data-a="'+b.id+'"><span class="caps">'+(device==='keys'?b.keys.map(K).join(''):K(device==='pad'?b.pad:b.touch))+'</span><span><b>'+b.label+'</b>'+(b.note?'<small>'+b.note+'</small>':'')+'</span></li>').join('')+'</ul>';
// Full reference with a device switch. Call wireControls on the container after inserting it.
export function controlsPanel(device){
  const tab=(id,label)=>'<button data-device="'+id+'" aria-pressed="'+(id===device)+'">'+label+'</button>';
  return '<div class="controls" data-show="'+device+'"><div class="chips" role="group" aria-label="Input device">'+tab('keys','Keyboard')+tab('pad','Gamepad')+tab('touch','Touch')+'</div>'+
    '<div class="controls-body" data-for="keys">'+keyboard()+legend('keys')+'</div>'+
    '<div class="controls-body" data-for="pad">'+gamepad()+legend('pad')+'</div>'+
    '<div class="controls-body" data-for="touch"><div>'+touchpad()+'</div>'+legend('touch')+'</div></div>';
}
export function wireControls(root){
  const panel=root.querySelector('.controls');
  for(const button of panel.querySelectorAll('[data-device]'))button.onclick=()=>{
    panel.dataset.show=button.dataset.device;
    for(const b of panel.querySelectorAll('[data-device]'))b.setAttribute('aria-pressed',b===button);
  };
  const light=event=>{
    const id=event.type==='pointerover'&&event.target.closest('[data-a]')?.dataset.a;
    for(const el of panel.querySelectorAll('[data-a]'))el.classList.toggle('lit',el.dataset.a===id);
  };
  panel.addEventListener('pointerover',light);panel.addEventListener('pointerleave',light);
}
// Compact card for the loading screen and the cockpit. CSS shows the variant for the device in use.
export function controlCard(){
  const row=(caps,label)=>'<span>'+caps.map(K).join('')+'<b>'+label+'</b></span>';
  return '<div class="for-keys">'+row(['W'],'Throttle')+row(['S'],'Brake')+row(['A','D'],'Steer')+row(['Shift'],'ERS')+row(['Space'],'DRS')+row(['Q','E'],'Gears')+row(['B'],'Pit')+row(['T'],'Tyres')+'</div>'+
    '<div class="for-pad">'+row(['RT'],'Throttle')+row(['LT'],'Brake')+row(['L stick'],'Steer')+row(['A'],'ERS')+row(['B'],'DRS')+row(['LB','RB'],'Gears')+row(['X'],'Pit')+row(['Y'],'Tyres')+'</div>'+
    '<div class="for-touch">'+row(['THR'],'Throttle')+row(['BRK'],'Brake')+row(['‹','›'],'Steer')+row(['ERS'],'Battery')+row(['DRS'],'Rear wing')+row(['Pause'],'Pit and tyres')+'</div>';
}
