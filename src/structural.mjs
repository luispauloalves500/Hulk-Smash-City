// Lightweight deterministic rigid-body approximation for collapsing building sections.
// Pure physics kernel: no renderer or WebGL dependency; coordinates use world X/Y/Z.
import { segmentAABB2D } from './physics.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Every storey band is split into two halves. Together the pieces preserve the
// volume of the tower (with small nonstructural visual seams).
export function towerSections(width, depth, height) {
  const count=clamp(Math.ceil(height/11.5),3,7);
  const floorHeight=height/count;
  const sections=[];
  for(let tier=0;tier<count;tier++){
    const splitX=tier%2===0;
    for(const side of [-1,1]){
      sections.push({tier,localX:splitX?side*width*.25:0,
        localZ:splitX?0:side*depth*.25,
        localY:(tier+.5)*floorHeight,
        w:splitX?width*.5:width,d:splitX?depth:depth*.5,
        h:floorHeight});
    }
  }
  return sections;
}

// Structural fragments collide with the ground and intact rectangular buildings.
// No expensive universal rigid-body solver; conservative 2D sweep + vertical range.
export function advanceStructuralBody(body,dt,obstacles=[],world=159,gravity=37) {
  if(!Number.isFinite(dt)||dt<=0)return {landed:false,wall:false};
  dt=Math.min(dt,.05);
  const oldY=body.y;
  body.vy-=gravity*dt;
  const ny=body.y+body.vy*dt;
  let nx=body.x+body.vx*dt,nz=body.z+body.vz*dt;
  let wall=false;
  // Do not sweep against buildings above or below this section's vertical interval.
  if(Math.max(oldY,ny)+body.h*.5>=0 && Math.min(oldY,ny)-body.h*.5<=1000){
    let nearest=null;
    for(const obstacle of obstacles){
      if(obstacle.alive===false)continue;
      if(Math.min(oldY,ny)-body.h*.5>obstacle.h||Math.max(oldY,ny)+body.h*.5<0)continue;
      if(Math.max(body.x,nx)+body.radius<obstacle.x-obstacle.w*.5 ||
         Math.min(body.x,nx)-body.radius>obstacle.x+obstacle.w*.5 ||
         Math.max(body.z,nz)+body.radius<obstacle.z-obstacle.d*.5 ||
         Math.min(body.z,nz)-body.radius>obstacle.z+obstacle.d*.5)continue;
      const hit=segmentAABB2D(body.x,body.z,nx,nz,obstacle,body.radius);
      if(hit&&!hit.inside&&(!nearest||hit.t<nearest.t))nearest=hit;
    }
    if(nearest){
      wall=true;
      const safe=Math.max(0,nearest.t-.015);
      nx=body.x+body.vx*dt*safe+nearest.nx*.025;
      nz=body.z+body.vz*dt*safe+nearest.nz*.025;
      const dot=body.vx*nearest.nx+body.vz*nearest.nz;
      if(dot<0){body.vx-=1.23*dot*nearest.nx;body.vz-=1.23*dot*nearest.nz;}
      body.vx*=.66;body.vz*=.66;
    }
  }
  body.x=clamp(nx,-world+body.radius,world-body.radius);
  body.z=clamp(nz,-world+body.radius,world-body.radius);
  const floor=body.h*.5;
  const landed=ny<=floor && oldY>floor+.01;
  if(ny<=floor){
    body.y=floor;
    if(body.vy< -2.5)body.vy*=-.17;
    else body.vy=0;
    const drag=Math.exp(-dt*5.5);
    body.vx*=drag;body.vz*=drag;
    if(Math.abs(body.vx)<.08)body.vx=0;
    if(Math.abs(body.vz)<.08)body.vz=0;
  }else{body.y=ny;body.vx*=Math.exp(-dt*.11);body.vz*=Math.exp(-dt*.11);}
  body.settled=body.y<=floor+.01&&Math.abs(body.vy)<.7&&Math.hypot(body.vx,body.vz)<1.2;
  return {landed,wall};
}

// Exact vertical-span plus 2D radius test; avoids damage from debris flying far overhead.
export function bodyTouchesActor(body,actorX,actorY,actorZ,actorRadius,actorHeight){
  if(body.y+body.h*.5<actorY||body.y-body.h*.5>actorY+actorHeight)return false;
  const r=body.radius+actorRadius;
  return (body.x-actorX)**2+(body.z-actorZ)**2<r*r;
}

export function shouldPlayPunchImpact(previousRemaining,newRemaining,hitMoment=.22){
  return previousRemaining>hitMoment && newRemaining<=hitMoment;
}

// Swept point against a large box expanded by projectile radius. Handles debris
// collisions at any speed without checking only the final position.
export function sweptSectionHit(from,to,body,padding=0){
  const slabs=[
    [from.x,to.x-from.x,body.x-body.w*.5-padding,body.x+body.w*.5+padding],
    [from.y,to.y-from.y,body.y-body.h*.5-padding,body.y+body.h*.5+padding],
    [from.z,to.z-from.z,body.z-body.d*.5-padding,body.z+body.d*.5+padding]
  ];
  let start=0,end=1;
  for(const [origin,delta,min,max] of slabs){
    if(Math.abs(delta)<1e-9){if(origin<min||origin>max)return null;continue;}
    let near=(min-origin)/delta,far=(max-origin)/delta;
    if(near>far)[near,far]=[far,near];
    start=Math.max(start,near);end=Math.min(end,far);
    if(start>end)return null;
  }
  return end>=0 && start<=1 ? clamp(start,0,1) : null;
}
