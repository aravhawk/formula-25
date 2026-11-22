// Packs square PNG files into one .ico. Usage: node scripts/favicon-ico.mjs <out.ico> <size.png> [<size.png> ...]
// Each PNG is stored as is, which every current browser reads. Frames must be 256 pixels or smaller.
import {readFileSync,writeFileSync} from 'node:fs';
const [out,...inputs]=process.argv.slice(2);
if(!out||!inputs.length){console.error('usage: node scripts/favicon-ico.mjs <out.ico> <size.png> [<size.png> ...]');process.exit(1);}
const frames=inputs.map(path=>{
  const png=readFileSync(path);
  if(png.readUInt32BE(0)!==0x89504e47)throw new Error(path+' is not a PNG');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  if(width>256||height>256)throw new Error(path+' is larger than 256 pixels');
  return{png,width,height};
});
const header=Buffer.alloc(6+16*frames.length);
header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);
let offset=header.length;
frames.forEach(({png,width,height},i)=>{
  const at=6+16*i;
  header[at]=width%256;header[at+1]=height%256;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);
  header.writeUInt32LE(png.length,at+8);header.writeUInt32LE(offset,at+12);offset+=png.length;
});
writeFileSync(out,Buffer.concat([header,...frames.map(f=>f.png)]));
console.log(out+': '+frames.map(f=>f.width+'x'+f.height).join(', '));
