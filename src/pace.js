const G=9.80665;
// Share of the car's downforce that the front axle can turn into cornering force. It sets the grip limit at speed.
const AERO_USE=.95;
// Curvature of the racing line, measured over a short span so GPS noise does not read as a corner.
// Same sign as a frame's curvature.
export function lineCurvature(track,span=5){
  const n=track.frames.length,points=track.frames.map((f,i)=>track.position(i*track.step,f.line||0));
  const yaw=i=>{const a=points[(i-span+n)%n],b=points[(i+span)%n];return Math.atan2(b[0]-a[0],b[2]-a[2]);};
  return track.frames.map((f,i)=>{
    const a=points[(i-span+n)%n],b=points[(i+span)%n],turn=yaw((i+span)%n)-yaw((i-span+n)%n);
    return -Math.atan2(Math.sin(turn),Math.cos(turn))/Math.max(1,Math.hypot(b[0]-a[0],b[2]-a[2]));
  });
}
// A speed envelope from the racing line's curvature, road grade and tyre grip.
// It is a driving aid calculated for this model, independent of the real lap time.
export function paceProfile(track,car,margin=.88){
  const lateral=v=>G*(car.grip+AERO_USE*car.aero*v*v)*margin;
  const longBend=lineCurvature(track),shortBend=lineCurvature(track,2);
  // The long baseline filters GPS jitter but cuts across the two apexes of a tight chicane.
  const bend=longBend.map((k,i)=>{
    const n=shortBend.length,reach=Math.round(34/track.step);
    const before=shortBend[(i+n-reach)%n],after=shortBend[(i+reach)%n];
    const chicane=Math.min(before*shortBend[i],after*shortBend[i])<-.00010;
    return Math.max(Math.abs(k),(chicane?.92:.72)*Math.abs(shortBend[i]));
  });
  const speeds=track.frames.map((f,i,frames)=>{
    const next=frames[(i+1)%frames.length],prev=frames[(i+frames.length-1)%frames.length];
    const crest=Math.min(0,(next.grade-prev.grade)/(2*track.step));
    // Corner speed where the tyres and downforce just hold the curve. A crest unloads the tyres.
    const curvature=Math.max(.00001,Math.abs(bend[i])-G*AERO_USE*car.aero*margin-car.grip*margin*crest);
    const physical=Math.sqrt(G*car.grip*margin/curvature);
    const reference=track.telemetrySpeed?.[i]/3.6;
    return Math.min(Number.isFinite(reference)?reference:car.vmax/3.6,physical);
  });
  for(let pass=0;pass<2;pass++)for(let i=speeds.length-1;i>=0;i--){
    const next=speeds[(i+1)%speeds.length],f=track.frames[i];
    // Grip already spent on cornering is not available for braking.
    const cornering=Math.min(.97,next*next*Math.abs(bend[i])/lateral(next));
    const decel=Math.max(3,(car.brake+.0040*next*next)*.92*Math.sqrt(1-cornering*cornering)+f.grade*G);
    speeds[i]=Math.min(speeds[i],Math.sqrt(next*next+2*decel*track.step));
  }
  return distance=>{
    const pos=((distance%track.length)+track.length)%track.length/track.step,i=Math.floor(pos)%speeds.length;
    return speeds[i]+(speeds[(i+1)%speeds.length]-speeds[i])*(pos-Math.floor(pos));
  };
}
