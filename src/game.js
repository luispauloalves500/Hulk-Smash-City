import * as THREE from 'three';
import { AudioEngine } from './audio.js';

// HULK: SMASH CITY — playable fan-made Three.js prototype.
// 3D models and textures are procedural; music, ambience and SFX are bundled OGG files.
const $ = (id) => document.getElementById(id);
const SETTINGS = { world: 159, spacing: 34, blocks: 4, gravity: 37, maxDebris: 220, maxEffects: 120 };
const rand = (min,max) => min + Math.random() * (max-min);
const clamp = (v,min,max) => Math.max(min, Math.min(max,v));
const smooth = (current,target,dt,speed=7) => THREE.MathUtils.damp(current,target,speed,dt);
const temp = new THREE.Vector3();
const vec = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const state = { mode:'menu', time:0, score:0, destroyed:0, kills:0, combo:0, comboTimer:0, rage:0, rageTime:0, health:100, stage:0, hurtCooldown:0, shotCooldown:0, slamCooldown:0, pickCooldown:0, roarCooldown:0, camYaw:Math.PI/4, camPitch:0.50, camDist:26, shake:0, hintTime:0, enemyWaveTime:0, hudTime:0, soundOn:true };
const stages = [
 {title:'CAOS URBANO',buildings:8,kills:6},
 {title:'CIDADE EM PÂNICO',buildings:17,kills:18},
 {title:'FÚRIA IMPARÁVEL',buildings:28,kills:32}
];
let renderer, scene, camera, player, playerRig, animation;
const audio=new AudioEngine();
let footsteps=0, qualityClock=0, fpsClock=0, frameAccumulator=0, frameSamples=0;
let particles=[], debris=[], effects=[], buildings=[], enemies=[], cars=[], projectiles=[], decorations=[];
let holdingCar=null, windClock=0, toastTimer=0, lastT=0, damageFlashTimer=0;
const keys = new Set();
const input={rightDown:false,mouseX:0,mouseY:0,pointerInside:false};
const mats = {};
const geometry = {};
const rubbleColors=['#626e6c','#82908c','#4a5a5f','#a6aaa1','#d1bda3'];
let rubbleMaterials=[], crackMaterial;
const playerForward = vec(0,0,-1);
let minimapCtx = null;

