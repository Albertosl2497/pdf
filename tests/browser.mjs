import { chromium } from 'playwright-core';
import { PDFDocument,StandardFonts } from 'pdf-lib';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { unzipSync } from 'fflate';
await mkdir('/tmp/pdf-check',{recursive:true});
const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);for(let i=1;i<=3;i++){const p=doc.addPage([300+i*10,440]);p.drawText(`Pagina ${i}`,{x:20,y:300,font});}const pdf=Buffer.from(await doc.save());
const image=await readFile(new URL('./fixtures/transparencia.png',import.meta.url));
const photo=await readFile(new URL('./fixtures/vertical.webp',import.meta.url));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('404'))console.log('console:',msg.text());});
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8787';
async function choose(path,payload){await page.goto(origin+path);await page.waitForFunction(()=>document.querySelector('#tool')?.dataset.ready==='true');await page.locator('#picker').setInputFiles(payload);await page.waitForFunction(()=>!document.querySelector('#process').disabled);assert.match(await page.locator('#status').innerText(),/listo/);}
async function processDownload(){await page.locator('#process').click();await page.waitForFunction(()=>!document.querySelector('#process').disabled);const status=await page.locator('#status').innerText();assert.match(status,/Documento listo/,status);const link=page.locator('#results a').filter({hasText:/Descargar (resultado|ZIP)/}).first();const download=await Promise.all([page.waitForEvent('download'),link.click()]);return readFile(await download[0].path());}
const payload={name:'ejemplo.pdf',mimeType:'application/pdf',buffer:pdf};
try{
 await choose('/unir-pdf',[payload,{...payload,name:'segundo.pdf'}]);let result=await processDownload();assert.equal((await PDFDocument.load(result)).getPageCount(),6);console.log('Unir: 6 páginas');await writeFile('/tmp/pdf-check/unido.pdf',result);
 await choose('/organizar-pdf',payload);await page.locator('#thumbnails').click();await page.waitForFunction(()=>!document.querySelector('#process').disabled);assert.equal(await page.locator('.thumb').count(),3);await page.locator('.thumb').nth(2).getByRole('button',{name:'↑',exact:true}).click();assert.equal(await page.locator('#ranges').inputValue(),'1, 3, 2');await page.locator('#undo-pages').click();assert.equal(await page.locator('#ranges').inputValue(),'');assert.equal(await page.locator('.thumb').count(),3);await page.locator('#ranges').fill('3,1');result=await processDownload();assert.equal((await PDFDocument.load(result)).getPageCount(),2);assert.equal((await PDFDocument.load(result)).getPage(0).getWidth(),330);console.log('Organizar y miniaturas: OK');
 await choose('/dividir-pdf',payload);await page.locator('#ranges').fill('1,3');result=await processDownload();const zip=unzipSync(result);assert.equal(Object.keys(zip).length,2);console.log('Dividir: ZIP con 2 PDF');
 await choose('/girar-pdf',payload);await page.locator('#ranges').fill('2');result=await processDownload();assert.equal((await PDFDocument.load(result)).getPage(1).getRotation().angle,90);console.log('Girar: OK');
 await choose('/eliminar-paginas-pdf',payload);await page.locator('#ranges').fill('2');result=await processDownload();assert.equal((await PDFDocument.load(result)).getPageCount(),2);console.log('Eliminar: OK');
 const images=[{name:'imagen.png',mimeType:'image/png',buffer:image},{name:'foto.webp',mimeType:'image/webp',buffer:photo}];
 for(const route of ['/jpg-a-pdf','/fotos-de-tareas-a-pdf','/credencial-en-una-hoja']){
  await choose(route,images);
  assert.deepEqual(await page.locator('#paper option').evaluateAll(options=>options.filter(o=>o.value!=='image').map(o=>o.value)),['a4','letter','oficio','oficio-340','legal','tabloid','a3','a5','half-letter','executive']);
  await page.locator('#orientation').selectOption('portrait');
  for(const [paper,w,h] of [['oficio',612,936],['tabloid',792,1224]]){
   await page.locator('#paper').selectOption(paper);result=await processDownload();const generated=await PDFDocument.load(result);assert.equal(generated.getPageCount(),route.includes('credencial')?1:2);
   for(const sheet of generated.getPages())assert.deepEqual(sheet.getSize(),{width:w,height:h},route+' '+paper);
  }
  console.log(route+': selector compartido y medidas Oficio/Tabloide comprobados');
 }
 await choose('/jpg-a-pdf',images[0]);await page.locator('#orientation').selectOption('portrait');
 for(const [paper,w,h] of [['oficio',612,936],['oficio-340',216/25.4*72,340/25.4*72],['legal',612,1008],['tabloid',792,1224],['a3',297/25.4*72,420/25.4*72],['a5',148/25.4*72,210/25.4*72],['half-letter',396,612],['executive',522,756]]){await page.locator('#paper').selectOption(paper);result=await processDownload();const size=(await PDFDocument.load(result)).getPage(0).getSize();assert.ok(Math.abs(size.width-w)<.01&&Math.abs(size.height-h)<.01,paper);}
 console.log('Imágenes: nuevos tamaños descargados y medidas comprobadas.');
 await choose('/preparar-documentos-para-tramites',[payload,images[0]]);await page.locator('#paper').selectOption('legal');await page.locator('#orientation').selectOption('portrait');result=await processDownload();const mixed=await PDFDocument.load(result);assert.equal(mixed.getPageCount(),4);for(let i=0;i<3;i++)assert.deepEqual(mixed.getPage(i).getSize(),{width:310+i*10,height:440});assert.deepEqual(mixed.getPage(3).getSize(),{width:612,height:1008});console.log('Trámites: tamaño Legal para imágenes y dimensiones originales para PDF comprobados');
 await choose('/pdf-a-jpg',payload);await page.locator('#ranges').fill('2');result=await processDownload();assert.equal(result[0],255);assert.equal(result[1],216);await page.locator('#format').selectOption('image/png');result=await processDownload();assert.equal(result.subarray(1,4).toString(),'PNG');console.log('PDF a JPG y PNG: OK');
 await choose('/comprimir-pdf',payload);await page.locator('#raster-consent').check();result=await processDownload();assert.equal((await PDFDocument.load(result)).getPageCount(),3);console.log('Compresión, PDF de texto: '+await page.locator('#results .notice').innerText());
 const largePng=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=1000;const ctx=c.getContext('2d'),img=ctx.createImageData(1000,1000);let seed=42;for(let i=0;i<img.data.length;i+=4){for(let j=0;j<3;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;img.data[i+j]=seed>>>24;}img.data[i+3]=255;}ctx.putImageData(img,0,0);return c.toDataURL('image/png').split(',')[1];}),'base64');const heavy=await PDFDocument.create();const embed=await heavy.embedPng(largePng);heavy.addPage([600,600]).drawImage(embed,{x:0,y:0,width:600,height:600});const heavyBytes=Buffer.from(await heavy.save());await choose('/comprimir-pdf',{name:'grande.pdf',mimeType:'application/pdf',buffer:heavyBytes});await page.locator('#raster-consent').check();result=await processDownload();assert.ok(result.byteLength<heavyBytes.byteLength);console.log('Compresión, PDF con imagen: '+await page.locator('#results .notice').innerText());await writeFile('/tmp/pdf-check/comprimido.pdf',result);
 await page.locator('#results select').selectOption('girar-pdf');await page.waitForURL('**/girar-pdf');await page.waitForFunction(()=>document.querySelector('#files')?.children.length===1&&!document.querySelector('#process').disabled);result=await processDownload();assert.equal((await PDFDocument.load(result)).getPageCount(),1);console.log('Continuar en otra herramienta sin almacenamiento persistente: OK');
 for(const width of [320,360,390,768,1024,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`Desbordamiento a ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/pdf-check/mobile.png',fullPage:true});console.log('Anchos 320, 360, 390, 768, 1024 y 1440: sin desbordamiento');
 assert.deepEqual(errors,[]);console.log('Sin errores de JavaScript');
}finally{await browser.close();}
