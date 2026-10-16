import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
export async function runtime(extraBindings={}){
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='services-test';
  const body=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:'https://services.cloudflareaccess.com',aud:['test-aud'],email:'owner@example.test',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});
  const token=body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(body))).toString('base64url');
  const bundle=await build({entryPoints:['src/index.js'],bundle:true,write:false,format:'esm',platform:'browser'});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:{DB:'service-test'},bindings:{ACCESS_TEAM_DOMAIN:'services.cloudflareaccess.com',ACCESS_AUD:'test-aud',OWNER_EMAIL:'owner@example.test',...extraBindings},outboundService:()=>Response.json({keys:[jwk]})}));
  const db=await mf.getD1Database('DB'),schema=await readFile('schema.sql','utf8');
  for(const sql of schema.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const call=(path,{method='GET',data,admin=false,origin='https://example.test',raw}={})=>mf.dispatchFetch('https://example.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(admin?{'Cf-Access-Jwt-Assertion':token}:{})},body:raw??(data?JSON.stringify(data):undefined)});
  return {mf,db,call};
}
