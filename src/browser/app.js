import {imageInfo} from '../image-info.js';
import {track,trackView} from './telemetry.js';
import { detectType, LIMITS, parsePages, validateFiles } from '../validation.js';
import { zipSync } from 'fflate';
let root = document.querySelector('#tool');
const $ = id => document.getElementById(id);
let mode = root?.dataset.mode;
let imageOnly = root?.dataset.images === 'true';
let mixed = mode === 'prepare';
let layout = root?.dataset.layout;
let files = [], pages = [], outputs = [], busy = false, epoch = 0, activeWorker, activeDoc, activeReject, taskStarted=0, pageHistory=[];
const urls = new Set();
const url = blob => { const value = URL.createObjectURL(blob); urls.add(value); return value; };
const revoke = value => { URL.revokeObjectURL(value); urls.delete(value); };
const size = n => n < 1024 ? `${n} bytes` : n < 1024**2 ? `${(n/1024).toFixed(1)} KB` : `${(n/1024**2).toFixed(2)} MB`;
const tell = (message, error = false) => { $('status').textContent = message; $('status').className = error ? 'error' : ''; };
function clearResults() { outputs = []; $('results').querySelectorAll('a[href^="blob:"]').forEach(a=>revoke(a.href)); $('results').replaceChildren(); }
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#tool input,#tool select,#tool button').forEach(el => { el.disabled = value && !['cancel','clear'].includes(el.id); });
  $('cancel').hidden = !value; $('progress').hidden = !value;
}
function cancel() {
  if(taskStarted){track('cancelled',root.dataset.slug,performance.now()-taskStarted);taskStarted=0;}
  epoch++; activeWorker?.terminate(); activeWorker = null; activeReject?.(Error('Cancelado')); activeReject=null;
  activeDoc?.destroy(); activeDoc = null;
  setBusy(false); tell('Tarea cancelada. Puedes volver a intentarlo.');
}
function rpc(method,args,token) {
  return new Promise((resolve,reject) => {
    const worker = new Worker('/assets/engine.js',{type:'module'}); activeWorker = worker; activeReject=reject;
    worker.onmessage = ({data}) => { worker.terminate(); if (activeWorker === worker) {activeWorker=null;activeReject=null;} if(token!==epoch)return reject(Error('Cancelado')); data.error ? reject(Error(data.error)) : resolve(data.result); };
    worker.onerror = () => { worker.terminate(); reject(Error('No se pudo iniciar el motor PDF. Recarga la página.')); };
    worker.postMessage({method,args});
  });
}
function button(text, callback) { const b=document.createElement('button'); b.type='button'; b.textContent=text; b.onclick=callback; return b; }
function move(array,index,delta) { const target=index+delta; if(target<0||target>=array.length)return; [array[index],array[target]]=[array[target],array[index]]; }
function renderFiles() {
  const container=$('files'); container.replaceChildren();
  for (const [index,file] of files.entries()) {
    const item=document.createElement('div'); item.className='file';
    const name=document.createElement('p'); name.className='name'; name.textContent=`${index+1}. ${file.name}`;
    const info=document.createElement('p'); info.className='small'; info.textContent=`${size(file.bytes.byteLength)}${file.info ? ` · ${file.info.pages} páginas` : ''}`;
    item.append(name,info);
    if(file.type!=='pdf') {
      const preview=document.createElement('img'); preview.alt=`Vista previa de ${file.name}`; preview.src=file.preview;
      item.append(preview);
      const actions=document.createElement('div'); actions.className='actions';
      actions.append(button('Girar 90°',async()=>{file.rotation=(file.rotation+90)%360;await updateImage(file);renderFiles();clearResults();}));
      item.append(actions);
      const details=document.createElement('details');
      const summary=document.createElement('summary'); summary.textContent='Recorte y legibilidad'; details.append(summary);
      for(const [key,label,min,max,step] of [['crop','Recortar el mismo porcentaje de cada borde',0,35,1],['brightness','Brillo (%)',60,150,5],['contrast','Contraste (%)',60,180,5]]) {
        const wrap=document.createElement('label'); wrap.textContent=`${label}: ${file[key]}`;
        const range=document.createElement('input'); range.type='range'; range.min=min; range.max=max; range.step=step; range.value=file[key];
        range.onchange=async()=>{file[key]=Number(range.value);await updateImage(file);renderFiles();clearResults();}; wrap.append(range); details.append(wrap);
      }
      details.append(button('Ver original',()=>{preview.src=file.original;}),button('Ver ajustes',()=>{preview.src=file.preview;}),button('Restablecer imagen',async()=>{file.rotation=0;file.crop=0;file.brightness=100;file.contrast=100;await updateImage(file);renderFiles();clearResults();}));
      item.append(details);
    }
    const actions=document.createElement('div'); actions.className='actions';
    actions.append(button('↑ Subir',()=>{move(files,index,-1);renderFiles();clearResults();}),button('↓ Bajar',()=>{move(files,index,1);renderFiles();clearResults();}),button('Quitar',()=>{if(file.preview)revoke(file.preview);if(file.original)revoke(file.original);files.splice(index,1);pageHistory=[];pages=[];$('pages').replaceChildren();renderFiles();clearResults();}));
    item.append(actions);container.append(item);
  }
}
async function transformed(file) {
  imageInfo(file.bytes);
  const bitmap=await createImageBitmap(new Blob([file.bytes]));
  try {
    if(bitmap.width*bitmap.height>LIMITS.imagePixels)throw Error('La imagen supera los 20 megapíxeles.');
    const inset=file.crop/100, width=Math.max(1,Math.round(bitmap.width*(1-inset*2))), height=Math.max(1,Math.round(bitmap.height*(1-inset*2)));
    const canvas=document.createElement('canvas'); const rotated=file.rotation%180!==0;
    canvas.width=rotated?height:width;canvas.height=rotated?width:height;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(file.rotation*Math.PI/180);
    ctx.filter=`brightness(${file.brightness}%) contrast(${file.contrast}%)`;
    ctx.drawImage(bitmap,bitmap.width*inset,bitmap.height*inset,width,height,-width/2,-height/2,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',Number($('quality')?.value || .85)));
    canvas.width=canvas.height=0;
    if(!blob)throw Error('No se pudo convertir la imagen.');
    return blob;
  } finally {bitmap.close();}
}
async function updateImage(file) { const blob=await transformed(file); if(file.preview)revoke(file.preview);file.preview=url(blob); }
async function addFiles(list) {
  if(busy)return;
  clearResults(); const token=++epoch; setBusy(true);
  try {
    const incoming=Array.from(list);
    if(!incoming.length)return;
    if(!root.dataset.multiple && files.length+incoming.length>1)throw Error('Esta herramienta admite un PDF. Pulsa Limpiar para elegir otro.');
    if(files.length+incoming.length>LIMITS.files)throw Error('Máximo 100 archivos por tarea.');
    if(incoming.some(f=>!f.size||f.size>LIMITS.fileBytes)||incoming.reduce((n,f)=>n+f.size,files.reduce((n,f)=>n+f.bytes.byteLength,0))>LIMITS.taskBytes)throw Error('Límite: 20 MB por archivo y 50 MB por tarea.');
    const staged=[];
    for(const f of incoming) {
      const bytes=new Uint8Array(await f.arrayBuffer());if(token!==epoch)return;
      const type=detectType(bytes);
      if(imageOnly&&type==='pdf')throw Error('Selecciona imágenes JPG, PNG o WebP.');
      if(!imageOnly&&!mixed&&type!=='pdf')throw Error('Selecciona un PDF válido.');
      const file={name:f.name,bytes,type,rotation:0,crop:0,brightness:100,contrast:100};
      if(type==='pdf') [file.info]=await rpc('inspect',[file],token);
      else { file.original=url(new Blob([bytes]));await updateImage(file); }
      staged.push(file);
    }
    if(token!==epoch)return;
    const next=[...files,...staged];validateFiles(next);
    if(next.reduce((n,f)=>n+(f.info?.pages || 1),0)>100)throw Error('La tarea supera las 100 páginas.');
    files=next;pageHistory=[];pages=[];$('pages').replaceChildren();renderFiles();tell(`${files.length} archivo(s) listo(s). Revisa las opciones antes de procesar.`);
  } catch(error) {if(token===epoch)tell(error.message,true);}
  finally {if(token===epoch)setBusy(false);$('picker').value='';}
}
function selection() { return pages.length ? pages.filter(p=>p.selected).map(p=>p.index+1).join(', ') : $('ranges')?.value || ''; }
function rememberPages(){pageHistory.push({pages:pages.map(p=>({...p})),ranges:$('ranges').value});if(pageHistory.length>20)pageHistory.shift();}
function undoPages(){const previous=pageHistory.pop();if(!previous)return tell('No hay cambios de páginas para deshacer.');pages=previous.pages;$('ranges').value=previous.ranges;drawPages();clearResults();tell('Cambio de páginas deshecho.');}
function drawPages() {
  const container=$('pages');container.replaceChildren();
  for(const [index,p] of pages.entries()) {
    const item=document.createElement('div');item.className='thumb';
    if(p.preview){const img=document.createElement('img');img.src=p.preview;img.alt=`Página ${p.index+1}`;item.append(img);}
    const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=p.selected;check.onchange=()=>{rememberPages();p.selected=check.checked;$('ranges').value=selection();clearResults();};label.append(check,` Página ${p.index+1}`);item.append(label);
    if(root.dataset.slug==='organizar-pdf')item.append(button('↑',()=>{rememberPages();move(pages,index,-1);drawPages();$('ranges').value=selection();clearResults();}),button('↓',()=>{rememberPages();move(pages,index,1);drawPages();$('ranges').value=selection();clearResults();}));
    container.append(item);
  }
}
async function thumbnails() {
  if(files.length!==1||files[0].type!=='pdf')return tell('Selecciona un PDF para ver sus páginas.',true);
  const token=++epoch;setBusy(true);
  try {
    const {openPdf,renderPage}=await import('./renderer.js');if(token!==epoch)return;
    activeDoc=await openPdf(files[0].bytes);if(token!==epoch){await activeDoc.destroy();return;}
    const selected=parsePages($('ranges').value,activeDoc.numPages);pages=[];
    for(let i=0;i<activeDoc.numPages;i++) {
      if(token!==epoch)return;
      const canvas=await renderPage(activeDoc,i+1,160);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.65));canvas.width=canvas.height=0;
      pages.push({index:i,selected:selected.includes(i),preview:url(blob)});drawPages();tell(`Miniaturas: ${i+1} de ${activeDoc.numPages}.`);
    }
  } catch(error){if(token===epoch)tell(error.message,true);}
  finally {if(token===epoch){await activeDoc?.destroy();activeDoc=null;setBusy(false);}}
}
function imageOptions(){return {paper:$('paper')?.value||'a4',orientation:$('orientation')?.value||'auto',margin:Number($('margin')?.value||24),layout:layout||'pages'};}
async function normalizedImages(selected,token) {
  const result=[];
  for(const file of selected){if(token!==epoch)throw Error('Cancelado');const blob=await transformed(file);result.push({bytes:new Uint8Array(await blob.arrayBuffer()),name:file.name});}
  return result;
}
async function renderOutput(token,compress=false) {
  if(compress && files[0]?.info?.forms)throw Error('Este PDF contiene formularios: no se admite compresión para evitar perderlos.');
  if(compress&&!$('raster-consent').checked)throw Error('Confirma que aceptas convertir las páginas en imágenes.');
  const {openPdf,renderPage}=await import('./renderer.js');if(token!==epoch)throw Error('Cancelado');
  activeDoc=await openPdf(files[0].bytes);
  const indexes=parsePages(compress?'':selection(),activeDoc.numPages);
  if(indexes.length>30)throw Error('El renderizado admite hasta 30 páginas por tarea.');
  const result=[];
  const presets={high:[1400,.88],balanced:[1000,.72],small:[720,.52]};
  const [width,quality]=compress?presets[$('compression').value]:[Number($('resolution').value),Number($('quality').value)];
  for(const [i,index] of indexes.entries()) {
    if(token!==epoch)throw Error('Cancelado');
    const page=await activeDoc.getPage(index+1), viewport=page.getViewport({scale:1});
    const canvas=await renderPage(activeDoc,index+1,width);
    const type=compress?'image/jpeg':$('format').value;
    const blob=await new Promise(r=>canvas.toBlob(r,type,quality));canvas.width=canvas.height=0;
    if(!blob)throw Error('No se pudo generar una imagen.');
    result.push({name:`pagina-${String(index+1).padStart(3,'0')}.${type==='image/png'?'png':'jpg'}`,type,bytes:new Uint8Array(await blob.arrayBuffer()),pageWidth:viewport.width,pageHeight:viewport.height});
    tell(`Página ${i+1} de ${indexes.length}.`);
  }
  return result;
}
async function run() {
  const token=++epoch;setBusy(true);clearResults();tell('Procesando en tu dispositivo…');taskStarted=performance.now();track('started',root.dataset.slug);
  try {
    validateFiles(files);
    if(mode==='images') outputs=await rpc('imagesToPdf',{files:await normalizedImages(files,token),...imageOptions()},token);
    else if(mode==='prepare') {
      const pdfs=[];
      for(const file of files) {
        if(file.type==='pdf')pdfs.push(file);
        else {const [out]=await rpc('imagesToPdf',{files:await normalizedImages([file],token),...imageOptions()},token);pdfs.push(out);}
      }
      outputs=await rpc('processPdf',{files:pdfs,operation:'merge'},token);
    } else if(mode==='render')outputs=await renderOutput(token);
    else if(mode==='compress') {
      const rendered=await renderOutput(token,true);
      outputs=await rpc('rasterPdf',{files:rendered},token);
      const original=files[0].bytes.byteLength, final=outputs[0].bytes.byteLength;
      const note=document.createElement('p');note.className='notice';note.textContent=`Original: ${size(original)}. Resultado: ${size(final)}. ${final<original?`Reducción real: ${((original-final)/original*100).toFixed(1)}%.`:'La conversión no redujo el peso; conserva el original.'}`;$('results').append(note);
      const link=document.createElement('a');link.href=url(new Blob([files[0].bytes],{type:'application/pdf'}));link.download=files[0].name;link.textContent='Descargar original';$('results').append(link);
    } else {
      if(pages.length&&!pages.some(p=>p.selected))throw Error('Selecciona al menos una página.');
      outputs=await rpc('processPdf',{files,operation:mode,pages:selection(),rotation:Number($('rotation')?.value||90),separate:$('separate')?.checked||false},token);
    }
    if(token!==epoch)return;
    const base=($('filename').value.trim()||'documento').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\.(pdf|zip|png|jpg)$/i,'').slice(0,100)||'documento';
    const box=document.createElement('div');box.className='result';
    const label=document.createElement('p');label.textContent=`Resultado: ${outputs.length} archivo(s), ${size(outputs.reduce((n,f)=>n+f.bytes.byteLength,0))}${outputs[0]?.pages?`, ${outputs.reduce((n,f)=>n+(f.pages||0),0)} páginas`:''}.`;box.append(label);
    if(outputs.length>1){const zip=zipSync(Object.fromEntries(outputs.map(o=>[o.name,o.bytes])));const link=document.createElement('a');link.href=url(new Blob([zip],{type:'application/zip'}));link.download=`${base}.zip`;link.className='button';link.textContent='Descargar ZIP';box.append(link);}
    outputs.forEach((out,i)=>{const link=document.createElement('a');link.href=url(new Blob([out.bytes],{type:out.type}));link.download=outputs.length===1?`${base}.${out.type==='application/pdf'?'pdf':out.type==='image/png'?'png':'jpg'}`:out.name;link.textContent=outputs.length===1?'Descargar resultado':`Descargar ${i+1}`;link.className='button';box.append(link);});
    if(outputs.length===1&&outputs[0].type==='application/pdf') {
      const label=document.createElement('label');label.textContent='Continuar con este PDF';const select=document.createElement('select');
      const links=[['','Elige otra herramienta'],['unir-pdf','Unir PDF'],['extraer-paginas-pdf','Extraer páginas'],['organizar-pdf','Organizar'],['girar-pdf','Girar'],['pdf-a-jpg','Convertir a imágenes'],['comprimir-pdf','Comprimir']];
      for(const [value,text] of links){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);} label.append(select);box.append(label);
      select.onchange=async()=>{if(!select.value)return;try{const nextFile = new File([outputs[0].bytes],`${base}.pdf`,{type:'application/pdf'}); const path='/'+select.value; const response=await fetch(path); if(!response.ok)throw Error(); const html=new DOMParser().parseFromString(await response.text(),'text/html'); for(const value of urls)URL.revokeObjectURL(value);urls.clear();document.querySelector('main').replaceWith(html.querySelector('main')); document.title=html.title; history.pushState({},'',path); files=[];pages=[];outputs=[]; initTool();document.dispatchEvent(new Event('pdf:navigation'));trackView(); await addFiles([nextFile]); window.scrollTo(0,0);}catch{tell('No se pudo continuar automáticamente. Descarga el resultado y ábrelo en la otra herramienta.',true);}};
    }
    track('completed',root.dataset.slug,performance.now()-taskStarted);taskStarted=0;box.querySelectorAll('a[download]').forEach(a=>a.addEventListener('click',()=>track('downloaded',root.dataset.slug)));$('results').append(box);tell('Documento listo. Comprueba el resultado antes de usarlo.');
  } catch(error){if(token===epoch){if(taskStarted){track('failed',root.dataset.slug,performance.now()-taskStarted);taskStarted=0;}tell(error.message,true);}}
  finally {if(token===epoch){await activeDoc?.destroy();activeDoc=null;setBusy(false);}}
}
function initTool() {
  root=document.querySelector('#tool');
  mode=root?.dataset.mode;imageOnly=root?.dataset.images==='true';mixed=mode==='prepare';layout=root?.dataset.layout;
if(root){
  root.dataset.ready='true';setBusy(false);
  $('picker').onchange=e=>addFiles(e.target.files);
  const zone=$('dropzone');zone.ondragover=e=>{e.preventDefault();zone.classList.add('over');};zone.ondragleave=()=>zone.classList.remove('over');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('over');addFiles(e.dataTransfer.files);};
  $('process').onclick=run;$('cancel').onclick=cancel;
  $('clear').onclick=()=>{cancel();pageHistory=[];files=[];pages=[];clearResults();for(const value of urls)URL.revokeObjectURL(value);urls.clear();$('files').replaceChildren();$('pages').replaceChildren();if($('ranges'))$('ranges').value='';tell('Sesión limpiada.');};
  if($('thumbnails'))$('thumbnails').onclick=thumbnails;
  if($('ranges'))$('ranges').onbeforeinput=rememberPages;
  if($('undo-pages'))$('undo-pages').onclick=undoPages;
  if($('ranges'))$('ranges').oninput=()=>{pages=[];$('pages').replaceChildren();clearResults();};
  if($('reset-pages'))$('reset-pages').onclick=()=>{rememberPages();pages=[];$('pages').replaceChildren();$('ranges').value='';clearResults();tell('Orden y selección restablecidos. El original no se modificó.');};

}
}
initTool();
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
window.addEventListener('popstate',()=>location.reload());
const search=$('search');if(search)search.oninput=()=>document.querySelectorAll('[data-search]').forEach(card=>{card.hidden=!card.dataset.search.includes(search.value.toLocaleLowerCase('es'));});
