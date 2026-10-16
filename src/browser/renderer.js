import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.mjs';
export async function openPdf(bytes) {
  return getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, enableXfa: false, cMapUrl: '/assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/assets/standard_fonts/', wasmUrl: '/assets/wasm/', stopAtErrors: true }).promise;
}
export async function renderPage(doc, pageNumber, maxWidth = 1000) {
  const page = await doc.getPage(pageNumber);
  const initial = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / initial.width, 2, Math.sqrt(8_000_000 / (initial.width * initial.height)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
  page.cleanup();
  return canvas;
}
