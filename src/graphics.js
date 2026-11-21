import {WebGLRenderer} from 'three';
import {read} from './data.js';

const cpu=/swiftshader|llvmpipe|software|lavapipe/i;
let glSoftware;
export const graphicsPrefs=()=>({backend:read('backend','auto'),quality:read('quality','auto')});

// Some adapters initialize successfully but lose their device on presentation.
// Exercise the swap chain before loading the circuit and starting the clock.
async function presentFrame(backend){
  const {device,context}=backend;
  const encoder=device.createCommandEncoder();
  const pass=encoder.beginRenderPass({colorAttachments:[{
    view:context.getCurrentTexture().createView(),clearValue:[0,0,0,1],loadOp:'clear',storeOp:'store'
  }]});
  pass.end();device.queue.submit([encoder.finish()]);
  let timeout;
  try{
    await Promise.race([device.queue.onSubmittedWorkDone(),new Promise((_,reject)=>{
      timeout=setTimeout(()=>reject(Error('WebGPU presentation timed out')),2500);
    })]);
  }finally{clearTimeout(timeout);}
}

async function nativeGPU(settings){
  if(!navigator.gpu||settings.backend==='webgl')return;
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)return;
  const info=adapter.info||{};
  const software=info.isFallbackAdapter||cpu.test([info.description,info.architecture,info.device].join(' '));
  if(software&&settings.backend==='auto')return;
  const {WebGPURenderer}=await import('three/webgpu');
  const renderer=new WebGPURenderer({antialias:settings.quality!=='performance',alpha:false,powerPreference:'high-performance'});
  try{
    await renderer.init();
    if(renderer.backend.isWebGPUBackend){
      await presentFrame(renderer.backend);
      return {renderer,software:!!software,label:'WebGPU'};
    }
  }catch(error){console.warn('WebGPU initialization',error.message);}
  const device=renderer.backend?.device;
  try{renderer.dispose();}finally{device?.destroy();}
}

export async function createGraphics(settings){
  if(settings.backend==='canvas'||new URLSearchParams(location.search).has('lite'))return;
  let abandoned=false,timer;
  try{
    const attempt=nativeGPU(settings).then(result=>{
      if(!abandoned||!result)return result;
      const device=result.renderer.backend.device;
      result.renderer.dispose();device.destroy();
    });
    const gpu=await Promise.race([attempt,new Promise(resolve=>{
      timer=setTimeout(()=>{abandoned=true;resolve();},6000);
    })]);
    if(gpu)return gpu;
  }catch(error){console.warn('WebGPU adapter',error.message);}
  finally{clearTimeout(timer);}
  let renderer;
  try{
    const params={alpha:false,powerPreference:'high-performance',antialias:glSoftware!==true&&settings.quality!=='performance'};
    renderer=new WebGLRenderer(params);
    const gl=renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
    glSoftware=!!info&&cpu.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    if(glSoftware&&params.antialias){
      renderer.dispose();renderer.forceContextLoss();
      renderer=new WebGLRenderer({...params,antialias:false});
    }
    return {renderer,software:glSoftware,label:'WebGL 2'};
  }catch(error){renderer?.dispose();console.warn('WebGL initialization',error.message);}
}
