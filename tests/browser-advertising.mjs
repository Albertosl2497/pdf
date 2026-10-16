import {chromium} from 'playwright-core';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {startServer} from '../src/node/server.js';
import {setOwner} from '../src/node/session.js';
const dir=await mkdtemp(join(tmpdir(),'pdf-ads-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const previous={ADVERTISING_ENABLED:process.env.ADVERTISING_ENABLED,AD_PROVIDER_HOSTS:process.env.AD_PROVIDER_HOSTS};process.env.ADVERTISING_ENABLED='true';process.env.AD_PROVIDER_HOSTS='ads.example.test';
const origin=`http://127.0.0.1:${port}`,app=await startServer({dataDir:dir,origin,port});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const key='a'.repeat(32),scriptUrl=`https://ads.example.test/${key}/invoke.js`;
const config={enabled:true,reviewed:true,ads_txt:'ads.example.test, test-fixture, DIRECT\n',slots:[{id:'test-banner',placement:'footer',device:'all',width:300,height:250,key,script_url:scriptUrl,enabled:true}]};
try{
 await setOwner(app.db,'owner@example.test','contraseña sintética de anuncios 123');
 app.db.prepare("UPDATE settings SET value_json=? WHERE key='advertising'").bind(JSON.stringify(config)).run();
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let providerRequests=0;
 await context.route(scriptUrl,async route=>{providerRequests++;await route.fulfill({contentType:'text/javascript',body:`const marker=document.createElement('p');marker.id='test-provider';let blocked=false;try{parent.document.querySelector('#picker');}catch{blocked=true;}marker.textContent=blocked?'parent-blocked':'UNSAFE';document.body.append(marker);try{localStorage.setItem('ad-test','bad');}catch{marker.dataset.storage='blocked';}`});});
 await context.addInitScript(()=>localStorage.setItem('pdf-preferences-v1',JSON.stringify({statistics:false,advertising:false})));
 await page.goto(origin+'/unir-pdf');await page.waitForFunction(()=>document.querySelector('#tool')?.dataset.ready==='true');
 assert.equal(await page.locator('#advertising-consent').count(),0);
 const frame=page.frameLocator('.advertisement iframe');await frame.locator('#test-provider').waitFor();assert.equal(await frame.locator('#test-provider').innerText(),'parent-blocked');assert.equal(await frame.locator('#test-provider').getAttribute('data-storage'),'blocked');assert.equal(providerRequests,1);
 assert.equal(await page.locator('#advertising-zone').count(),1);
 assert.ok(await page.evaluate(()=>{const zone=document.getElementById('advertising-zone'),faq=[...document.querySelectorAll('h2')].find(h=>h.textContent==='Preguntas frecuentes');return !zone.closest('#tool')&&!!(zone.compareDocumentPosition(faq)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(document.getElementById('tool').compareDocumentPosition(zone)&Node.DOCUMENT_POSITION_FOLLOWING);}));
 assert.equal(await page.locator('.advertisement iframe').getAttribute('sandbox'),'allow-scripts');assert.equal(await page.locator('.advertisement iframe').evaluate(el=>el.contentDocument),null);
 await page.setViewportSize({width:400,height:844});await page.waitForTimeout(350);assert.equal(providerRequests,1);
 const doc=await PDFDocument.create();doc.addPage();await page.locator('#picker').setInputFiles({name:'no-debe-salir.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())});await page.waitForFunction(()=>!document.querySelector('#process').disabled);await page.locator('#process').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Documento listo'));assert.equal(providerRequests,1);
 await page.locator('#open-preferences').click();await page.locator('#reject-preferences').click();assert.equal(await page.locator('.advertisement iframe').count(),1);assert.equal(providerRequests,1);
 app.db.prepare("UPDATE settings SET value_json=? WHERE key='advertising'").bind(JSON.stringify({...config,enabled:false})).run();
 await page.reload();await page.waitForFunction(()=>document.querySelector('#tool')?.dataset.ready==='true');assert.equal(await page.locator('.advertisement iframe').count(),0);assert.equal(providerRequests,1);
 app.db.prepare("UPDATE settings SET value_json=? WHERE key='advertising'").bind(JSON.stringify(config)).run();
 console.log('Publicidad automática con estadísticas rechazadas y preferencia antigua ignorada; aislamiento, sin duplicados e interruptor del propietario verificados.');
 // Bloqueo del proveedor: la generación PDF sigue funcionando.
 await context.unroute(scriptUrl);await context.route(scriptUrl,route=>route.abort());await page.reload();await page.waitForFunction(()=>document.querySelector('#tool')?.dataset.ready==='true');await page.locator('#picker').setInputFiles({name:'prueba.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())});await page.waitForFunction(()=>!document.querySelector('#process').disabled);await page.locator('#process').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Documento listo'));assert.equal(await page.locator('#results a[download]').count(),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));console.log('Proveedor bloqueado: PDF descargable y móvil sin desbordamiento.');
 // Panel protegido: guardar borrador y ads.txt, persistir y desactivar.
 const owner=await browser.newPage();await owner.goto(origin+'/admin/login');await owner.locator('#email').fill('owner@example.test');await owner.locator('#password').fill('contraseña sintética de anuncios 123');await owner.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await owner.waitForURL('**/admin');await owner.waitForFunction(()=>document.getElementById('ad-config-state').textContent.includes('Dominios autorizados'));
 await owner.locator('#disable-ads').click();await owner.waitForFunction(()=>document.getElementById('ad-config-state').textContent.startsWith('Publicidad desactivada.'));
 const status=await page.request.get(origin+'/api/advertising/status');assert.equal((await status.json()).enabled,false);
 await owner.route(scriptUrl,route=>route.fulfill({contentType:'text/javascript',body:"document.body.innerHTML='<p id=preview-loaded>Prueba sintética privada</p>';"}));await owner.locator('#ad-preview-consent').check();await owner.getByRole('button',{name:'Probar banner guardado (solo administración)',exact:true}).click();await owner.frameLocator('#ad-preview iframe').locator('#preview-loaded').waitFor();assert.equal((await (await page.request.get(origin+'/api/advertising/status')).json()).enabled,false);
 console.log('Panel: vista previa aislada sin activar publicidad pública.');
 console.log('Panel: interruptor global guardado en SQLite y estado público desactivado.');
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
