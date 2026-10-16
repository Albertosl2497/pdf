import { build } from 'esbuild';
import { mkdir, cp, copyFile, rm, readFile, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({ entryPoints: { login: 'src/browser/login.js', site: 'src/browser/site.js', app: 'src/browser/app.js', admin: 'src/browser/admin.js', engine: 'src/browser/engine-worker.js', renderer: 'src/browser/renderer.js' }, outdir: 'dist/assets', bundle: true, splitting: true, format: 'esm', target: 'es2022', minify: true, legalComments: 'eof' });
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/assets/pdf.worker.mjs');
await cp('node_modules/pdfjs-dist/cmaps', 'dist/assets/cmaps', { recursive: true });
await cp('node_modules/pdfjs-dist/standard_fonts', 'dist/assets/standard_fonts', { recursive: true });
await cp('node_modules/pdfjs-dist/wasm', 'dist/assets/wasm', { recursive: true });

const notices = await Promise.all([['PDF-lib 1.17.1', 'node_modules/pdf-lib/LICENSE.md'], ['PDF.js 5.4.624', 'node_modules/pdfjs-dist/LICENSE'], ['fflate 0.8.3', 'node_modules/fflate/LICENSE']].map(async ([name,path])=>name+'\n'+await readFile(path,'utf8')));
await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n'));
