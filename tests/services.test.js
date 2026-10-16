import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './support/runtime.js';
import {cleanup} from '../src/public-api.js';

test('contacto persiste consultas privadas y exige token, espera, origen y límites',async()=>{
  const {mf,db,call}=await runtime();
  try{
    const payload={email:'visitante@example.test',message:'Consulta sintética <script>alert(1)</script>',website:''};
    assert.equal((await call('/api/contact',{method:'POST',data:payload})).status,400);
    assert.equal((await call('/api/contact/challenge',{method:'POST',data:{},origin:'https://evil.test'})).status,403);
    const {token}=await (await call('/api/contact/challenge',{method:'POST',data:{}})).json();
    const send=data=>call('/api/contact',{method:'POST',data:{...payload,token,...data}});
    assert.equal((await send({})).status,400);
    await db.prepare('UPDATE contact_challenges SET created_ms=created_ms-4000').run();
    assert.equal((await send({website:'bot.example'})).status,400);
    assert.equal((await send({email:'incorrecto'})).status,400);
    const response=await send({});assert.equal(response.status,201);assert.match((await response.json()).message,/No se ha enviado por correo/);
    assert.equal((await send({})).status,400);
    assert.equal((await call('/api/admin/messages')).status,401);
    const {messages}=await (await call('/api/admin/messages',{admin:true})).json();assert.equal(messages.length,1);assert.equal(messages[0].email,payload.email);
    assert.equal((await call('/api/admin/message',{admin:true,method:'PUT',data:{id:messages[0].id,action:'read'}})).status,200);
    assert.equal((await db.prepare('SELECT status FROM contact_messages').first()).status,'read');
    assert.equal((await call('/api/admin/message',{admin:true,method:'PUT',data:{id:messages[0].id,action:'delete'}})).status,200);
    assert.equal((await db.prepare('SELECT count(*) n FROM contact_messages').first()).n,0);
    for(let i=0;i<29;i++)await call('/api/contact/challenge',{method:'POST',data:{}});
    assert.equal((await call('/api/contact/challenge',{method:'POST',data:{}})).status,429);
  }finally{await mf.dispose();}
});

test('estadísticas validan consentimiento y datos mínimos, agregan y exportan con autorización',async()=>{
  const {mf,db,call}=await runtime();
  try{
    const data={consent:true,tool:'unir-pdf',event:'completed',duration_ms:3000};
    const post=body=>call('/api/metrics',{method:'POST',data:body});
    for(const bad of [{...data,consent:false},{...data,tool:'__proto__'},{...data,filename:'privado.pdf'},{...data,event:'desconocido'},{...data,duration_ms:3},{...data,tool:'inicio'}])assert.equal((await post(bad)).status,400);
    assert.equal((await post(data)).status,202);assert.equal((await post(data)).status,202);
    const row=await db.prepare('SELECT * FROM usage_daily').first();assert.equal(row.count,2);assert.equal(row.duration_ms_total,6000);assert.deepEqual(Object.keys(row).sort(),['count','day','duration_ms_total','event','tool_slug']);
    const date=new Date().toISOString().slice(0,10),query=`?from=${date}&to=${date}&tool=unir-pdf`;
    assert.equal((await call('/api/admin/statistics'+query)).status,401);
    const report=await (await call('/api/admin/statistics'+query,{admin:true})).json();assert.equal(report.rows[0].count,2);
    const csv=await call('/api/admin/statistics.csv'+query,{admin:true});assert.equal(csv.status,200);assert.match(csv.headers.get('Content-Disposition'),/estadisticas.csv/);assert.match(await csv.text(),/unir-pdf,completed,2,6000/);
    assert.equal((await call('/api/admin/statistics?from=2026-02-30',{admin:true})).status,400);
    assert.equal((await call('/api/metrics',{method:'POST',raw:JSON.stringify({...data,padding:'x'.repeat(2000)})})).status,400);
    await db.prepare("INSERT INTO request_limits VALUES(?,600,?)").bind('metrics:'+Math.floor(Date.now()/60000),Date.now()+120000).run().catch(async()=>{await db.prepare("UPDATE request_limits SET count=600 WHERE bucket LIKE 'metrics:%'").run();});
    assert.equal((await post(data)).status,429);
  }finally{await mf.dispose();}
});

test('limpieza elimina registros vencidos y conserva los vigentes',async()=>{
  const {mf,db}=await runtime();
  try{
    await db.prepare("INSERT INTO contact_messages(id,email,message,created_at) VALUES('old','test@example.test','Viejo',strftime('%Y-%m-%dT%H:%M:%fZ','now','-32 days')),('new','test@example.test','Actual',strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
    await db.prepare("INSERT INTO usage_daily VALUES(date('now','-367 days'),'inicio','view',1,0),(date('now'),'inicio','view',1,0)").run();
    await db.prepare('INSERT INTO contact_challenges VALUES(?,?,?)').bind('expired',Date.now()-10000,Date.now()-1000).run();
    await cleanup({DB:db});
    assert.equal((await db.prepare('SELECT count(*) n FROM contact_messages').first()).n,1);
    assert.equal((await db.prepare('SELECT id FROM contact_messages').first()).id,'new');
    assert.equal((await db.prepare('SELECT count(*) n FROM usage_daily').first()).n,1);
    assert.equal((await db.prepare('SELECT count(*) n FROM contact_challenges').first()).n,0);
  }finally{await mf.dispose();}
});
