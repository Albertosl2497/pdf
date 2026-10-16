export const LIMITS = Object.freeze({ fileBytes: 20 * 1024 ** 2, taskBytes: 50 * 1024 ** 2, pages: 100, files: 100, imagePixels: 20_000_000 });
export function validateFiles(files) {
  if (!files.length) throw Error('Elige al menos un archivo.');
  if (files.length > LIMITS.files) throw Error('El límite es de 100 archivos.');
  if (files.some(f => !f.bytes?.byteLength || f.bytes.byteLength > LIMITS.fileBytes)) throw Error('Cada archivo debe contener datos y pesar como máximo 20 MB.');
  if (files.reduce((n, f) => n + f.bytes.byteLength, 0) > LIMITS.taskBytes) throw Error('La tarea supera los 50 MB.');
}
export function parsePages(value, count) {
  if (!value.trim()) return Array.from({ length: count }, (_, i) => i);
  const pages = [];
  const seen = new Set();
  for (const part of value.split(',')) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim());
    if (!match) throw Error('Usa páginas e intervalos como 1-3, 5, 8-10.');
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > count) throw Error(`El intervalo debe estar entre 1 y ${count}, en orden ascendente.`);
    for (let n = start; n <= end; n++) {
      if (seen.has(n)) throw Error(`La página ${n} está repetida.`);
      seen.add(n); pages.push(n - 1);
    }
  }
  return pages;
}
export function detectType(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (new TextDecoder().decode(data.subarray(0, 5)) === '%PDF-') return 'pdf';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'jpg';
  if ([137,80,78,71,13,10,26,10].every((v,i) => data[i] === v)) return 'png';
  if (new TextDecoder().decode(data.subarray(0,4)) === 'RIFF' && new TextDecoder().decode(data.subarray(8,12)) === 'WEBP') return 'webp';
  throw Error('Archivo no compatible: el contenido debe ser PDF, JPG, PNG o WebP.');
}
