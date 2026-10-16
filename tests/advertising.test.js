import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './support/runtime.js';
import {validateAdvertising,validateAdsTxt} from '../src/advertising.js';
const key='a'.repeat(32);
const config=()=>({enabled:true,reviewed:true,ads_txt:'ads.example.test, seller-test, DIRECT\n',slots:[{id:'footer-mobile',placement:'footer',device:'all',width:300,height:250,key,script_url:`https://ads.example.test/${key}/invoke.js`,enabled:true}]});
const bindings={ADVERTISING_ENABLED:'true',AD_PROVIDER_HOSTS:'ads.example.test'};
test('publicidad exige permiso del servidor, dominio exacto, revisión y formato seguro',()=>{
 assert.doesNotThrow(()=>validateAdvertising(config(),bindings));
 for(const env of [{},{ADVERTISING_ENABLED:'true'}, {...bindings,AD_PROVIDER_HOSTS:'other.example.test'}])assert.throws(()=>validateAdvertising(config(),env));
 for(const change of [{reviewed:false},{slots:[{...config().slots[0],script_url:'javascript:alert(1)'}]},{slots:[{...config().slots[0],script_url:`https://evil.test/${key}/invoke.js`}]},{slots:[{...config().slots[0],width:10000}]},{slots:[{...config().slots[0],placement:'download'}]}])assert.throws(()=>validateAdvertising({...config(),...change},bindings));
 assert.equal(validateAdsTxt(config().ads_txt),config().ads_txt);assert.throws(()=>validateAdsTxt('<script>alert(1)</script>'));
});
test('API publicitaria cerrada por defecto, sin anuncios ni ads.txt inventados',async()=>{
 const {mf,call}=await runtime();try{
 assert.equal((await call('/ads.txt')).status,404);
 assert.equal((await call('/api/admin/advertising')).status,401);
 const data={consent:true,page:'/unir-pdf',device:'mobile'};
 assert.deepEqual((await (await call('/api/advertising',{method:'POST',data})).json()).slots,[]);
 assert.equal((await call('/api/advertising',{method:'POST',data:{...data,consent:false}})).status,400);
 assert.equal((await call('/api/advertising',{method:'POST',data,origin:'https://evil.test'})).status,403);
 assert.equal((await call('/advertising/frame/footer-mobile')).status,404);
 }finally{await mf.dispose();}
});
test('configuración persiste, ads.txt exacto, permiso de un uso y frame aislado',async()=>{
 const {mf,call,db}=await runtime(bindings);try{
 const save=data=>call('/api/admin/advertising',{method:'PUT',admin:true,data});
 assert.equal((await save(config())).status,200);
 assert.equal((await (await call('/api/admin/advertising',{admin:true})).json()).config.slots[0].key,key);
 assert.equal(await (await call('/ads.txt')).text(),config().ads_txt);
 const request={method:'POST',data:{consent:true,page:'/unir-pdf',device:'mobile'}};
 const approved=await (await call('/api/advertising',request)).json();assert.equal(approved.slots.length,1);
 const frame=await call(approved.slots[0].src);assert.equal(frame.status,200);
 const csp=frame.headers.get('Content-Security-Policy');assert.match(csp,/sandbox allow-scripts;/);assert.ok(!csp.includes('allow-same-origin'));assert.match(csp,/https:\/\/ads.example.test/);assert.equal(frame.headers.get('Referrer-Policy'),'no-referrer');
 const html=await frame.text();assert.match(html,/window.atOptions=/);assert.ok(!html.includes('seller-test'));
 assert.equal((await call(approved.slots[0].src)).status,404);
 const pending=await (await call('/api/advertising',request)).json();assert.equal((await call('/api/admin/advertising/disable',{method:'PUT',admin:true,data:{}})).status,200);
 assert.equal((await call(pending.slots[0].src)).status,404);
 assert.equal((await (await call('/api/advertising/status')).json()).enabled,false);
 assert.equal((await db.prepare('SELECT count(*) n FROM ad_permits').first()).n,0);
 assert.equal((await call('/api/advertising',{...request,data:{...request.data,page:'/contacto'}})).status,400);
 assert.equal((await call('/api/advertising',{...request,data:{...request.data,filename:'privado.pdf'}})).status,400);
 }finally{await mf.dispose();}
});
test('preview privada requiere propietario y consentimiento, sin activar anuncios públicos',async()=>{
 const {mf,call}=await runtime({...bindings,ADVERTISING_ENABLED:'false'});try{
 assert.equal((await call('/api/admin/advertising',{method:'PUT',admin:true,data:{...config(),enabled:false}})).status,200);
 const request={method:'POST',data:{slot_id:'footer-mobile',consent:true}};
 assert.equal((await call('/api/admin/advertising/preview',request)).status,401);
 assert.equal((await call('/api/admin/advertising/preview',{...request,admin:true,data:{...request.data,consent:false}})).status,400);
 const preview=await (await call('/api/admin/advertising/preview',{...request,admin:true})).json();assert.ok(preview.src);
 const frame=await call(preview.src);assert.equal(frame.status,200);assert.match(frame.headers.get('Content-Security-Policy'),/sandbox allow-scripts/);
 assert.equal((await call(preview.src)).status,404);
 assert.equal((await (await call('/api/advertising/status')).json()).enabled,false);
 }finally{await mf.dispose();}
});
