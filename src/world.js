import {assetUrl,seasonData} from './assets.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import * as T from 'three';
import {scenery,canvasMap} from './scenery.js';
import {frontAxle,opponent} from './single-seater.js';
import {setCompound} from './car-finish.js';
import {mod} from './data.js';
import {SceneSolids} from './solids.js';
import {RearView} from './rear-view.js';
import {createGraphics,graphicsPrefs} from './graphics.js';
import {Floodlights,TyreMarks} from './race-effects.js';
import {WorldLite} from './world-lite.js';
import {FramePacer,displayInterval} from './frame-pacer.js';
let shared,hdr;
async function textures(software){
  if(!shared){
    const loader=new T.TextureLoader();
    const files=['asphalt','grass','sky','tree0','tree1','tree2','pit-facade','grandstand','concrete','guardrail','building0','building1','building2','building3'];
    shared=Promise.all(files.map(f=>loader.loadAsync(assetUrl(f)))).then(all=>{
      const [asphalt,grass,sky,t0,t1,t2,pit,crowd,concrete,guardrail,...buildings]=all;
      for(const t of all)t.colorSpace=T.SRGBColorSpace;
      for(const t of [asphalt,grass,pit,crowd,concrete,guardrail,...buildings]){t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;}
      sky.mapping=T.EquirectangularReflectionMapping;
      return {asphalt,grass,sky,trees:[t0,t1,t2],pit,crowd,concrete,guardrail,buildings,all};
    }).catch(e=>{shared=null;throw e;});
  }
  const media=await shared;
  if(!software&&!hdr)hdr=new HDRLoader().loadAsync('./assets/paddock.hdr').then(t=>{
    t.mapping=T.EquirectangularReflectionMapping;return t;
  }).catch(()=>{hdr=null;return media.sky;});
  return {...media,hdr:software?null:await hdr};
}
export class World{
  static async create(root,game,prefs=graphicsPrefs()){
    const graphics=createGraphics(prefs);
    if(!graphics)return new WorldLite(root,game);
    const {renderer}=graphics,ultra=prefs.quality==='ultra';
    const software=prefs.quality==='performance'||(graphics.software&&!ultra);
    try{
      const id=String(game.event.round).padStart(2,'0');
      const [media,land,footprints]=await Promise.all([textures(software),new T.TextureLoader().loadAsync(assetUrl('land-'+id)),seasonData('buildings-'+id)]);
      land.colorSpace=T.SRGBColorSpace;land.anisotropy=4;
      const world=new World(root,game,renderer,{...media,land,footprints},software,ultra);
      world.backend='WebGL 2';
      world.budget=graphics.software&&!ultra?285000:software?1.6e6:ultra?6.2e6:4.2e6;
      if(displayInterval&&displayInterval<.011)world.budget=Math.min(world.budget,ultra?3.6e6:2.5e6);
      renderer.domElement.addEventListener('webglcontextlost',()=>{world.lost=true;},{once:true});
      return world;
    }
    catch(error){
      console.warn('Scene initialization',error.message);
      renderer.dispose();renderer.forceContextLoss();
      return new WorldLite(root,game);
    }
  }
  constructor(root,game,renderer,media,software,ultra=false){
    this.ultra=ultra;this.game=game;this.renderer=renderer;this.media=media;root.replaceChildren(renderer.domElement);
    this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(69,1,.09,3400);
    if(!software)this.mirrors=new RearView(ultra);
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.97;
    renderer.shadowMap.enabled=!software&&game.track.event.light!=='night';
    renderer.shadowMap.type=T.PCFShadowMap;
    this.software=software;this.pacer=new FramePacer(software?.5:ultra?.7:.6);this.frames=0;this.budget=285000;
    game.solids=new SceneSolids();
    this.updateCourse=scenery(this.scene,game.track,media,software,game.solids,ultra);
    if(!software&&['dusk','night'].includes(game.event.light))this.lights=new Floodlights(this.scene,game.track);
    this.marks=new TyreMarks(this.scene);
    this.axle=frontAxle();this.scene.add(this.axle.group);
    const shadowTex=canvasMap(64,128,c=>{const g=c.createRadialGradient(32,64,1,32,64,43);g.addColorStop(0,'#11131af2');g.addColorStop(.65,'#11131aaa');g.addColorStop(1,'#11131a00');
      c.fillStyle=g;c.fillRect(-5,-5,110,145);});
    const shadowMat=new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    const shadowGeo=new T.PlaneGeometry(3.0,6.2).rotateX(-Math.PI/2);
    this.cars=game.ai.map(c=>{const m=opponent(c,software),shadow=new T.Mesh(shadowGeo,shadowMat);
      m.add(shadow);shadow.position.y=.035;this.scene.add(m);return m;});
    this.line=new T.InstancedMesh(new T.PlaneGeometry(.32,3.9).rotateX(-Math.PI/2),new T.MeshBasicMaterial({transparent:true,opacity:.74,depthWrite:false}),35);
    this.line.frustumCulled=false;this.scene.add(this.line);this.stamp=new T.Object3D();this.tint=new T.Color();
  }
  // Never render more pixels than the display has, and cap very large displays.
  resize(w,h){
    this.width=w;this.height=h;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    const ratio=Math.min(devicePixelRatio||1,this.ultra?3:2,Math.sqrt(this.budget/(w*h)))*this.pacer.scale;
    this.renderer.setDrawingBufferSize(w,h,ratio);this.pixels=Math.floor(w*ratio)+' × '+Math.floor(h*ratio);this.mirrors?.resize(w,h,ratio);
  }
  get cadence(){return this.pacer.cadence;}
  get status(){return this.pixels+(this.pacer.measured?' · '+Math.round(1/this.pacer.mean)+' fps · p95 '+(this.pacer.p95*1000).toFixed(1)+' ms':'');}
  render(d,eye,line,dt){
    const {track}=this.game,cam=this.camera;
    if(this.pacer.add(dt))this.resize(this.width,this.height);
    const shade=this.updateCourse(eye);
    // Mirrors and shadows refresh on alternate frames, so every frame carries a similar load.
    const period=Math.max(2,Math.round((1/30)/this.pacer.interval)),phase=this.frames++%period;
    if(this.updateCourse.sun?.castShadow&&phase===Math.floor(period/2))this.updateCourse.sun.shadow.needsUpdate=true;
    cam.position.set(eye.x,eye.y,eye.z);cam.rotation.set(eye.pitch,-eye.yaw,eye.roll,'YXZ');
    const fov=eye.fov+(cam.aspect<1?10:0);
    if(Math.abs(cam.fov-fov)>.18){cam.fov=fov;cam.updateProjectionMatrix();}
    const f=track.at(d.distance),ax=this.axle.group,cs=Math.cos(d.heading),sn=Math.sin(d.heading);
    ax.position.set(...track.position(d.distance,d.offset));ax.rotation.set(Math.atan(f.grade*cs-f.bank*sn),-f.yaw-d.heading,-Math.atan(f.bank*cs+f.grade*sn),'YXZ');
    this.axle.update(d);this.lights?.update(d.distance);this.marks.update(d);
    const viewingForward=cs>=0;
    this.game.ai.forEach((c,i)=>{
      const mesh=this.cars[i],gap=mod(c.distance-d.distance+track.length/2,track.length)-track.length/2;
      const ahead=viewingForward?gap:-gap;
      mesh.visible=ahead>(this.mirrors?-310:-8)&&ahead<530;
      if(mesh.visible){const station=c.renderDistance??c.distance,offset=c.renderOffset??c.offset;
        setCompound(mesh.userData.tyreAtlas,c.tyre,true);
        const p=track.at(station);mesh.position.set(...track.position(station,offset));
        const brakeDive=Math.min(.025,Math.max(-.035,(c.longitudinalG||0)*.009));
        const roll=Math.max(-.034,Math.min(.034,p.curvature*c.speed*c.speed*.0013));
        mesh.rotation.set(Math.atan(p.grade)+brakeDive,-p.yaw-(c.bodyYaw||0),-Math.atan(p.bank)+roll,'YXZ');}
    });
    this.line.visible=line;
    if(line){
      const start=Math.ceil(d.distance/6)*6;
      if(this.lineStart!==start){
        this.lineStart=start;this.linePace??=new Float32Array(this.line.count);
        for(let i=0;i<this.line.count;i++){
          const station=start+i*6,p=track.at(station);
          this.stamp.position.set(...track.position(station,p.line,.071));
          this.stamp.rotation.set(Math.atan(p.grade),-p.yaw,-Math.atan(p.bank),'YXZ');
          this.stamp.updateMatrix();this.line.setMatrixAt(i,this.stamp.matrix);
          this.linePace[i]=this.game.pace(station);
        }
        this.line.instanceMatrix.needsUpdate=true;this.lineSpeed=Infinity;
      }
      if(Math.abs(d.speed-this.lineSpeed)>.2){
        this.lineSpeed=d.speed;
        for(let i=0;i<this.line.count;i++){
          const margin=this.linePace[i]-d.speed;
          this.tint.set(margin<-2?'#ff553b':margin<5?'#ffc445':'#64e4a5');
          this.line.setColorAt(i,this.tint);
        }
        this.line.instanceColor.needsUpdate=true;
      }
    }
    if(phase===0)this.mirrors?.capture(this.renderer,this.scene,d,f,ax,this.line);
    this.renderer.render(this.scene,cam);
    this.mirrors?.draw(this.renderer,eye,cam.aspect);
    const fraction=mod(d.distance,track.length)/track.length;
    if(track.event.round===8&&fraction>.397&&fraction<.505)return .30;
    if(track.event.light==='night')return .45+.15*Math.cos(d.distance*Math.PI/24)**2;
    return (track.event.light==='dusk'?.77:.94+.06*Math.sin(f.yaw+.7))*(1-.39*shade);
  }
  dispose(){
    this.mirrors?.dispose();
    const kept=new Set(this.media.all);
    const materials=new Set(),geom=new Set(),texturesToFree=new Set();
    this.scene.traverse(o=>{if(o.geometry)geom.add(o.geometry);if(o.material)materials.add(o.material);if(o.isInstancedMesh)o.dispose();});
    for(const m of materials){if(m.map&&!kept.has(m.map))texturesToFree.add(m.map);m.dispose();}
    for(const g of geom)g.dispose();for(const t of texturesToFree)t.dispose();
    if(!kept.has(this.scene.background))this.scene.background.dispose();
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
}
