import {LEGAL_TITLES,legalView,responsibleView} from './legal.js';
import {SITE_DEFAULTS,validateSite,readSeo} from './configuration.js';
import {publicAdvertising,advertisingStatus} from './advertising.js';
import { publicApi,cleanup,contactView } from './public-api.js';
import { adminResponse } from './admin.js';
import { loginView } from './login-view.js';
import { bySlug } from './tools.js';
import { esc, page, catalog, toolView } from './views.js';
const DEFAULT_SITE={brand:'PDF al Instante',description:'Utilidades para documentos de escuela, trabajo y trámites.',public_origin:null};
const CSP="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; font-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'self'; frame-ancestors 'none'";
function response(body,status=200,type='text/html; charset=utf-8') {
  return new Response(body,{status,headers:{'Content-Type':type,'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
}
const json=(data,status=200)=>response(JSON.stringify(data),status,'application/json; charset=utf-8');
async function getSite(env){
  if(!env.DB)return DEFAULT_SITE;
  const row=await env.DB.prepare('SELECT value_json FROM settings WHERE key = ?').bind('site').first();
  const config=row?JSON.parse(row.value_json):{};
  let public_origin=null;
  try {const url=new URL(config.public_origin);if(url.protocol==='https:'&&!url.username&&!url.password)public_origin=url.origin;}catch{}
  const normalized=validateSite({...SITE_DEFAULTS,...config,public_origin});return {...normalized,indexable:!!public_origin&&env.INDEXING_ENABLED==='true'};
}
const infoPages=LEGAL_TITLES;

export default {async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/advertising/status'&&['GET','HEAD'].includes(request.method)){try{return json(await advertisingStatus(env));}catch{return json({enabled:false});}}
  if(path==='/ads.txt'||path==='/api/advertising'||path.startsWith('/advertising/frame/')||path.startsWith('/advertising/preview/')){try{const r=await publicAdvertising(request,env);if(r){r.headers.set('Cache-Control','no-store');r.headers.set('X-Robots-Tag','noindex, nofollow');r.headers.set('X-Content-Type-Options','nosniff');return r;}}catch{return json({error:'Publicidad no disponible.'},503);}}
  if(env.AUTH&&path==='/admin/login'&&['GET','HEAD'].includes(request.method)){const r=response(page({brand:'PDF al Instante'},'Iniciar sesión','Acceso del propietario.',loginView,{path:'/admin'}));return request.method==='HEAD'?new Response(null,{headers:r.headers}):r;}
  if(env.AUTH&&['/api/auth/login','/api/auth/logout'].includes(path)){const r=await env.AUTH.endpoint(request);const secured=response(r.body,r.status,r.headers.get('Content-Type'));if(r.headers.has('Set-Cookie'))secured.headers.set('Set-Cookie',r.headers.get('Set-Cookie'));return secured;}
  if(path==='/admin'||path.startsWith('/admin/')||path.startsWith('/api/admin/')){const r=await adminResponse(request,env);if(env.AUTH&&path==='/admin'&&r.status===401){const redirect=response(null,303);redirect.headers.set('Location','/admin/login');return redirect;}const secured=response(r.body,r.status,r.headers.get('Content-Type'));if(r.headers.has('Content-Disposition'))secured.headers.set('Content-Disposition',r.headers.get('Content-Disposition'));return request.method==='HEAD'?new Response(null,{status:secured.status,headers:secured.headers}):secured;}
  if(['/api/contact','/api/contact/challenge','/api/metrics'].includes(path)){const r=await publicApi(request,env);const secured=response(r.body,r.status,r.headers.get('Content-Type'));if(r.headers.has('Allow'))secured.headers.set('Allow',r.headers.get('Allow'));return secured;}
  if(!['GET','HEAD'].includes(request.method)){const r=json({error:'Método no permitido.'},405);r.headers.set('Allow','GET, HEAD');return r;}
  let result,indexable=false;
  try {
    if(path.startsWith('/assets/')||path==='/styles.css'||path==='/THIRD_PARTY_NOTICES.txt'||path==='/favicon.svg'){
      if(!env.ASSETS)return response('Recurso no encontrado',404,'text/plain; charset=utf-8');
      const asset=await env.ASSETS.fetch(request);result=new Response(asset.body,asset);
      result.headers.set('X-Content-Type-Options','nosniff');result.headers.set('X-Robots-Tag','noindex');
    } else if(path==='/api/health'){
      if(!env.DB)result=json({status:'unavailable',database:'missing_binding'},503);
      else{const row=await env.DB.prepare('SELECT value_json FROM settings WHERE key = ?').bind('site').first();result=json({status:row?'ok':'unavailable',database:row?'ready':'missing_seed'},row?200:503);}
    } else if(path==='/admin'||path.startsWith('/admin/')||path.startsWith('/api/admin'))result=json({error:'Administración deshabilitada hasta configurar autenticación y autorización de propietario.'},503);
    else if(path==='/robots.txt'){const site=await getSite(env);result=response(site.indexable?`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${site.public_origin}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n',200,'text/plain; charset=utf-8');}
    else if(path==='/imagenes-a-pdf'||path==='/pdf-a-imagenes'){result=response(null,301);result.headers.set('Location',path==='/imagenes-a-pdf'?'/jpg-a-pdf':'/pdf-a-jpg');}
    else if(path.endsWith('/')&&path!=='/'){result=response(null,301);result.headers.set('Location',path.replace(/\/+$/,'')+url.search);}
    else {
      const site=await getSite(env),tool=bySlug[path.slice(1)];
      const states=env.DB?(await env.DB.prepare('SELECT slug,status FROM tools').all()).results:[];
      const unavailable=states.filter(t=>t.status!=='published').map(t=>t.slug);
      const visible=Object.values(bySlug).filter(t=>!unavailable.includes(t.slug));
      indexable=site.indexable;
      if(site.indexable&&url.origin!==site.public_origin){const redirect=response(null,301);redirect.headers.set('Location',site.public_origin+path+url.search);return redirect;}
      if(path==='/sitemap.xml'){const guides=env.DB?(await env.DB.prepare("SELECT slug,updated_at FROM pages WHERE status='published' AND slug LIKE 'guias/%'").all()).results:[];const paths=['/','/herramientas','/guias','/contacto',...visible.map(t=>'/'+t.slug),...Object.keys(infoPages).map(p=>'/'+p),...guides.map(g=>'/'+g.slug)];result=site.public_origin?response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${esc(site.public_origin+p)}</loc>${guides.find(g=>'/'+g.slug===p)?`<lastmod>${esc(guides.find(g=>'/'+g.slug===p).updated_at)}</lastmod>`:''}</url>`).join('')}</urlset>`,200,'application/xml; charset=utf-8'):response('Configura el dominio principal antes de generar el sitemap.',503,'text/plain; charset=utf-8');}
      else if(path==='/')result=response(page(site,'Herramientas PDF en tu navegador',site.description,`<p class="eyebrow">Archivos bajo tu control</p><h1>Tu próximo documento, listo para usar.</h1><p class="intro">Une, organiza y convierte documentos en tu dispositivo. Elige una tarea para comenzar; sin registro y sin subir tus archivos.</p>${catalog(visible)}`,{script:true}));
      else if(path==='/contacto')result=response(page(site,'Contacto','Envía una consulta al responsable.',responsibleView(site)+contactView,{path}));
      else if(path==='/herramientas')result=response(page(site,'Todas las herramientas','Elige una herramienta para PDF e imágenes.',`<h1>Herramientas para tus documentos</h1>${catalog(visible)}`,{path,script:true}));
      else if(tool&&unavailable.includes(tool.slug))result=response(page(site,tool.name,tool.description,`<h1>${esc(tool.name)}</h1><p>Esta herramienta no está disponible en este momento.</p>`,{path}),states.find(t=>t.slug===tool.slug)?.status==='maintenance'?503:404);
      else if(tool){const seo=await readSeo(env.DB,tool.slug);result=response(page(site,seo?.title||tool.name,seo?.description||tool.description,toolView({...tool,name:seo?.heading||tool.name,description:seo?.intro||tool.description,steps:seo?.instructions||tool.steps,faq:seo?.faq}),{path,script:true}));}
      else if(path==='/guias'){const guides=env.DB?(await env.DB.prepare("SELECT slug,title,description FROM pages WHERE status='published' AND slug LIKE 'guias/%' ORDER BY title").all()).results:[];result=response(page(site,'Guías','Guías publicadas para trabajar con documentos.',`<h1>Guías</h1>${guides.length?guides.map(g=>`<article class="card"><h2><a href="/${esc(g.slug)}">${esc(g.title)}</a></h2><p>${esc(g.description)}</p></article>`).join(''):'<p>Todavía no hay guías publicadas.</p>'}`,{path}));}
      else if(path.startsWith('/guias/')&&env.DB){const guide=await env.DB.prepare("SELECT title,description,body_text FROM pages WHERE slug=? AND status='published'").bind(path.slice(1)).first();result=guide?response(page(site,guide.title,guide.description,`<h1>${esc(guide.title)}</h1><section class="panel">${guide.body_text.split('\n').map(p=>`<p>${esc(p)}</p>`).join('')}</section>`,{path})):response(page(site,'Guía no encontrada','Guía no disponible.','<h1>Guía no encontrada</h1>'),404);}
      else if(Object.hasOwn(infoPages,path.slice(1))){const slug=path.slice(1),title=infoPages[slug];result=response(page(site,title,title+' de '+site.brand,legalView(slug,site),{path}));}
      else result=response(page(site,'Página no encontrada','La dirección solicitada no existe.','<h1>Página no encontrada</h1><p>Consulta las herramientas disponibles.</p><a href="/herramientas">Ver herramientas</a>'),404);
    }
  }catch{result=json({error:'Servicio temporalmente no disponible.'},503);}
  if(indexable&&result.status===200&&result.headers.get('Content-Type')?.startsWith('text/html'))result.headers.set('X-Robots-Tag','index, follow');
  return request.method==='HEAD'?new Response(null,{status:result.status,headers:result.headers}):result;
},async scheduled(controller,env,ctx){ctx.waitUntil(cleanup(env));}};
