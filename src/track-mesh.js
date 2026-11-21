import * as T from 'three';

// Spatial batches keep the far side of a circuit out of the draw list.
const cell = (x,z,size=150) => Math.floor(x/size)+','+Math.floor(z/size);
export class Surface {
  constructor(parent,material,size=150){this.parent=parent;this.material=material;this.tiles=new Map();this.range=0;this.size=size;}
  quad(a,b,c,d,color,u=1,v=1,offset=0,uv=null,tints=null){
    const key=cell(a[0],a[2],this.size);
    if(!this.tiles.has(key))this.tiles.set(key,{positions:[],colors:[],uvs:[],indices:[]});
    const tile=this.tiles.get(key),n=tile.positions.length/3;
    tile.positions.push(...a,...b,...c,...d);
    for(const tint of tints||[color,color,color,color])tile.colors.push(tint.r,tint.g,tint.b);
    tile.uvs.push(...(uv||[0,offset,u,offset,u,v+offset,0,v+offset]));
    tile.indices.push(n,n+1,n+3,n+1,n+2,n+3);
  }
  finish(){
    for(const t of this.tiles.values()){
      const g=new T.BufferGeometry();
      for(const [key,values,size] of [['position',t.positions,3],['color',t.colors,3],['uv',t.uvs,2]])
        g.setAttribute(key,new T.Float32BufferAttribute(values,size));
      g.setIndex(t.indices);g.computeVertexNormals();g.computeBoundingSphere();
      const mesh=new T.Mesh(g,this.material);mesh.receiveShadow=true;if(this.range)mesh.userData.range=this.range;this.parent.add(mesh);
    }
    this.tiles.clear();
  }
}

// Two-triangle scenery such as trees is cheaper to submit in a few large tiles than to cull finely.
export function instanceTiles(parent,geometry,material,matrices,tints,casts=false,size=150){
  const tiles=new Map();
  matrices.forEach((matrix,i)=>{
    const e=matrix.elements,key=cell(e[12],e[14],size);
    if(!tiles.has(key))tiles.set(key,[]);
    tiles.get(key).push(i);
  });
  for(const indices of tiles.values()){
    const mesh=new T.InstancedMesh(geometry,material,indices.length);
    indices.forEach((i,j)=>{mesh.setMatrixAt(j,matrices[i]);if(tints)mesh.setColorAt(j,tints[i]);});
    mesh.computeBoundingSphere();mesh.castShadow=casts;mesh.receiveShadow=casts;parent.add(mesh);
  }
}
