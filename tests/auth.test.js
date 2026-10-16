import test from 'node:test';
import assert from 'node:assert/strict';
import {authorize} from '../src/auth.js';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test-key';
const config={ACCESS_TEAM_DOMAIN:'pdf-test.cloudflareaccess.com',ACCESS_AUD:'test-aud',OWNER_EMAIL:'owner@example.test'};
async function token(overrides={},header={alg:'RS256',kid:'test-key'}){const body=encode(header)+'.'+encode({iss:'https://pdf-test.cloudflareaccess.com',aud:['test-aud'],email:'owner@example.test',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,...overrides});return body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(body))).toString('base64url');}
const request=value=>new Request('https://example.test/admin',{headers:value?{'Cf-Access-Jwt-Assertion':value}:{}});
const fetchKeys=async url=>{assert.equal(url,'https://pdf-test.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
test('administración permanece cerrada sin configuración ni token',async()=>{assert.equal((await authorize(request(),{})).status,503);assert.equal((await authorize(request(),config)).status,401);});
test('propietario firmado aceptado; otro usuario, audiencia, emisor, caducidad o firma rechazados',async()=>{assert.equal((await authorize(request(await token()),config,fetchKeys)).status,200);assert.equal((await authorize(request(await token({email:'intruso@example.test'})),config,fetchKeys)).status,403);for(const payload of [{aud:['otra']},{iss:'https://attacker.test'},{exp:1},{iat:Date.now()/1000+3600}])assert.equal((await authorize(request(await token(payload)),config,fetchKeys)).status,401);const valid=await token();assert.equal((await authorize(request(valid.slice(0,-8)+'AAAAAAAA'),config,fetchKeys)).status,401);assert.equal((await authorize(request(await token({},{alg:'none',kid:'test-key'})),config,fetchKeys)).status,401);});
