import * as T from 'three';

const teamNames={red_bull:'RED BULL',rb:'RACING BULLS',mercedes:'MERCEDES',mclaren:'McLAREN',
  aston_martin:'ASTON MARTIN',haas:'HAAS',sauber:'KICK SAUBER',alpine:'ALPINE',ferrari:'FERRARI',williams:'WILLIAMS'};

const tyres=new Map();
let slick;
function tread(){
  if(slick)return slick;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d'),pixels=c.createImageData(512,256);
  let state=1728;
  const random=()=>((state=Math.imul(1664525,state)+1013904223>>>0)/4294967296);
  for(let y=0;y<256;y++)for(let x=0;x<512;x++){
    const tread=y>=147&&y<=183,shoulder=5*Math.cos(y*.26);
    const gray=(tread?51:40)+shoulder+random()*18+2*Math.sin(y*1.5);
    const i=(y*512+x)*4;
    pixels.data[i]=pixels.data[i+1]=gray;pixels.data[i+2]=gray+1;pixels.data[i+3]=255;
  }
  c.putImageData(pixels,0,0);
  for(let i=0;i<110;i++){
    c.fillStyle=i%3?'#333436':'#525356';
    c.fillRect(random()*512,150+random()*30,2+random()*14,1);
  }
  slick=canvas;return slick;
}
function tireImage(compound='MEDIUM'){
  if(tyres.has(compound))return tyres.get(compound);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d');c.drawImage(tread(),0,0);
  c.fillStyle=compound==='SOFT'?'#e24346':compound==='HARD'?'#e3e0d5':'#c3a83d';
  for(const y of [102,235]){
    c.fillRect(0,y,512,2.4);
    c.font='italic bold 10px sans-serif';c.textAlign='center';
    for(const x of [74,330])c.fillText('P ZERO',x,y+10);
  }
  tyres.set(compound,canvas);
  return canvas;
}
export function tireTexture(compound){
  const map=new T.CanvasTexture(tireImage(compound));map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  return map;
}
export function setCompound(map,compound,isAtlas){
  if(map.userData.compound===compound)return;
  if(isAtlas)map.image.getContext('2d').drawImage(tireImage(compound),0,256);
  else map.image=tireImage(compound);
  map.userData.compound=compound;map.needsUpdate=true;
}
export function wingDecal(driver,color){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;
  const c=canvas.getContext('2d');
  c.fillStyle='#20242b';c.fillRect(0,0,512,80);
  c.fillStyle=color;c.fillRect(0,59,512,9);
  c.fillStyle='#f4f1e9';c.font='italic bold 55px sans-serif';c.textAlign='center';
  c.fillText(teamNames[driver.team]||driver.team.toUpperCase(),256,52,480);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  return map;
}

const numbers={YOU:1,NOR:4,PIA:81,LEC:16,HAM:44,RUS:63,ANT:12,VER:1,TSU:22,LAW:30,HAD:6,
  ALB:23,SAI:55,ALO:14,STR:18,BEA:87,OCO:31,GAS:10,DOO:7,COL:43,HUL:27,BOR:5};
export function paintAtlas(driver,body,stripe){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;
  const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,768,512);
  const grad=c.createLinearGradient(0,0,0,255);
  grad.addColorStop(0,body);grad.addColorStop(.75,body);grad.addColorStop(1,'#161b22');
  c.fillStyle=grad;c.fillRect(0,0,768,256);
  c.fillStyle=stripe;c.beginPath();c.moveTo(0,178);c.bezierCurveTo(300,198,420,87,768,36);
  c.lineTo(768,79);c.bezierCurveTo(420,108,290,228,0,189);c.fill();
  c.fillStyle='#151a22';c.beginPath();c.moveTo(0,216);c.bezierCurveTo(260,254,510,226,768,128);c.lineTo(768,256);c.lineTo(0,256);c.fill();
  c.fillStyle='#f8f8f2';c.font='italic bold 56px sans-serif';c.textAlign='center';
  c.fillText(teamNames[driver.team]||driver.team.toUpperCase(),289,129,414);
  c.font='italic bold 88px sans-serif';c.fillText(String(numbers[driver.id]||driver.slot+1),629,175,123);
  c.font='bold 17px monospace';c.fillText(driver.id,628,196);
  c.drawImage(tireImage(driver.tyre),0,256,512,256);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;map.userData.compound=driver.tyre;return map;
}

// Each section spans a station across the wing. The closed profile curls upward
// at the tips like a 2025 ground-effect rear wing.
export function foil(span,chord,camber,tipRise=0){
  const positions=[],indices=[];
  const contour=[[0,0],[.15,.055],[.48,.15],[.80,.34],[1,.54],[.95,.42],[.52,.05],[.13,-.09]];
  for(let i=0;i<=12;i++){
    const u=i/6-1,bend=Math.abs(u)**3;
    for(const [v,y] of contour)positions.push(u*span/2,y*camber+tipRise*bend,(v-.5)*chord*(1-.25*bend)-bend*.045);
    if(i)for(let j=0;j<contour.length;j++){
      const a=(i-1)*contour.length+j,b=(i-1)*contour.length+(j+1)%contour.length;
      indices.push(a,b,a+contour.length,b,b+contour.length,a+contour.length);
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
