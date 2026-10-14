// Small deterministic 2D/3D collision kernel. No rendering dependency.
// Rectangles are axis aligned in world X/Z coordinates, dimensions full width/depth.
export function circleRectOverlap(x, z, radius, b) {
  const dx = Math.max(Math.abs(x-b.x)-b.w*.5,0);
  const dz = Math.max(Math.abs(z-b.z)-b.d*.5,0);
  return dx*dx+dz*dz < radius*radius;
}

// Segment versus rectangle expanded by radius. Returns first contact in [0,1].
export function segmentAABB2D(x0,z0,x1,z1,b,radius=0) {
  const left=b.x-b.w*.5-radius, right=b.x+b.w*.5+radius;
  const near=b.z-b.d*.5-radius, far=b.z+b.d*.5+radius;
  const dx=x1-x0,dz=z1-z0;
  let enter=0,exit=1,nx=0,nz=0;
  for(const [start,delta,min,max,axis] of [[x0,dx,left,right,0],[z0,dz,near,far,1]]) {
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return null;continue;}
    let t0=(min-start)/delta,t1=(max-start)/delta,normal=-1;
    if(t0>t1){const v=t0;t0=t1;t1=v;normal=1;}
    if(t0>enter){enter=t0;nx=axis===0?normal:0;nz=axis===1?normal:0;}
    exit=Math.min(exit,t1);
    if(enter>exit)return null;
  }
  if(exit<0||enter>1)return null;
  // A body born inside geometry needs a valid outward normal to escape it.
  if(nx===0&&nz===0&&x0>=left&&x0<=right&&z0>=near&&z0<=far){
    const sides=[{v:x0-left,nx:-1,nz:0},{v:right-x0,nx:1,nz:0},
      {v:z0-near,nx:0,nz:-1},{v:far-z0,nx:0,nz:1}];
    sides.sort((a,b)=>a.v-b.v);
    return {t:0,nx:sides[0].nx,nz:sides[0].nz,inside:true};
  }
  return {t:Math.max(0,enter),nx,nz,inside:false};
}

// Iterative swept slide; never advances beyond the first solid surface on a segment.
export function moveCircleSlide(x,z,dx,dz,radius,rects,bound=159) {
  let px=x,pz=z,rx=dx,rz=dz,collisions=0;
  for(let iteration=0;iteration<3;iteration++){
    if(rx*rx+rz*rz<1e-12)break;
    let hit=null,object=null;
    for(const b of rects){
      if(b.alive===false)continue;
      const minX=Math.min(px,px+rx)-radius,maxX=Math.max(px,px+rx)+radius;
      const minZ=Math.min(pz,pz+rz)-radius,maxZ=Math.max(pz,pz+rz)+radius;
      if(maxX<b.x-b.w*.5||minX>b.x+b.w*.5||maxZ<b.z-b.d*.5||minZ>b.z+b.d*.5)continue;
      const test=segmentAABB2D(px,pz,px+rx,pz+rz,b,radius);
      if(test && !test.inside && (!hit||test.t<hit.t)){hit=test;object=b;}
    }
    if(!hit){px+=rx;pz+=rz;break;}
    collisions++;
    const len=Math.hypot(rx,rz);
    const safeT=Math.max(0,hit.t-(.015/Math.max(.015,len)));
    px+=rx*safeT;pz+=rz*safeT;
    const factor=1-safeT;
    rx*=factor;rz*=factor;
    const dot=rx*hit.nx+rz*hit.nz;
    if(dot<0){rx-=dot*hit.nx;rz-=dot*hit.nz;}
    // Tiny separation avoids numerical jitter on repeated contacts.
    px+=hit.nx*.003;pz+=hit.nz*.003;
    void object;
  }
  return {x:Math.max(-bound+radius,Math.min(bound-radius,px)),
          z:Math.max(-bound+radius,Math.min(bound-radius,pz)),collisions};
}

export function segmentSphere3D(ax,ay,az,bx,by,bz,cx,cy,cz,radius) {
  const dx=bx-ax,dy=by-ay,dz=bz-az;
  const fx=ax-cx,fy=ay-cy,fz=az-cz;
  const a=dx*dx+dy*dy+dz*dz;
  const c=fx*fx+fy*fy+fz*fz-radius*radius;
  if(c<=0)return 0;
  if(a<1e-12)return null;
  const b=2*(fx*dx+fy*dy+fz*dz);
  const disc=b*b-4*a*c;
  if(disc<0)return null;
  const t=(-b-Math.sqrt(disc))/(2*a);
  return t>=0&&t<=1?t:null;
}

export function sweptBuildingHit(from,to,buildings,radius=.3) {
  let best=null;
  for(const b of buildings){
    if(!b.alive)continue;
    const h=segmentAABB2D(from.x,from.z,to.x,to.z,b,radius);
    if(!h)continue;
    const y=from.y+(to.y-from.y)*h.t;
    if(y < -radius || y > b.h+radius)continue;
    if(!best||h.t<best.t)best={...h,building:b};
  }
  return best;
}
