import {chromium} from 'playwright-core';
import {PDFDocument} from 'pdf-lib';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext(),page=await context.newPage(),origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8787';
const events=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/metrics'))events.push(r.postDataJSON());});
try{
 await page.goto(origin+'/');await page.waitForFunction(()=>!!document.getElementById('open-preferences')?.onclick||document.querySelector('script[src="/assets/site.js"]'));await page.waitForLoadState('networkidle');assert.equal(events.length,0);
 await page.locator('#open-preferences').click();await page.locator('#statistics-consent').check();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/metrics')),page.locator('#save-preferences').click()]);assert.equal(events[0].event,'view');
 await page.goto(origin+'/unir-pdf');await page.waitForFunction(()=>document.querySelector('#tool')?.dataset.ready==='true');
 const doc=await PDFDocument.create();doc.addPage();const bytes=Buffer.from(await doc.save());await page.locator('#picker').setInputFiles([{name:'documento-no-enviar.pdf',mimeType:'application/pdf',buffer:bytes}]);await page.waitForFunction(()=>!document.querySelector('#process').disabled);const completed=page.waitForResponse(r=>r.url().endsWith('/api/metrics')&&r.request().postDataJSON().event==='completed');await page.locator('#process').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Documento listo'));assert.equal((await completed).status(),202);assert.ok(events.some(e=>e.event==='started'));assert.ok(events.some(e=>e.event==='completed'));assert.ok(events.every(e=>Object.keys(e).every(k=>['consent','tool','event','duration_ms'].includes(k))));
 await page.locator('#open-preferences').click();await page.locator('#reject-preferences').click();const before=events.length;await page.reload();await page.waitForLoadState('networkidle');assert.equal(events.length,before);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pdf-preferences-v1')).statistics),false);
 console.log('Consentimiento: sin eventos antes de aceptar, eventos mínimos tras aceptar, revocación persistente.');
 await page.goto(origin+'/contacto');await page.locator('#contact-email').fill('prueba@example.test');await page.locator('#contact-message').fill('Consulta sintética de prueba de navegador.');await page.waitForFunction(()=>!document.querySelector('#send-contact').disabled);await page.locator('#send-contact').click();await page.waitForFunction(()=>document.querySelector('#contact-status').textContent.includes('Tu consulta se guardó'));assert.match(await page.locator('#contact-status').innerText(),/No se ha enviado por correo/);console.log('Contacto: envío real a bandeja D1 y mensaje veraz.');
 await page.setViewportSize({width:320,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('Contacto y preferencias: sin errores JS ni desbordamiento a 320 px.');
}finally{await browser.close();}
