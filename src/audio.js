/** Audio engine: baked OGG fallback assets ship with the game; optional CC0 Kenney overrides.
 *  AudioContext starts only from a genuine user interaction to comply with browser autoplay policies.
 */
export class AudioEngine {
  constructor(){
    this.ctx=null;this.buffers=new Map();this.started=false;this.loading=null;
    this.master=null;this.sfx=null;this.music=null;this.ambient=null;
    this.loopSources=new Map();this.muted=false;this.musicEnabled=true;this.volume=.75;
    this.loaded=0;this.failed=0;this.overrideNames={};
    this.names=['punch','hit','boom','slam','hurt','laser','jump','roar','throw','grab','success','step','collapse','menu','crash','music','ambience'];
  }
  async start(){
    if(this.ctx){if(this.ctx.state==='suspended')await this.ctx.resume();this.playLoops();return;}
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)return;
    const ctx=this.ctx=new Context();
    this.master=ctx.createGain();this.master.gain.value=this.muted?0:this.volume;
    this.sfx=ctx.createGain();this.sfx.gain.value=.85;
    this.music=ctx.createGain();this.music.gain.value=this.musicEnabled ? 0.29 : 0;
    this.ambient=ctx.createGain();this.ambient.gain.value=.14;
    this.sfx.connect(this.master);this.music.connect(this.master);this.ambient.connect(this.master);this.master.connect(ctx.destination);
    this.started=true;
    this.loading=(async()=>{
      try{const response=await fetch('assets/audio/kenney-map.json');if(response.ok)this.overrideNames=await response.json();}catch{}
      await Promise.all(this.names.map(async name=>{
        const fallback=`assets/audio/${name}.ogg`;
        const preferred=this.overrideNames[name];
        for(const url of (preferred?[preferred,fallback]:[fallback])){
          try{
            const response=await fetch(url);if(!response.ok)throw new Error(`${response.status}: ${url}`);
            const buffer=await ctx.decodeAudioData(await response.arrayBuffer());
            this.buffers.set(name,buffer);this.loaded++;break;
          }catch(error){if(url===fallback)console.warn('Áudio ausente:',name,error);}
        }
        if(!this.buffers.has(name))this.failed++;
        if(name==='music'||name==='ambience')this.playLoops();
      }));
      return this.loaded;
    })();
    await ctx.resume();return this.loading;
  }
  play(kind,intensity=1,pan=0){
    if(!this.ctx||this.muted)return;
    const buffer=this.buffers.get(kind);
    if(!buffer)return;
    const src=this.ctx.createBufferSource();src.buffer=buffer;
    src.playbackRate.value=kind==='step'?(.92+Math.random()*.16):(.95+Math.random()*.1);
    const gain=this.ctx.createGain();gain.gain.value=Math.min(1.6,Math.max(.03,intensity))*.75;
    if(this.ctx.createStereoPanner){const stereo=this.ctx.createStereoPanner();stereo.pan.value=Math.max(-1,Math.min(1,pan));src.connect(gain);gain.connect(stereo);stereo.connect(this.sfx);}else{src.connect(gain);gain.connect(this.sfx);}
    src.start();src.onended=()=>{try{src.disconnect();gain.disconnect();}catch{}};
  }
  playLoops(){
    if(!this.ctx)return;
    for(const [kind,node] of [['music',this.music],['ambience',this.ambient]]){
      if(this.loopSources.has(kind))continue;
      const buffer=this.buffers.get(kind);if(!buffer)continue;
      const src=this.ctx.createBufferSource();src.buffer=buffer;src.loop=true;src.connect(node);src.start();
      this.loopSources.set(kind,src);
    }
  }
  setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)));if(this.master&&this.ctx)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.ctx.currentTime,.025);}
  setMuted(muted){this.muted=Boolean(muted);this.setVolume(this.volume);}
  setMusic(enabled){this.musicEnabled=Boolean(enabled);if(this.music&&this.ctx)this.music.gain.setTargetAtTime(this.musicEnabled ? 0.29 : 0,this.ctx.currentTime,.08);}
  setPaused(paused){if(!this.ctx)return;const val=paused?0:1;this.sfx.gain.setTargetAtTime(val*.85,this.ctx.currentTime,.04);this.music.gain.setTargetAtTime(val*(this.musicEnabled ? 0.29 : 0),this.ctx.currentTime,.05);this.ambient.gain.setTargetAtTime(val*.14,this.ctx.currentTime,.05);}
  async suspend(){if(this.ctx&&this.ctx.state==='running')await this.ctx.suspend();}
  async resume(){if(this.ctx&&this.ctx.state==='suspended')await this.ctx.resume();}
}
