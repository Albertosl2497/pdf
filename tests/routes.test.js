import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {tools} from '../src/tools.js';
const request=(path,method='GET')=>worker.fetch(new Request('https://example.test'+path,{method}),{});
test('rutas de herramientas entregan contenido propio desde el servidor',async()=>{for(const tool of tools){const r=await request('/'+tool.slug);assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('<h1>'+tool.name+'</h1>'));assert.ok(html.includes('data-mode="'+tool.mode+'"'));assert.ok(html.includes('<meta name="description"'));assert.match(r.headers.get('Content-Security-Policy'),/worker-src 'self'/);}});
test('admin cerrado, 404 reales, aliases y métodos protegidos',async()=>{assert.equal((await request('/no-existe')).status,404);assert.equal((await request('/api/admin/settings')).status,503);assert.equal((await request('/admin')).status,503);assert.equal((await request('/imagenes-a-pdf')).headers.get('Location'),'/jpg-a-pdf');assert.equal((await request('/herramientas/')).status,301);assert.equal((await request('/','POST')).status,405);assert.equal(await (await request('/','HEAD')).text(),'');assert.equal((await request('/api/health')).status,503);});
