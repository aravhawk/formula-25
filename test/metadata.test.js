import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const ORIGIN='https://formula.aravhawk.com';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const head=html.slice(html.indexOf('<head>'),html.indexOf('</head>'));
// The head is parsed from index.html itself, so the check sees exactly what a crawler fetches before any script runs.
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
const metas=[...head.matchAll(/<meta\s[^>]*>/g)].map(m=>attrs(m[0]));
const meta=key=>{const hits=metas.filter(m=>m.property===key||m.name===key);assert.equal(hits.length,1,key+' must appear exactly once');return hits[0].content;};
const canonical=()=>{const hits=[...head.matchAll(/<link\s[^>]*rel="canonical"[^>]*>/g)];assert.equal(hits.length,1,'one canonical link');return attrs(hits[0][0]).href;};
const jpegSize=buffer=>{
  assert.equal(buffer.readUInt16BE(0),0xffd8,'og-image.jpg is a JPEG');
  for(let at=2;at<buffer.length;){
    const marker=buffer.readUInt16BE(at),length=buffer.readUInt16BE(at+2);
    if(marker>=0xffc0&&marker<=0xffcf&&![0xffc4,0xffc8,0xffcc].includes(marker))return{height:buffer.readUInt16BE(at+5),width:buffer.readUInt16BE(at+7)};
    at+=2+length;
  }
  throw new Error('no frame header in og-image.jpg');
};
test('The page names itself with a title, description and canonical link on the production domain',()=>{
  const title=/<title>([^<]*)<\/title>/.exec(head)?.[1];
  assert.ok(title&&title.length<=60,'title is present and fits a search result');
  const description=meta('description');
  assert.ok(description.length>=80&&description.length<=160,'description is 80 to 160 characters');
  assert.equal(canonical(),ORIGIN+'/');
  assert.equal(meta('og:url'),canonical());
});
test('Open Graph tags describe the page and point at an absolute 1200 by 630 image',()=>{
  assert.equal(meta('og:type'),'website');
  assert.equal(meta('og:site_name'),'Formula 25');
  assert.equal(meta('og:locale'),'en_US');
  assert.equal(meta('og:title'),/<title>([^<]*)<\/title>/.exec(head)[1]);
  assert.equal(meta('og:description'),meta('description'));
  const image=meta('og:image');
  assert.ok(image.startsWith(ORIGIN+'/'),'og:image is an absolute URL on the production domain');
  assert.equal(meta('og:image:secure_url'),image);
  assert.equal(meta('og:image:type'),'image/jpeg');
  assert.equal(meta('og:image:width'),'1200');
  assert.equal(meta('og:image:height'),'630');
  assert.ok(meta('og:image:alt').length>=20,'og:image:alt describes the picture');
});
test('Twitter card uses the large image layout with matching title, description and image',()=>{
  assert.equal(meta('twitter:card'),'summary_large_image');
  assert.equal(meta('twitter:title'),meta('og:title'));
  assert.equal(meta('twitter:description'),meta('og:description'));
  assert.equal(meta('twitter:image'),meta('og:image'));
  assert.equal(meta('twitter:image:alt'),meta('og:image:alt'));
});
test('The shared image exists in public, matches its declared size and stays light',()=>{
  const file=new URL('../public/'+new URL(meta('og:image')).pathname.slice(1),import.meta.url);
  const buffer=readFileSync(file);
  assert.deepEqual(jpegSize(buffer),{width:Number(meta('og:image:width')),height:Number(meta('og:image:height'))});
  assert.ok(buffer.length<600*1024,'social preview stays under 600 KB so every platform fetches it');
});
test('Share copy has no em dashes or en dashes',()=>{
  for(const m of metas)for(const value of Object.values(m))assert.ok(!/[\u2013\u2014]/.test(value),'no dash in '+value);
  assert.ok(!/[\u2013\u2014]/.test(/<title>([^<]*)<\/title>/.exec(head)[1]),'no dash in the title');
});

