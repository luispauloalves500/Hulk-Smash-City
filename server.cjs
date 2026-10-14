// Minimal static server so the project does not require npm or Vite.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.cjs':'text/javascript; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.ogg':'audio/ogg','.mp3':'audio/mpeg','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
  let url;
  try{url=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400);res.end('Bad Request');return;}
  const abs=path.resolve(root,'.'+(url==='/'?'/index.html':url));
  if(!abs.startsWith(root+path.sep)&&abs!==path.join(root,'index.html')){res.writeHead(403);res.end('Forbidden');return;}
  fs.readFile(abs,(error,data)=>{
   if(error){res.writeHead(404);res.end('Not found');return;}
   res.writeHead(200,{'Content-Type':mime[path.extname(abs)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
  });
});
const port=Number(process.env.PORT||8766);
server.listen(port,'127.0.0.1',()=>console.log('HULK SMASH CITY v1.2: http://127.0.0.1:'+port));
