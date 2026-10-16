import {isolatedAdOrigin,frameDescriptor} from './ad-origin.js';
import {json,readJson} from './http.js';
import {bySlug} from './tools.js';
import {consume} from './public-api.js';
export const DEFAULT_ADS={enabled:false,reviewed:false,ads_txt:'',slots:[]};
export const FORMATS=[[300,250],[320,50],[320,100],[728,90]];
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
export function providerHosts(env){return (env.AD_PROVIDER_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(s=>/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(s));}
export function validateAdvertising(data,env){
  if(!data||typeof data!=='object'||typeof data.enabled!=='boolean'||typeof data.reviewed!=='boolean'||!Array.isArray(data.slots)||data.slots.length>4)throw Error('Configuración publicitaria no válida.');
  const approved=providerHosts(env),ids=new Set();
  const slots=data.slots.map(slot=>{
    if(!slot||!['footer'].includes(slot.placement)||!['mobile','desktop','all'].includes(slot.device)||!FORMATS.some(([w,h])=>w===slot.width&&h===slot.height)||typeof slot.enabled!=='boolean'||typeof slot.id!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(slot.id)||ids.has(slot.id))throw Error('Revisa identificador, formato, dispositivo y ubicación del banner.');
    ids.add(slot.id);
    const key=typeof slot.key==='string'?slot.key.trim():'',script_url=typeof slot.script_url==='string'?slot.script_url.trim():'';
    if(key&&!/^[a-f0-9]{32}$/i.test(key))throw Error('La clave del banner debe proceder del código real del proveedor.');
    let host='';
    if(script_url){let url;try{url=new URL(script_url);}catch{throw Error('URL del proveedor no válida.');}const legacy=/^\/([a-f0-9]{32})\/invoke\.js$/i.exec(url.pathname),alternate=/^\/22\/([a-f0-9]{32})$/i.exec(url.pathname),pathKey=(legacy||alternate)?.[1];if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!pathKey||pathKey!==key)throw Error('El banner requiere HTTPS y /CLAVE/invoke.js o /22/CLAVE con la misma clave; no se admiten scripts arbitrarios.');host=url.hostname;}
    if(slot.enabled&&(!key||!script_url))throw Error('Un banner activo necesita su clave y URL reales.');
    if(data.enabled&&slot.enabled&&!approved.includes(host))throw Error('El dominio del banner debe autorizarse en AD_PROVIDER_HOSTS del servidor.');
    return {id:slot.id,placement:'footer',device:slot.device,width:slot.width,height:slot.height,key,script_url,enabled:slot.enabled};
  });
  if(data.enabled&&(env.ADVERTISING_ENABLED!=='true'||!data.reviewed||!slots.some(s=>s.enabled)))throw Error('Para activar: habilita ADVERTISING_ENABLED, revisa proveedor y privacidad y configura al menos un banner.');
  const ads_txt=validateAdsTxt(data.ads_txt??'');
  return {enabled:data.enabled,reviewed:data.reviewed,slots,ads_txt};
}
export function validateAdsTxt(value){
  if(typeof value!=='string'||value.length>10000)throw Error('ads.txt supera el límite permitido.');
  if(!value.trim())return '';
  if(/[\x00-\x08\x0b-\x1f\x7f]/.test(value.replace(/\r?\n/g,'')))throw Error('ads.txt contiene caracteres no válidos.');
  for(const raw of value.split(/\r?\n/)){const line=raw.split('#')[0].trim();if(!line)continue;if(!/^[a-z0-9.-]+\.[a-z]{2,}\s*,\s*[a-z0-9_-]+\s*,\s*(DIRECT|RESELLER)(?:\s*,\s*[a-z0-9_-]+)?\s*$/i.test(line))throw Error('Usa únicamente registros ads.txt reales: dominio, vendedor, DIRECT/RESELLER y certificado opcional.');}
  return value;
}
export async function readAdvertising(env){const row=env.DB?await env.DB.prepare("SELECT value_json FROM settings WHERE key='advertising'").first():null;return {...DEFAULT_ADS,...(row?JSON.parse(row.value_json):{})};}
export async function adminAdvertising(request,env,auth){
  const path=new URL(request.url).pathname;
  if(path==='/api/admin/advertising/preview'){
    if(request.method!=='POST')return json({error:'Método no permitido.'},405);
    if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origen no permitido.'},403);
    try{const data=await readJson(request,1024);if(data.consent!==true||typeof data.slot_id!=='string')return json({error:'Se requiere consentimiento explícito para cargar el proveedor en la prueba.'},400);
      const config=validateAdvertising({...await readAdvertising(env),enabled:false},env),slot=config.slots.find(s=>s.id===data.slot_id);
      if(!slot?.key||!slot.script_url||!providerHosts(env).includes(new URL(slot.script_url).hostname))return json({error:'Guarda un banner real y autoriza su dominio antes de probar.'},400);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
      await env.DB.prepare('DELETE FROM ad_previews WHERE expires_ms<?').bind(Date.now()).run();
      await env.DB.batch([env.DB.prepare('INSERT INTO ad_previews VALUES(?,?,?)').bind(await hash(token),JSON.stringify(slot),Date.now()+60000),env.DB.prepare('INSERT INTO audit_log(actor,action) VALUES(?,?)').bind(auth.email,'advertising.preview')]);
      return json({width:slot.width,height:slot.height,...frameDescriptor('/advertising/preview/frame?permit='+token,env)});
    }catch{return json({error:'No se pudo preparar la prueba.'},400);}
  }
  if(path==='/api/admin/advertising/disable'){
    if(request.method!=='PUT')return json({error:'Método no permitido.'},405);
    if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origen no permitido.'},403);
    const config={...await readAdvertising(env),enabled:false};await env.DB.batch([env.DB.prepare("UPDATE settings SET value_json=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='advertising'").bind(JSON.stringify(config)),env.DB.prepare('DELETE FROM ad_permits'),env.DB.prepare('DELETE FROM ad_previews'),env.DB.prepare('INSERT INTO audit_log(actor,action) VALUES(?,?)').bind(auth.email,'advertising.disabled')]);return json({ok:true});
  }
  if(path!=='/api/admin/advertising')return null;
  if(request.method==='GET'||request.method==='HEAD')return json({config:await readAdvertising(env),provider_hosts:providerHosts(env),server_enabled:env.ADVERTISING_ENABLED==='true',frame_origin:isolatedAdOrigin(env)});
  if(request.method!=='PUT')return json({error:'Método no permitido.'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origen no permitido.'},403);
  try{const data=validateAdvertising(await readJson(request),env);await env.DB.batch([env.DB.prepare("INSERT INTO settings(key,value_json) VALUES('advertising',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(JSON.stringify(data)),env.DB.prepare('DELETE FROM ad_permits'),env.DB.prepare('DELETE FROM ad_previews'),env.DB.prepare('INSERT INTO audit_log(actor,action) VALUES(?,?)').bind(auth.email,data.enabled?'advertising.update':'advertising.disabled')]);return json({ok:true});}catch(error){return json({error:error.message.startsWith('SQLITE')?'No se pudo guardar la publicidad.':error.message},400);}
}
export async function advertisingStatus(env){const config=await readAdvertising(env);try{validateAdvertising(config,env);if(config.enabled)return {enabled:true,revision:await hash(JSON.stringify(config))};}catch{}return {enabled:false,revision:''};}
export async function publicAdvertising(request,env){
  const url=new URL(request.url),path=url.pathname;
  const adOrigin=isolatedAdOrigin(env);
  if((path==='/advertising/preview/frame'||path.startsWith('/advertising/frame/'))&&adOrigin&&url.origin!==adOrigin)return new Response('No disponible.',{status:404});
  if(path==='/ads.txt'){
    if(!['GET','HEAD'].includes(request.method))return json({error:'Método no permitido.'},405);
    const config=await readAdvertising(env);
    return new Response(request.method==='HEAD'?null:config.ads_txt||'No hay registros publicados.',{status:config.ads_txt?200:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});
  }
  if(path==='/api/advertising'){
    if(request.method!=='POST')return json({error:'Método no permitido.'},405);
    if(request.headers.get('Origin')!==url.origin)return json({error:'Origen no permitido.'},403);
    try{
      const body=await readJson(request,1024);
      if(!body||!['mobile','desktop'].includes(body.device)||typeof body.page!=='string'||(body.page!=='/'&&body.page!=='/herramientas'&&body.page!=='/guias'&&!Object.hasOwn(bySlug,body.page.slice(1)))||Object.keys(body).some(k=>!['consent','device','page'].includes(k)))return json({error:'Solicitud no válida.'},400);
      // El campo consent de clientes antiguos se ignora; no se interpreta como autorización.
      if(!env.DB||env.ADVERTISING_ENABLED!=='true')return json({slots:[]});
      const config=await readAdvertising(env);if(!config.enabled)return json({slots:[]});
      try{validateAdvertising(config,env);}catch{return json({slots:[]});}
      if(!await consume(env.DB,'advertising',120,60000))return json({slots:[]},429);
      // El pie de página admite un solo banner; nunca invade selección/descarga.
      const slot=config.slots.find(s=>s.enabled&&(s.device==='all'||s.device===body.device));if(!slot)return json({slots:[]});
      if(Object.hasOwn(bySlug,body.page.slice(1))){const state=await env.DB.prepare('SELECT status FROM tools WHERE slug=?').bind(body.page.slice(1)).first();if(state&&state.status!=='published')return json({slots:[]});}
      await env.DB.prepare('DELETE FROM ad_permits WHERE expires_ms<?').bind(Date.now()).run();
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
      await env.DB.prepare('INSERT INTO ad_permits(token_hash,slot_id,expires_ms) VALUES(?,?,?)').bind(await hash(token),slot.id,Date.now()+60000).run();
      return json({revision:await hash(JSON.stringify(config)),slots:[{id:slot.id,width:slot.width,height:slot.height,...frameDescriptor('/advertising/frame/'+slot.id+'?permit='+token,env)}]});
    }catch{return json({slots:[]},400);}
  }
  if(path==='/advertising/preview/frame'){
    const fail=()=>new Response('Prueba no disponible.',{status:404,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
    const token=url.searchParams.get('permit');if(request.method!=='GET'||!env.DB||!/^[a-f0-9]{64}$/.test(token||''))return fail();
    const row=await env.DB.prepare('DELETE FROM ad_previews WHERE token_hash=? AND expires_ms>=? RETURNING payload_json').bind(await hash(token),Date.now()).first();if(!row)return fail();
    try{const slot=JSON.parse(row.payload_json);validateAdvertising({enabled:false,reviewed:false,slots:[slot],ads_txt:''},env);if(!providerHosts(env).includes(new URL(slot.script_url).hostname))return fail();return bannerResponse(slot,env);}catch{return fail();}
  }
  if(path.startsWith('/advertising/frame/')){
    const denied=()=>new Response('No disponible.',{status:404,headers:{'Content-Type':'text/plain','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
    if(request.method!=='GET'||!env.DB||env.ADVERTISING_ENABLED!=='true')return denied();
    const token=url.searchParams.get('permit');if(!/^[a-f0-9]{64}$/.test(token||''))return denied();
    const id=path.slice('/advertising/frame/'.length);
    const permit=await env.DB.prepare('DELETE FROM ad_permits WHERE token_hash=? AND slot_id=? AND expires_ms>=? RETURNING slot_id').bind(await hash(token),id,Date.now()).first();if(!permit)return denied();
    const config=await readAdvertising(env);let valid;try{valid=validateAdvertising(config,env);}catch{return denied();}
    const slot=valid.slots.find(s=>s.id===id&&s.enabled);if(!valid.enabled||!slot)return denied();
    return bannerResponse(slot,env);
  }
  return null;
}

function bannerResponse(slot,env){
    const isolated=!!isolatedAdOrigin(env);
    const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))),sources=providerHosts(env).map(h=>'https://'+h).join(' ');
    return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Publicidad</title><style>html,body{margin:0;padding:0;overflow:hidden}</style></head><body><script nonce="${nonce}">window.atOptions=${JSON.stringify({key:slot.key,format:'iframe',width:slot.width,height:slot.height,params:{}})};for(const type of ['load','error'])document.addEventListener(type,event=>{if(event.target.id==='ad-provider')parent.postMessage({type:'pdf-ad-state',state:type==='load'?'loaded':'failed'},${JSON.stringify(isolated?env.APP_ORIGIN:'*')});},true);</script><script id="ad-provider" src="${slot.script_url}"></script></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`sandbox allow-scripts${isolated?' allow-same-origin allow-popups allow-popups-to-escape-sandbox':''}; default-src 'none'; script-src ${isolated?"'self' 'unsafe-inline' 'unsafe-eval'":"'nonce-"+nonce+"'"} ${sources}; img-src ${sources} data:; connect-src ${sources}; frame-src ${isolated?"'self'":''} ${sources}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors ${isolated?env.APP_ORIGIN:"'self'"}`,'Origin-Agent-Cluster':'?1','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Permissions-Policy':'camera=(), microphone=(), geolocation=(), document-domain=()'}});
}
