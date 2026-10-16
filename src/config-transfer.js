import {json,readJson} from './http.js';
import {validateSite,validateSeo,seoStatement,text} from './configuration.js';
import {validateAdvertising} from './advertising.js';
import {bySlug} from './tools.js';
export const CONFIG_LIMIT=512*1024;
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
const stable=value=>JSON.stringify(value);
export async function exportConfiguration(db){
 const [settings,pages,tools,seo]=await Promise.all([
  db.prepare("SELECT key,value_json FROM settings WHERE key IN ('site','advertising') ORDER BY key").all(),
  db.prepare('SELECT slug,title,description,body_text,status FROM pages ORDER BY slug').all(),
  db.prepare('SELECT slug,name,status FROM tools ORDER BY slug').all(),
  db.prepare('SELECT slug,title,description,heading,intro,instructions_json,faq_json FROM tool_seo ORDER BY slug').all(),
 ]);
 return {version:2,settings:settings.results,pages:pages.results,tools:tools.results,tool_seo:seo.results};
}
export function validateTransfer(data,env){
 if(!data||![1,2].includes(data.version)||!Array.isArray(data.settings)||!Array.isArray(data.pages)||!Array.isArray(data.tools)||data.settings.length>3||data.pages.length>50||data.tools.length>12)throw Error('Copia no compatible: versiones 1/2, hasta 50 páginas y 12 herramientas.');
 const siteRow=data.settings.find(s=>s.key==='site');if(!siteRow)throw Error('La copia debe incluir la identidad del sitio.');
 const known=new Set(['site','advertising','limits']);if(data.settings.some(s=>!known.has(s.key))||new Set(data.settings.map(s=>s.key)).size!==data.settings.length)throw Error('La copia contiene ajustes desconocidos o duplicados.');
 const site=validateSite(JSON.parse(siteRow.value_json));
 const adRow=data.settings.find(s=>s.key==='advertising');const advertising=validateAdvertising({...JSON.parse(adRow?.value_json||'{}'),enabled:false,reviewed:false,slots:JSON.parse(adRow?.value_json||'{}').slots||[],ads_txt:JSON.parse(adRow?.value_json||'{}').ads_txt||''},env);
 const pages=data.pages.map(p=>{if(!/^guias\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)||!['draft','published','archived'].includes(p.status))throw Error('La copia contiene una página o estado no válido.');return {slug:p.slug,title:text(p.title,200),description:text(p.description,500),body_text:text(p.body_text,20000),status:p.status};});
 if(new Set(pages.map(p=>p.slug)).size!==pages.length)throw Error('La copia contiene páginas duplicadas.');
 const tools=data.tools.map(t=>{if(!Object.hasOwn(bySlug,t.slug)||!['draft','published','maintenance'].includes(t.status))throw Error('Herramienta no implementada o estado no válido en la copia.');return {slug:t.slug,status:t.status};});
 if(new Set(tools.map(t=>t.slug)).size!==tools.length)throw Error('La copia contiene herramientas duplicadas.');
 const seo=data.tool_seo??[];if(!Array.isArray(seo)||seo.length>12)throw Error('SEO no válido.');
 const tool_seo=seo.map(s=>validateSeo({...s,instructions:s.instructions??JSON.parse(s.instructions_json),faq:s.faq??JSON.parse(s.faq_json)}));
 if(new Set(tool_seo.map(s=>s.slug)).size!==tool_seo.length)throw Error('La copia contiene SEO duplicado.');
 const completeTools=Object.keys(bySlug).map(slug=>({slug,status:tools.find(t=>t.slug===slug)?.status||'published'}));
 return {site,advertising,pages,tools:completeTools,tool_seo};
}
export async function configTransfer(request,env,auth){
 const path=new URL(request.url).pathname;
 if(['GET','HEAD'].includes(request.method)&&path==='/api/admin/config/history')return json({backups:(await env.DB.prepare('SELECT id,created_at FROM config_history ORDER BY created_at DESC LIMIT 10').all()).results});
 if(['GET','HEAD'].includes(request.method)&&/^\/api\/admin\/config\/history\/[a-f0-9-]{36}$/.test(path)){const row=await env.DB.prepare('SELECT payload_json FROM config_history WHERE id=?').bind(path.split('/').at(-1)).first();return row?new Response(row.payload_json,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="configuracion-anterior.json"'}}):json({error:'Copia no encontrada.'},404);}
 if(!['/api/admin/config/restore/preview','/api/admin/config/restore/apply'].includes(path))return null;
 if(request.method!=='POST')return json({error:'Método no permitido.'},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origen no permitido.'},403);
 try{
  if(path.endsWith('/preview')){
   const raw=await readJson(request,CONFIG_LIMIT),payload=validateTransfer(raw,env),baseline=await exportConfiguration(env.DB);
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
   await env.DB.prepare('DELETE FROM config_restore_drafts WHERE expires_ms<?').bind(Date.now()).run();
   await env.DB.prepare('INSERT INTO config_restore_drafts VALUES(?,?,?,?)').bind(await digest(token),stable(payload),await digest(stable(baseline)),Date.now()+600000).run();
   return json({token,summary:{brand:payload.site.brand,pages:payload.pages.length,tools:payload.tools.length,seo:payload.tool_seo.length,current_pages:baseline.pages.length,advertising:'disabled'},expires_in_ms:600000});
  }
  const data=await readJson(request,1024);if(data?.confirmation!=='RESTAURAR'||typeof data.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token))return json({error:'Confirma escribiendo RESTAURAR después de revisar la copia.'},400);
  const tokenHash=await digest(data.token),draft=await env.DB.prepare('SELECT * FROM config_restore_drafts WHERE token_hash=? AND expires_ms>?').bind(tokenHash,Date.now()).first();if(!draft)return json({error:'La revisión caducó o ya se utilizó. Vuelve a revisar la copia.'},409);
  const before=await exportConfiguration(env.DB);if(await digest(stable(before))!==draft.baseline_hash)return json({error:'La configuración cambió desde la revisión. Revisa la copia otra vez.'},409);
  const payload=JSON.parse(draft.payload_json),statements=[env.DB.prepare('INSERT INTO config_history(id,payload_json) VALUES(?,?)').bind(crypto.randomUUID(),stable(before)),env.DB.prepare('DELETE FROM pages'),env.DB.prepare('DELETE FROM tool_seo'),env.DB.prepare("UPDATE tools SET status='draft'")];
  for(const [key,value] of [['site',payload.site],['advertising',payload.advertising]])statements.push(env.DB.prepare("INSERT INTO settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(key,stable(value)));
  for(const p of payload.pages)statements.push(env.DB.prepare('INSERT INTO pages(slug,title,description,body_text,status) VALUES(?,?,?,?,?)').bind(p.slug,p.title,p.description,p.body_text,p.status));
  for(const t of payload.tools)statements.push(env.DB.prepare('INSERT INTO tools(slug,name,description,engine,status,verified_at) VALUES(?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,engine=excluded.engine,status=excluded.status,verified_at=excluded.verified_at').bind(t.slug,bySlug[t.slug].name,bySlug[t.slug].description,'browser-v1',t.status,'2026-10-15T18:28:48Z'));
  for(const s of payload.tool_seo)statements.push(seoStatement(env.DB,s));
  statements.push(env.DB.prepare('DELETE FROM ad_permits'),env.DB.prepare('DELETE FROM ad_previews'),env.DB.prepare('DELETE FROM config_restore_drafts'),env.DB.prepare('INSERT INTO audit_log(actor,action) VALUES(?,?)').bind(auth.email,'configuration.restore'),env.DB.prepare('DELETE FROM config_history WHERE id NOT IN (SELECT id FROM config_history ORDER BY created_at DESC LIMIT 10)'));
  // Compare the complete reviewed state inside the write transaction, including
  // the one-use token: concurrent edits or a second apply roll back atomically.
  const tables=[['settings',before.settings,['key','value_json']," WHERE a.key IN ('site','advertising')"],['pages',before.pages,['slug','title','description','body_text','status'],''],['tools',before.tools,['slug','name','status'],''],['tool_seo',before.tool_seo,['slug','title','description','heading','intro','instructions_json','faq_json'],'']];
  const ctes=tables.map((t,i)=>`e${i} AS (SELECT value FROM json_each(?))`).join(',');
  const checks=tables.map(([table,rows,columns,where],i)=>`(SELECT count(*) FROM ${table} a${where})=(SELECT count(*) FROM e${i}) AND NOT EXISTS(SELECT 1 FROM ${table} a${where}${where?' AND':' WHERE'} NOT EXISTS(SELECT 1 FROM e${i} e WHERE ${columns.map(c=>`json_extract(e.value,'$.${c}') IS a.${c}`).join(' AND ')}))`).join(' AND ');
  const guard=crypto.randomUUID();
  statements.unshift(env.DB.prepare(`WITH ${ctes} INSERT INTO config_restore_guards(id,valid) SELECT ?,CASE WHEN ${checks} AND EXISTS(SELECT 1 FROM config_restore_drafts WHERE token_hash=? AND expires_ms>?) THEN 1 ELSE 0 END`).bind(...tables.map(t=>stable(t[1])),guard,tokenHash,Date.now()));
  statements.push(env.DB.prepare('DELETE FROM config_restore_guards WHERE id=?').bind(guard));
  await env.DB.batch(statements);return json({ok:true,message:'Configuración restaurada. Publicidad desactivada; acceso, consultas y estadísticas agregadas conservados.'});
 }catch(error){return json({error:/SQLITE|D1|constraint|JSON at|Unexpected/.test(error.message)?'La copia no es válida o no pudo restaurarse. No se aplicaron cambios.':error.message},400);}
}
