import {surfaceY} from './circuit.js';
import * as T from 'three';

// Capture the rear scene once and sample two outward-looking, reflected crops.
export class RearView {
  constructor(ultra=false){
    this.ultra=ultra;
    this.target=new T.RenderTarget(3,1,{type:T.HalfFloatType});
    this.camera=new T.PerspectiveCamera(40,3,.35,310);
    this.overlay=new T.Scene();this.screen=new T.OrthographicCamera(-1,1,1,-1,.01,5);this.screen.position.z=1;
    this.windows=[...document.querySelectorAll('.mirror')].map((canvas,i)=>{
      const geo=new T.PlaneGeometry(1,1),uv=geo.attributes.uv;
      const start=i===0?.47:.18;
      for(let j=0;j<uv.count;j++)uv.setX(j,start+(1-uv.getX(j))*.35);
      const pane=new T.Mesh(geo,new T.MeshBasicMaterial({map:this.target.texture,depthWrite:false,depthTest:false}));
      this.overlay.add(pane);canvas.style.opacity='0';return {canvas,pane};
    });
  }
  resize(w,h,ratio=1){
    const root=document.getElementById('cockpit').getBoundingClientRect();
    let required=1;
    for(const window of this.windows){
      const rect=window.canvas.getBoundingClientRect();
      required=Math.max(required,rect.height,rect.width/(.35*3));
      window.x=2*(rect.x-root.x+rect.width/2)/w-1;
      window.y=1-2*(rect.y-root.y+rect.height/2)/h;
      window.pane.scale.set(2*rect.width/w,2*rect.height/h,1);
    }
    const height=Math.min(this.ultra?384:224,Math.ceil(required*ratio*(this.ultra?1.2:1)/8)*8);
    this.target.setSize(height*3,height);
    // Three uses camera zoom for mesh LOD. Match the rear target's pixel density
    // while preserving the 40-degree projection on both mirror crops.
    this.camera.zoom=Math.min(1,height/(h*ratio)*Math.tan(34*Math.PI/180)/Math.tan(20*Math.PI/180));
    this.camera.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(20*Math.PI/180)*this.camera.zoom));
    this.camera.updateProjectionMatrix();
  }
  capture(renderer,scene,drive,road,axle,line){
    const {camera}=this,yaw=road.yaw+drive.heading;
    camera.position.set(road.x+road.nx*drive.offset-Math.sin(yaw)*.9,
      surfaceY(road,drive.offset)+.83,road.z+road.nz*drive.offset+Math.cos(yaw)*.9);
    const cs=Math.cos(drive.heading),sn=Math.sin(drive.heading);
    camera.rotation.set(-Math.atan(road.grade*cs-road.bank*sn)-.035,Math.PI-yaw,Math.atan(road.bank*cs+road.grade*sn),'YXZ');
    const visible=line.visible;line.visible=false;axle.visible=false;
    renderer.shadowMap.autoUpdate=false;
    renderer.setRenderTarget(this.target);renderer.render(scene,camera);renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate=true;line.visible=visible;axle.visible=true;
  }
  draw(renderer,eye,aspect){
    for(const w of this.windows)w.pane.position.set(w.x+eye.cellX*2/aspect,w.y-eye.cellY*2,0);
    renderer.autoClear=false;renderer.render(this.overlay,this.screen);renderer.autoClear=true;
  }
  dispose(){
    for(const w of this.windows){w.canvas.style.opacity='';w.pane.geometry.dispose();w.pane.material.dispose();}
    this.target.dispose();
  }
}
