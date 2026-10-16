import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './support/runtime.js';
import {validateSite,validateSeo,SITE_DEFAULTS} from '../src/configuration.js';
const seo={slug:'unir-pdf',title:'Combina documentos al instante',description:'Ordena tus PDF y crea un documento.',heading:'Combinar documentos',intro:'Contenido propio <script>alert(1)</script>',instructions:['Elegir documentos','Revisar el orden','Descargar resultado'],faq:[{question:'¿Se suben mis archivos?',answer:'No, se procesan en el navegador.'}]};
test('marca valida colores con contraste y rechaza logos activos/externos',()=>{assert.equal(validateSite(SITE_DEFAULTS).brand,'PDF al Instante');for(const bad of [{primary_color:'#ffffff'},{accent_color:'red;display:none'},{logo_data:'data:image/svg+xml;base64,PHN2Zz4='},{logo_data:'https://tracking.example.test/logo.png'}])assert.throws(()=>validateSite({...SITE_DEFAULTS,...bad}));assert.equal(validateSeo(seo).faq.length,1);assert.throws(()=>validateSeo({...seo,slug:'herramienta-falsa'}));});
test('SEO y tema persisten y se reflejan en HTML directo sin ejecutar etiquetas',async()=>{
 const {mf,call}=await runtime();try{
 assert.equal((await call('/api/admin/site',{method:'PUT',admin:true,data:{...SITE_DEFAULTS,brand:'PDF al Instante',primary_color:'#123456',accent_color:'#00776f'}})).status,200);
 assert.equal((await call('/api/admin/seo',{method:'PUT',admin:true,data:seo})).status,200);
 const html=await (await call('/unir-pdf')).text();assert.match(html,/<title>Combina documentos al instante \| PDF al Instante/);assert.match(html,/<h1>Combinar documentos<\/h1>/);assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(html.includes('--blue:#123456'));assert.ok(html.includes('¿Se suben mis archivos?'));
 const stored=await (await call('/api/admin/seo?slug=unir-pdf',{admin:true})).json();assert.equal(stored.seo.title,seo.title);
 assert.equal((await call('/api/admin/seo?slug=unir-pdf')).status,401);
 }finally{await mf.dispose();}
});
test('restauración: revisión, confirmación, transacción, copia previa y conservación de acceso/datos',async()=>{
 const {mf,db,call}=await runtime();try{
 await call('/api/admin/seo',{method:'PUT',admin:true,data:seo});
 const exported=await (await call('/api/admin/export',{admin:true})).json();assert.equal(exported.version,2);assert.ok(!JSON.stringify(exported).includes('owner_account'));
 await call('/api/admin/site',{method:'PUT',admin:true,data:{...SITE_DEFAULTS,brand:'Marca a reemplazar'}});
 await call('/api/admin/page',{method:'PUT',admin:true,data:{slug:'guias/actual',title:'Guía actual',description:'Contenido actual',body_text:'Texto de la guía',status:'published'}});
 await db.prepare("INSERT INTO contact_messages VALUES('keep','test@example.test','Consulta conservada','new',strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
 const preview=async data=>call('/api/admin/config/restore/preview',{method:'POST',admin:true,data});
 assert.equal((await call('/api/admin/config/restore/preview',{method:'POST',data:exported})).status,401);
 const review=await (await preview(exported)).json();assert.ok(review.token);assert.equal(review.summary.pages,0);
 const apply=data=>call('/api/admin/config/restore/apply',{method:'POST',admin:true,data});
 assert.equal((await apply({token:review.token,confirmation:'NO'})).status,400);
 assert.equal((await apply({token:review.token,confirmation:'RESTAURAR'})).status,200);
 assert.equal((await apply({token:review.token,confirmation:'RESTAURAR'})).status,409);
 assert.equal((await db.prepare('SELECT count(*) n FROM pages').first()).n,0);
 assert.equal((await db.prepare('SELECT count(*) n FROM contact_messages').first()).n,1);
 const history=await (await call('/api/admin/config/history',{admin:true})).json();assert.equal(history.backups.length,1);
 const backup=await (await call('/api/admin/config/history/'+history.backups[0].id,{admin:true})).json();assert.equal(JSON.parse(backup.settings.find(s=>s.key==='site').value_json).brand,'Marca a reemplazar');
 assert.equal((await call('/api/admin/config',{admin:true})).status,200);
 const newReview=await (await preview(exported)).json();await call('/api/admin/site',{method:'PUT',admin:true,data:{...SITE_DEFAULTS,brand:'Cambio concurrente'}});assert.equal((await apply({token:newReview.token,confirmation:'RESTAURAR'})).status,409);
 assert.equal((await preview({...exported,pages:[{slug:'admin',title:'Inválida'}]})).status,400);
 }finally{await mf.dispose();}
});
