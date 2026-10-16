import subprocess,uuid,json,time
prefix='pdf-check-'+uuid.uuid4().hex[:10]
container=prefix;volume=prefix+'-data';network=prefix+'-net';web=prefix+'-web'
def docker(*args,input=None):
 return subprocess.check_output(['docker',*args],input=input,text=True).strip()
script="""
const health=await fetch('http://127.0.0.1:3000/api/health');if(!health.ok)throw Error('salud');
const base='http://127.0.0.1:3000',origin='https://pdf.localhost';
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'contraseña sintética contenedor 123'})});if(!login.ok)throw Error('login');const cookie=login.headers.get('Set-Cookie').split(';')[0];
const update=await fetch(base+'/api/admin/site',{method:'PUT',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({brand:'Marca Docker',description:'Persistente',public_origin:null})});if(!update.ok)throw Error('guardar');
console.log('Salud, sesión segura y escritura SQLite en Docker aprobadas.');
"""
try:
 docker('network','create',network)
 docker('run','-d','--name',container,'--network',network,'--network-alias','app','--read-only','--tmpfs','/tmp:size=32m,mode=1777','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','512m','-e','APP_ORIGIN=https://pdf.localhost','-e','AD_ORIGIN=https://ads.pdf.localhost','-e','AD_PROVIDER_HOSTS=ads.example.test','-v',volume+':/data','herramientas-pdf:local')
 for i in range(20):
  probe=subprocess.run(['docker','exec',container,'node','-e',"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],capture_output=True)
  if probe.returncode==0:break
  time.sleep(.25)
 else:raise Exception('Servidor no inició: '+docker('logs',container))
 docker('exec','-i',container,'node','scripts/owner.mjs','owner@example.test',input='contraseña sintética contenedor 123\n')
 print(docker('exec',container,'node','--input-type=module','-e',script))
 docker('exec',container,'node','scripts/backup.mjs')
 backup=docker('exec',container,'node','--input-type=module','-e',"import{readdir}from'node:fs/promises';console.log((await readdir('/data/backups')).filter(n=>n.endsWith('.sqlite')).sort().at(-1))")
 docker('restart',container)
 print(docker('exec',container,'node','--input-type=module','-e',"for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:3000/');if((await r.text()).includes('Marca Docker')){console.log('Reinicio con volumen: datos conservados.');break;}}catch{}if(i===29)throw Error('persistencia');await new Promise(r=>setTimeout(r,200));}"))
 config=open('deploy/Caddyfile').read().replace('  encode zstd gzip','  tls internal\n  encode zstd gzip')
 path='/tmp/'+prefix+'-Caddyfile';open(path,'w').write(config)
 docker('create','--name',web,'--network',network,'--network-alias','web','-e','DOMAIN=pdf.localhost','-e','ACME_EMAIL=owner@example.test','caddy:2.10.2-alpine')
 docker('cp',path,web+':/etc/caddy/Caddyfile');docker('start',web)
 for i in range(30):
  try:ca=docker('exec',web,'cat','/data/caddy/pki/authorities/local/root.crt');break
  except subprocess.CalledProcessError:time.sleep(.2)
 code="import https from 'node:https'; const ca="+json.dumps(ca)+"; const response=await new Promise((resolve,reject)=>https.get({hostname:'web',servername:'pdf.localhost',headers:{Host:'pdf.localhost'},ca,path:'/api/health'},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));}).on('error',reject));if(response!==200)throw Error('proxy');console.log('Proxy Caddy: HTTPS validado con CA de prueba explícita y salud 200.');"
 print(docker('exec',container,'node','--input-type=module','-e',code))
 limits="""import https from 'node:https'; const ca=CA_VALUE;
async function post(path,size){const body=' '.repeat(size);return new Promise((resolve,reject)=>{const req=https.request({hostname:'web',servername:'pdf.localhost',headers:{Host:'pdf.localhost','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},ca,path,method:'POST'},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});req.on('error',reject);req.end(body);});}
if(await post('/api/admin/config/restore/preview',90*1024)!==401)throw Error('restauración debe llegar a autenticación con 90 KB');
if(await post('/api/admin/config/restore/preview',513*1024)!==413)throw Error('restauración debe limitarse a 512 KB');
if(await post('/api/admin/site',65*1024)!==413)throw Error('otras rutas deben limitarse a 64 KB');
console.log('Proxy: restauración admite más de 64 KB, exige autenticación y respeta 512 KB; resto limitado a 64 KB.');
""".replace('CA_VALUE',json.dumps(ca))
 print(docker('exec',container,'node','--input-type=module','-e',limits))
 isolated="""import https from 'node:https'; const ca=CA_VALUE;
const origin='https://pdf.localhost',base='http://127.0.0.1:3000';
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'contraseña sintética contenedor 123'})});
if(!login.ok)throw Error('login');const cookie=login.headers.get('Set-Cookie').split(';')[0],key='a'.repeat(32);
const save=await fetch(base+'/api/admin/advertising',{method:'PUT',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({enabled:false,reviewed:false,ads_txt:'',slots:[{id:'test',placement:'footer',device:'all',width:300,height:250,key,script_url:'https://ads.example.test/22/'+key,enabled:true}]})});if(!save.ok)throw Error('config');
const preview=await fetch(base+'/api/admin/advertising/preview',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({consent:true,slot_id:'test'})});const descriptor=await preview.json();if(!descriptor.src?.startsWith('https://ads.pdf.localhost/'))throw Error('origen');
async function get(path){return new Promise((resolve,reject)=>https.get({hostname:'web',servername:'ads.pdf.localhost',headers:{Host:'ads.pdf.localhost'},ca,path},r=>{r.resume();r.on('end',()=>resolve({status:r.statusCode,csp:r.headers['content-security-policy']}));}).on('error',reject));}
const frame=await get(new URL(descriptor.src).pathname+new URL(descriptor.src).search);if(frame.status!==200||!frame.csp.includes('allow-same-origin')||!frame.csp.includes("frame-ancestors https://pdf.localhost"))throw Error('marco separado');
if((await get('/api/admin/config')).status!==404||(await get('/')).status!==404)throw Error('rutas privadas');
console.log('Caddy: segundo hostname HTTPS, marco publicitario separado y rutas privadas bloqueadas comprobados.');
""".replace('CA_VALUE',json.dumps(ca))
 print(docker('exec',container,'node','--input-type=module','-e',isolated))


 docker('stop',container)
 print(docker('run','--rm','-e','APP_ORIGIN=https://pdf.localhost','-e','AD_ORIGIN=https://ads.pdf.localhost','-e','AD_PROVIDER_HOSTS=ads.example.test','-v',volume+':/data','herramientas-pdf:local','node','scripts/backup.mjs','restore','/data/backups/'+backup,'--confirm-replace'))
finally:
 import os
 if 'path' in locals() and os.path.exists(path):os.unlink(path)
 subprocess.run(['docker','rm','-f','-v',web],capture_output=True)
 subprocess.run(['docker','rm','-f',container],capture_output=True)
 subprocess.run(['docker','network','rm',network],capture_output=True)
 subprocess.run(['docker','volume','rm',volume],capture_output=True)