function material(color,roughness=.75,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function initMats(){
  Object.assign(mats, {
    asphalt: material('#30383d'), sidewalk:material('#818e88'), curb:material('#c2c8b9'), grass:material('#56705a'),
    green:material('#61b52a'), greenLight:material('#8bdf48'), greenDark:material('#397b22'),
    shorts:material('#653189'), shortsLight:material('#8650b0'), hair:material('#17211a'),
    eye:material('#e8f4dc'), pupil:material('#252f25'), teeth:material('#e2dcc2'),
    glass:material('#5d96a6',.18,.42), dark:material('#202d32',.64,.18),
    gold:material('#ffc75d',.5,.2), red:material('#de4e37',.5,.1), smoke:material('#737c77'),
    wheel:material('#161d20'), fire: new THREE.MeshBasicMaterial({color:'#ffb05f'}),
    windowGlow:new THREE.MeshBasicMaterial({color:'#d5e69a'}),
    white:new THREE.MeshBasicMaterial({color:'#e6e6d0'})
  });
  geometry.box = new THREE.BoxGeometry(1,1,1);
  geometry.sphere = new THREE.SphereGeometry(1,12,9);
  geometry.lowSphere = new THREE.IcosahedronGeometry(1,1);
  geometry.cylinder = new THREE.CylinderGeometry(1,1,1,9);
  rubbleMaterials=rubbleColors.map(c=>material(c));
  crackMaterial=new THREE.LineBasicMaterial({color:'#202b2b',transparent:true,opacity:.83,depthTest:true});
}
function mesh(parent, geo, mat, x=0,y=0,z=0, sx=1,sy=1,sz=1, cast=false){
 const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m;
}
function box(parent, mat, x,y,z,w,h,d,cast=false){return mesh(parent,geometry.box,mat,x,y,z,w,h,d,cast);}
function sphere(parent, mat,x,y,z,sx=1,sy=sx,sz=sx,cast=false){return mesh(parent,geometry.sphere,mat,x,y,z,sx,sy,sz,cast);}
function dropShadow(parent,radius=2,opacity=.25){
  const mat=new THREE.MeshBasicMaterial({color:0x04140b,transparent:true,opacity,depthWrite:false});
  const s=mesh(parent,new THREE.CircleGeometry(1,20),mat,0,.04,0,radius,radius,radius);
  s.rotation.x=-Math.PI/2;return s;
}
function makeWindowTexture(base,highlight,seed){
 const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d');
 ctx.fillStyle=base;ctx.fillRect(0,0,256,512);
 // Procedural highrise façade. Always render lit and dark windows, even without image assets.
 for(let y=10;y<512;y+=31){
   ctx.fillStyle='rgba(0,0,0,.30)';ctx.fillRect(0,y+22,256,4);
   for(let x=12;x<256;x+=34){
     const lit=(Math.sin((x*97+y*19+seed*100)*1.57)>-.36);
     ctx.fillStyle=lit?highlight:'#223840';ctx.fillRect(x,y,20,19);
     ctx.fillStyle=lit?'rgba(252,246,211,.15)':'rgba(58,126,138,.11)';ctx.fillRect(x+2,y+2,8,12);
     ctx.fillStyle='rgba(3,20,24,.35)';ctx.fillRect(x+10,y,2,19);
   }
 }
 for(let x=0;x<256;x+=34){ctx.fillStyle='rgba(255,255,255,.07)';ctx.fillRect(x,0,3,512);}
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;return tex;
}
function buildScene(){
 scene=new THREE.Scene();scene.background=new THREE.Color('#9fbcc2');scene.fog=new THREE.FogExp2('#9fbcc2',.0041);
 camera=new THREE.PerspectiveCamera(66,window.innerWidth/window.innerHeight,.15,490);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.setSize(window.innerWidth,window.innerHeight);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
 $('game').appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xdcefff,0x43523b,2.2));
 const sun=new THREE.DirectionalLight(0xffecd1,2.7);sun.position.set(-55,95,32);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-100;sun.shadow.camera.right=100;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;
 sun.shadow.camera.near=1;sun.shadow.camera.far=250;sun.shadow.bias=-.0002;scene.add(sun);scene.userData.sun=sun;
 const ground=box(scene,mats.grass,0,-.45,0,360,.9,360);ground.receiveShadow=true;
 const sidewalkMat=material('#949e93');
 const buildingPalettes=[
  makeWindowTexture('#455c67','#f5dba3',2),makeWindowTexture('#677d83','#c5d6c1',8),
  makeWindowTexture('#526474','#a7d6ed',4),makeWindowTexture('#727c75','#ead2a4',5),
  makeWindowTexture('#415660','#ffd9a0',11),makeWindowTexture('#525756','#adcac4',13)
 ];
 const wallMats=buildingPalettes.map(t=>new THREE.MeshStandardMaterial({map:t,roughness:.79,metalness:.07}));
 const roadLineMat=new THREE.MeshBasicMaterial({color:'#d8d2af'});
 for(let k=-4;k<=4;k++){
  const p=k*SETTINGS.spacing;
  box(scene,mats.asphalt,p,.018,0,11,.045,336);
  box(scene,mats.asphalt,0,.023,p,336,.05,11);
  for(let s=-157;s<158;s+=13){
   box(scene,roadLineMat,p,.058,s,0.21,.025,5.1);
   box(scene,roadLineMat,s,.06,p,5.1,.025,.21);
  }
 }
 for(let i=-4;i<4;i++) for(let j=-4;j<4;j++){
  const cx=(i+.5)*SETTINGS.spacing,cz=(j+.5)*SETTINGS.spacing;
  box(scene,sidewalkMat,cx,-.001,cz,SETTINGS.spacing-11,.25,SETTINGS.spacing-11);
  // The center park and a handful of vacant lots make streets more readable.
  if((i===0&&j===0)||(i===-1&&j===-1)||(Math.abs(i*7+j*3)%21===12)){
   box(scene,mats.grass,cx,.14,cz,21,.08,21);
   for(let n=0;n<4;n++) makeTree(cx+rand(-8,8),cz+rand(-8,8),rand(3,6));
   continue;
  }
  const count=Math.random()<.53?1:2;
  if(count===1){
    addBuilding(cx+rand(-1.2,1.2),cz+rand(-1.2,1.2),rand(14,19),rand(17,20),rand(24,74),wallMats);
  }else{
    const alongX=Math.random()<.5;
    for(let n=0;n<2;n++){
      const bx=cx+(alongX?(n===0?-5.8:5.8):0);
      const bz=cz+(!alongX?(n===0?-5.8:5.8):0);
      addBuilding(bx,bz,alongX?9:rand(14,19),alongX?rand(14,19):9,rand(16,56),wallMats);
    }
  }
 }
 for(let i=0;i<38;i++){
  const k=Math.floor(rand(-4,5))*SETTINGS.spacing;
  const axis=Math.random()<.5;
  makeStreetLight(axis?k+5.5:rand(-146,146),axis?rand(-146,146):k+5.5);
 }
 makeCarFleet();
 // Hazy skyline outside the gameplay region.
 const skylineMats=['#748e91','#71817f','#8a9392'].map(c=>material(c));
 for(let i=0;i<130;i++){
  const x=rand(-280,280),z=rand(-280,280);
  if(Math.abs(x)<171&&Math.abs(z)<171)continue;
  const height=rand(20,90);
  box(scene,skylineMats[i%3],x,height/2-1,z,rand(12,22),height,rand(11,25));
 }
}
function makeTree(x,z,size){
 const g=new THREE.Group();g.position.set(x,.18,z);
 mesh(g,geometry.cylinder,material('#554736'),0,size*.3,0,.30,size*.65,.30);
 mesh(g,geometry.lowSphere,material(['#4b8958','#76a45b','#659b63'][Math.floor(rand(0,3))]),0,size*.78,0,size*.43,size*.50,size*.43);
 scene.add(g);
}
function makeStreetLight(x,z){
 const g=new THREE.Group();g.position.set(x,0,z);
 mesh(g,geometry.cylinder,mats.dark,0,3.6,0,.14,7.2,.14);
 box(g,mats.dark,.6,7.1,0,1.2,.12,.13);
 const lamp=box(g,mats.gold,1.15,6.96,0,.45,.08,.34);
 g.add(lamp);scene.add(g);
}
function addBuilding(x,z,w,d,h,palette){
 const group=new THREE.Group();group.position.set(x,0,z);
 const col=palette[Math.floor(rand(0,palette.length))];
 const wall=box(group,col,0,h/2,0,w,h,d);
 wall.castShadow=false;
 const cap=box(group,material('#7f8a87'),0,h+.35,0,w+.5,.7,d+.5);
 box(group,mats.dark,0,h+.75,0,w*.35,.6,d*.22);
 if(h>37&&Math.random()<.7)box(group,mats.dark,rand(-2,2),h+2,rand(-2,2),1.1,3.8,1.1);
 // Dirt / environmental decals for ground-level detail.
 box(group,mats.glass,0,1,d/2+.04,w*.25,2,.08);
 scene.add(group);
 buildings.push({group,x,z,w,d,h,health:Math.max(90,h*2.35),maxHealth:Math.max(90,h*2.35),alive:true,fall:0,fallFX:0,damageTier:0,cracks:[],fallDirection:1,color:col.color?.clone()||new THREE.Color('#7b8584')});
}
function makeHulk(){
 player=new THREE.Group();scene.add(player);player.position.set(0,0,0);
 playerRig=new THREE.Group();player.add(playerRig);
 const rig=playerRig;
 const torso=sphere(rig,mats.green,0,3.7,0,1.32,1.38,.82,true);
 const chest=sphere(rig,mats.greenLight,0,4.0,.33,1.12,.9,.65,true);
 const abs=box(rig,mats.green,0,2.9,.2,1.8,1.4,1.14,true);
 const shorts=box(rig,mats.shorts,0,2.15,0,2.2,1.05,1.28,true);
 box(rig,mats.shortsLight,0,2.28,.64,1.25,.25,.06);
 const neck=sphere(rig,mats.green,0,4.85,.01,.49,.54,.46,true);
 const head=sphere(rig,mats.green,0,5.35,.12,.75,.8,.68,true);
 sphere(rig,mats.greenDark,0,5.0,.61,.55,.18,.20);
 for(const x of [-.32,.32]){
  sphere(rig,mats.eye,x,5.43,.7,.16,.135,.07);
  sphere(rig,mats.pupil,x,5.43,.764,.052,.063,.025);
  const brow=box(rig,mats.hair,x,5.64,.68,.36,.1,.18);
  brow.rotation.z=x<0?-.28:.28;
 }
 box(rig,mats.hair,0,6.06,.02,1.38,.30,1.28,true);
 for(let i=0;i<7;i++){
  const spike=mesh(rig,new THREE.ConeGeometry(.2,.55,4),mats.hair,rand(-.58,.58),6.27,rand(-.45,.48),1,1,1,true);
  spike.rotation.z=rand(-.45,.45);
 }
 const leftArm=new THREE.Group(),rightArm=new THREE.Group();
 leftArm.position.set(-1.45,4.48,0);rightArm.position.set(1.45,4.48,0);
 rig.add(leftArm,rightArm);
 for(const [arm,side] of [[leftArm,-1],[rightArm,1]]){
  sphere(arm,mats.green,side*.24,-.32,0,.62,.62,.68,true);
  sphere(arm,mats.green,side*.43,-1.1,0,.53,.85,.57,true);
  const fist=sphere(arm,mats.greenLight,side*.45,-1.86,.2,.58,.52,.62,true);
  for(let i=0;i<3;i++)sphere(arm,mats.green,side*.25+(i-1)*.26,-1.99,.54,.18,.20,.18,true);
 }
 const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
 leftLeg.position.set(-.63,1.83,0);rightLeg.position.set(.63,1.83,0);rig.add(leftLeg,rightLeg);
 for(const leg of [leftLeg,rightLeg]){
  sphere(leg,mats.shorts,0,-.18,0,.55,.5,.56,true);
  sphere(leg,mats.green,0,-.75,0,.47,.78,.48,true);
  sphere(leg,mats.greenLight,0,-1.39,.25,.49,.25,.76,true);
 }
 animation={leftArm,rightArm,leftLeg,rightLeg,torso,head,rig,attack:0,walk:0,jumpVelocity:0,onGround:true,airPeak:0,landTime:0,shadow:dropShadow(player,2,.31)};
 animation.shadow.position.y=.04;
 playerRig.rotation.y=Math.PI;
 player.position.set(0,0,0);
}
function makeCar(x,z,axis,velocity,type=0){
 const group=new THREE.Group();group.position.set(x,0,z);
 group.rotation.y=axis?Math.PI/2:0;
 const palettes=['#d34e38','#568ba4','#e5c365','#73897f','#e7e7de','#293f51'];
 const tint=material(palettes[Math.floor(rand(0,palettes.length))],.46,.23);
 box(group,mats.wheel,0,.43,0,3.4,.28,6.0);
 box(group,tint,0,.9,0,3.3,1.02,5.8,true);
 box(group,tint,0,1.62,-.3,2.9,.85,2.8,true);
 box(group,mats.glass,0,1.75,1.15,2.55,.60,.10);
 box(group,mats.glass,0,1.75,-1.75,2.55,.60,.10);
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const wheel=mesh(group,geometry.cylinder,mats.wheel,sx*1.58,.48,sz*1.84,.55,.24,.55);
  wheel.rotation.z=Math.PI/2;
 }
 for(const sx of [-1,1]){
  box(group,mats.gold,sx*1.15,1,2.93,.4,.27,.08);
  box(group,mats.red,sx*1.15,1,-2.93,.4,.20,.08);
 }
 const obj={group,x,z,axis,velocity,health:70,alive:true,held:false,thrown:false,vy:0,life:20,type};
 scene.add(group);cars.push(obj);return obj;
}
function makeCarFleet(){
 for(let i=0;i<25;i++){
  const axis=Math.random()<.5;
  const road=Math.floor(rand(-4,5))*34;
  const lane=(Math.random()<.5?-2.8:2.8);
  const p=rand(-135,135);
  makeCar(axis?p:road+lane,axis?road+lane:p,axis,Math.random()<.5?rand(4,9):-rand(4,9));
 }
}
function spawnEnemy(kind){
 const theta=rand(0,Math.PI*2);const dist=rand(48,82);
 let x=clamp(player.position.x+Math.sin(theta)*dist,-141,141);
 let z=clamp(player.position.z+Math.cos(theta)*dist,-141,141);
 // Spawn units onto the road grid rather than inside a solid building.
 if(Math.random()<.5)x=clamp(Math.round(x/34)*34+rand(-2.8,2.8),-139,139);
 else z=clamp(Math.round(z/34)*34+rand(-2.8,2.8),-139,139);
 if(isBlocked(x,z,3)){x=Math.round(x/34)*34;z=Math.round(z/34)*34;} 
 // Enemy units move freely on the street, their AI does not depend on paths.
 const group=new THREE.Group();group.position.set(x,0,z);scene.add(group);
 if(kind==='tank'){
  box(group,mats.dark,0,.85,0,5.3,1.35,7.0,true);
  box(group,material('#586a4b',.78,.15),0,1.9,-.3,4.6,1.6,5.3,true);
  const turret=new THREE.Group();turret.position.set(0,2.8,-.3);group.add(turret);
  mesh(turret,geometry.cylinder,material('#56684b'),0,.25,0,1.35,.68,1.35,true);
  box(turret,mats.dark,0,.35,2.18,.43,.45,4.45,true);
  for(const side of [-1,1])for(let i=0;i<5;i++){
   const w=mesh(group,geometry.cylinder,mats.wheel,side*2.6,.58,-2.7+i*1.33,.72,.25,.72);
   w.rotation.z=Math.PI/2;
  }
  group.userData.turret=turret;
 }else{
  sphere(group,mats.dark,0,0,0,1.32,.55,1.58,true);
  sphere(group,mats.red,0,.18,1.23,.5,.32,.3);
  for(let i=0;i<4;i++){
   const sx=i%2?-1:1,sz=i<2?-1:1;
   box(group,mats.dark,sx*1.9,.05,sz*1.0,1.7,.15,.22);
   const rotor=mesh(group,geometry.cylinder,mats.wheel,sx*2.5,.15,sz*1,.62,.08,.62);
   rotor.userData.rotor=true;
  }
  group.position.y=rand(12,18);
 }
 const obj={group,x,z,kind,health:kind==='tank'?115:60,speed:kind==='tank'?rand(3.1,4.4):rand(5.2,7.2),cooldown:rand(1,3),blink:0,bob:rand(0,9),alive:true};
 enemies.push(obj);return obj;
}
function explosion(x,y,z,color='#ffaa54',power=1){
 if(effects.length>=SETTINGS.maxEffects) return;
 const count=power>2?15:8;
 for(let i=0;i<count;i++)particle(vec(x,y,z),color,rand(.2,.7)*power,rand(.35,.95),vec(rand(-7,7)*power,rand(2,12)*power,rand(-7,7)*power));
 shockRing(x,z,4*power,color,.52);
 cameraShake(power*.38);playSound('boom',power);
}
function particle(pos,color,size,life,velocity){
 if(particles.length>=170){const old=particles.shift();scene.remove(old.mesh);old.mesh.material.dispose();}
 const p=mesh(scene,geometry.lowSphere,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false}),pos.x,pos.y,pos.z,size,size,size);
 particles.push({mesh:p,pos:p.position,velocity:velocity.clone(),life,total:life});
}
function spawnRubble(building,impact=1){
 const {x,z,w,d,h}=building;
 const count=clamp(Math.round(h*.27),12,25);
 // Shared material cache avoids recreating GPU materials for every falling block.
 for(let i=0;i<count;i++){
  if(debris.length>=SETTINGS.maxDebris){const old=debris.shift();scene.remove(old.mesh);}
  const size=rand(.8,2.8);
  const m=mesh(scene,geometry.box,rubbleMaterials[Math.floor(rand(0,rubbleMaterials.length))],x+rand(-w*.46,w*.46),rand(2,h),z+rand(-d*.46,d*.46),size,size*rand(.5,1.35),size,true);
  debris.push({mesh:m,vel:vec(rand(-17,17)*impact,rand(7,20),rand(-17,17)*impact),spin:vec(rand(-7,7),rand(-7,7),rand(-7,7)),life:rand(3.3,7.0),ground:size*.38});
 }
 for(let j=0;j<12;j++)particle(vec(x+rand(-w*.45,w*.45),rand(2,Math.min(h,30)),z+rand(-d*.4,d*.4)),'#9b9b8b',rand(.8,2.7),rand(1,2.3),vec(rand(-12,12),rand(1,9),rand(-12,12)));
}
function shockRing(x,z,radius,color='#b3ef59',life=.6){
 if(effects.length>=SETTINGS.maxEffects){const old=effects.shift();scene.remove(old.mesh);old.mesh.geometry.dispose();old.mesh.material.dispose();}
 const geo=new THREE.RingGeometry(.92,1.04,48);
 const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide});
 const m=new THREE.Mesh(geo,mat);m.position.set(x,.19,z);m.rotation.x=-Math.PI/2;scene.add(m);
 effects.push({mesh:m,life,total:life,radius});
}
function cameraShake(intensity){state.shake=Math.min(1.5,state.shake+intensity);}
function notify(message,duration=1.8){$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=duration;}
function score(points){
 state.combo=state.comboTimer>0?Math.min(12,state.combo+1):1;state.comboTimer=4;
 state.score+=Math.round(points*(1+Math.floor(state.combo/3)*.2));
 state.rage=clamp(state.rage+rand(2,5),0,100);
 if(state.combo>=3){$('combo').textContent=`${state.combo}× COMBO!`;$('combo').style.opacity='1';}
}
function putCracksOnFacade(b,tier){
 // Damage visual persists and grows over three distinct health thresholds.
 const count=3+tier*2;
 const facing=Math.random()<.5;
 const front=(Math.random()<.5?-1:1);
 const centerX=facing?(b.w*.5+.10)*front:rand(-b.w*.32,b.w*.32);
 const centerZ=facing?rand(-b.d*.32,b.d*.32):(b.d*.5+.10)*front;
 const startY=rand(Math.min(b.h*.15,3),Math.max(5,b.h*.75));
 const pts=[];
 let dx=rand(-.6,.6),dy=0;
 const extent=rand(2,Math.min(9,b.h*.25));
 for(let k=0;k<count;k++){
  const ex=dx+rand(-1.1,1.1),ey=dy+extent/count;
  const x1=facing?centerX:centerX+dx, z1=facing?centerZ+dx:centerZ;
  const x2=facing?centerX:centerX+ex, z2=facing?centerZ+ex:centerZ;
  pts.push(x1,startY+dy,z1,x2,startY+ey,z2);
  dx=ex;dy=ey;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
 const crack=new THREE.LineSegments(g,crackMaterial);b.group.add(crack);b.cracks.push(crack);
}
function clearCracks(b){for(const o of b.cracks){o.removeFromParent();o.geometry.dispose();}b.cracks=[];b.damageTier=0;}
function hurtBuilding(b,damage,sourceX,sourceZ){
 if(!b.alive)return;
 b.health-=damage;
 const remaining=clamp(b.health/b.maxHealth,0,1);
 const tier=remaining<=.25?3:remaining<=.5?2:remaining<=.75?1:0;
 while(b.damageTier<tier){b.damageTier++;putCracksOnFacade(b,b.damageTier);}
 const hitX=clamp(sourceX,b.x-b.w*.5,b.x+b.w*.5),hitZ=clamp(sourceZ,b.z-b.d*.5,b.z+b.d*.5);
 for(let i=0;i<5;i++)particle(vec(hitX,rand(3,Math.min(b.h,12)),hitZ),'#d2c6a7',rand(.2,.7),rand(.3,.8),vec(rand(-6,6),rand(2,8),rand(-6,6)));
 if(b.health<=0){
  b.alive=false;b.fall=.67;b.fallFX=.01;b.fallDirection=Math.random()<.5?-1:1;state.destroyed++;score(Math.round(b.h*13));state.rage=clamp(state.rage+11,0,100);
  explosion(b.x,2,b.z,'#ffbd65',1.35);spawnRubble(b);playSound('collapse',.95);
  if(state.destroyed%3===0)notify('PRÉDIO DEMOLIDO! + BÔNUS');
 }else{
  b.group.rotation.z+=rand(-.015,.015);
  playSound('hit');
 }
}
function destroyCar(car){
 if(!car.alive)return;
 car.alive=false;scene.remove(car.group);if(holdingCar===car)holdingCar=null;
 explosion(car.group.position.x,1,car.group.position.z,'#ff9f43',1.35);playSound('crash',.7);score(150);
}
function damageEnemy(enemy,amount){
 if(!enemy.alive)return;
 enemy.health-=amount;enemy.blink=.15;
 for(let i=0;i<3;i++)particle(enemy.group.position.clone().add(vec(0,enemy.kind==='tank'?2:0,0)),'#ffc266',rand(.2,.4),.36,vec(rand(-8,8),rand(2,11),rand(-8,8)));
 if(enemy.health<=0){
  enemy.alive=false;state.kills++;score(enemy.kind==='tank'?850:420);state.rage=clamp(state.rage+8,0,100);
  explosion(enemy.group.position.x,enemy.group.position.y+1,enemy.group.position.z,'#ff9344',enemy.kind==='tank'?1.7:1.05);
  scene.remove(enemy.group);state.health=clamp(state.health+(enemy.kind==='tank'?6:3),0,100);
 }
}
function damagePlayer(dmg){
 if(state.mode!=='playing'||state.rageTime>0||state.hurtCooldown>0)return;
 state.hurtCooldown=.48;
 state.health=Math.max(0,state.health-dmg);
 $('damageFlash').style.opacity='1';damageFlashTimer=.16;
 cameraShake(.32);playSound('hurt');
 if(state.health<=0)finishGame(false);
}
function directionVector(){return playerForward.clone().normalize();}
function pointAABBDistance(x,z,b){
 const dx=Math.max(Math.abs(x-b.x)-b.w/2,0),dz=Math.max(Math.abs(z-b.z)-b.d/2,0);
 return Math.hypot(dx,dz);
}
function applyAreaDamage(origin,radius,power,dir=null){
 const cone=dir!==null;
 for(const b of buildings){
  if(!b.alive)continue;
  if(pointAABBDistance(origin.x,origin.z,b)>radius)continue;
  const delta=vec(b.x-origin.x,0,b.z-origin.z);
  if(cone&&delta.length()>1&&delta.normalize().dot(dir)<-.32)continue;
  hurtBuilding(b,power,origin.x,origin.z);
 }
 for(const e of enemies){
  if(!e.alive)continue;
  const delta=e.group.position.clone().sub(origin);delta.y=0;
  if(delta.length()>radius+1.7)continue;
  if(cone&&delta.length()>2&&delta.clone().normalize().dot(dir)<-.15)continue;
  damageEnemy(e,power*1.3);
 }
 for(const car of cars){
  if(!car.alive||car.held)continue;
  const delta=car.group.position.clone().sub(origin);delta.y=0;
  if(delta.length()<=radius+2)destroyCar(car);
 }
}
function punch(){
 if(state.mode!=='playing'||state.shotCooldown>0)return;
 const rage=state.rageTime>0;
 state.shotCooldown=rage?.20:.42;animation.attack=.28;
 const dir=directionVector(),point=player.position.clone().addScaledVector(dir,5.0);
 applyAreaDamage(point,rage?8.4:6.3,rage?96:58,dir);
 for(let i=0;i<5;i++)particle(point.clone().add(vec(rand(-1,1),rand(1,4),rand(-1,1))),'#b8f05c',rand(.14,.35),rand(.2,.4),vec(rand(-4,4),rand(-2,5),rand(-4,4)));
 shockRing(point.x,point.z,rage?4.2:2.5,'#cbf779',.25);
 cameraShake(.12);playSound('punch');
}
function slam(power=1){
 if(state.mode!=='playing'||state.slamCooldown>0||!animation.onGround)return;
 state.slamCooldown=state.rageTime>0?3.5:5.2;
 const origin=player.position.clone();const radius=power===1?15.5:power;
 applyAreaDamage(origin,radius,state.rageTime>0?150:110);
 shockRing(origin.x,origin.z,radius,'#d9ff85',.72);
 shockRing(origin.x,origin.z,radius*.7,'#fdd875',.55);
 for(let i=0;i<30;i++){
  const a=rand(0,Math.PI*2),r=rand(2,radius);
  particle(vec(origin.x+Math.cos(a)*r,.5,origin.z+Math.sin(a)*r),'#9c9580',rand(.3,.85),rand(.3,.95),vec(Math.cos(a)*rand(2,8),rand(2,11),Math.sin(a)*rand(2,8)));
 }
 cameraShake(.9);playSound('slam');notify('ESMAGAMENTO SÍSMICO!');
}
function handleCarAction(){
 if(state.mode!=='playing'||state.pickCooldown>0)return;
 state.pickCooldown=.52;
 if(holdingCar){
  const c=holdingCar;holdingCar=null;c.held=false;c.thrown=true;c.life=3.5;
  scene.attach(c.group);c.group.position.copy(player.position).add(vec(0,5,0)).addScaledVector(playerForward,4);
  c.vy=12;c.fly=playerForward.clone().multiplyScalar(43);
  playSound('throw');notify('CARRO ARREMESSADO!');return;
 }
 let candidate=null,dist=6.8;
 for(const car of cars){
  if(!car.alive||car.thrown||car.held)continue;
  const d=car.group.position.distanceTo(player.position);
  if(d<dist){candidate=car;dist=d;}
 }
 if(!candidate){notify('APROXIME-SE DE UM CARRO');return;}
 candidate.held=true;candidate.velocity=0;holdingCar=candidate;
 player.attach(candidate.group);candidate.group.position.set(0,7,0);candidate.group.rotation.set(0,0,Math.PI/10);
 playSound('grab');notify('CARRO LEVANTADO — E PARA LANÇAR');
}
function roar(){
 if(state.mode!=='playing'||state.rageTime>0)return;
 if(state.rage<85){notify(`FÚRIA INSUFICIENTE (${Math.floor(state.rage)}%)`);return;}
 state.rage=0;state.rageTime=12;state.roarCooldown=12;
 notify('FÚRIA MÁXIMA! 12 SEGUNDOS',2.2);cameraShake(.7);playSound('roar');
 for(let i=0;i<25;i++)particle(player.position.clone().add(vec(rand(-2,2),rand(0,6),rand(-2,2))),'#bbff50',rand(.2,.6),rand(.3,1.2),vec(rand(-7,7),rand(2,11),rand(-7,7)));
}
function isBlocked(x,z,radius=1.45){
 if(Math.abs(x)>SETTINGS.world-radius||Math.abs(z)>SETTINGS.world-radius)return true;
 for(const b of buildings){
  if(!b.alive)continue;
  if(Math.abs(x-b.x)<b.w/2+radius&&Math.abs(z-b.z)<b.d/2+radius)return true;
 }
 return false;
}
function updatePlayer(dt){
 const yaw=state.camYaw;
 const forward=vec(-Math.sin(yaw),0,-Math.cos(yaw));
 const right=vec(Math.cos(yaw),0,-Math.sin(yaw));
 const move=vec(0,0,0);
 const w=keys.has('KeyW')||keys.has('ArrowUp'),s=keys.has('KeyS')||keys.has('ArrowDown');
 const a=keys.has('KeyA')||keys.has('ArrowLeft'),d=keys.has('KeyD')||keys.has('ArrowRight');
 if(w)move.add(forward);if(s)move.sub(forward);if(d)move.add(right);if(a)move.sub(right);
 const moving=move.lengthSq()>0.001;
 if(moving){
  move.normalize();const sprint=keys.has('ShiftLeft')||keys.has('ShiftRight');
  const speed=(sprint?19:11.5)*(state.rageTime>0?1.23:1);
  const nx=player.position.x+move.x*speed*dt,nz=player.position.z+move.z*speed*dt;
  if(!isBlocked(nx,player.position.z))player.position.x=nx;
  if(!isBlocked(player.position.x,nz))player.position.z=nz;
  const targetYaw=Math.atan2(move.x,move.z);
  playerRig.rotation.y+=Math.atan2(Math.sin(targetYaw-playerRig.rotation.y),Math.cos(targetYaw-playerRig.rotation.y))*Math.min(1,dt*13);
  playerForward.set(Math.sin(playerRig.rotation.y),0,Math.cos(playerRig.rotation.y));
 }
 animation.walk+=dt*(moving?((keys.has('ShiftLeft')||keys.has('ShiftRight'))?13:9):3);
 const amount=moving?1:0;
 if(moving&&animation.onGround){footsteps-=dt;if(footsteps<=0){playSound('step',.18);footsteps=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?.23:.38;}}else footsteps=0;
 animation.leftLeg.rotation.x=smooth(animation.leftLeg.rotation.x,Math.sin(animation.walk)*.49*amount,dt,12);
 animation.rightLeg.rotation.x=smooth(animation.rightLeg.rotation.x,-Math.sin(animation.walk)*.49*amount,dt,12);
 animation.leftArm.rotation.x=smooth(animation.leftArm.rotation.x,-Math.sin(animation.walk)*.26*amount,dt,10);
 animation.rightArm.rotation.x=smooth(animation.rightArm.rotation.x,Math.sin(animation.walk)*.26*amount,dt,10);
 animation.rig.position.y=Math.sin(animation.walk*2)*.07*amount;
 if(animation.attack>0){animation.attack-=dt;animation.rightArm.rotation.x=-1.85*Math.sin(Math.PI*clamp(animation.attack/.28,0,1));}
 if(!animation.onGround){
  animation.jumpVelocity-=SETTINGS.gravity*dt;
  player.position.y=Math.max(0,player.position.y+animation.jumpVelocity*dt);
  if(player.position.y<=0){
   player.position.y=0;animation.onGround=true;animation.jumpVelocity=0;
   if(animation.airPeak>5.5){state.slamCooldown=0;slam(12+Math.min(animation.airPeak*.2,5));}
   animation.airPeak=0;
  }else animation.airPeak=Math.max(animation.airPeak,player.position.y);
 }
 animation.rig.rotation.z=smooth(animation.rig.rotation.z,moving?Math.sin(animation.walk)*.03:0,dt,5);
 animation.shadow.position.y=.04-player.position.y;
 animation.shadow.scale.setScalar(1+player.position.y*.07);
 animation.shadow.material.opacity=clamp(.32-player.position.y*.015,.04,.32);
 if(state.rageTime>0&&Math.random()<dt*30){
  particle(player.position.clone().add(vec(rand(-1.4,1.4),rand(.5,5.7),rand(-1.4,1.4))),'#9cff55',rand(.10,.25),.4,vec(rand(-1,1),rand(1,5),rand(-1,1)));
 }
}
function jump(){
 if(state.mode!=='playing'||!animation.onGround)return;
 animation.jumpVelocity=23;animation.onGround=false;animation.airPeak=0;playSound('jump');
}
function updateBuildings(dt){
 for(const b of buildings){
  if(b.fall>0){
   b.fall-=dt;b.fallFX-=dt;
   b.group.position.y-=dt*(b.h*1.7);
   b.group.rotation.z+=b.fallDirection*dt*.35;
   if(b.fallFX<=0&&b.fall>.06){
    b.fallFX=.11;
    const y=clamp(-b.group.position.y+rand(1,8),2,b.h);
    for(let i=0;i<4;i++)particle(vec(b.x+rand(-b.w/2,b.w/2),y,b.z+rand(-b.d/2,b.d/2)), '#a69d88',rand(.7,1.6),.8,vec(rand(-8,8),rand(2,8),rand(-8,8)));
   }
   if(b.fall<=0){scene.remove(b.group);b.group.visible=false;}
  }else if(b.alive){b.group.rotation.z=smooth(b.group.rotation.z,0,dt,10);}
 }
}
function updateCars(dt){
 for(const c of cars){
  if(!c.alive||c.held)continue;
  if(c.thrown){
   c.vy-=SETTINGS.gravity*dt;
   c.group.position.addScaledVector(c.fly,dt);c.group.position.y+=c.vy*dt;c.group.rotation.x+=dt*6;
   c.life-=dt;
   let impact=c.group.position.y<1||c.life<=0;
   for(const b of buildings){
    if(b.alive&&pointAABBDistance(c.group.position.x,c.group.position.z,b)<2.4&&c.group.position.y<b.h+2){
     hurtBuilding(b,180,c.group.position.x,c.group.position.z);impact=true;break;
    }
   }
   for(const e of enemies){if(e.alive&&e.group.position.distanceTo(c.group.position)<5){damageEnemy(e,210);impact=true;}}
   // High-energy collisions with other cars also trigger a chain reaction.
   if(!impact)for(const other of cars){if(other===c||!other.alive||other.held)continue;if(other.group.position.distanceTo(c.group.position)<3.1){destroyCar(other);impact=true;break;}}
   if(impact)destroyCar(c);
   continue;
  }
  if(Math.abs(c.velocity)>.01){
   if(c.axis)c.group.position.x+=c.velocity*dt;
   else c.group.position.z+=c.velocity*dt;
   const travel=c.axis?c.group.position.x:c.group.position.z;
   if(Math.abs(travel)>145){c.velocity*=-1;c.group.rotation.y+=Math.PI;}
  }
  const dist=c.group.position.distanceTo(player.position);
  if(dist<2.5&&state.rageTime>0){destroyCar(c);continue;}
 }
}
function moveEnemySafely(e,to,dt,radius){
 const p=e.group.position;
 const amount=e.speed*dt;
 const tryMove=(dx,dz)=>{
  const nx=p.x+dx,nz=p.z+dz;
  if(!isBlocked(nx,nz,radius)){p.x=nx;p.z=nz;return true;}
  return false;
 };
 if(tryMove(to.x*amount,to.z*amount))return;
 // Street-avoiding obstacle steering: slide around corners instead of walking through walls.
 const side=e.bob%2>1?1:-1;
 const lx=-to.z*amount*side,lz=to.x*amount*side;
 if(!tryMove(lx,lz))tryMove(-lx,-lz);
}
function updateEnemies(dt){
 const countActive=enemies.filter(e=>e.alive).length;
 state.enemyWaveTime-=dt;
 if(state.enemyWaveTime<=0&&countActive<(7+state.stage*3)){
  spawnEnemy(Math.random()<(.55+state.stage*.12)?'tank':'drone');
  state.enemyWaveTime=clamp(3.9-state.stage*.85,1.9,4);
 }
 for(const e of enemies){
  if(!e.alive)continue;
  e.cooldown-=dt;e.blink-=dt;
  const to=player.position.clone().sub(e.group.position);to.y=0;
  const dist=to.length();to.normalize();
  const targetYaw=Math.atan2(to.x,to.z);
  e.group.rotation.y+=Math.atan2(Math.sin(targetYaw-e.group.rotation.y),Math.cos(targetYaw-e.group.rotation.y))*Math.min(1,dt*2.5);
  if(e.kind==='tank'){
   if(dist>17)moveEnemySafely(e,to,dt,3.1);
   if(e.cooldown<=0&&dist<75){fireProjectile(e,3.6);e.cooldown=rand(2.7,4.2);}
  }else{
   e.bob+=dt*2;
   e.group.position.y=smooth(e.group.position.y,14+Math.sin(e.bob)*3,dt,2);
   if(dist>13)moveEnemySafely(e,to,dt,2.0);
   if(e.cooldown<=0&&dist<75){fireProjectile(e,1.4);e.cooldown=rand(1.9,3.5);}
   for(const part of e.group.children){if(part.userData.rotor)part.rotation.y+=dt*35;}
  }
  // Do not mutate shared enemy materials when one enemy takes damage.
  e.group.scale.setScalar(e.blink>0?1.08:1);
  if(dist<5&&e.kind==='tank'&&e.cooldown<1)damagePlayer(2.5);
 }
}
function fireProjectile(enemy,height){
 if(projectiles.length>38)return;
 const start=enemy.group.position.clone().add(vec(0,height,0));
 const direction=player.position.clone().add(vec(0,2,0)).sub(start).normalize();
 const ball=mesh(scene,geometry.sphere,mats.fire,start.x,start.y,start.z,.41,.41,.41);
 projectiles.push({mesh:ball,velocity:direction.multiplyScalar(enemy.kind==='tank'?28:35),life:4,damage:enemy.kind==='tank'?9:6});
 playSound('laser');
}
function updateProjectiles(dt){
 for(let i=projectiles.length-1;i>=0;i--){
  const p=projectiles[i];p.life-=dt;p.mesh.position.addScaledVector(p.velocity,dt);
  const d=p.mesh.position.distanceTo(player.position.clone().add(vec(0,2,0)));
  let wall=null;
  if(d>=2.5)for(const b of buildings){if(b.alive&&p.mesh.position.y<b.h&&pointAABBDistance(p.mesh.position.x,p.mesh.position.z,b)<.6){wall=b;break;}}
  if(d<2.5||wall||p.life<=0||p.mesh.position.y<0){
   if(d<2.5){damagePlayer(p.damage);explosion(p.mesh.position.x,p.mesh.position.y,p.mesh.position.z,'#ff8d46',.44);}
   else if(wall){hurtBuilding(wall,p.damage*.8,p.mesh.position.x,p.mesh.position.z);playSound('hit',.35);}
   scene.remove(p.mesh);projectiles.splice(i,1);
  }
 }
}
function updateEffects(dt){
 for(let i=particles.length-1;i>=0;i--){
  const p=particles[i];p.life-=dt;p.pos.addScaledVector(p.velocity,dt);
  p.velocity.y-=SETTINGS.gravity*.4*dt;p.mesh.material.opacity=Math.max(0,p.life/p.total)*.88;
  p.mesh.scale.multiplyScalar(1+dt*.22);
  if(p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();particles.splice(i,1);}
 }
 for(let i=debris.length-1;i>=0;i--){
  const d=debris[i];d.life-=dt;d.vel.y-=SETTINGS.gravity*dt;
  d.mesh.position.addScaledVector(d.vel,dt);
  d.mesh.rotation.x+=d.spin.x*dt;d.mesh.rotation.y+=d.spin.y*dt;d.mesh.rotation.z+=d.spin.z*dt;
  if(d.mesh.position.y<d.ground){d.mesh.position.y=d.ground;d.vel.x*=.65;d.vel.z*=.65;d.vel.y*=-.20;d.spin.multiplyScalar(.9);}
  if(d.life<=0){scene.remove(d.mesh);debris.splice(i,1);}
 }
 for(let i=effects.length-1;i>=0;i--){
  const e=effects[i];e.life-=dt;const t=1-clamp(e.life/e.total,0,1);
  e.mesh.scale.setScalar(.25+e.radius*t);e.mesh.material.opacity=(1-t)*.78;
  if(e.life<=0){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1);}
 }
}
function updateCamera(dt){
 const distance=state.camDist;
 const horizontal=Math.cos(state.camPitch)*distance;
 const target=player.position.clone().add(vec(0,3.2,0));
 const desired=vec(target.x+Math.sin(state.camYaw)*horizontal,target.y+Math.sin(state.camPitch)*distance,target.z+Math.cos(state.camYaw)*horizontal);
 // Camera collision with buildings (simple ray-wall clipping).
 const from=target.clone();const toward=desired.clone().sub(from);let fraction=1;
 for(const b of buildings){
  if(!b.alive)continue;
  for(let s=.17;s<.98;s+=.12){
   const p=from.clone().addScaledVector(toward,s);
   if(p.y<b.h+1&&Math.abs(p.x-b.x)<b.w*.5+.55&&Math.abs(p.z-b.z)<b.d*.5+.55){fraction=Math.min(fraction,Math.max(.12,s-.10));break;}
  }
 }
 if(fraction<1)desired.copy(from.addScaledVector(toward,fraction));
 camera.position.lerp(desired,1-Math.exp(-dt*5.5));
 if(state.shake>.001){camera.position.add(vec(rand(-1,1),rand(-1,1),rand(-1,1)).multiplyScalar(state.shake));state.shake=Math.max(0,state.shake-dt*2.6);}
 camera.lookAt(target);
 const sun=scene.userData.sun;sun.position.set(player.position.x-55,95,player.position.z+32);sun.target.position.copy(player.position);sun.target.updateMatrixWorld();
}
function updateMission(){
 if(state.mode!=='playing')return;
 const stage=stages[state.stage];
 if(state.destroyed>=stage.buildings&&state.kills>=stage.kills){
  if(state.stage===stages.length-1){finishGame(true);return;}
  state.stage++;state.health=clamp(state.health+28,0,100);
  notify(`MISSÃO ${String(state.stage+1).padStart(2,'0')} DESBLOQUEADA!`,2.7);
  playSound('success');
 }
}
function updateHUD(){
 $('healthLabel').textContent=`${Math.ceil(state.health)}%`;$('healthFill').style.width=`${state.health}%`;
 $('rageLabel').textContent=state.rageTime>0?`${Math.ceil(state.rageTime)}s`:`${Math.floor(state.rage)}%`;
 $('rageFill').style.width=`${state.rageTime>0?100:state.rage}%`;
 $('score').textContent=String(state.score).padStart(6,'0');
 $('destroyCount').textContent=state.destroyed;$('enemyCount').textContent=state.kills;
 const stage=stages[state.stage];
 $('missionTag').textContent=`MISSÃO ${String(state.stage+1).padStart(2,'0')} • ${stage.title}`;
 $('missionTitle').textContent=state.rageTime>0?'HULK ESMAGA!':'DESTRUA A CIDADE';
 $('missionProgress').textContent=`Prédios ${Math.min(state.destroyed,stage.buildings)}/${stage.buildings}   ·   Inimigos ${Math.min(state.kills,stage.kills)}/${stage.kills}`;
 $('objectiveFill').style.width=`${Math.min(100,((Math.min(1,state.destroyed/stage.buildings)+Math.min(1,state.kills/stage.kills))*.5)*100)}%`;
 drawMinimap();
}
function drawMinimap(){
 if(!minimapCtx)return;
 const ctx=minimapCtx,w=176,h=176,range=94,scale=w/(2*range);
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#0a2227';ctx.fillRect(0,0,w,h);
 const center=player.position;
 const sx=(x)=>w/2+(x-center.x)*scale,sy=(z)=>h/2+(z-center.z)*scale;
 ctx.strokeStyle='#435354';ctx.lineWidth=11*scale;
 for(let k=-4;k<=4;k++){
  const p=k*34;ctx.beginPath();ctx.moveTo(sx(p),0);ctx.lineTo(sx(p),h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,sy(p));ctx.lineTo(w,sy(p));ctx.stroke();
 }
 for(const b of buildings){if(!b.alive)continue;ctx.fillStyle='#78908a';ctx.fillRect(sx(b.x-b.w/2),sy(b.z-b.d/2),b.w*scale,b.d*scale);}
 for(const e of enemies){if(!e.alive)continue;ctx.fillStyle=e.kind==='tank'?'#f96c48':'#eaaa5c';ctx.beginPath();ctx.arc(sx(e.group.position.x),sy(e.group.position.z),e.kind==='tank'?3:2,0,Math.PI*2);ctx.fill();}
 ctx.save();ctx.translate(w/2,h/2);ctx.rotate(-playerRig.rotation.y);ctx.fillStyle='#b9fe58';ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(-5,-6);ctx.lineTo(5,-6);ctx.closePath();ctx.fill();ctx.restore();
 ctx.strokeStyle='#b8e36c';ctx.lineWidth=1;ctx.strokeRect(.5,.5,w-1,h-1);
}
function finishGame(win){
 state.mode=win?'won':'dead';if(win){audio.setPaused(false);playSound('success');}else audio.setPaused(true);
 $('modal').classList.remove('hidden');$('modalKicker').textContent=win?'CAMPANHA CONCLUÍDA':'FIM DE JOGO';
 $('modalTitle').textContent=win?'A CIDADE SE RENDEU':'HULK FOI DERROTADO';
 $('modalBody').innerHTML=`<p>${win?'Você completou as três missões e tomou conta da cidade!':'Sua força não foi suficiente. Tente de novo e espalhe ainda mais destruição.'}</p><p><b>${state.destroyed}</b> prédios demolidos &nbsp;·&nbsp; <b>${state.kills}</b> inimigos derrotados &nbsp;·&nbsp; <b>${state.score.toLocaleString('pt-BR')}</b> pontos</p>`;
 $('resumeButton').classList.add('hidden');$('restartButton').classList.remove('hidden');$('controlsHint').hidden=true;
}
function setModalHow(){
 $('modal').classList.remove('hidden');$('modalKicker').textContent='CONTROLES';$('modalTitle').textContent='COMO JOGAR';
 $('modalBody').innerHTML=`<div class="how-grid"><div><kbd>W A S D</kbd><span>Mover</span></div><div><kbd>SHIFT</kbd><span>Correr</span></div><div><kbd>ESPAÇO</kbd><span>Super salto</span></div><div><kbd>F / CLIQUE</kbd><span>Socar / atacar</span></div><div><kbd>Q</kbd><span>Onda de choque</span></div><div><kbd>E</kbd><span>Pegar / lançar carro</span></div><div><kbd>R</kbd><span>Ativar fúria (85%)</span></div><div><kbd>MOUSE DIREITO</kbd><span>Girar câmera</span></div><div><kbd>RODA MOUSE</kbd><span>Zoom</span></div><div><kbd>ESC / P</kbd><span>Pausar</span></div></div>`;
 $('resumeButton').classList.remove('hidden');$('restartButton').classList.add('hidden');
 $('resumeButton').textContent=state.mode==='menu'?'VOLTAR':'CONTINUAR';
}
function startGame(){
 resetGame();state.mode='playing';$('menu').classList.add('hidden');$('modal').classList.add('hidden');$('hud').hidden=false;$('controlsHint').hidden=false;
 notify('HULK ESMAGA!',2.0);initAudio();audio.setPaused(false);audio.loading?.then(()=>{if(state.mode==='playing')playSound('roar');});
}
function resetGame(){
 for(const o of particles){scene.remove(o.mesh);o.mesh.material.dispose();}
 for(const o of debris)scene.remove(o.mesh);
 for(const o of effects){scene.remove(o.mesh);o.mesh.material.dispose();o.mesh.geometry.dispose();}
 for(const o of [...enemies,...cars,...projectiles]){(o.group||o.mesh).removeFromParent();}
 for(const b of buildings){if(!b.alive){b.group.position.y=0;b.group.rotation.set(0,0,0);scene.add(b.group);b.group.visible=true;}}
 particles=[];debris=[];effects=[];enemies=[];cars=[];projectiles=[];holdingCar=null;
 for(const b of buildings){b.alive=true;b.fall=0;b.fallFX=0;b.health=b.maxHealth;clearCracks(b);b.group.rotation.set(0,0,0);b.group.position.set(b.x,0,b.z);}
 Object.assign(state,{score:0,destroyed:0,kills:0,combo:0,comboTimer:0,rage:0,rageTime:0,health:100,stage:0,hurtCooldown:0,shotCooldown:0,slamCooldown:0,pickCooldown:0,enemyWaveTime:1,hudTime:0,shake:0});
 player.position.set(0,0,0);playerRig.rotation.set(0,Math.PI,0);playerForward.set(0,0,-1);animation.onGround=true;animation.jumpVelocity=0;animation.airPeak=0;footsteps=0;keys.clear();$('damageFlash').style.opacity='0';damageFlashTimer=0;
 makeCarFleet();updateHUD();
}
function togglePause(){
 if(state.mode==='playing'){state.mode='paused';audio.setPaused(true);$('modal').classList.remove('hidden');$('modalKicker').textContent='JOGO PAUSADO';$('modalTitle').textContent='PAUSA';$('modalBody').innerHTML='<p>A cidade ainda está de pé. Continue a destruição!</p><p>Pressione <b>ESC</b> para continuar.</p>';$('resumeButton').textContent='CONTINUAR';$('resumeButton').classList.remove('hidden');$('restartButton').classList.add('hidden');}
 else if(state.mode==='paused')resumeGame();
}
function resumeGame(){
 $('modal').classList.add('hidden');if(state.mode==='paused'){state.mode='playing';audio.setPaused(false);}
}
function wireInput(){
 window.addEventListener('resize',()=>{
  camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);
 });
 window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);
  if(e.repeat)return;
  if(e.code==='Escape'||e.code==='KeyP'){if(state.mode==='playing'||state.mode==='paused')togglePause();else if(state.mode==='menu')$('modal').classList.add('hidden');return;}
  if(state.mode!=='playing')return;
  if(e.code==='Space')jump();if(e.code==='KeyQ')slam();if(e.code==='KeyF')punch();if(e.code==='KeyE')handleCarAction();if(e.code==='KeyR')roar();
  if(e.code==='KeyM'){state.soundOn=!state.soundOn;audio.setMuted(!state.soundOn);updateAudioButtons();notify(state.soundOn?'SOM ATIVADO':'SOM DESATIVADO');}
 });
 window.addEventListener('keyup',e=>keys.delete(e.code));
 window.addEventListener('blur',()=>{keys.clear();input.rightDown=false;if(state.mode==='playing')togglePause();});
 renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
 renderer.domElement.addEventListener('mousedown',e=>{
  if(e.button===2){input.rightDown=true;input.mouseX=e.clientX;input.mouseY=e.clientY;}
  if(e.button===0)punch();
 });
 window.addEventListener('mouseup',e=>{if(e.button===2)input.rightDown=false;});
 window.addEventListener('mousemove',e=>{
  if(!input.rightDown)return;
  state.camYaw-=((e.clientX-input.mouseX)*.006);
  state.camPitch=clamp(state.camPitch+(input.mouseY-e.clientY)*.004,.18,1.12);
  input.mouseX=e.clientX;input.mouseY=e.clientY;
 });
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();state.camDist=clamp(state.camDist+e.deltaY*.024,14,42);},{passive:false});
 $('startButton').addEventListener('click',startGame);
 $('howButton').addEventListener('click',setModalHow);
 $('resumeButton').addEventListener('click',resumeGame);
 $('restartButton').addEventListener('click',()=>{startGame();});
 $('soundToggle').addEventListener('click',()=>{state.soundOn=!state.soundOn;audio.setMuted(!state.soundOn);updateAudioButtons();});
 $('musicToggle').addEventListener('click',()=>{audio.setMusic(!audio.musicEnabled);updateAudioButtons();});
 $('volumeSlider').addEventListener('input',e=>audio.setVolume(e.target.value/100));
 updateAudioButtons();
}
function updateAudioButtons(){
 $('soundToggle').textContent=state.soundOn?'🔊 SOM: LIGADO':'🔇 SOM: DESLIGADO';
 $('soundToggle').setAttribute('aria-pressed',String(state.soundOn));
 $('musicToggle').textContent=audio.musicEnabled?'♫ MÚSICA: LIGADA':'♫ MÚSICA: DESLIGADA';
 $('musicToggle').setAttribute('aria-pressed',String(audio.musicEnabled));
}
function initAudio(){audio.start().catch(err=>console.warn('Falha inicializando áudio:',err));}
function playSound(kind,amount=1,pan=0){if(!state.soundOn)return;audio.play(kind,amount,pan);}
function frame(t){
 requestAnimationFrame(frame);
 const dt=Math.min(.033,(t-lastT)/1000||.016);lastT=t;
 if(state.mode==='playing'){
  state.time+=dt;state.hurtCooldown=Math.max(0,state.hurtCooldown-dt);state.shotCooldown=Math.max(0,state.shotCooldown-dt);state.slamCooldown=Math.max(0,state.slamCooldown-dt);
  state.pickCooldown=Math.max(0,state.pickCooldown-dt);state.rageTime=Math.max(0,state.rageTime-dt);
  if(state.comboTimer>0){state.comboTimer-=dt;if(state.comboTimer<=0){state.combo=0;$('combo').style.opacity='0';}}
  updatePlayer(dt);updateBuildings(dt);updateCars(dt);updateEnemies(dt);updateProjectiles(dt);updateEffects(dt);updateMission();
  if(damageFlashTimer>0){damageFlashTimer-=dt;if(damageFlashTimer<=0)$('damageFlash').style.opacity='0';}
  if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('visible');}
  state.hudTime-=dt;if(state.hudTime<=0){updateHUD();state.hudTime=.13;}
 }
 updateCamera(dt);
 renderer.render(scene,camera);
 fpsClock+=dt;frameAccumulator+=dt;frameSamples++;
 if(fpsClock>2.4){
  const fps=frameSamples/frameAccumulator;window.__HULK_FPS=Math.round(fps);
  // Adaptive resolution only when performance drops markedly; restores quality when stable.
  const current=renderer.getPixelRatio(),max=Math.min(window.devicePixelRatio||1,1.5);
  let next=current;if(fps<33)next=Math.max(.9,current-.12);else if(fps>54)next=Math.min(max,current+.09);
  if(Math.abs(next-current)>.06){renderer.setPixelRatio(next);renderer.setSize(window.innerWidth,window.innerHeight);}
  fpsClock=0;frameAccumulator=0;frameSamples=0;
 }
}
function fatal(error){
 console.error('Falha ao iniciar o jogo:',error);
 $('fatal').classList.remove('hidden');$('fatalText').textContent=`Não foi possível iniciar o 3D. Verifique WebGL e a internet. Detalhe: ${error.message||error}`;
}
try{
 initMats();buildScene();makeHulk();wireInput();minimapCtx=$('minimap').getContext('2d');
 updateHUD();camera.position.set(20,17,27);camera.lookAt(vec(0,3,0));window.__HULK_READY=true;window.__HULK_AUDIO=audio;requestAnimationFrame(frame);
}catch(error){fatal(error);}
