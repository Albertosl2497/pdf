import {responsibleFields} from './legal.js';
import {validateSite,validateSeo,seoStatement,readSeo} from './configuration.js';
import {configTransfer,exportConfiguration} from './config-transfer.js';
import {themeFields,seoView,restoreView} from './configuration-view.js';
import {adminAdvertising} from './advertising.js';
import {advertisingView} from './advertising-view.js';
import {readJson} from './http.js';
import {backoffice,backofficeView} from './backoffice.js';
import { authorize } from './auth.js';
import { page } from './views.js';
import { bySlug } from './tools.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
function text(value,max=200){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Texto vacío o demasiado largo.');return value.trim();}
export async function adminResponse(request,env){
  const auth=await authorize(request,env);if(auth.status!==200)return json({error:auth.error},auth.status);
  if(!env.DB)return json({error:'Base de datos no configurada.'},503);
  const transfer=await configTransfer(request,env,auth);if(transfer)return transfer;
  const adResponse=await adminAdvertising(request,env,auth);if(adResponse)return adResponse;
  const extra=await backoffice(request,env,auth);if(extra)return extra;
  const path=new URL(request.url).pathname;
  if(request.method==='GET'||request.method==='HEAD') {
    if(path==='/admin')return new Response(page({brand:'PDF al Instante'},'Administración','Configuración del propietario.',`<h1>Administración</h1><p>Acceso de propietario verificado en servidor.</p>${env.AUTH?'<button id="logout" type="button">Cerrar sesión</button><script type="module" src="/assets/login.js"></script>':''}<p id="admin-status" role="status"></p><section class="panel"><h2>Identidad del sitio</h2><label for="brand">Marca</label><input id="brand" maxlength="100"><label for="description">Descripción</label><input id="description" maxlength="500"><label for="public-origin">Dominio principal (https)</label><input id="public-origin" type="url">${themeFields}${responsibleFields}<button id="save-site">Guardar configuración</button></section><section class="panel"><h2>Disponibilidad de herramientas</h2><div id="tool-settings"></div></section>${seoView}<section class="panel"><h2>Guías y páginas</h2><p>El contenido se guarda como texto, sin HTML ni scripts.</p><label for="page-slug">Ruta (por ejemplo guias/unir-documentos)</label><input id="page-slug"><label for="page-title">Título</label><input id="page-title"><label for="page-description">Descripción</label><input id="page-description"><label for="page-body">Contenido</label><textarea id="page-body" rows="10" style="width:100%"></textarea><label for="page-state">Estado</label><select id="page-state"><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select><button id="save-page">Guardar página</button><div id="saved-pages"></div></section>${backofficeView}${advertisingView}<section class="panel"><h2>Medición externa</h2><p>Analytics y Search Console pendientes de datos reales. No se muestran ingresos ni posiciones inventadas.</p></section><section class="panel"><h2>Copia de configuración</h2><button id="export">Exportar configuración y contenido</button><p>No incluye credenciales ni documentos.</p></section>${restoreView}<script type="module" src="/assets/admin.js"></script>`,{path:'/admin'}),{headers:{'Content-Type':'text/html; charset=utf-8'}});
    if(path==='/api/admin/export')return json(await exportConfiguration(env.DB));
    if(path==='/api/admin/seo'){const slug=new URL(request.url).searchParams.get('slug');if(!Object.hasOwn(bySlug,slug))return json({error:'Herramienta no válida.'},400);return json({seo:await readSeo(env.DB,slug)});}
    if(path==='/api/admin/config'){
      const [settings,pages,tools]=await Promise.all([env.DB.prepare('SELECT key,value_json,updated_at FROM settings').all(),env.DB.prepare('SELECT * FROM pages ORDER BY slug').all(),env.DB.prepare('SELECT slug,name,status FROM tools ORDER BY slug').all()]);
      return json({version:1,settings:settings.results,pages:pages.results,tools:tools.results});
    }
    return json({error:'No encontrado.'},404);
  }
  if(request.method!=='PUT')return json({error:'Método no permitido.'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origen no permitido.'},403);
  try{
    const data=await readJson(request);let statement,action;
    if(path==='/api/admin/site'){
      const config=validateSite(data);
      statement=env.DB.prepare("INSERT INTO settings(key,value_json) VALUES('site',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(JSON.stringify(config));action='site.update';
    }else if(path==='/api/admin/seo'){const seo=validateSeo(data);statement=seoStatement(env.DB,seo);action='seo.'+seo.slug+'.update';
    }else if(path==='/api/admin/tool'){
      if(!bySlug[data.slug]||!['published','maintenance','draft'].includes(data.status))throw Error('Herramienta o estado no válido.');
      statement=env.DB.prepare('INSERT INTO tools(slug,name,description,engine,status,verified_at) VALUES(?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET status=excluded.status,updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')').bind(data.slug,bySlug[data.slug].name,bySlug[data.slug].description,'browser-v1',data.status,'2026-10-15T18:28:48Z');action='tool.'+data.slug+'.'+data.status;
    }else if(path==='/api/admin/page'){
      const slug=text(data.slug,120);if(!/^guias\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw Error('La ruta debe comenzar por guias/ y usar letras minúsculas, números y guiones.');
      if(!['draft','published','archived'].includes(data.status))throw Error('Estado no válido.');
      statement=env.DB.prepare("INSERT INTO pages(slug,title,description,body_text,status) VALUES(?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,description=excluded.description,body_text=excluded.body_text,status=excluded.status,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(slug,text(data.title),text(data.description,500),text(data.body_text,20000),data.status);action='page.'+slug+'.'+data.status;
    }else return json({error:'No encontrado.'},404);
    await env.DB.batch([statement,env.DB.prepare('INSERT INTO audit_log(actor,action) VALUES(?,?)').bind(auth.email,action)]);
    return json({ok:true});
  }catch(error){return json({error:/Texto|ruta|origen|HTTPS|Estado|Herramienta|JSON|contenido|32 KB|Marca|Descripción|logo|Logo|responsable|público|país|colores|contraste|SEO|Paso|Pregunta|Respuesta|Introducción|Encabezado|Título/.test(error.message)?error.message:'No se pudo guardar la configuración.'},400);}
}
