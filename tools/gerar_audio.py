import os, numpy as np, subprocess, tempfile, wave
from scipy.signal import butter, sosfilt
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'assets'/'audio';root.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(2026); sr=22050

def time(n):return np.arange(int(n*sr),dtype=np.float64)/sr
def lp(x,hz):return sosfilt(butter(2,hz,fs=sr,output='sos'),x)
def hp(x,hz):return sosfilt(butter(2,hz,fs=sr,output='sos',btype='highpass'),x)
def hzslide(t,f0,f1):return np.sin(2*np.pi*(f1*t+(f0-f1)*.17*(1-np.exp(-t/.17))))
def env(t,attack=.009,decay=.24):return np.clip(t/max(attack,1e-4),0,1)*np.exp(-t/max(decay,1e-4))
def norm(x,volume=.72):
 x=np.nan_to_num(x); peak=max(np.max(np.abs(x)),.0001);return np.clip(x/peak*volume,-1,1)
def export(name,x):
 x=norm(x);wav=tempfile.NamedTemporaryFile(suffix='.wav',delete=False);path=wav.name;wav.close()
 with wave.open(path,'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr);f.writeframes((x*32767).astype('<i2').tobytes())
 dest=root/(name+'.ogg');p=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',path,'-c:a','libvorbis','-q:a','4',str(dest)],capture_output=True);os.remove(path)
 if p.returncode:raise RuntimeError(p.stderr.decode())
 print(name,dest.stat().st_size)

def noise(n,mode='low',hz=1500):
 x=rng.standard_normal(int(sr*n));return lp(x,hz) if mode=='low' else hp(x,hz)

T=time(.34); export('punch', .5*hzslide(T,92,36)*env(T,.003,.11)+.33*noise(.34,'low',760)*env(T,.002,.045)+.37*noise(.34,'low',220)*env(T,.004,.17))
T=time(.21);export('hit',.65*noise(.21,'low',2200)*env(T,.002,.06)+.30*hzslide(T,160,60)*env(T,.001,.12))
T=time(.55);export('boom',.6*noise(.55,'low',240)*env(T,.002,.27)+.6*hzslide(T,100,28)*env(T,.003,.29)+.18*noise(.55,'low',2800)*env(T,.002,.07))
T=time(.83);export('slam',.8*noise(.83,'low',160)*env(T,.001,.4)+.6*hzslide(T,120,24)*env(T,.001,.37)+.12*noise(.83,'low',3000)*env(T,.001,.16))
T=time(.24);export('hurt',.5*hzslide(T,370,81)*env(T,.002,.14)+.20*noise(.24,'low',600)*env(T,.02,.12))
T=time(.32);export('laser',.60*hzslide(T,960,145)*env(T,.003,.17)+.21*noise(.32,'low',2900)*env(T,.002,.08))
T=time(.39);export('jump',.8*hzslide(T,105,400)*env(T,.02,.16)+.18*noise(.39,'low',2300)*env(T,.02,.06))
T=time(1.35);export('roar',.5*(np.sin(2*np.pi*(48*T+5*np.sin(2*np.pi*4*T)))+np.sin(2*np.pi*72*T+.4*np.sin(2*np.pi*13*T)))*env(T,.08,.8)+.35*noise(1.35,'low',490)*env(T,.06,.55))
T=time(.42);export('throw',.65*hzslide(T,390,50)*env(T,.005,.21)+.35*noise(.42,'low',800)*env(T,.007,.1))
T=time(.25);export('grab',.4*hzslide(T,135,230)*env(T,.005,.17)+.3*noise(.25,'low',2100)*env(T,.007,.1))
T=time(.6);export('success',sum(.28*np.sin(2*np.pi*f*T)*env(np.maximum(0,T-offset),.003,.18)*(T>=offset) for f,offset in [(392,0),(523,.12),(659,.24),(784,.36)]))
T=time(.20);export('step',.5*noise(.20,'low',420)*env(T,.004,.08)+.15*noise(.20,'low',1700)*env(T,.001,.025))
T=time(.8);export('collapse',.6*noise(.8,'low',130)*env(T,.01,.5)+.27*noise(.8,'low',1200)*env(T,.03,.4)+.3*hzslide(T,85,31)*env(T,.005,.4))
T=time(.13);export('menu',.5*np.sin(2*np.pi*640*T)*env(T,.003,.07)+.21*np.sin(2*np.pi*1060*T)*env(T,.003,.07))
T=time(.45);export('crash',.64*noise(.45,'low',2300)*env(T,.001,.12)+.4*noise(.45,'low',260)*env(T,.004,.22)+.25*hzslide(T,195,50)*env(T,.003,.24))
# original seamless 16 second action music
L=16;track=np.zeros(sr*L,dtype=np.float64);bpm=120; beat=60/bpm

def add(at,sound,gain=1):
 start=int(at*sr)
 if start>=len(track):return
 end=min(len(track),start+len(sound));track[start:end]+=sound[:end-start]*gain

def tone(freq,dur,brightness=.3):
 t=time(dur);phase=2*np.pi*freq*t
 return (np.sin(phase)+brightness*np.sin(2*phase)+.15*np.sin(3*phase))*env(t,.008,dur*.52)
# 32 beats over 16s
for i in range(32):
 t0=i*beat
 x=time(.24);add(t0,(.6*hzslide(x,130,44)+.33*noise(.24,'low',210))*env(x,.001,.083),.58 if i%4==0 else .4)
 if i%2==1:
  x=time(.24);add(t0,.35*noise(.24,'low',2800)*env(x,.003,.09),.5)
 for j in [0,.5]:
  x=time(.095);add(t0+j*beat,.24*noise(.095,'high',4500)*env(x,.001,.024),.28)
roots=[55,55,65.41,49,55,58.27,65.41,49]
for bar in range(8):
 base=bar*2;f=roots[bar]
 for i in range(4):
  add(base+i*.5,tone(f*(1 if i%2==0 else 2),.42,.55),.16)
 notes=[f*4,f*6,f*5,f*8, f*6,f*5,f*4,f*3]
 for i in range(8): add(base+i*.25,tone(notes[i],.23,.14),.065)
# normalize, avoid hard clipping
export('music',np.tanh(track*.85))
# 12 second loop city ambience: distant traffic + soft siren + wind
T=time(12); amb=.10*lp(rng.standard_normal(len(T)),430)+.035*lp(rng.standard_normal(len(T)),2200)
amb+=.05*np.sin(2*np.pi*(75*T+.28*np.sin(2*np.pi*.12*T)))*(0.5+.5*np.sin(2*np.pi*.16*T)**2)
amb+=.045*np.sin(2*np.pi*(560*T+100*np.sin(2*np.pi*.17*T)))*(0.3+.7*np.sin(2*np.pi*.041*T)**2)
# crop and fade loop boundaries for seamless loop
n=int(.15*sr);amb[:n]*=np.linspace(0,1,n);amb[-n:]*=np.linspace(1,0,n)
export('ambience',amb)
