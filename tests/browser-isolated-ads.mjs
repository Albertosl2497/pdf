import {PDFDocument} from 'pdf-lib';
import {chromium} from 'playwright-core';
import {createServer} from 'node:net';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {startServer} from '../src/node/server.js';
import {setOwner} from '../src/node/session.js';
const dir=await mkdtemp(join(tmpdir(),'pdf-isolated-ads-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin=`http://127.0.0.1:${port}`,adOrigin=`http://localhost:${port}`;
const previous={ADVERTISING_ENABLED:process.env.ADVERTISING_ENABLED,AD_PROVIDER_HOSTS:process.env.AD_PROVIDER_HOSTS};process.env.ADVERTISING_ENABLED='true';process.env.AD_PROVIDER_HOSTS='ads.example.test,images.example.test';
const app=await startServer({dataDir:dir,origin,port,host:'0.0.0.0',adOrigin});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const key='a'.repeat(32),scriptUrl=`https://ads.example.test/22/${key}`;
const config={enabled:true,reviewed:true,ads_txt:'',slots:[{id:'isolated-banner',placement:'footer',device:'all',width:300,height:250,key,script_url:scriptUrl,enabled:true}]};
try{
 await setOwner(app.db,'owner@example.test','contraseña sintética de aislamiento 123');
 app.db.prepare("UPDATE settings SET value_json=? WHERE key='advertising'").bind(JSON.stringify(config)).run();
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let requests=0;
 page.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text());});page.on('pageerror',e=>console.log('pageerror:',e.message));
 const png=await readFile(new URL('./fixtures/transparencia.png',import.meta.url));
 await context.route('https://images.example.test/banner.png',r=>r.fulfill({contentType:'image/png',body:png}));
 await context.route('https://ads.example.test/creative',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':adOrigin,'Access-Control-Allow-Credentials':'true'},contentType:'text/javascript',body:`document.body.innerHTML='<a id="synthetic-ad" href="https://ads.example.test/destination" target="_blank" rel="noopener"><img id="creative-image" width="300" height="250" src="https://images.example.test/banner.png"></a>';eval("document.body.dataset.dynamic='executed'");`}));
 await context.route('https://ads.example.test/destination',r=>r.fulfill({contentType:'text/html',body:'<p>Destino sintético</p>'}));
 await context.route(scriptUrl,async r=>{
  requests++;
  await r.fulfill({contentType:'text/javascript',body:`
   window.atOptions.height===250||(()=>{throw Error('atOptions')})();
   let blocked=false;try{parent.document.querySelector('#picker')}catch{blocked=true}
   const marker=document.createElement('p');marker.id='isolation';marker.textContent=blocked?'parent-blocked':'UNSAFE';document.body.append(marker);
   try{localStorage.setItem('ad-only','yes');document.cookie='ad-only=yes; SameSite=Lax';}catch{marker.dataset.storage='unavailable';}
   const request=new XMLHttpRequest();request.withCredentials=true;request.open('GET','https://ads.example.test/creative');request.onload=()=>{
    const child=document.createElement('iframe');child.id='vendor-child';child.width=300;child.height=250;child.src='about:blank';child.onload=()=>{
     const inner=child.contentDocument;const script=inner.createElement('script');script.textContent=request.responseText;inner.body.append(script);
    };document.body.append(child);
   };request.send();`});
 });
 const response=await page.goto(origin+'/unir-pdf');const policy=response.headers()['content-security-policy'];assert.ok(policy.includes(`frame-src 'self' ${adOrigin}`));assert.ok(!policy.includes("'unsafe-eval'"));assert.ok(!policy.includes("script-src 'self' 'unsafe-inline'"));
 await page.waitForFunction(()=>document.querySelector('#tool')?.dataset.ready==='true');assert.equal(await page.locator('#advertising-consent').count(),0);
 await page.evaluate(()=>{localStorage.setItem('private-sentinel','document-secret');});

 const frame=page.frameLocator('.advertisement iframe');await frame.locator('#isolation').waitFor();assert.equal(await frame.locator('#isolation').innerText(),'parent-blocked');
 const inner=frame.frameLocator('#vendor-child');await inner.locator('#creative-image').waitFor({timeout:10000});await inner.locator('#creative-image').evaluate(img=>img.decode());assert.equal(await inner.locator('body').getAttribute('data-dynamic'),'executed');
 assert.equal(await page.locator('.advertisement iframe').evaluate(f=>f.contentDocument),null);
 assert.equal(await page.evaluate(()=>localStorage.getItem('ad-only')),null);
 const adPage=page.frames().find(f=>f.url().startsWith(adOrigin));assert.equal(await adPage.evaluate(()=>{try{return localStorage.getItem('private-sentinel')}catch{return null}}),null);
 assert.ok((await adPage.locator('body').textContent()).includes('parent-blocked'));
 for(const path of ['/admin','/api/admin/config','/api/auth/login','/api/health','/assets/app.js','/'])assert.equal((await page.request.get(adOrigin+path)).status(),404,path);
 const adFrameUrl=adPage.url();assert.equal((await page.request.get(origin+new URL(adFrameUrl).pathname+new URL(adFrameUrl).search)).status(),404);
 const [popup]=await Promise.all([context.waitForEvent('page'),inner.locator('#synthetic-ad').click()]);await popup.waitForLoadState();assert.equal(await popup.evaluate(()=>window.opener),null);await popup.close();
 assert.equal(page.url(),origin+'/unir-pdf');assert.equal(requests,1);
 await page.locator('#picker').setInputFiles({name:'documento-privado.pdf',mimeType:'application/pdf',buffer:Buffer.from(await (async()=>{const d=await PDFDocument.create();d.addPage();return d.save()})())});await page.waitForFunction(()=>!document.getElementById('process').disabled&&document.getElementById('status').textContent.includes('archivo(s) listo'));await page.locator('#process').evaluate(button=>button.onclick());assert.match(await page.locator('#status').innerText(),/^Documento listo/);assert.equal(await page.locator('#results a[download]').count(),1);

 await page.locator('#open-preferences').click();await page.locator('#reject-preferences').click();assert.equal(await page.locator('.advertisement iframe').count(),1);
 // Vista previa privada sobre otro origen; la activación pública sigue apagada.
 const owner=await context.newPage();await owner.goto(origin+'/admin/login');await owner.locator('#email').fill('owner@example.test');await owner.locator('#password').fill('contraseña sintética de aislamiento 123');await owner.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await owner.waitForURL('**/admin');await owner.waitForFunction(()=>document.getElementById('ad-config-state').textContent.includes('Dominios autorizados'));
 await owner.locator('#disable-ads').click();await owner.waitForFunction(()=>document.getElementById('ad-config-state').textContent.startsWith('Publicidad desactivada.'));
 await owner.locator('#ad-preview-consent').check();await owner.getByRole('button',{name:'Probar banner guardado (solo administración)',exact:true}).click();await owner.frameLocator('#ad-preview iframe').frameLocator('#vendor-child').locator('#creative-image').waitFor();
 assert.equal((await (await owner.request.get(origin+'/api/advertising/status')).json()).enabled,false);
 const previewFrame=owner.frames().find(f=>f.url().startsWith(adOrigin));assert.equal((await owner.request.get(previewFrame.url())).status(),404,'token de un uso');
 assert.equal((await owner.request.get(adOrigin+'/api/admin/config')).status(),404);
 assert.ok(!(await context.cookies(adOrigin)).some(c=>c.name.includes('session')));
 console.log('Origen separado: creativo con XHR, iframe interno, inline/eval e imagen visible; documento y almacenamiento principal inaccesibles.');
 console.log('Enlace abre con opener nulo; rutas privadas ausentes del subdominio, CSP principal estricta, tokens de un uso, carga automática, estadísticas independientes y preview privada verificados.');
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
