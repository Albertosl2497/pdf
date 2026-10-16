import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatedAdOrigin,frameDescriptor} from '../src/ad-origin.js';
import {runtime} from './support/runtime.js';
const env={APP_ORIGIN:'https://pdf.example.test',AD_ORIGIN:'https://ads.example.test'};
test('origen publicitario exige hostname distinto y HTTPS sin rutas ni credenciales',()=>{
 assert.equal(isolatedAdOrigin(env),'https://ads.example.test');
 for(const AD_ORIGIN of ['https://pdf.example.test','https://pdf.example.test:444','http://ads.example.test','https://ads.example.test/path','https://user@ads.example.test','javascript:alert(1)'])assert.throws(()=>isolatedAdOrigin({...env,AD_ORIGIN}));
 assert.equal(isolatedAdOrigin({}),null);
 assert.deepEqual(frameDescriptor('/advertising/frame/x',env),{src:'https://ads.example.test/advertising/frame/x',isolated:true});
});
test('el marco ampliado solo se sirve desde el origen separado y conserva tokens de un uso',async()=>{
 const key='a'.repeat(32),{mf,call}=await runtime({...env,AD_PROVIDER_HOSTS:'vendor.example.test'});
 try{
 const data={enabled:false,reviewed:false,ads_txt:'',slots:[{id:'test',placement:'footer',device:'all',width:300,height:250,key,script_url:`https://vendor.example.test/22/${key}`,enabled:true}]};
 assert.equal((await call('/api/admin/advertising',{admin:true,method:'PUT',data})).status,200);
 const descriptor=await (await call('/api/admin/advertising/preview',{admin:true,method:'POST',data:{consent:true,slot_id:'test'}})).json();
 assert.equal(descriptor.isolated,true);assert.ok(descriptor.src.startsWith(env.AD_ORIGIN));
 const url=new URL(descriptor.src);assert.equal((await call(url.pathname+url.search)).status,404);
 const frame=await mf.dispatchFetch(descriptor.src);assert.equal(frame.status,200);
 const csp=frame.headers.get('Content-Security-Policy');assert.ok(csp.includes('allow-same-origin'));assert.ok(csp.includes("'unsafe-inline' 'unsafe-eval'"));assert.ok(csp.includes('frame-ancestors '+env.APP_ORIGIN));
 assert.ok(!frame.headers.has('Access-Control-Allow-Origin'));assert.ok(!frame.headers.has('Set-Cookie'));
 assert.equal((await mf.dispatchFetch(descriptor.src)).status,404);
 }finally{await mf.dispose();}
});