// Technical SEO: crawl rules, language, structured data, icons and the install manifest.
const pub=name=>new URL('../public/'+name,import.meta.url);
const links=[...head.matchAll(/<link\s[^>]*>/g)].map(m=>attrs(m[0]));
const pngSize=buffer=>{assert.equal(buffer.readUInt32BE(0),0x89504e47,'file is a PNG');return{width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};};
const icoSizes=buffer=>{
  assert.equal(buffer.readUInt16LE(2),1,'file is an ico');
  return Array.from({length:buffer.readUInt16LE(4)},(_,i)=>{const at=6+16*i,width=buffer[at]||256,height=buffer[at+1]||256;assert.equal(buffer.readUInt32BE(buffer.readUInt32LE(at+12)),0x89504e47,'ico frame is a PNG');return width+'x'+height;});
};
const jsonLd=()=>{const hits=[...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];assert.equal(hits.length,1,'one JSON-LD block');return JSON.parse(hits[0][1]);};
test('Production allows indexing, declares English and has no hreflang because the site has one language',()=>{
  assert.match(html,/^<!doctype html>\s*<html lang="en">/i);
  assert.ok(meta('og:locale').startsWith('en'),'og:locale agrees with lang');
  const robots=meta('robots').split(',').map(v=>v.trim().toLowerCase());
  assert.ok(robots.includes('index')&&robots.includes('follow'),'robots meta says index, follow');
  for(const blocked of['noindex','nofollow','none','noarchive','nosnippet'])assert.ok(!robots.includes(blocked),'robots meta has no '+blocked);
  assert.ok(!/hreflang/i.test(html),'no hreflang on a single language site');
  assert.ok(!/noindex/i.test(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')),'vercel.json adds no noindex header');
});
test('robots.txt allows crawling and names the sitemap on the production domain',()=>{
  const robots=readFileSync(pub('robots.txt'),'utf8');
  assert.match(robots,/^User-agent: \*$/m);
  assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots),'robots.txt does not block the whole site');
  assert.match(robots,new RegExp('^Sitemap: '+ORIGIN.replaceAll('.','\\.')+'/sitemap\\.xml$','m'));
});
test('sitemap.xml lists every page once, on the production domain, including the canonical URL',()=>{
  const xml=readFileSync(pub('sitemap.xml'),'utf8');
  assert.match(xml,/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  const locs=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  assert.deepEqual(locs,[canonical()],'the one page of this single route app');
  assert.equal(new Set(locs).size,locs.length);
});
test('JSON-LD describes the site, the game and its author with linked, absolute identifiers',()=>{
  const ld=jsonLd();
  assert.equal(ld['@context'],'https://schema.org');
  const nodes=ld['@graph'],byId=new Map(nodes.map(n=>[n['@id'],n])),types=n=>[].concat(n['@type']);
  const site=nodes.find(n=>types(n).includes('WebSite')),game=nodes.find(n=>types(n).includes('VideoGame')),person=nodes.find(n=>types(n).includes('Person'));
  assert.ok(site&&game&&person,'WebSite, VideoGame and Person nodes exist');
  assert.equal(byId.size,nodes.length,'every node has its own @id');
  for(const id of byId.keys())assert.ok(id.startsWith(ORIGIN+'/#'),id+' sits on the production domain');
  const walk=value=>{if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(k==='@id'&&typeof v==='string')assert.ok(byId.has(v),'@id '+v+' resolves to a node');walk(v);}};
  walk(ld);
  assert.equal(site.url,canonical());
  assert.equal(game.url,canonical());
  assert.equal(game.image,meta('og:image'));
  assert.equal(game.description,meta('description'));
  assert.equal(site.description,meta('description'));
  assert.equal(game.inLanguage,'en');
  assert.equal(game.isAccessibleForFree,true);
  assert.deepEqual(game.isPartOf,{'@id':site['@id']});
  assert.deepEqual(game.author,{'@id':person['@id']});
  assert.ok(person.name&&person.url.startsWith('https://'),'the author has a name and an https profile');
  const text=JSON.stringify(ld);
  for(const [,url] of text.matchAll(/"(https?:[^"]+)"/g))assert.ok(url.startsWith('https://'),url+' is https');
  assert.ok(!/[\u2013\u2014]/.test(text),'no dashes in structured data');
});
test('Favicons, apple-touch-icon and the manifest exist at the sizes the head and manifest declare',()=>{
  const find=(rel,pick=()=>true)=>{const hit=links.find(l=>l.rel===rel&&pick(l));assert.ok(hit,'a '+rel+' link exists');return hit;};
  for(const l of links.filter(l=>['icon','apple-touch-icon','manifest'].includes(l.rel))){
    assert.ok(l.href.startsWith('/'),l.href+' is root relative');
    assert.ok(existsSync(pub(l.href.slice(1))),l.href+' exists in public');
  }
  const ico=find('icon',l=>l.href==='/favicon.ico');
  const frames=icoSizes(readFileSync(pub('favicon.ico')));
  for(const size of ico.sizes.split(' '))assert.ok(frames.includes(size),'favicon.ico holds a '+size+' frame');
  assert.equal(find('icon',l=>l.type==='image/svg+xml').href,'/icon.svg');
  const touch=find('apple-touch-icon');
  const touchSize=pngSize(readFileSync(pub(touch.href.slice(1))));
  assert.equal(touchSize.width+'x'+touchSize.height,touch.sizes);
  assert.equal(touchSize.width,180,'apple-touch-icon is 180 pixels square');
  const manifest=JSON.parse(readFileSync(pub(find('manifest').href.slice(1)),'utf8'));
  assert.ok(manifest.name&&manifest.short_name&&manifest.start_url&&manifest.id,'manifest names the app and its identity');
  assert.equal(manifest.lang,'en');
  assert.equal(manifest.theme_color,meta('theme-color'));
  assert.equal(manifest.background_color,meta('theme-color'));
  const png=manifest.icons.filter(i=>i.type==='image/png');
  assert.ok(png.some(i=>i.sizes==='192x192')&&png.some(i=>i.sizes==='512x512'),'192 and 512 pixel icons for installs');
  for(const i of png){const size=pngSize(readFileSync(pub(i.src)));assert.equal(size.width+'x'+size.height,i.sizes,i.src+' matches its declared size');}
  assert.ok(manifest.icons.every(i=>existsSync(pub(i.src))),'every manifest icon exists');
  assert.ok(!/[\u2013\u2014]/.test(JSON.stringify(manifest)),'no dashes in the manifest');
});
