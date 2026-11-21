import {defineConfig} from 'vite';
import {readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Emits sw.js with the list of built files, so the game installs as an app and runs offline after one visit.
const worker=(version,hashed,files)=>`const VERSION='${version}',HASHED=new Set(${JSON.stringify(hashed)}),FILES=${JSON.stringify(files)};
const base=new URL(self.registration.scope).pathname;
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(['./',...HASHED,...FILES].map(url=>new Request(url,{cache:'reload'})))));});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('formula25-')&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
// Hashed bundles never change, so the cache answers first. Everything else prefers the network and falls back to the cache offline.
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(VERSION);
    if(HASHED.has(url.pathname.slice(base.length))){const hit=await cache.match(event.request);if(hit)return hit;}
    try{const response=await fetch(event.request);if(response.ok)cache.put(event.request,response.clone());return response;}
    catch(error){const hit=await cache.match(event.request,{ignoreSearch:true})||event.request.mode==='navigate'&&await cache.match('./');if(hit)return hit;throw error;}
  })());
});
`;
const offline=()=>({name:'offline',apply:'build',enforce:'post',generateBundle(_,bundle){
  const hashed=Object.keys(bundle).filter(name=>name!=='index.html');
  const files=readdirSync('public',{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()).map(entry=>(entry.parentPath+'/'+entry.name).replaceAll('\\','/').replace(/^public\//,'')).sort();
  const hash=createHash('sha256');
  for(const name of hashed)hash.update(name);
  for(const name of files)hash.update(name).update(readFileSync('public/'+name));
  this.emitFile({type:'asset',fileName:'sw.js',source:worker('formula25-'+hash.digest('hex').slice(0,12),hashed,files)});
}});
export default defineConfig({
  plugins:[offline()],
  preview:{allowedHosts:['.preview.devinapps.com']},
  build:{rollupOptions:{output:{manualChunks(id){if(id.includes('/node_modules/three/'))return 'three';}}}}
});
