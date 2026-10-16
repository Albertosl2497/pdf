import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../src/node/server.js';
import {openDatabase} from '../src/node/database.js';
import {SessionAuth,setOwner} from '../src/node/session.js';
import {makeBackup,restoreBackup} from '../src/node/backup.js';

test('adaptador SQLite: persistencia y rollback atómico',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pdf-sqlite-'));let db;
 try{const file=join(dir,'portal.sqlite');db=await openDatabase(file);db.prepare("INSERT INTO settings VALUES('persist','{}','now')").run();assert.throws(()=>db.batch([db.prepare("UPDATE settings SET value_json='1' WHERE key='persist'"),db.prepare('INSERT INTO tabla_inexistente VALUES(1)')]));assert.equal(db.prepare("SELECT value_json FROM settings WHERE key='persist'").first().value_json,'{}');db.close();db=await openDatabase(file);assert.ok(db.prepare("SELECT 1 FROM settings WHERE key='persist'").first());}finally{db?.close();await rm(dir,{recursive:true,force:true});}
});

test('sesiones: contraseña derivada con scrypt, cookie segura, falsificación, CSRF y revocación',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pdf-sessions-')),db=await openDatabase(join(dir,'portal.sqlite'));
 try{await setOwner(db,'owner@example.test','contraseña sintética extensa 123');const auth=new SessionAuth(db,'https://pdf.example.test');const req=(data,origin='https://pdf.example.test')=>new Request('https://pdf.example.test/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});const data={email:'owner@example.test',password:'contraseña sintética extensa 123'};
 assert.equal((await auth.endpoint(req(data,'https://evil.test'))).status,403);assert.equal((await auth.endpoint(req({...data,password:'incorrecta'}))).status,401);
 const response=await auth.endpoint(req(data));assert.equal(response.status,200);const cookie=response.headers.get('Set-Cookie');assert.match(cookie,/__Host-pdf-session=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
 const signed=new Request('https://pdf.example.test/admin',{headers:{Cookie:cookie.split(';')[0]}});assert.equal((await auth.authorize(signed)).status,200);assert.equal((await auth.authorize(new Request(signed.url,{headers:{Cookie:'__Host-pdf-session='+ 'a'.repeat(64)}}))).status,401);
 await setOwner(db,'owner@example.test','otra contraseña sintética 456');assert.equal((await auth.authorize(signed)).status,401);assert.ok(!db.prepare('SELECT password_hash FROM owner_account').first().password_hash.includes('sintética'));
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('servidor VPS: acceso, assets, límites, persistencia y copia/restauración fuera de línea',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pdf-server-'));let app;
 try{
  app=await startServer({dataDir:dir,port:0,origin:'http://127.0.0.1:3000'});let base='http://127.0.0.1:'+app.server.address().port;const origin='http://127.0.0.1:3000';
  assert.equal((await fetch(base+'/api/health')).status,200);assert.match((await fetch(base+'/assets/app.js')).headers.get('Content-Type'),/javascript/);assert.equal((await fetch(base+'/admin',{redirect:'manual'})).status,303);
  await setOwner(app.db,'owner@example.test','contraseña de prueba segura 123');
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'contraseña de prueba segura 123'})});assert.equal(login.status,200);const cookie=login.headers.get('Set-Cookie').split(';')[0];
  const update=await fetch(base+'/api/admin/site',{method:'PUT',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({brand:'Marca VPS',description:'Persistencia de prueba',public_origin:null})});assert.equal(update.status,200);
  app.db.prepare('INSERT INTO ad_permits VALUES(?,?,?)').bind('test-permit','test-banner',Date.now()+60000).run();
  const copy=await makeBackup(app.db,join(dir,'manual'));
  await assert.rejects(()=>restoreBackup(copy,join(dir,'portal.sqlite')),{code:'ELOCKED'});
  assert.equal((await fetch(base+'/api/metrics',{method:'POST',headers:{Origin:origin},body:'x'.repeat(70000)})).status,413);
  await app.close();app=null;
  await restoreBackup(copy,join(dir,'portal.sqlite'));
  app=await startServer({dataDir:dir,port:0,origin});base='http://127.0.0.1:'+app.server.address().port;
  assert.match(await (await fetch(base+'/')).text(),/Marca VPS/);assert.equal((await fetch(base+'/api/admin/config',{headers:{Cookie:cookie}})).status,401);assert.equal(app.db.prepare('SELECT count(*) n FROM ad_permits').first().n,0);
  assert.ok((await readFile(copy)).length>0);
 }finally{await app?.close();await rm(dir,{recursive:true,force:true});}
});
