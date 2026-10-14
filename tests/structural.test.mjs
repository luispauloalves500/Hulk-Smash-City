import assert from 'node:assert/strict';
import {towerSections,advanceStructuralBody,bodyTouchesActor,shouldPlayPunchImpact,sweptSectionHit} from '../src/structural.mjs';
const sections=towerSections(16,20,55);
assert.equal(sections.length,10,'5 tiers, 2 structural halves each');
assert(Math.abs(sections.reduce((sum,s)=>sum+s.w*s.d*s.h,0)-16*20*55)<.001,'total building volume conserved');
for(const s of sections){
 assert(s.localY>=s.h/2 && s.localY+s.h/2<=55+.001,'section within tower');
 assert(s.w>0 && s.d>0 && s.h>0,'dimensions positive');
}
assert.equal(towerSections(12,12,20).length,6,'short building 3 tiers');
assert.equal(towerSections(12,12,120).length,14,'large building capped to 7 tiers');
const body=()=>({x:0,y:10,z:0,vx:0,vy:0,vz:0,w:2,d:2,h:2,radius:1.2,settled:false});
let b=body();for(let i=0;i<300;i++)advanceStructuralBody(b,1/60);
assert(Math.abs(b.y-1)<.0001,'falls onto ground, never tunnels below');
assert(b.settled,'settles after damping');
b=body();b.vx=65;const obstacle={x:5,z:0,w:2,d:8,h:20,alive:true};
const impact=advanceStructuralBody(b,.1,[obstacle]);
assert(impact.wall,'swept section collides with building at high velocity');
assert(b.x<3,'stops in front of neighboring building');
b=body();b.y=45;b.vx=20;
assert.equal(advanceStructuralBody(b,.05,[obstacle]).wall,false,'passes well above a roof');
b=body();b.x=2;b.y=6;
assert(bodyTouchesActor(b,1,0,0,1.5,6),'falling section touches player');
assert(!bodyTouchesActor(b,1,0,0,1.5,3),'low actor not hit by airborne section');
assert(!bodyTouchesActor(b,40,0,0,1.5,6),'distant actor not hit');
assert(shouldPlayPunchImpact(.3,.19),'hit fires upon passing attack keyframe');
assert(!shouldPlayPunchImpact(.18,.12),'hit fires only once');
const section=body(); section.y=4; section.w=3;section.d=5;section.h=8;
assert(Math.abs(sweptSectionHit({x:-10,y:3,z:0},{x:10,y:3,z:0},section)-.425)<1e-8,'projectile swept through falling box');
assert.equal(sweptSectionHit({x:-10,y:20,z:0},{x:10,y:20,z:0},section),null,'projectile safely above rubble');
assert.equal(sweptSectionHit({x:10,y:0,z:0},{x:20,y:0,z:0},section),null,'projectile travelling away');
// Reproducible 104-body stress run: physics should remain finite and bounded.
let stressSeed=17;
const random=()=>((stressSeed=(1664525*stressSeed+1013904223)>>>0)/4294967296);
const stressBodies=Array.from({length:104},()=>({x:(random()-.5)*120,y:5+random()*70,z:(random()-.5)*120,
  vx:(random()-.5)*30,vy:(random()-.5)*15,vz:(random()-.5)*30,
  w:3+random()*7,d:3+random()*7,h:3+random()*9,radius:1.5+random()*2.0}));
const obstacles=[{x:0,z:0,w:14,d:20,h:48,alive:true},{x:38,z:34,w:18,d:13,h:64,alive:true}];
for(let t=0;t<600;t++)for(const item of stressBodies){
  advanceStructuralBody(item,1/60,obstacles);
  assert([item.x,item.y,item.z,item.vx,item.vy,item.vz].every(Number.isFinite),'no NaNs in long session');
  assert(item.y>=item.h/2-.0001,'body cannot tunnel through floor');
  assert(Math.abs(item.x)<=159&&Math.abs(item.z)<=159,'stays within playable world');
}
console.log('structural physics / animation keyframe / 104-body stress tests: OK');
