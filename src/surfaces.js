import * as THREE from 'three';

// Tileable, locally generated art; zero network requests and no third-party textures.
function noise(x,y,seed){
 let n=Math.imul(x+seed*17,374761393)^Math.imul(y-seed*31,668265263);
 n=Math.imul(n^(n>>>13),1274126177);
 return ((n^(n>>>16))>>>0)/4294967295;
}
function makePair(kind,side=256){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=side;
 const bump=document.createElement('canvas');bump.width=bump.height=side;
 const dc=canvas.getContext('2d'), bc=bump.getContext('2d');
 const img=dc.createImageData(side,side), hi=bc.createImageData(side,side);
 const base={asphalt:[52,61,65],concrete:[154,156,147],grass:[76,113,75],skin:[90,179,42],fabric:[104,54,145]}[kind];
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const t=(y*side+x)*4;
  const grain=(noise(x,y,7)-.5)*42;
  const cloud=(Math.sin(x*.081+Math.sin(y*.05))*Math.sin(y*.087+x*.024))*9;
  const coarse=(noise(x>>3,y>>3,11)-.5)*16;
  let n=grain+cloud+coarse;
  if(kind==='asphalt'){if(noise(x,y,31)>.975)n+=52;if(noise(x,y,32)<.019)n-=24;}
  if(kind==='concrete')n=grain*.42+cloud*.65+coarse;
  if(kind==='skin')n=grain*.34+cloud*.30+coarse*.27;
  if(kind==='fabric')n=grain*.30+cloud*.14+coarse*.17;
  if(kind==='grass'){n=grain*.8+cloud*.8+coarse*1.3;if(noise(x,y,23)>.965)n+=20;}
  for(let k=0;k<3;k++)img.data[t+k]=Math.max(0,Math.min(255,base[k]+n+(kind==='grass'&&k===1?coarse*.75:0)));
  img.data[t+3]=255;
  const bumpVal=Math.max(0,Math.min(255,127+n*2.4));
  hi.data[t]=hi.data[t+1]=hi.data[t+2]=bumpVal;hi.data[t+3]=255;
 }
 dc.putImageData(img,0,0);bc.putImageData(hi,0,0);
 if(kind==='concrete'){
  dc.strokeStyle='rgba(54,67,63,.35)';dc.lineWidth=2;dc.strokeRect(0,0,side,side);
  dc.strokeStyle='rgba(255,255,242,.15)';dc.lineWidth=1;
  dc.beginPath();dc.moveTo(3,3);dc.lineTo(side-3,3);dc.moveTo(3,3);dc.lineTo(3,side-3);dc.stroke();
 }else if(kind==='asphalt'){
  const r=(a)=>noise(a,a*17,19);
  dc.strokeStyle='rgba(22,31,32,.20)';dc.lineWidth=.8;
  for(let k=0;k<6;k++){
    dc.beginPath();let px=r(k)*side,py=r(k+31)*side;
    dc.moveTo(px,py);
    for(let i=0;i<5;i++){px+=((r(k*11+i)-.5)*27);py+=((r(k*19+i)-.5)*27);dc.lineTo(px,py);}
    dc.stroke();
  }
 }else if(kind==='fabric'){
  dc.strokeStyle='rgba(15,5,28,.12)';dc.lineWidth=.65;
  for(let x=0;x<side;x+=6){dc.beginPath();dc.moveTo(x,0);dc.lineTo(x,side);dc.stroke();}
  for(let y=0;y<side;y+=6){dc.beginPath();dc.moveTo(0,y);dc.lineTo(side,y);dc.stroke();}
 }else if(kind==='grass'){
  for(let n=0;n<210;n++){
   const x=noise(n,11,1)*side,y=noise(n,23,2)*side;
   dc.strokeStyle=n%2?'rgba(123,159,91,.55)':'rgba(35,79,47,.47)';
   dc.lineWidth=1;dc.beginPath();dc.moveTo(x,y);dc.lineTo(x+2,y-3);dc.stroke();
  }
 }
 const color=new THREE.CanvasTexture(canvas),height=new THREE.CanvasTexture(bump);
 color.colorSpace=THREE.SRGBColorSpace;
 for(const texture of [color,height]){
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(kind==='grass'?42:kind==='asphalt'?22:3,
                    kind==='grass'?42:kind==='asphalt'?22:3);
  texture.anisotropy=4;
 }
 return {color,height};
}
export function createSurfaceMaterials(){
 const out={};
 for(const [kind,rough,bumpScale] of [['asphalt',.96,.082],['concrete',.89,.12],['grass',.99,.15],['skin',.76,.025],['fabric',.93,.055]]){
  const t=makePair(kind);
  out[kind]=new THREE.MeshStandardMaterial({map:t.color,bumpMap:t.height,bumpScale,roughness:rough,metalness:0});
 }
 return out;
}
