// Deterministic gameplay rules, independent of Three.js / DOM.
export const SUPER_JUMP_CHARGE_SECONDS = 1.65;
export const HULK_RADIUS = 1.26;
export const BASE_JUMP_SPEED = 23;
export const SUPER_JUMP_BONUS = 36;

export function chargeRatio(seconds) {
  return Math.max(0, Math.min(1, seconds / SUPER_JUMP_CHARGE_SECONDS));
}
export function chargedJumpSpeed(seconds, rage = false) {
  const ratio = chargeRatio(seconds);
  return (BASE_JUMP_SPEED + SUPER_JUMP_BONUS * Math.pow(ratio, .86)) * (rage ? 1.12 : 1);
}

// Facades, not the entire footprint, are climbable. Returns the nearest
// outside-facing, snapped contact on a living building.
export function findClimbWall(x, z, y, buildings, radius = HULK_RADIUS, reach = 1.6) {
  let best = null;
  for (const b of buildings) {
    if (!b.alive || y > b.h + .15) continue;
    const hw = b.w * .5, hd = b.d * .5;
    const faces = [
      {nx: -1, nz: 0, wx: b.x - hw - radius - .12, wz: z, eligible: Math.abs(z-b.z) <= hd-.3 && x<=b.x-hw+.05},
      {nx:  1, nz: 0, wx: b.x + hw + radius + .12, wz: z, eligible: Math.abs(z-b.z) <= hd-.3 && x>=b.x+hw-.05},
      {nx: 0, nz:-1, wx:x, wz:b.z-hd-radius-.12, eligible: Math.abs(x-b.x) <= hw-.3 && z<=b.z-hd+.05},
      {nx: 0, nz: 1, wx:x, wz:b.z+hd+radius+.12, eligible: Math.abs(x-b.x) <= hw-.3 && z>=b.z+hd-.05},
    ];
    for (const f of faces) {
      if (!f.eligible) continue;
      const distance = Math.hypot(x-f.wx, z-f.wz);
      if (distance > reach || (best && distance>=best.distance)) continue;
      best = {building:b, normalX:f.nx, normalZ:f.nz, x:f.wx, z:f.wz, distance};
    }
  }
  return best;
}

export function roofAt(x, z, buildings, minHeight=0, margin=.26) {
  let top=0;
  for(const b of buildings){
    if(!b.alive || b.h<minHeight || Math.abs(x-b.x)>b.w*.5-margin || Math.abs(z-b.z)>b.d*.5-margin)continue;
    top=Math.max(top,b.h);
  }
  return top;
}

// Sweep feet down across roof top. Never land on a roof from beneath.
export function landingHeight(x,z,oldY,newY,buildings){
  if(newY>oldY)return null;
  let top=newY<=0 && oldY>=0?0:null;
  for(const b of buildings){
    if(!b.alive || oldY+1e-5<b.h || newY-1e-5>b.h)continue;
    if(Math.abs(x-b.x)<=b.w*.5-.26 && Math.abs(z-b.z)<=b.d*.5-.26)top=top===null?b.h:Math.max(top,b.h);
  }
  return top;
}

// Return true if a target is inside a directional, expanding thunderclap cone.
export function thunderclapContains(dx, dz, forwardX, forwardZ, length, width=0.72, targetRadius=0){
  const along=dx*forwardX+dz*forwardZ;
  const across=Math.abs(dx*forwardZ-dz*forwardX);
  return along>=-targetRadius && along<=length+targetRadius && across<=2 + along*width + targetRadius;
}
