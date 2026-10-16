import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './support/runtime.js';
import {SITE_DEFAULTS,validateSite} from '../src/configuration.js';
const profile={responsible_name:'Responsable de prueba <script>alert(1)</script>',contact_email:'contacto@example.test',responsible_country:'México',responsible_address:'Dirección pública de prueba'};
test('responsable público exige datos completos y valida correo sin inventar identidad',()=>{
 assert.equal(validateSite(SITE_DEFAULTS).responsible_name,'');
 for(const bad of [{responsible_name:'Solo nombre'},{...profile,contact_email:'correo incorrecto'},{...profile,contact_email:'test@example.test\nBcc:otro@example.test'},{...profile,responsible_country:''}])assert.throws(()=>validateSite({...SITE_DEFAULTS,...bad}));
 assert.equal(validateSite({...SITE_DEFAULTS,...profile}).contact_email,'contacto@example.test');
});
test('identidad legal persiste, aparece escapada en páginas públicas y se incluye en exportación',async()=>{
 const {mf,call}=await runtime();try{
 const data={...SITE_DEFAULTS,...profile};
 assert.equal((await call('/api/admin/site',{method:'PUT',data})).status,401);
 assert.equal((await call('/api/admin/site',{method:'PUT',admin:true,data,origin:'https://other.test'})).status,403);
 assert.equal((await call('/api/admin/site',{method:'PUT',admin:true,data})).status,200);
 for(const path of ['/privacidad','/cookies','/terminos','/sobre-nosotros','/contacto']){
  const response=await call(path);assert.equal(response.status,200,path);const html=await response.text();assert.ok(html.includes('contacto@example.test'),path);assert.ok(html.includes('México'));assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));
 }
 const privacy=await (await call('/privacidad')).text();assert.ok(privacy.includes('automáticamente'));assert.ok(privacy.includes('Hostinger'));assert.ok(!privacy.includes('pendientes de configuración'));
 const exported=await (await call('/api/admin/export',{admin:true})).json();assert.equal(JSON.parse(exported.settings.find(s=>s.key==='site').value_json).responsible_name,profile.responsible_name);
 const preview=await call('/api/admin/config/restore/preview',{method:'POST',admin:true,data:exported});assert.equal(preview.status,200);
 }finally{await mf.dispose();}
});
