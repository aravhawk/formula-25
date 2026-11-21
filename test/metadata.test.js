import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
