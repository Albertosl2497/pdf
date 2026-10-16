import {imageInfo} from './image-info.js';
import { PDFDocument, degrees } from 'pdf-lib';

import { LIMITS, detectType, parsePages, validateFiles } from './validation.js';
export { LIMITS, detectType, parsePages, validateFiles } from './validation.js';
async function loadPdf(bytes) {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    if (/\/ByteRange\s*\[/.test(new TextDecoder('latin1').decode(bytes))) throw Error('Los PDF con firmas digitales no son compatibles.');
    if (doc.getPageCount() < 1 || doc.getPageCount() > LIMITS.pages) throw Error('El PDF debe tener entre 1 y 100 páginas.');
    return doc;
  } catch (error) {
    if (/encrypted/i.test(error.message)) throw Error('No se admiten PDF protegidos por contraseña.');
    if (/páginas|firmas digitales/.test(error.message)) throw error;
    throw Error('No se pudo leer el PDF. Puede estar dañado o usar una estructura no compatible.');
  }
}
export async function inspect(files) {
  validateFiles(files);
  let total = 0;
  const info = [];
  for (const file of files) {
    const type = detectType(file.bytes);
    if (type !== 'pdf') throw Error('Esta operación necesita archivos PDF.');
    const doc = await loadPdf(file.bytes);
    total += doc.getPageCount();
    info.push({ pages: doc.getPageCount(), sizes: doc.getPages().map(p => ({ ...p.getSize(), rotation: p.getRotation().angle })), forms: doc.getForm().getFields().length > 0 });
  }
  if (total > LIMITS.pages) throw Error('El total de la tarea no puede superar 100 páginas.');
  return info;
}
export async function processPdf({ files, pages = '', operation = 'merge', rotation = 90, separate = false }) {
  await inspect(files);
  if (operation !== 'merge' && files.length !== 1) throw Error('Selecciona un solo PDF para esta operación.');
  const source = await Promise.all(files.map(f => loadPdf(f.bytes)));
  let refs = source.flatMap((doc, file) => doc.getPageIndices().map(index => ({ file, index })));
  if (operation !== 'merge') {
    const selection = parsePages(pages, refs.length);
    if (operation === 'remove') refs = refs.filter((_, i) => !selection.includes(i));
    else if (operation === 'rotate') refs = refs.map((r,i) => ({ ...r, rotation: selection.includes(i) ? Number(rotation) : 0 }));
    else refs = selection.map(i => refs[i]);
  }
  if (!refs.length) throw Error('El resultado debe conservar al menos una página.');
  if (![0,90,180,270].includes(Number(rotation))) throw Error('El giro debe ser 0, 90, 180 o 270 grados.');
  const groups = separate ? refs.map(r => [r]) : [refs];
  const outputs = [];
  for (const [index, group] of groups.entries()) {
    const out = await PDFDocument.create();
    for (const ref of group) {
      const [page] = await out.copyPages(source[ref.file], [ref.index]);
      if (ref.rotation) page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360));
      out.addPage(page);
    }
    outputs.push({ name: `pagina-${String(index + 1).padStart(3,'0')}.pdf`, type: 'application/pdf', bytes: await out.save(), pages: out.getPageCount() });
  }
  return outputs;
}
export async function imagesToPdf({ files, paper = 'a4', orientation = 'auto', margin = 24, layout = 'pages' }) {
  validateFiles(files);
  if (files.length > 100) throw Error('El límite es de 100 imágenes.');
  if (!['a4','letter','image'].includes(paper) || !['auto','portrait','landscape'].includes(orientation)) throw Error('Configuración de página no válida.');
  margin = Number(margin);
  if (!Number.isFinite(margin) || margin < 0 || margin > 72) throw Error('El margen debe estar entre 0 y 72 puntos.');
  if (layout === 'id' && files.length !== 2) throw Error('Elige exactamente dos imágenes: frente y reverso.');
  const doc = await PDFDocument.create();
  let sheet;
  for (const [index,file] of files.entries()) {
    const type = detectType(file.bytes);
    if (!['jpg','png'].includes(type)) throw Error('Convierte la imagen a JPG o PNG antes de generar el PDF.');
    imageInfo(file.bytes);
    const img = type === 'png' ? await doc.embedPng(file.bytes) : await doc.embedJpg(file.bytes);
    if (img.width * img.height > LIMITS.imagePixels) throw Error('La imagen supera los 20 megapíxeles.');
    let [width,height] = paper === 'letter' ? [612,792] : paper === 'image' ? [img.width * .75 + margin*2,img.height * .75 + margin*2] : [595.28,841.89];
    if (orientation === 'landscape' || (orientation === 'auto' && paper !== 'image' && layout !== 'id' && img.width > img.height)) [width,height] = [height,width];
    if (orientation === 'portrait' && width > height) [width,height] = [height,width];
    const page = layout === 'id' ? (sheet ??= doc.addPage([width,height])) : doc.addPage([width,height]);
    const areaHeight = layout === 'id' ? (height - margin*3)/2 : height - margin*2;
    const scale = Math.min((width-margin*2)/img.width, areaHeight/img.height);
    const w = img.width*scale, h = img.height*scale;
    const y = layout === 'id' ? height - margin - index*(areaHeight+margin) - (areaHeight+h)/2 : (height-h)/2;
    page.drawImage(img, { x: (width-w)/2, y, width:w, height:h });
  }
  return [{ name:'documento.pdf', type:'application/pdf', bytes:await doc.save(), pages:doc.getPageCount() }];
}

export async function rasterPdf({files}) {
  if(!files.length || files.length>30) throw Error('Selecciona entre 1 y 30 páginas.');
  const doc=await PDFDocument.create();
  for(const file of files) {
    if(detectType(file.bytes)!=='jpg')throw Error('El renderizado necesita páginas JPEG.');
    const img=await doc.embedJpg(file.bytes);
    const width=Number(file.pageWidth),height=Number(file.pageHeight);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Dimensiones de página no válidas.');
    const page=doc.addPage([width,height]);page.drawImage(img,{x:0,y:0,width,height});
  }
  return [{name:'comprimido.pdf',type:'application/pdf',bytes:await doc.save(),pages:doc.getPageCount()}];
}
