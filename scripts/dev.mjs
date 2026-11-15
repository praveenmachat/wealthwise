import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('public'),port=Number(process.env.PORT||4173);
try{process.loadEnvFile('.env');}catch{}
const routes={'/api/config':'config','/api/workspace':'workspace','/api/assistant':'assistant','/api/gmail':'gmail','/api/gmail/callback':'gmail-callback'};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost:'+port);
 if(routes[url.pathname]){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>5_700_000){res.writeHead(413);res.end();return;}chunks.push(c);}const data=Buffer.concat(chunks);const mod=await import('../netlify/functions/'+routes[url.pathname]+'.mjs');const r=await mod.default(new Request(url,{method:req.method,headers:req.headers,...(data.length?{body:data}:{} )}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;}
 const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 const mime={'.html':'text/html','.css':'text/css','.mjs':'application/javascript','.js':'application/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'};
 if(!(await stat(path)).isFile())throw new Error('not found');res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(path));
 }catch{res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Not found or service unavailable'}));}}).listen(port,'127.0.0.1',()=>console.log('WealthWise preview: http://localhost:'+port));
