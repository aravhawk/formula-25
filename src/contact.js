// Distances in metres. The cockpit origin sits behind the body's geometric centre.
import {clamp,mod} from './data.js';
const HALF_WIDTH=1,HALF_LENGTH=2.55,FORWARD=.20;
const motion=car=>car.reverse?-1:1;
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
// Where the chassis points. A sliding car's body is turned away from its direction of travel.
const attitude=car=>(car.heading||0)+(car.bodyYaw||0);
// Compare the car polygon and the actual rail segments in the local road plane.
export function wallLimits(track,car){
  const frame=track.at(car.distance),index=Math.floor(mod(car.distance,track.length)/track.step);
  const angle=attitude(car),cs=Math.cos(angle),sn=Math.sin(angle);
  const corners=[];
  for(const [fore,side] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
    const length=FORWARD+fore*HALF_LENGTH,width=side*HALF_WIDTH;
    corners.push({x:length*cs-width*sn,y:length*sn+width*cs});
  }
  const xmin=Math.min(...corners.map(p=>p.x)),xmax=Math.max(...corners.map(p=>p.x));
  const limits={left:-Infinity,right:Infinity,leftAngle:0,rightAngle:0};
  for(const side of [-1,1]){
    const key=side<0?'left':'right',rail=track.rails[key];
    const point=i=>{
      const p=rail[mod(i,rail.length)],dx=p.x-frame.x,dz=p.z-frame.z;
      return {x:dx*frame.nz-dz*frame.nx,y:dx*frame.nx+dz*frame.nz};
    };
    let i=index,a=point(i);
    // Follow the local branch, including the timing seam and the inside of hairpins.
    while(a.x>xmin&&i>index-12)a=point(--i);
    for(;i<=index+12;i++){
      const b=point(i+1),run=b.x-a.x;
      if(run>1e-7){
        const slope=(b.y-a.y)/run;
        for(let j=0;j<4;j++){
          const p=corners[j],q=corners[(j+1)%4];
          const lo=Math.max(a.x,Math.min(p.x,q.x)),hi=Math.min(b.x,Math.max(p.x,q.x));
          if(lo>hi)continue;
          for(const x of [lo,hi]){
            const bodyY=Math.abs(q.x-p.x)<1e-8?side*Math.max(side*p.y,side*q.y):p.y+(q.y-p.y)*(x-p.x)/(q.x-p.x);
            const limit=a.y+(x-a.x)*slope-bodyY-side*.075;
            if(side*(limit-limits[key])<0){
              limits[key]=limit;limits[key+'Angle']=Math.atan(slope);
            }
          }
        }
      }
      if(b.x>=xmax)break;
      a=b;
    }
  }
  return limits;
}

// Keep the chassis attitude when a contact redirects the car, then let it rotate onto the new path.
export function redirect(car,heading){
  if(!car.suspension)return;
  car.bodyYaw=wrap((car.bodyYaw||0)+car.heading-heading);car.heading=heading;
}
export function impact(car,speed,side){
  if(speed<.6)return;
  car.hit=Math.max(car.hit||0,Math.min(1,speed/18));
  car.suspension?.impact(side,speed);
  if(speed>5)car.damage=Math.min(1,(car.damage||0)+(speed-5)*.024);
}

export function contain(track,car,dt=0){
  // Safe broad phase for cars well inside the narrowest nearby rail.
  const i=Math.floor(mod(car.distance,track.length)/track.step)%track.frames.length;
  const frame=track.frames[i];
  if(Math.abs(car.offset)+3.1<frame.clearance){car.wallSide=0;return;}
  const {left,right,leftAngle,rightAngle}=wallLimits(track,car);
  const side=car.offset<left?-1:car.offset>right?1:0;
  if(!side){
    if(car.offset>left+.10&&car.offset<right-.10)car.wallSide=0;
    return;
  }
  const limit=side<0?left:right;
  const angle=side<0?leftAngle:rightAngle,heading=car.heading||0;
  car.railContact=true;
  // Velocity along and into the rail. A spun car can meet it travelling in either direction.
  const travel=heading-angle+(car.reverse?Math.PI:0),along=car.speed*Math.cos(travel);
  const normal=Math.max(0,side*car.speed*Math.sin(travel));
  if(car.wallSide!==side)car.contacts=(car.contacts||0)+1;
  // A car already on the rail takes a fresh hit when it is steered in or the rail turns toward it.
  if(car.wallSide!==side||normal>1.5){
    impact(car,normal,side);
    if(normal>0||!car.suspension)car.speed=Math.max(0,Math.abs(along)-normal*.16);
  }
  car.offset=limit;car.wallSide=side;
  if(normal>0)redirect(car,wrap(angle+(along<0?Math.PI:0)-(car.reverse?Math.PI:0)));
  if(side*car.yawRate>0)car.yawRate=0;
  car.speed=Math.max(0,car.speed-dt*(.4+Math.min(normal,8)*.18));
}

