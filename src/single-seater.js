import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {foil,tireTexture,wingDecal,paintAtlas,setCompound} from './car-finish.js';
import {colors} from './data.js';

// Form the aerodynamic body from transverse sections [z, half-width, floor, crown].
function hull(sections){
  const vertices=[],indices=[],sides=20;
  for(const [z,w,base,top] of sections){
    for(let i=0;i<sides;i++){
      const a=2*Math.PI*i/sides,c=Math.cos(a),s=Math.sin(a);
      vertices.push(w*Math.sign(c)*Math.pow(Math.abs(c),.77),base+(top-base)*(.5+.5*s),z);
    }
  }
  for(let j=1;j<sections.length;j++)for(let i=0;i<sides;i++){
    const a=(j-1)*sides+i,b=(j-1)*sides+(i+1)%sides;
    indices.push(a,b,a+sides,b,b+sides,a+sides);
  }
  const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geom.setIndex(indices);
  geom.computeVertexNormals();return geom;
}
const rod=(a,b,r)=>{
  const start=new T.Vector3(...a),v=new T.Vector3(...b).sub(start),length=v.length();
  const g=new T.CylinderGeometry(r,r,length,7);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));
  return g.translate(...start.addScaledVector(v,length/2).toArray());
};
function tireGeometry(segments=40){
  const a=[[-.185,.255],[-.184,.314],[-.164,.347],[-.134,.358],[.134,.358],[.164,.347],[.184,.314],[.185,.255],[.185,.004],[-.185,.004],[-.185,.255]];
  return new T.LatheGeometry(a.map(([y,x])=>new T.Vector2(x,y)),segments).rotateZ(Math.PI/2);
}
export function frontAxle(){
  const group=new T.Group(),chassis=new T.Group(),wheels=[],arms=[],flaps=[];
  group.add(chassis);
  const rubber=new T.MeshStandardMaterial({map:tireTexture(),roughness:.87,envMapIntensity:.19});
  const carbon=new T.MeshStandardMaterial({color:0x22262d,metalness:.27,roughness:.42});
  const rim=new T.MeshStandardMaterial({color:0x606368,metalness:.65,roughness:.32});
  const ventsMaterial=new T.MeshStandardMaterial({color:0x1c1918,roughness:.85,emissive:0xd6380c,emissiveIntensity:0});
  const navy=new T.MeshStandardMaterial({color:0x162640,metalness:.24,roughness:.32});
  const gold=new T.MeshStandardMaterial({color:0xf2ba32,metalness:.18,roughness:.36});
  const wishbones=new T.InstancedMesh(new T.CylinderGeometry(.017,.022,1,7),carbon,12);
  wishbones.instanceMatrix.setUsage(T.DynamicDrawUsage);wishbones.frustumCulled=false;group.add(wishbones);
  for(const side of [-1,1]){
    const hub=new T.Group();hub.position.set(side*.84,.358,-1.8);group.add(hub);wheels.push(hub);
    const spin=new T.Group();hub.add(spin);
    spin.add(new T.Mesh(tireGeometry(),rubber));
    const vents=[],cover=new T.Mesh(new T.CylinderGeometry(.242,.242,.376,32).rotateZ(Math.PI/2),rim);spin.add(cover);
    for(const sign of [-1,1]){
      for(let k=0;k<10;k++){
        const angle=k*Math.PI/5;
        vents.push(new T.BoxGeometry(.008,.042,.014).rotateX(-angle).translate(.192*sign,.191*Math.cos(angle),-.191*Math.sin(angle)));
      }
    }
    spin.add(new T.Mesh(mergeGeometries(vents),ventsMaterial));vents.forEach(g=>g.dispose());
    for(const [y,z,hy] of [[.43,-.83,.35],[.46,-2.05,.35],[.22,-.92,.19],[.22,-2.10,.19],[.17,-1.10,.39],[.31,-1.16,.29]]){
      const start=new T.Vector3(side*.21,y,z),end=new T.Vector3(side*.76,hy,-1.8);
      arms.push({start,end,side});
    }
    const endplate=new T.Mesh(hull([[-2.71,.015,.12,.21],[-2.50,.018,.10,.35],[-2.16,.017,.09,.26]]),navy);
    endplate.position.x=side*.966;chassis.add(endplate);
  }
  for(let i=0;i<4;i++){
    const wing=new T.Mesh(foil(1.94,.19,.115,.04),i===2?navy:carbon);
    wing.position.set(0,.105+i*.039,-2.70+i*.11);chassis.add(wing);flaps.push(wing);
  }
  chassis.add(new T.Mesh(hull([[-2.73,.052,.175,.226],[-2.48,.105,.168,.268],[-1.64,.17,.18,.40],[-.35,.31,.16,.57]]),navy));
  chassis.add(new T.Mesh(hull([[-2.72,.036,.223,.229],[-2.48,.082,.252,.272],[-1.64,.067,.389,.403],[-.35,.054,.561,.576]]),gold));
  const up=new T.Vector3(0,1,0),end=new T.Vector3(),start=new T.Vector3(),delta=new T.Vector3();
  const link=new T.Object3D();
  function update(d){
    const s=d.suspension;
    setCompound(rubber.map,d.tyre,false);
    ventsMaterial.emissiveIntensity=Math.max(0,(s.brakeHeat-.35)*1.6)**2;
    for(let i=1;i<flaps.length;i++)flaps[i].rotation.z=(d.damage||0)*.055*i;
    chassis.position.y=s.heave;chassis.rotation.set(s.pitch,0,s.roll);
    wheels.forEach((hub,i)=>{hub.position.y=.358+s.contacts[i];hub.rotation.y=-s.steerAngle;hub.children[0].rotation.x=s.rotation[i];});
    for(const [index,arm] of arms.entries()){
      start.copy(arm.start).applyEuler(chassis.rotation);start.y+=s.heave;
      end.copy(arm.end);end.y+=s.contacts[arm.side===1?1:0];
      delta.subVectors(end,start);
      link.position.copy(start).lerp(end,.5);link.scale.y=delta.length();
      link.quaternion.setFromUnitVectors(up,delta.normalize());
      link.updateMatrix();wishbones.setMatrixAt(index,link.matrix);
    }
    wishbones.instanceMatrix.needsUpdate=true;
  }
  return {group,update};
}
export function opponent(driver,software=false){
  const geo=[],tmp=new T.Color(),carbon='#22242b',body=driver.team==='alpine'?'#265fb7':driver.team==='red_bull'?'#192a48':colors[driver.team]||'#919399';
  function part(g,color,finish){
    let m=g.index?g.toNonIndexed():g;if(m!==g)g.dispose();const oldUV=m.attributes.uv,pos=m.attributes.position;
    const uv=new Float32Array(pos.count*2);
    if(finish==='livery')m.computeBoundingBox();
    for(let i=0;i<pos.count;i++){
      if(finish==='rubber'){
        uv[2*i]=oldUV.getX(i)*511/768;uv[2*i+1]=oldUV.getY(i)*.492+.003;
      }else if(finish==='livery'){
        const {min,max}=m.boundingBox;
        const u=(pos.getZ(i)-min.z)/Math.max(.01,max.z-min.z);
        uv[2*i]=pos.getX(i)<0?1-u:u;
        uv[2*i+1]=.505+.49*(pos.getY(i)-min.y)/Math.max(.01,max.y-min.y);
      }else{uv[2*i]=.92;uv[2*i+1]=.12;}
    }
    m.setAttribute('uv',new T.BufferAttribute(uv,2));
    if(!m.attributes.normal)m.computeVertexNormals();
    const a=new Float32Array(m.attributes.position.count*3);tmp.set(color);
    for(let i=0;i<a.length;i+=3)tmp.toArray(a,i);
    m.setAttribute('color',new T.BufferAttribute(a,3));geo.push(m);
  }
  const box=(w,h,l,x,y,z,color,angle=0)=>part(new T.BoxGeometry(w,h,l).rotateX(angle).translate(x,y,z),color);
  part(hull([[-2.70,.018,.19,.215],[-2.51,.112,.18,.26],[-1.52,.16,.21,.42],[-.5,.32,.14,.62],[.12,.37,.14,.72],[.76,.34,.17,.73],[1.6,.22,.18,.51],[2.12,.035,.26,.34]]),body);
  const stripe={mclaren:'#151b20',ferrari:'#fff5d9',red_bull:'#e89e24',mercedes:'#66d7c3',williams:'#172b56',rb:'#edecdf',haas:'#e44542',aston_martin:'#d4da58',alpine:'#ec8cbd',sauber:'#202529'}[driver.team]||'#e3eaec';
  box(1.55,.046,3,0,.125,.43,carbon);
  part(hull([[-2.53,.028,.214,.266],[-1.60,.052,.343,.436],[-.58,.07,.55,.627]]),stripe);
  for(const s of [-1,1]){
    part(hull([[-.52,.07,.2,.45],[-.35,.28,.18,.62],[.02,.31,.17,.68],[.87,.27,.18,.52],[1.56,.10,.2,.29]]).translate(s*.44,0,0),'#ffffff','livery');
    box(.4,.15,.075,s*.45,.48,-.37,carbon);
    part(hull([[-.30,.13,.54,.61],[.10,.19,.58,.68],[.70,.12,.50,.56],[1.25,.045,.38,.43]]).translate(s*.53,.009,0),stripe);
    box(.07,.09,.14,s*.48,.64,-.36,body);
    part(rod([s*.23,.53,-.39],[s*.47,.62,-.36],.014),carbon);
    for(const z of [-1.8,1.77]){
      part(tireGeometry(software?18:32).translate(s*.83,.356,z),'#ffffff','rubber');
      part(new T.CylinderGeometry(.219,.219,.38,16).rotateZ(Math.PI/2).translate(s*.83,.356,z),'#46474c');
      for(const dz of [-.57,.52])part(rod([s*.23,.29,z+dz],[s*.77,.31,z],.023),carbon);
    }
    box(.04,.32,.66,s*.955,.26,-2.39,body);
    part(hull([[1.86,.012,.58,.90],[2.05,.022,.70,.99],[2.33,.016,.83,.99]]).translate(s*.595,0,0),body);
    for(let i=0;i<5;i++)box(.021,.15,.64,s*(.13+i*.095),.18,1.94,carbon,-.12);
    for(let i=0;i<7;i++)box(.117,.013,.026,s*.54,.64-i*.012,.13+i*.071,carbon,-.18);
    for(const y of [.30,.49])for(const z of [1.30,2.03])
      part(rod([s*.17,y,z],[s*.77,.32,1.77],.019),carbon);
    box(.23,.022,1.15,s*.75,.13,.46,carbon,-.014);
    part(rod([s*.34,.64,.34],[s*.32,.93,.15],.038),carbon);
    part(rod([s*.32,.93,.15],[s*.22,.94,-.4],.04),carbon);
    part(rod([s*.22,.94,-.4],[0,.86,-.62],.036),carbon);
  }
  part(rod([0,.55,-.59],[0,.88,-.62],.032),carbon);
  for(let i=0;i<4;i++)part(foil(1.93,.19,.11,.032).translate(0,.11+i*.044,-2.64+i*.125),i===2?body:carbon);
  part(hull([[.30,.12,.48,.92],[.46,.185,.49,1.06],[.72,.16,.46,.95],[1.8,.08,.32,.56]]),'#ffffff','livery');
  box(.26,.14,.06,0,.91,.34,carbon);
  const helmet=new T.SphereGeometry(.144,16,12).scale(.88,1.04,1);
  part(helmet.translate(0,.755,-.06),driver.slot%2?'#f9edc9':'#e8ad35');
  part(new T.SphereGeometry(.14,12,9).scale(.9,.44,1).translate(0,.77,-.082),'#142c3a');
  box(.86,.13,.38,0,.26,2.04,carbon,-.19);
  box(.14,.52,.10,0,.56,2.01,carbon,-.25);
  part(foil(1.19,.43,.26,.11).translate(0,.75,2.05),body);
  part(foil(1.18,.23,.19,.07).translate(0,.876,2.22),carbon);
  part(foil(.88,.23,.17,.055).translate(0,.49,1.98),carbon);
  const exhaust=new T.CylinderGeometry(.073,.080,.23,16,1,true).rotateX(Math.PI/2);
  part(exhaust.translate(0,.49,2.04),'#6e625a');
  part(new T.CircleGeometry(.064,16).translate(0,.49,2.15),'#16171a');
  box(.12,.13,.075,0,.32,2.24,'#9e261b');
  for(const x of [-.037,0,.037])for(const y of [.287,.325,.363])box(.02,.018,.008,x,y,2.285,'#ff6945');
  box(.42,.044,.07,0,1.085,.50,driver.slot%2?'#f4d64a':carbon);
  const map=paintAtlas(driver,body,stripe);
  const mat=software?new T.MeshPhongMaterial({map,vertexColors:true,shininess:30,specular:0x393939,side:T.DoubleSide}):
    new T.MeshStandardMaterial({map,vertexColors:true,roughness:.45,metalness:.10,envMapIntensity:.37,side:T.DoubleSide});
  const merged=mergeGeometries(geo);geo.forEach(g=>g.dispose());
  const high=new T.Mesh(merged,mat);high.castShadow=true;high.receiveShadow=true;
  const decal=new T.Mesh(new T.PlaneGeometry(1.15,.15),new T.MeshBasicMaterial({map:wingDecal(driver,body)}));
  decal.rotation.x=-.69;decal.position.set(0,.94,2.31);high.add(decal);
  const lod=new T.LOD();lod.addLevel(high,0);
  geo.length=0;
  part(hull([[-2.65,.06,.16,.23],[-.61,.25,.17,.58],[.41,.36,.17,.91],[1.90,.12,.18,.38]]),body);
  box(1.45,.25,1.85,0,.31,.5,body);
  for(const side of [-1,1])for(const z of [-1.8,1.77])
    part(new T.CylinderGeometry(.355,.355,.36,10).rotateZ(Math.PI/2).translate(side*.83,.355,z),'#24262a');
  box(1.93,.085,.42,0,.18,-2.44,carbon);box(1.21,.19,.35,0,.89,2.17,body);
  box(.13,.52,.12,0,.55,2,carbon);
  const low=new T.Mesh(mergeGeometries(geo),mat);
  // At midfield distances retain the sidepods, helmet, halo and wing silhouette.
  // A tyre's individual vent holes and the diffuser vanes are subpixel here.
  for(const side of [-1,1]){
    part(hull([[-.48,.16,.18,.48],[-.17,.29,.17,.64],[.38,.27,.17,.62],[1.45,.09,.20,.32]]).translate(side*.46,0,0),'#ffffff','livery');
    part(rod([side*.31,.65,.33],[side*.29,.92,.14],.035),carbon);
    part(rod([side*.29,.92,.14],[0,.86,-.59],.038),carbon);
    for(const z of [-1.8,1.77]){
      part(new T.CircleGeometry(.22,12).rotateY(side*Math.PI/2).translate(side*1.015,.355,z),'#515257');
      part(rod([side*.21,.30,z+.4],[side*.76,.31,z],.028),carbon);
    }
    box(.036,.29,.59,side*.952,.25,-2.4,body);
  }
  part(new T.SphereGeometry(.14,8,6).translate(0,.76,-.06),driver.slot%2?'#f9edc9':'#e8ad35');
  part(foil(1.18,.23,.19,.07).translate(0,.876,2.22),carbon);
  const middle=new T.Mesh(mergeGeometries(geo),mat);geo.forEach(g=>g.dispose());
  middle.castShadow=true;lod.addLevel(middle,software?23:36,.12);lod.addLevel(low,software?65:105,.12);
  lod.userData.tyreAtlas=map;
  return lod;
}
