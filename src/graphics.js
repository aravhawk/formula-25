import {WebGLRenderer} from 'three';
import {read} from './data.js';

const cpu=/swiftshader|llvmpipe|software|lavapipe/i;
let glSoftware;
export const graphicsPrefs=()=>({quality:read('quality','auto')});

// WebGL 2 is the only 3D renderer. Without it the caller draws the circuit on a 2D canvas.
export function createGraphics(settings){
  if(settings.lite||new URLSearchParams(location.search).has('lite'))return;
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
    return {renderer,software:glSoftware};
  }catch(error){renderer?.dispose();console.warn('WebGL initialization',error.message);}
}
