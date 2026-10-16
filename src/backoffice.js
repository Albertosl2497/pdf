import {json,readJson} from './http.js';
import {bySlug} from './tools.js';
export const backofficeView=`<section class="panel"><h2>Consultas de contacto</h2><p>Consultas guardadas en la bandeja privada, sin envío automático de correo. Se eliminan después de 30 días en la siguiente limpieza diaria.</p><button id="refresh-messages">Actualizar bandeja</button><div id="contact-inbox"></div></section><section class="panel"><h2>Estadísticas agregadas</h2><p>Solo incluyen eventos de quienes activaron estadísticas opcionales. No representan visitantes únicos y pueden contener repeticiones o eventos automatizados.</p><div class="options-grid"><div><label for="stats-from">Desde (UTC)</label><input id="stats-from" type="date"></div><div><label for="stats-to">Hasta (UTC)</label><input id="stats-to" type="date"></div></div><label for="stats-tool">Herramienta o página</label><select id="stats-tool"><option value="">Todas</option>${Object.values(bySlug).map(t=>`<option value="${t.slug}">${t.name}</option>`).join('')}</select><div class="actions"><button id="refresh-stats">Consultar</button><button id="export-stats">Exportar CSV</button></div><div id="statistics"></div></section>`;
function filters(url){
  const to=url.searchParams.get('to')||new Date().toISOString().slice(0,10),from=url.searchParams.get('from')||new Date(Date.now()-29*86400000).toISOString().slice(0,10),tool=url.searchParams.get('tool')||'';
  for(const day of [from,to])if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw Error('Fechas no válidas.');
  if(from>to||(Date.parse(to)-Date.parse(from))/86400000>366)throw Error('Selecciona un periodo de hasta 366 días.');
  if(tool&&!Object.hasOwn(bySlug,tool)&&!['inicio','herramientas','guias','contacto','privacidad','cookies','terminos','sobre-nosotros'].includes(tool))throw Error('Filtro no válido.');
  return {from,to,tool};
}
export async function backoffice(request,env,auth){
  const url=new URL(request.url),path=url.pathname;
  if(['GET','HEAD'].includes(request.method)&&path==='/api/admin/messages'){
    const result=await env.DB.prepare("SELECT id,email,message,status,created_at FROM contact_messages WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') ORDER BY created_at DESC LIMIT 100").all();return json({messages:result.results});
  }
  if(['GET','HEAD'].includes(request.method)&&['/api/admin/statistics','/api/admin/statistics.csv'].includes(path)){
    try{
      const {from,to,tool}=filters(url);
      const rows=(await env.DB.prepare('SELECT day,tool_slug,event,count,duration_ms_total FROM usage_daily WHERE day>=? AND day<=? AND (?=\'\' OR tool_slug=?) ORDER BY day,tool_slug,event').bind(from,to,tool,tool).all()).results;
      if(path.endsWith('.csv'))return new Response('\ufeffday,tool,event,count,duration_ms_total\r\n'+rows.map(r=>[r.day,r.tool_slug,r.event,r.count,r.duration_ms_total].join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="estadisticas.csv"'}});
      return json({from,to,rows});
    }catch{return json({error:'Revisa fechas y filtro; el periodo máximo es de 366 días.'},400);}
  }
  if(path==='/api/admin/message'&&request.method==='PUT'){
    if(request.headers.get('Origin')!==url.origin)return json({error:'Origen no permitido.'},403);
    try{
      const data=await readJson(request,1024);if(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id)||!['read','delete'].includes(data.action))return json({error:'Operación no válida.'},400);
      const change=data.action==='delete'?env.DB.prepare('DELETE FROM contact_messages WHERE id=?').bind(data.id):env.DB.prepare("UPDATE contact_messages SET status='read' WHERE id=?").bind(data.id);
      await env.DB.batch([change,env.DB.prepare('INSERT INTO audit_log(actor,action) VALUES(?,?)').bind(auth.email,'contact.'+data.action)]);return json({ok:true});
    }catch{return json({error:'No se pudo actualizar la consulta.'},400);}
  }
  return null;
}
