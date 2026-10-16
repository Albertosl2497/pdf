import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
test('D1 persiste configuración, guías, mantenimiento y auditoría; API rechaza CSRF',async()=>{
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='integration-key';
  const claims={iss:'https://integration.cloudflareaccess.com',aud:['test-aud'],email:'owner@example.test',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300};
  const body=encode({alg:'RS256',kid:jwk.kid})+'.'+encode(claims);const token=body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(body))).toString('base64url');
  const bundle=await build({entryPoints:['src/index.js'],bundle:true,write:false,format:'esm',platform:'browser'});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:{DB:'admin-test'},bindings:{ACCESS_TEAM_DOMAIN:'integration.cloudflareaccess.com',ACCESS_AUD:'test-aud',OWNER_EMAIL:'owner@example.test'},outboundService:async request=>{assert.equal(new URL(request.url).hostname,'integration.cloudflareaccess.com');return Response.json({keys:[jwk]});}}));
  try {
    const db=await mf.getD1Database('DB');const schema=await readFile('schema.sql','utf8');
    for(const sql of schema.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
    const call=(path,method='GET',data,origin='https://example.test')=>mf.dispatchFetch('https://example.test'+path,{method,headers:{'Cf-Access-Jwt-Assertion':token,Origin:origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
    assert.equal((await call('/admin')).status,200);
    const site={brand:'Marca guardada',description:'Descripción persistente',public_origin:'https://pdf.example.test'};
    assert.equal((await call('/api/admin/site','PUT',site,'https://evil.test')).status,403);
    assert.equal((await call('/api/admin/site','PUT',site)).status,200);
    const configuration=await (await call('/api/admin/config')).json();assert.equal(JSON.parse(configuration.settings.find(s=>s.key==='site').value_json).brand,site.brand);
    assert.match(await (await mf.dispatchFetch('https://example.test/')).text(),/Marca guardada/);
    assert.equal((await call('/api/admin/page','PUT',{slug:'guias/primera-guia',title:'Guía guardada',description:'Guía de prueba',body_text:'Contenido <script>alert(1)</script>',status:'published'})).status,200);
    const guide=await mf.dispatchFetch('https://example.test/guias/primera-guia');assert.equal(guide.status,200);assert.match(await guide.text(),/&lt;script&gt;/);
    assert.equal((await call('/api/admin/tool','PUT',{slug:'unir-pdf',status:'maintenance'})).status,200);
    assert.equal((await mf.dispatchFetch('https://example.test/unir-pdf')).status,503);
    const listing=await (await mf.dispatchFetch('https://example.test/herramientas')).text();assert.ok(!listing.includes('href="/unir-pdf"'));
    assert.equal((await db.prepare('SELECT count(*) AS n FROM audit_log').first()).n,3);
    assert.equal((await mf.dispatchFetch('https://example.test/api/admin/config')).status,401);
  }finally{await mf.dispose();}
});
