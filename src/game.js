import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { createSurfaceMaterials } from './surfaces.js';
import { circleRectOverlap, segmentAABB2D, segmentSphere3D, sweptBuildingHit, moveCircleSlide } from './physics.mjs';

// HULK: SMASH CITY — playable fan-made Three.js prototype.
// 3D models and textures are procedural; music, ambience and SFX are bundled OGG files.
const $ = (id) => document.getElementById(id);
const SETTINGS = { world: 159, spacing: 34, blocks: 4, gravity: 37, maxDebris: 180, maxEffects: 120, playerRadius:1.26 };
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
let rubbleMaterials=[], crackMaterial, surfaceMaterials;
const playerForward = vec(0,0,-1);
let minimapCtx = null;

function material(color,roughness=.75,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function initMats(){
  surfaceMaterials=createSurfaceMaterials();
  Object.assign(mats, {
    asphalt: material('#30383d'), sidewalk:material('#818e88'), curb:material('#c2c8b9'), grass:material('#56705a'),
    green:surfaceMaterials.skin, greenLight:material('#8bdf48'), greenDark:material('#397b22'),
    shorts:surfaceMaterials.fabric, shortsLight:material('#8650b0'), hair:material('#17211a'),
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
 scene=new THREE.Scene();scene.background=new THREE.Color('#b6d2de');scene.fog=new THREE.FogExp2('#a6bdc4',.0038);
 // Atmospheric color gradient and soft distant haze (static sky sphere).
 const sky=new THREE.Mesh(new THREE.SphereGeometry(420,24,14),new THREE.ShaderMaterial({
   side:THREE.BackSide,depthWrite:false,fog:false,
   vertexShader:'varying vec3 vp; void main(){ vp=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:'varying vec3 vp; void main(){float t=smoothstep(-.32,.95,normalize(vp).y);vec3 horizon=vec3(.64,.75,.79);vec3 zenith=vec3(.29,.55,.78);gl_FragColor=vec4(mix(horizon,zenith,t),1.);}'
 }));scene.add(sky);
 camera=new THREE.PerspectiveCamera(66,window.innerWidth/window.innerHeight,.15,490);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.setSize(window.innerWidth,window.innerHeight);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.16;
 $('game').appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xdcefff,0x43523b,1.55));
 const sun=new THREE.DirectionalLight(0xffecd1,2.35);sun.position.set(-55,95,32);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-100;sun.shadow.camera.right=100;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;
 sun.shadow.camera.near=1;sun.shadow.camera.far=250;sun.shadow.bias=-.0002;scene.add(sun);scene.userData.sun=sun;
 const ground=box(scene,surfaceMaterials.grass,0,-.45,0,360,.9,360);ground.receiveShadow=true;
 const sidewalkMat=surfaceMaterials.concrete;
 const buildingPalettes=[
  makeWindowTexture('#455c67','#f5dba3',2),makeWindowTexture('#677d83','#c5d6c1',8),
  makeWindowTexture('#526474','#a7d6ed',4),makeWindowTexture('#727c75','#ead2a4',5),
  makeWindowTexture('#415660','#ffd9a0',11),makeWindowTexture('#525756','#adcac4',13)
 ];
 const wallMats=buildingPalettes.map(t=>new THREE.MeshStandardMaterial({map:t,roughness:.79,metalness:.07}));
 const roadLineMat=new THREE.MeshBasicMaterial({color:'#dfdbcc'});
 const zebraMat=new THREE.MeshBasicMaterial({color:'#e7e3d3'});
 for(let k=-4;k<=4;k++){
  const p=k*SETTINGS.spacing;
  box(scene,surfaceMaterials.asphalt,p,.018,0,11,.045,336);
  box(scene,surfaceMaterials.asphalt,0,.023,p,336,.05,11);
  for(let s=-157;s<158;s+=13){
   box(scene,roadLineMat,p,.058,s,0.21,.025,5.1);
   box(scene,roadLineMat,s,.06,p,5.1,.025,.21);
  }
 }
 // Pedestrian crossings near the central neighborhoods, visible from above and on foot.
 for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++){
   const x=i*SETTINGS.spacing,z=j*SETTINGS.spacing;
   for(let stripe=-2;stripe<=2;stripe++){
    box(scene,zebraMat,x-8.3,.082,z+stripe*.90,2.6,.015,.48);
    box(scene,zebraMat,x+8.3,.082,z+stripe*.90,2.6,.015,.48);
   }
 }
 for(let i=-4;i<4;i++) for(let j=-4;j<4;j++){
  const cx=(i+.5)*SETTINGS.spacing,cz=(j+.5)*SETTINGS.spacing;
  box(scene,sidewalkMat,cx,-.001,cz,SETTINGS.spacing-11,.25,SETTINGS.spacing-11);
  // The center park and a handful of vacant lots make streets more readable.
  if((i===0&&j===0)||(i===-1&&j===-1)||(Math.abs(i*7+j*3)%21===12)){
   box(scene,surfaceMaterials.grass,cx,.14,cz,21,.08,21);
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
 // Distinct lower floor with door, awning and additional façade relief.
 const trim=material(['#41515a','#857c72','#748f95'][Math.floor(rand(0,3))]);
 box(group,trim,0,3.2,d*.5+.14,w*.84,.24,.24);
 box(group,mats.dark,0,1.5,d*.5+.14,2.0,2.75,.2);
 box(group,mats.glass,0,1.48,d*.5+.26,1.6,2.3,.035);
 if(h>32){
  for(const side of [-1,1])box(group,trim,side*(w*.5-.28),h*.5,d*.5+.09,.3,h,.17);
  box(group,trim,0,h*.42,d*.5+.1,w*.92,.19,.21);
 }
 if(h>45){
  const hvac=box(group,mats.dark,w*.21,h+1,d*.12,2.8,1.3,2.6);
  box(group,trim,hvac.position.x,h+1.8,hvac.position.z,3.0,.23,2.8);
 }
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
 const body=new THREE.Group();rig.add(body);
 const torso=sphere(body,mats.green,0,3.7,0,1.32,1.38,.82,true);
 sphere(body,mats.greenLight,0,4.02,.33,1.11,.88,.66,true);
 box(body,mats.green,0,2.9,.16,1.78,1.43,1.1,true);
 box(rig,mats.shorts,0,2.13,0,2.2,1.07,1.32,true);
 box(rig,mats.shortsLight,0,2.29,.67,1.35,.20,.05);
 sphere(body,mats.green,0,4.85,.01,.49,.54,.46,true);
 const headGroup=new THREE.Group();headGroup.position.set(0,5.35,.12);body.add(headGroup);
 sphere(headGroup,mats.green,0,0,0,.75,.8,.68,true);
 sphere(headGroup,mats.greenDark,0,-.35,.49,.56,.18,.21);
 for(const x of [-.32,.32]){
  sphere(headGroup,mats.eye,x,.08,.58,.16,.13,.067);
  sphere(headGroup,mats.pupil,x,.08,.647,.052,.063,.028);
  const brow=box(headGroup,mats.hair,x,.29,.57,.36,.1,.18);
  brow.rotation.z=x<0?-.28:.28;
 }
 box(headGroup,mats.hair,0,.71,-.1,1.38,.30,1.28,true);
 for(let i=0;i<7;i++){
  const spike=mesh(headGroup,new THREE.ConeGeometry(.20,.55,4),mats.hair,rand(-.58,.58),.92,rand(-.45,.48),1,1,1,true);
  spike.rotation.z=rand(-.45,.45);
 }
 const arms=[],forearms=[];
 for(const side of [-1,1]){
  const arm=new THREE.Group();arm.position.set(side*1.45,4.48,0);body.add(arm);
  sphere(arm,mats.green,side*.22,-.34,0,.64,.65,.66,true);
  sphere(arm,mats.green,side*.42,-.76,0,.49,.62,.52,true);
  const elbow=new THREE.Group();elbow.position.set(side*.42,-1.01,0);arm.add(elbow);
  sphere(elbow,mats.green,0,-.41,0,.52,.65,.54,true);
  sphere(elbow,mats.greenLight,0,-.92,.19,.58,.48,.64,true);
  for(let i=0;i<3;i++)sphere(elbow,mats.green,(i-1)*.26,-1.06,.51,.18,.19,.18,true);
  arms.push(arm);forearms.push(elbow);
 }
 const legs=[],shins=[],feet=[];
 for(const side of [-1,1]){
  const leg=new THREE.Group();leg.position.set(side*.63,1.83,0);rig.add(leg);
  sphere(leg,mats.shorts,0,-.2,0,.55,.48,.57,true);
  sphere(leg,mats.green,0,-.59,0,.48,.64,.50,true);
  const knee=new THREE.Group();knee.position.set(0,-.88,0);leg.add(knee);
  sphere(knee,mats.green,0,-.37,0,.43,.47,.43,true);
  const foot=sphere(knee,mats.greenLight,0,-.54,.31,.51,.27,.76,true);
  legs.push(leg);shins.push(knee);feet.push(foot);
 }
 const shadow=dropShadow(player,2,.31);
 animation={leftArm:arms[0],rightArm:arms[1],leftForearm:forearms[0],rightForearm:forearms[1],
   leftLeg:legs[0],rightLeg:legs[1],leftShin:shins[0],rightShin:shins[1],
   torso,body,head:headGroup,rig,attack:0,attackHand:1,punchCount:0,slamPose:0,
   throwPose:0,grabPose:0,roarPose:0,walk:0,speed:0,velocity:vec(),
   jumpVelocity:0,onGround:true,airPeak:0,landTime:0,shadow};
 playerRig.rotation.y=Math.PI;
 player.position.set(0,0,0);
}
function makeCar(x,z,axis,velocity,type=0){
 const group=new THREE.Group();group.position.set(x,0,z);
 group.rotation.y=(axis?Math.PI/2:0)+(velocity<0?Math.PI:0);
 const palettes=['#d34e38','#568ba4','#e5c365','#73897f','#e7e7de','#293f51'];
 const tint=material(palettes[Math.floor(rand(0,palettes.length))],.32,.35);
 box(group,mats.wheel,0,.43,0,3.4,.28,6.0);
 box(group,tint,0,.9,0,3.3,1.02,5.8,true);
 box(group,tint,0,1.62,-.3,2.9,.85,2.8,true);
 box(group,mats.glass,0,1.75,1.15,2.55,.60,.10);
 box(group,mats.glass,0,1.75,-1.75,2.55,.60,.10);
 box(group,mats.glass,1.47,1.64,-.3,.07,.59,2.55);
 box(group,mats.glass,-1.47,1.64,-.3,.07,.59,2.55);
 box(group,mats.dark,0,2.08,-.33,2.68,.08,2.83);
 const wheels=[];
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const wheel=mesh(group,geometry.cylinder,mats.wheel,sx*1.58,.48,sz*1.84,.55,.24,.55);
  wheel.rotation.z=Math.PI/2;wheels.push(wheel);
 }
 for(const sx of [-1,1]){
  box(group,mats.gold,sx*1.15,1,2.93,.4,.27,.08);
  box(group,mats.red,sx*1.15,1,-2.93,.4,.20,.08);
 }
 const obj={group,x,z,axis,velocity,health:70,alive:true,held:false,thrown:false,vy:0,life:20,type,wheels,crashCooldown:0};
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
 // Units remain on a traversable road even if the initial spawn sample hits traffic.
 if(solidObstacleList().some(b=>circleRectOverlap(x,z,3,b))){x=clamp(Math.round(x/34)*34,-136,136);z=clamp(Math.round(z/34)*34,-136,136);}
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
 const obj={group,x,z,kind,health:kind==='tank'?115:60,speed:kind==='tank'?rand(3.1,4.4):rand(5.2,7.2),cooldown:rand(1,3),blink:0,bob:rand(0,9),alive:true,collisionRadius:kind==='tank'?2.7:1.6};
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
 state.shotCooldown=rage?.24:.38;animation.attack=.36;animation.punchCount++;animation.attackHand=(animation.punchCount%2)?1:-1;
 const dir=directionVector(),point=player.position.clone().addScaledVector(dir,5.0);
 applyAreaDamage(point,rage?8.4:6.3,rage?96:58,dir);
 for(let i=0;i<5;i++)particle(point.clone().add(vec(rand(-1,1),rand(1,4),rand(-1,1))),'#b8f05c',rand(.14,.35),rand(.2,.4),vec(rand(-4,4),rand(-2,5),rand(-4,4)));
 shockRing(point.x,point.z,rage?4.2:2.5,'#cbf779',.25);
 cameraShake(.12);playSound('punch');
}
function slam(power=1){
 if(state.mode!=='playing'||state.slamCooldown>0||!animation.onGround)return;
 state.slamCooldown=state.rageTime>0?3.5:5.2;animation.slamPose=.60;
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
  animation.throwPose=.48;playSound('throw');notify('CARRO ARREMESSADO!');return;
 }
 let candidate=null,dist=6.8;
 for(const car of cars){
  if(!car.alive||car.thrown||car.held)continue;
  const d=car.group.position.distanceTo(player.position);
  if(d<dist){candidate=car;dist=d;}
 }
 if(!candidate){notify('APROXIME-SE DE UM CARRO');return;}
 candidate.held=true;candidate.velocity=0;holdingCar=candidate;
 player.attach(candidate.group);candidate.group.position.set(0,7.25,0);candidate.group.rotation.set(0,0,Math.PI/10);animation.grabPose=.5;
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
 for(const b of buildings)if(b.alive&&circleRectOverlap(x,z,radius,b))return true;
 return false;
}
function solidObstacleList(ignoreCar=null){
 const solids=buildings.filter(b=>b.alive);
 for(const c of cars){
  if(!c.alive||c.held||c.thrown||c===ignoreCar)continue;
  const p=c.group.position;
  // Cars act as rectangular barriers for walking bodies, even when parked.
  solids.push({x:p.x,z:p.z,w:c.axis?5.7:3.0,d:c.axis?3.0:5.7,alive:true});
 }
 for(const e of enemies)if(e.alive&&e.kind==='tank'){
  solids.push({x:e.group.position.x,z:e.group.position.z,w:4.6,d:6.0,alive:true});
 }
 return solids;
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
 const sprint=keys.has('ShiftLeft')||keys.has('ShiftRight');
 if(moving)move.normalize();
 const targetSpeed=(sprint?19:11.5)*(state.rageTime>0?1.23:1);
 const accel=animation.onGround?12.5:4.0;
 const smoothing=1-Math.exp(-dt*accel);
 animation.velocity.x+=(move.x*targetSpeed-animation.velocity.x)*smoothing;
 animation.velocity.z+=(move.z*targetSpeed-animation.velocity.z)*smoothing;
 const originX=player.position.x,originZ=player.position.z;
 const solids=solidObstacleList(holdingCar);
 const result=moveCircleSlide(originX,originZ,animation.velocity.x*dt,animation.velocity.z*dt,SETTINGS.playerRadius,solids,SETTINGS.world);
 player.position.x=result.x;player.position.z=result.z;
 const vx=(result.x-originX)/Math.max(dt,.001),vz=(result.z-originZ)/Math.max(dt,.001);
 const actualSpeed=Math.hypot(vx,vz);
 animation.speed=smooth(animation.speed,actualSpeed,dt,9);
 if(result.collisions>0){
  // Remove into-wall velocity, but keep tangential velocity for responsive sliding.
  animation.velocity.x=vx;animation.velocity.z=vz;
 }
 if(actualSpeed>.3){
  const targetYaw=Math.atan2(vx,vz);
  playerRig.rotation.y+=Math.atan2(Math.sin(targetYaw-playerRig.rotation.y),Math.cos(targetYaw-playerRig.rotation.y))*Math.min(1,dt*12);
 }
 playerForward.set(Math.sin(playerRig.rotation.y),0,Math.cos(playerRig.rotation.y));
 const gait=clamp(animation.speed/11.5,0,1.55);
 animation.walk+=dt*(3.5+animation.speed*.72);
 const step=Math.sin(animation.walk),lift=Math.max(0,Math.cos(animation.walk));
 animation.leftLeg.rotation.x=smooth(animation.leftLeg.rotation.x,step*.57*gait,dt,13);
 animation.rightLeg.rotation.x=smooth(animation.rightLeg.rotation.x,-step*.57*gait,dt,13);
 animation.leftShin.rotation.x=smooth(animation.leftShin.rotation.x,Math.max(0,-step)*.77*gait,dt,13);
 animation.rightShin.rotation.x=smooth(animation.rightShin.rotation.x,Math.max(0,step)*.77*gait,dt,13);
 const punchT=clamp(animation.attack/.36,0,1),punchWeight=Math.sin((1-punchT)*Math.PI);
 const attackL=animation.attackHand<0?punchWeight:0;
 const attackR=animation.attackHand>0?punchWeight:0;
 const slamWeight=Math.sin(Math.PI*clamp(animation.slamPose/.60,0,1));
 const throwWeight=Math.sin(Math.PI*clamp(animation.throwPose/.48,0,1));
 const holding=holdingCar?1:0;
 animation.leftArm.rotation.x=smooth(animation.leftArm.rotation.x, -step*.31*gait-attackL*1.96-slamWeight*1.45-throwWeight*.85-holding*2.78,dt,19);
 animation.rightArm.rotation.x=smooth(animation.rightArm.rotation.x, step*.31*gait-attackR*1.96-slamWeight*1.45-throwWeight*.85-holding*2.78,dt,19);
 animation.leftArm.rotation.z=smooth(animation.leftArm.rotation.z,-.12-attackL*.26-slamWeight*.4-holding*.37,dt,14);
 animation.rightArm.rotation.z=smooth(animation.rightArm.rotation.z,.12+attackR*.26+slamWeight*.4+holding*.37,dt,14);
 animation.leftForearm.rotation.x=smooth(animation.leftForearm.rotation.x,-.16+attackL*.48+holding*.45,dt,18);
 animation.rightForearm.rotation.x=smooth(animation.rightForearm.rotation.x,-.16+attackR*.48+holding*.45,dt,18);
 animation.body.rotation.y=smooth(animation.body.rotation.y,(attackR-attackL)*.24+Math.sin(animation.walk)*.06*gait,dt,15);
 animation.body.rotation.x=smooth(animation.body.rotation.x,animation.onGround?(gait*.085+slamWeight*.35):-.15,dt,9);
 animation.rig.rotation.z=smooth(animation.rig.rotation.z,Math.sin(animation.walk)*.052*gait,dt,7);
 animation.rig.position.y=Math.sin(animation.walk*2)*.085*gait+(animation.landTime>0?-.24*Math.sin(Math.PI*animation.landTime/.26):0);
 animation.torso.scale.y=smooth(animation.torso.scale.y,1+Math.sin(state.time*2.8)*.013,dt,5);
 animation.head.rotation.x=smooth(animation.head.rotation.x,-.04+Math.sin(state.time*1.7)*.032+slamWeight*.12,dt,5);
 if(animation.attack>0)animation.attack=Math.max(0,animation.attack-dt);
 animation.slamPose=Math.max(0,animation.slamPose-dt);
 animation.throwPose=Math.max(0,animation.throwPose-dt);
 animation.landTime=Math.max(0,animation.landTime-dt);
 if(!animation.onGround){
  animation.jumpVelocity-=SETTINGS.gravity*dt;
  player.position.y=Math.max(0,player.position.y+animation.jumpVelocity*dt);
  animation.leftLeg.rotation.x=smooth(animation.leftLeg.rotation.x,-.28,dt,9);
  animation.rightLeg.rotation.x=smooth(animation.rightLeg.rotation.x,-.45,dt,9);
  animation.leftShin.rotation.x=smooth(animation.leftShin.rotation.x,.8,dt,9);
  animation.rightShin.rotation.x=smooth(animation.rightShin.rotation.x,.9,dt,9);
  animation.leftArm.rotation.x=smooth(animation.leftArm.rotation.x,-.75,dt,9);
  animation.rightArm.rotation.x=smooth(animation.rightArm.rotation.x,-.75,dt,9);
  if(player.position.y<=0){
   player.position.y=0;animation.onGround=true;animation.jumpVelocity=0;animation.landTime=.26;
   if(animation.airPeak>5.5){state.slamCooldown=0;slam(12+Math.min(animation.airPeak*.2,5));}
   animation.airPeak=0;
  }else animation.airPeak=Math.max(animation.airPeak,player.position.y);
 }
 if(animation.onGround&&gait>.16){
  footsteps-=dt;
  if(footsteps<=0){playSound('step',.13+gait*.08);footsteps=(sprint?.23:.35);}
 }else footsteps=0;
 animation.shadow.position.y=.04-player.position.y;
 animation.shadow.scale.setScalar(1+player.position.y*.07);
 animation.shadow.material.opacity=clamp(.32-player.position.y*.015,.04,.32);
 if(state.rageTime>0&&Math.random()<dt*30){
  particle(player.position.clone().add(vec(rand(-1.4,1.4),rand(.5,5.7),rand(-1.4,1.4))),'#9cff55',rand(.10,.25),.4,vec(rand(-1,1),rand(1,5),rand(-1,1)));
 }
}
function jump(){
 if(state.mode!=='playing'||!animation.onGround)return;
 animation.jumpVelocity=23;animation.onGround=false;animation.airPeak=0;animation.landTime=0;playSound('jump');
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
  c.crashCooldown=Math.max(0,c.crashCooldown-dt);
  if(c.thrown){
   const start=c.group.position.clone();
   c.vy-=SETTINGS.gravity*dt;
   const to=start.clone().addScaledVector(c.fly,dt);to.y+=c.vy*dt;
   const buildingHit=sweptBuildingHit(start,to,buildings,2.3);
   c.group.position.copy(buildingHit?start.clone().lerp(to,buildingHit.t):to);
   c.group.rotation.x+=dt*6;c.life-=dt;
   let impact=to.y<1||c.life<=0;
   if(buildingHit){hurtBuilding(buildingHit.building,180,c.group.position.x,c.group.position.z);impact=true;}
   for(const e of enemies){
    if(!e.alive)continue;
    const t=segmentSphere3D(start.x,start.y,start.z,to.x,to.y,to.z,e.group.position.x,e.group.position.y+(e.kind==='tank'?1.7:0),e.kind==='tank'?3.3:2.0);
    if(t!==null){damageEnemy(e,210);impact=true;}
   }
   if(!impact)for(const other of cars){
    if(other===c||!other.alive||other.held)continue;
    const p=other.group.position;
    const t=segmentSphere3D(start.x,start.y,start.z,to.x,to.y,to.z,p.x,p.y+1.1,p.z,3.1);
    if(t!==null){destroyCar(other);impact=true;break;}
   }
   if(impact)destroyCar(c);
   continue;
  }
  if(Math.abs(c.velocity)>.01){
   const before=c.group.position.clone();
   const delta=(c.axis?vec(c.velocity*dt,0,0):vec(0,0,c.velocity*dt));
   // Prevent moving vehicles from tunnelling through solid actors and walls.
   const obstacles=buildings.filter(b=>b.alive);
   for(const other of cars)if(other!==c&&other.alive&&!other.held&&!other.thrown){
     const p=other.group.position;
     if(p.distanceToSquared(before)<110)obstacles.push({x:p.x,z:p.z,w:other.axis?5.5:2.9,d:other.axis?2.9:5.5,alive:true});
   }
   const radius=1.35;
   const result=moveCircleSlide(before.x,before.z,delta.x,delta.z,radius,obstacles,SETTINGS.world-12);
   // This road traffic is constrained to a single lane: brake/reverse, don't drift sideways.
   const advanced=c.axis?Math.abs(result.x-before.x):Math.abs(result.z-before.z);
   if(result.collisions||advanced<Math.abs(c.velocity*dt)*.3){c.velocity*=-1;c.group.rotation.y+=Math.PI;c.crashCooldown=.5;}
   else{c.group.position.x=result.x;c.group.position.z=result.z;}
   const travel=c.axis?c.group.position.x:c.group.position.z;
   if(Math.abs(travel)>145){c.velocity*=-1;c.group.rotation.y+=Math.PI;}
   for(const wheel of c.wheels)wheel.rotation.y+=c.velocity*dt*.65;
   const dx=c.group.position.x-player.position.x,dz=c.group.position.z-player.position.z;
   if(Math.hypot(dx,dz)<3.1&&player.position.y<2.4&&c.crashCooldown<=0){
    if(state.rageTime>0)destroyCar(c);
    else {damagePlayer(Math.min(13,4+Math.abs(c.velocity)*.65));c.velocity*=-.7;c.crashCooldown=.8;}
   }
  }
 }
}
function moveEnemySafely(e,to,dt,radius){
 const p=e.group.position;
 const amount=e.speed*dt;
 const obstacles=buildings.filter(b=>b.alive);
 if(e.kind==='tank'){
  obstacles.push({x:player.position.x,z:player.position.z,w:2.6,d:2.6,alive:true});
  for(const c of cars)if(c.alive&&!c.held&&!c.thrown)obstacles.push({x:c.group.position.x,z:c.group.position.z,w:c.axis?5.7:3.0,d:c.axis?3.0:5.7,alive:true});
 }
 const move=moveCircleSlide(p.x,p.z,to.x*amount,to.z*amount,radius,obstacles,SETTINGS.world);
 p.x=move.x;p.z=move.z;
 if(move.collisions&&Math.hypot(p.x-player.position.x,p.z-player.position.z)>12){
  // Follow the free side of an obstacle instead of sticking permanently to a corner.
  const steer=moveCircleSlide(p.x,p.z,-to.z*amount,to.x*amount,radius,obstacles,SETTINGS.world);
  if(steer.collisions===0){p.x=steer.x;p.z=steer.z;}
 }
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
  const p=projectiles[i];p.life-=dt;
  const from=p.mesh.position.clone(),to=from.clone().addScaledVector(p.velocity,dt);
  const playerT=segmentSphere3D(from.x,from.y,from.z,to.x,to.y,to.z,
    player.position.x,player.position.y+2.6,player.position.z,2.08);
  const wall=sweptBuildingHit(from,to,buildings,.38);
  let carHit=null;
  for(const c of cars){
   if(!c.alive||c.held)continue;
   const cp=c.group.position;
   const t=segmentSphere3D(from.x,from.y,from.z,to.x,to.y,to.z,cp.x,cp.y+1.1,cp.z,2.35);
   if(t!==null&&(!carHit||t<carHit.t))carHit={car:c,t};
  }
  const nearest=Math.min(playerT??Infinity,wall?.t??Infinity,carHit?.t??Infinity);
  const impact=Number.isFinite(nearest);
  if(impact)p.mesh.position.lerpVectors(from,to,nearest);
  else p.mesh.position.copy(to);
  if(impact&&playerT!==null&&playerT<=nearest){
   damagePlayer(p.damage);
   explosion(p.mesh.position.x,p.mesh.position.y,p.mesh.position.z,'#ff8d46',.44);
  }else if(impact&&wall&&wall.t<=nearest){
   hurtBuilding(wall.building,p.damage*.8,p.mesh.position.x,p.mesh.position.z);playSound('hit',.35);
  }else if(impact&&carHit&&carHit.t<=nearest){destroyCar(carHit.car);}
  if(impact||p.life<=0||to.y<0){scene.remove(p.mesh);projectiles.splice(i,1);}
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
 // Robust camera collision: first ray/rectangle contact instead of discrete samples.
 const from=target.clone();let fraction=1;
 for(const b of buildings){
  if(!b.alive)continue;
  const hit=segmentAABB2D(from.x,from.z,desired.x,desired.z,b,.66);
  if(!hit)continue;
  const collisionY=from.y+(desired.y-from.y)*hit.t;
  if(collisionY<=b.h+1.2&&collisionY>=-.5)fraction=Math.min(fraction,Math.max(.14,hit.t-.045));
 }
 if(fraction<1)desired.copy(from.addScaledVector(desired.clone().sub(from),fraction));
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
 player.position.set(0,0,0);playerRig.rotation.set(0,Math.PI,0);playerForward.set(0,0,-1);animation.onGround=true;animation.jumpVelocity=0;animation.airPeak=0;animation.velocity.set(0,0,0);animation.attack=0;animation.slamPose=0;animation.landTime=0;animation.speed=0;footsteps=0;keys.clear();$('damageFlash').style.opacity='0';damageFlashTimer=0;
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
