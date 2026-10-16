import {createServer} from 'node:http';
import {readFile,realpath,mkdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import lockfile from 'proper-lockfile';
import worker from '../index.js';
import {cleanup} from '../public-api.js';
import {openDatabase} from './database.js';
import {makeBackup,pruneBackups} from './backup.js';
import {SessionAuth} from './session.js';
export const ROOT=resolve(new URL('../../',import.meta.url).pathname);
const MIME={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.bcmap':'application/octet-stream','.pfb':'application/octet-stream','.ttf':'font/ttf','.wasm':'application/wasm'};
export async function staticAssets(directory){
  const base=await realpath(directory);
  return {async fetch(request){
    try{
      const path=decodeURIComponent(new URL(request.url).pathname);if(path.includes('\0')||path.includes('\\'))return new Response('No encontrado',{status:404});
      const filename=await realpath(resolve(base,'.'+path));if(!filename.startsWith(base+sep))return new Response('No encontrado',{status:404});
      const extension=filename.slice(filename.lastIndexOf('.'));if(!MIME[extension])return new Response('No encontrado',{status:404});
      return new Response(await readFile(filename),{headers:{'Content-Type':MIME[extension],'Cache-Control':'no-cache'}});
    }catch{return new Response('No encontrado',{status:404});}
  }};
}
export async function startServer({dataDir=process.env.DATA_DIR||resolve(ROOT,'data'),origin=process.env.APP_ORIGIN||'http://127.0.0.1:3000',port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1',production=process.env.NODE_ENV==='production',dist=resolve(ROOT,'dist')}={}){
  const parsed=new URL(origin);if(parsed.origin!==origin||parsed.username||parsed.password||!['http:','https:'].includes(parsed.protocol))throw Error('APP_ORIGIN debe ser un origen sin ruta.');
  if(production&&parsed.protocol!=='https:')throw Error('Producción requiere APP_ORIGIN HTTPS.');
  await mkdir(dataDir,{recursive:true,mode:0o700});
  const filename=resolve(dataDir,'portal.sqlite');
  const release=await lockfile.lock(filename,{realpath:false,stale:30000,update:10000,retries:{retries:20,minTimeout:2000,maxTimeout:2000}});
  let db,server,timer,maintenance=Promise.resolve(),maintaining=false;
  try{
    db=await openDatabase(filename);
    const env={DB:db,AUTH:new SessionAuth(db,origin),ASSETS:await staticAssets(dist),INDEXING_ENABLED:process.env.INDEXING_ENABLED||'false',ADVERTISING_ENABLED:process.env.ADVERTISING_ENABLED||'false',AD_PROVIDER_HOSTS:process.env.AD_PROVIDER_HOSTS||''};
    const backups=resolve(dataDir,'backups');
    await cleanup(env);await makeBackup(db,backups);await pruneBackups(backups);
    let lastCleanup=Date.now();
    timer=setInterval(()=>{if(Date.now()-lastCleanup>=86400000&&!maintaining){maintaining=true;maintenance=cleanup(env).then(()=>makeBackup(db,backups)).then(()=>pruneBackups(backups)).then(()=>{lastCleanup=Date.now();}).catch(()=>console.error('No se pudo completar la limpieza programada.')).finally(()=>{maintaining=false;});}},60000);timer.unref();
    server=createServer(async(req,res)=>{
      try{
        const target=new URL(req.url,origin);if(target.origin!==origin){res.writeHead(400);res.end();return;}
        const bodyLimit=target.pathname==='/api/admin/config/restore/preview'?524288:65536;
        let total=0;const chunks=[];
        if(Number(req.headers['content-length']||0)>bodyLimit){res.writeHead(413,{'Connection':'close'});res.end();req.resume();return;}
        for await(const chunk of req){total+=chunk.length;if(total>bodyLimit){res.writeHead(413,{'Connection':'close'});res.end();return;}chunks.push(chunk);}
        const headers=new Headers();for(const [name,value] of Object.entries(req.headers)){if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);}
        const request=new Request(target,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
        const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
      }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});res.end('Servicio temporalmente no disponible.');}
    });
    server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=30000;
    await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,host,done);});
    return {server,db,env,async close(){clearInterval(timer);await new Promise(resolve=>server.close(resolve));await maintenance;db.close();await release();}};
  }catch(error){clearInterval(timer);server?.close();db?.close();await release();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const app=await startServer();console.log('Servidor PDF iniciado.');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
}