const pairGap=(delta,L)=>delta-Math.round(delta/L)*L;
function body(car){
  const h=attitude(car),c=Math.cos(h),s=Math.sin(h);
  return {c,s,x:car.distance+FORWARD*c,y:car.offset+FORWARD*s};
}
const radius=(pose,nx,ny)=>HALF_LENGTH*Math.abs(pose.c*nx+pose.s*ny)+HALF_WIDTH*Math.abs(pose.c*ny-pose.s*nx);

// Swept separating-axis test. Locate first contact from relative motion along
// each rectangle axis, including cars on opposite sides of the timing line.
function contact(a,b,L){
  const p=body(a),q=body(b),dx=pairGap(q.x-p.x,L),dy=q.y-p.y;
  const vx=(b.distance-b.oldDistance)-(a.distance-a.oldDistance);
  const vy=(b.offset-b.oldOffset)-(a.offset-a.oldOffset);
  const ox=dx-vx,oy=dy-vy;
  let enter=-Infinity,exit=Infinity,depth=Infinity,shallow,first;
  for(const [nx,ny] of [[p.c,p.s],[-p.s,p.c],[q.c,q.s],[-q.s,q.c]]){
    const bound=radius(p,nx,ny)+radius(q,nx,ny)+.012;
    const end=dx*nx+dy*ny,start=ox*nx+oy*ny,v=end-start;
    const overlap=bound-Math.abs(end),sign=Math.sign(end)||1;
    if(overlap<depth){depth=overlap;shallow={nx:nx*sign,ny:ny*sign,depth};}
    if(Math.abs(v)<1e-8){if(Math.abs(start)>=bound)return;continue;}
    const t1=(-bound-start)/v,t2=(bound-start)/v,lo=Math.min(t1,t2);
    if(lo>enter){enter=lo;const sign=-Math.sign(v);
      first={nx:nx*sign,ny:ny*sign,depth:bound-end*sign};}
    exit=Math.min(exit,Math.max(t1,t2));
    if(exit<enter)return;
  }
  if(enter>=0&&enter<=1&&exit>=0&&first?.depth>0)return first;
  if(depth>.0001)return shallow;
}

function applyVelocity(car,x,y){
  const h=car.heading||0;
  const along=car.speed*Math.cos(h)+motion(car)*x,across=car.speed*Math.sin(h)+motion(car)*y;
  if(car.suspension){
    car.speed=Math.hypot(along,across);
    if(car.speed>.3)redirect(car,Math.atan2(across,along));
  }else car.speed=Math.max(0,along);
}

export function resolveField(game,dt){
  const {track,players}=game,L=track.length;
  // The broad phase only visits neighbours within a car length plus this
  // step's travel. All cars, including pit traffic, remain solid.
  for(let pass=0;pass<12;pass++){
    let count=0;
    for(let i=0;i<players.length;i++){
      const a=players[i];
      for(let j=i+1;j<players.length;j++){
        const b=players[j];
        if(Math.abs(pairGap(b.distance-a.distance,L))>6.3+dt*105||Math.abs(a.offset-b.offset)>6.3+dt*100)continue;
        const hit=contact(a,b,L);if(!hit)continue;
        const {nx,ny,depth}=hit;
        const ha=a.heading||0,hb=b.heading||0;
        // Use velocity before projection. Positional corrections from another pair are not momentum.
        const va=a.suspension?motion(a)*a.speed*Math.sin(ha):(a.laneVelocity||0);
        const vb=b.suspension?motion(b)*b.speed*Math.sin(hb):(b.laneVelocity||0);
        const closing=(motion(a)*a.speed*Math.cos(ha)-motion(b)*b.speed*Math.cos(hb))*nx+(va-vb)*ny;
        a.fieldContact=b.fieldContact=true;
        const holdA=a.pit&&!a.pit.serviced&&a.pit.hold>0,holdB=b.pit&&!b.pit.serviced&&b.pit.hold>0;
        const shareA=holdA&&!holdB?0:holdB&&!holdA?1:.5,shareB=1-shareA;
        if(pass===0&&closing>0){
          const impulse=closing*1.035;
          applyVelocity(a,-nx*impulse*shareA,-ny*impulse*shareA);
          applyVelocity(b,nx*impulse*shareB,ny*impulse*shareB);
          impact(a,closing*shareA,Math.sign(ny)||1);impact(b,closing*shareB,-Math.sign(ny)||-1);
          if((a===game.player||b===game.player)&&closing>2)game.say('Contact · '+(a===game.player?b.id:a.id),.9);
        }
        a.distance-=nx*depth*shareA;b.distance+=nx*depth*shareB;
        a.offset-=ny*depth*shareA;b.offset+=ny*depth*shareB;
        game.solids?.resolve(track,a);game.solids?.resolve(track,b);
        contain(track,a);contain(track,b);count++;
      }
    }
    if(count===0)break;
  }
}
