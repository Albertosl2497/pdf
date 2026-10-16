import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {imageInfo} from '../src/image-info.js';
test('preflight lee PNG y WebP reales antes de decodificar',async()=>{
  assert.deepEqual(imageInfo(await readFile('tests/fixtures/transparencia.png')),{width:500,height:300,type:'png'});
  assert.deepEqual(imageInfo(await readFile('tests/fixtures/vertical.webp')),{width:400,height:600,type:'webp'});
});
test('preflight rechaza dimensiones abusivas y cabeceras truncadas',async()=>{
  const png=new Uint8Array(await readFile('tests/fixtures/transparencia.png'));const view=new DataView(png.buffer);view.setUint32(16,20000);assert.throws(()=>imageInfo(png),/megapíxeles/);
  for(const n of [0,4,10,25])assert.throws(()=>imageInfo(png.subarray(0,n)));
  const webp=new Uint8Array(await readFile('tests/fixtures/vertical.webp'));webp[4]=255;webp[5]=255;assert.throws(()=>imageInfo(webp),/cabecera/);
});
test('preflight JPEG lee SOF y rechaza imágenes de píxeles excesivos',()=>{
  const jpeg=new Uint8Array([255,216,255,192,0,8,8,1,44,1,244,1,255,217]);assert.deepEqual(imageInfo(jpeg),{width:500,height:300,type:'jpg'});jpeg[7]=255;jpeg[8]=255;assert.throws(()=>imageInfo(jpeg),/megapíxeles/);
});
