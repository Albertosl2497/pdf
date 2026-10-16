import {bySlug} from './tools.js';
import {json,readJson} from './http.js';
export const EVENTS=['view','started','completed','failed','cancelled','downloaded'];
const PUBLIC_PAGES=['inicio','herramientas','guias','contacto','privacidad','cookies','terminos','sobre-nosotros'];
export async function cleanup(env){
  if(!env.DB)return;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM config_restore_drafts WHERE expires_ms < ?').bind(Date.now()),
    env.DB.prepare('DELETE FROM ad_previews WHERE expires_ms < ?').bind(Date.now()),
    env.DB.prepare('DELETE FROM ad_permits WHERE expires_ms < ?').bind(Date.now()),
    env.DB.prepare('DELETE FROM contact_challenges WHERE expires_ms < ?').bind(Date.now()),
    env.DB.prepare('DELETE FROM request_limits WHERE expires_ms < ?').bind(Date.now()),
    env.DB.prepare("DELETE FROM contact_messages WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')"),
    env.DB.prepare("DELETE FROM usage_daily WHERE day < date('now','-365 days')"),
  ]);
}
// Límites globales deliberados: no se necesita guardar direcciones IP.
export async function consume(db,name,limit,windowMs){
  const now=Date.now(),window=Math.floor(now/windowMs),bucket=`${name}:${window}`;
  const row=await db.prepare('INSERT INTO request_limits(bucket,count,expires_ms) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,(window+2)*windowMs).first();
  return row.count<=limit;
}
const tokenHash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
export async function publicApi(request,env){
  if(request.method!=='POST'){const r=json({error:'Método no permitido.'},405);r.headers.set('Allow','POST');return r;}
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origen no permitido.'},403);
  if(!env.DB)return json({error:'Servicio temporalmente no disponible.'},503);
  const path=new URL(request.url).pathname;
  try{
    const data=await readJson(request,path==='/api/metrics'?1024:8192);
    if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'Contenido no válido.'},400);
    if(path==='/api/metrics'){
      if(Object.keys(data).some(k=>!['consent','tool','event','duration_ms'].includes(k))||data.consent!==true||typeof data.tool!=='string'||(!Object.hasOwn(bySlug,data.tool)&&!PUBLIC_PAGES.includes(data.tool))||!EVENTS.includes(data.event)||(!Object.hasOwn(bySlug,data.tool)&&data.event!=='view'))return json({error:'Evento no válido.'},400);
      const duration=data.duration_ms??0;
      if(!Number.isInteger(duration)||duration<0||duration>3600000||duration%1000!==0||(!['completed','failed','cancelled'].includes(data.event)&&duration!==0))return json({error:'Duración no válida.'},400);
      if(!await consume(env.DB,'metrics',600,60000))return json({error:'Límite temporal de medición.'},429);
      await env.DB.prepare("INSERT INTO usage_daily(day,tool_slug,event,count,duration_ms_total) VALUES(date('now'),?,?,1,?) ON CONFLICT(day,tool_slug,event) DO UPDATE SET count=count+1,duration_ms_total=duration_ms_total+excluded.duration_ms_total").bind(data.tool,data.event,duration).run();
      return json({ok:true},202);
    }
    if(path==='/api/contact/challenge'){
      if(!await consume(env.DB,'contact-challenge',30,60000))return json({error:'Demasiados intentos. Inténtalo más tarde.'},429);
      await cleanup(env);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
      await env.DB.prepare('INSERT INTO contact_challenges(token_hash,created_ms,expires_ms) VALUES(?,?,?)').bind(await tokenHash(token),Date.now(),Date.now()+600000).run();
      return json({token,min_wait_ms:3000,expires_in_ms:600000});
    }
    if(path==='/api/contact'){
      if(Object.keys(data).some(k=>!['email','message','website','token'].includes(k))||typeof data.email!=='string'||data.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(data.email)||typeof data.message!=='string'||data.message.trim().length<10||data.message.length>3000||typeof data.website!=='string'||data.website!==''||typeof data.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token))return json({error:'Revisa el correo y el mensaje (10–3000 caracteres).'},400);
      const challenge=await env.DB.prepare('DELETE FROM contact_challenges WHERE token_hash=? AND created_ms<=? AND expires_ms>=? RETURNING token_hash').bind(await tokenHash(data.token),Date.now()-3000,Date.now()).first();
      if(!challenge)return json({error:'La comprobación caducó o el envío fue demasiado rápido. Inténtalo de nuevo.'},400);
      if(!await consume(env.DB,'contact-submit',20,3600000))return json({error:'Se alcanzó el límite temporal de consultas. Inténtalo más tarde.'},429);
      await env.DB.prepare('INSERT INTO contact_messages(id,email,message) VALUES(?,?,?)').bind(crypto.randomUUID(),data.email.trim(),data.message.trim()).run();
      return json({ok:true,message:'Tu consulta se guardó para que la revise el responsable. No se ha enviado por correo.'},201);
    }
    return json({error:'No encontrado.'},404);
  }catch(error){return json({error:/JSON|contenido/.test(error.message)?error.message:'No se pudo completar la operación.'},/JSON|contenido/.test(error.message)?400:503);}
}
export const contactView=`<h1>Contacto</h1><p>Envía una consulta al responsable. No adjuntes documentos, contraseñas ni números de identificación.</p><section class="panel"><form id="contact-form"><label for="contact-email">Correo para responder</label><input id="contact-email" type="email" maxlength="254" autocomplete="email" required><label for="contact-message">Mensaje</label><textarea id="contact-message" minlength="10" maxlength="3000" rows="7" required></textarea><div class="honeypot" aria-hidden="true"><label for="contact-website">No completar este campo</label><input id="contact-website" type="text" tabindex="-1" autocomplete="off"></div><p class="small">La consulta y el correo se guardan en la bandeja privada. Se eliminan al superar 30 días, en la siguiente limpieza diaria. El envío no equivale a un correo enviado ni garantiza un plazo de respuesta.</p><button id="send-contact" type="submit" disabled>Enviar consulta</button><p id="contact-status" role="status" aria-live="polite">Preparando el formulario…</p></form></section>`;
