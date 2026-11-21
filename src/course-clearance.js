// Keep reconstructed buildings and grandstands outside the available road and
// runoff. Each indexed rectangle spans one interval of the circuit.
export class CourseClearance{
  constructor(track){
    this.cells=new Map();
    for(let i=0;i<track.points.length;i++){
      // A rail runs straight between two stations, so the wider end bounds the interval.
      const f=track.at((i+.5)*track.step),a=track.frames[i],b=track.frames[(i+1)%track.frames.length];
      const left=Math.max(a.leftWall,b.leftWall),right=Math.max(a.rightWall,b.rightWall),shift=(right-left)/2;
      const tile={x:f.x+shift*f.nx,z:f.z+shift*f.nz,c:f.nx,s:f.nz,
        w:(right+left)/2+.35,l:track.step*.65,y:f.y,station:(i+.5)*track.step};
      for(const key of this.keys(tile.x,tile.z,tile.w+tile.l)){
        if(!this.cells.has(key))this.cells.set(key,[]);
        this.cells.get(key).push(tile);
      }
    }
  }
  *keys(x,z,r){
    for(let i=Math.floor((x-r)/48);i<=Math.floor((x+r)/48);i++)
      for(let j=Math.floor((z-r)/48);j<=Math.floor((z+r)/48);j++)yield i*65536+j;
  }
  intersects(x,z,yaw,width,length,bottom,top){
    const c=Math.cos(yaw),s=Math.sin(yaw),w=width/2,l=length/2;
    for(const key of this.keys(x,z,w+l))for(const road of this.cells.get(key)||[]){
      if(bottom>road.y+2||top<road.y-1)continue;
      const dx=x-road.x,dz=z-road.z;
      const sep=(a,b)=>Math.abs(dx*a+dz*b)>w*Math.abs(a*c+b*s)+l*Math.abs(a*s-b*c)+
        road.w*Math.abs(a*road.c+b*road.s)+road.l*Math.abs(a*road.s-b*road.c);
      if(!sep(c,s)&&!sep(s,-c)&&!sep(road.c,road.s)&&!sep(road.s,-road.c))return true;
    }
    return false;
  }
  // True where a point belonging to one part of the lap lies inside the rails of another part.
  crosses(track,station,x,y,z){
    for(const key of this.keys(x,z,0))for(const road of this.cells.get(key)||[]){
      const gap=Math.abs(station-road.station);
      if(Math.min(gap,track.length-gap)<45||Math.abs(road.y-y)>2.5)continue;
      const dx=x-road.x,dz=z-road.z;
      if(Math.abs(dx*road.c+dz*road.s)<road.w-.2&&Math.abs(dx*road.s-dz*road.c)<=road.l)return true;
    }
    return false;
  }
  fenceHeight(track,station,point){
    let height=3.08;
    const [x,y,z]=point;
    for(const key of this.keys(x,z,0))for(const road of this.cells.get(key)||[]){
      const gap=Math.abs(station-road.station);
      if(Math.min(gap,track.length-gap)<45||road.y<=y+.8)continue;
      const dx=x-road.x,dz=z-road.z;
      if(Math.abs(dx*road.c+dz*road.s)<=road.w+2&&Math.abs(dx*road.s-dz*road.c)<=road.l+2)
        height=Math.min(height,Math.max(.75,road.y-y-.85));
    }
    return height;
  }
}
