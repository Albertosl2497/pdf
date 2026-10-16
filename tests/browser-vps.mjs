import {chromium} from 'playwright-core';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {startServer} from '../src/node/server.js';
import {setOwner} from '../src/node/session.js';
const dir=await mkdtemp(join(tmpdir(),'pdf-ui-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin=`http://127.0.0.1:${port}`,app=await startServer({dataDir:dir,origin,port});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 await setOwner(app.db,'owner@example.test','contraseña sintética para navegador 123');
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/admin');await page.locator('#email').fill('owner@example.test');await page.locator('#password').fill('contraseña sintética para navegador 123');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForURL('**/admin');await page.waitForFunction(()=>document.getElementById('brand').value.length>0);
 await page.locator('#responsible-name').fill('Responsable sintético');await page.locator('#contact-email').fill('contacto@example.test');await page.locator('#responsible-country').fill('México');
 await page.locator('#brand').fill('Marca de prueba VPS');await page.locator('#save-site').click();await page.waitForFunction(()=>document.querySelector('#admin-status').textContent.includes('Guardado'));await page.reload();await page.waitForFunction(()=>document.getElementById('brand').value==='Marca de prueba VPS');
 assert.equal(await page.locator('#contact-email').inputValue(),'contacto@example.test');
 const legal=await (await page.request.get(origin+'/privacidad')).text();assert.ok(legal.includes('Responsable sintético'));assert.ok(legal.includes('contacto@example.test'));
 const saved=await (await page.request.get(origin+'/api/admin/export')).json();
 await page.locator('#primary-color').fill('#123456');await page.locator('#logo-file').setInputFiles('tests/fixtures/transparencia.png');await page.locator('#save-site').click();await page.waitForFunction(()=>document.querySelector('#admin-status').textContent.includes('Guardado'));
 await page.locator('#seo-title').fill('PDF al Instante: combinar documentos');await page.locator('#seo-heading').fill('Combinar documentos ahora');await page.locator('#save-seo').click();await page.waitForFunction(()=>document.querySelector('#seo-status').textContent.includes('guardados'));
 const publicPage=await browser.newPage();await publicPage.goto(origin+'/unir-pdf');assert.equal(await publicPage.locator('h1').innerText(),'Combinar documentos ahora');assert.ok((await publicPage.title()).includes('PDF al Instante: combinar documentos'));assert.ok(await publicPage.locator('.brand img').count());await publicPage.close();
 await page.locator('#restore-file').setInputFiles({name:'configuration.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.locator('#review-restore').click();await page.waitForFunction(()=>document.querySelector('#restore-summary').textContent.includes('Se reemplazará'));assert.equal(await page.locator('#apply-restore').isDisabled(),true);await page.locator('#restore-confirmation').fill('RESTAURAR');await page.locator('#apply-restore').click();await page.waitForFunction(()=>document.querySelector('#restore-status').textContent.includes('restaurada'));await page.waitForFunction(()=>document.querySelector('#seo-title').value==='Unir PDF');assert.equal((await page.request.get(origin+'/api/admin/config/history')).status(),200);
 await page.locator('#logout').click();await page.waitForURL('**/admin/login');const response=await page.request.get(origin+'/api/admin/config');assert.equal(response.status(),401);assert.deepEqual(errors,[]);
 console.log('VPS: login, marca/logo/colores, SEO público, restauración revisada, logout y revocación aprobados.');
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
