import {mkdir,open,readFile,rm} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const output=resolve(process.argv[2]||'release/herramientas-pdf-vps-desarrollo.tar.gz');
await mkdir(dirname(output),{recursive:true});
const archive=await open(output,'wx',0o600);let digest;
try{
 digest=await open(output+'.sha256','wx',0o600);
 const paths=['package.json','package-lock.json','Dockerfile','compose.yaml','.dockerignore','.gitignore','.env.example','README.md','schema.sql','wrangler.toml','deploy','docs','scripts','src','public','tests','dist'];
 await new Promise((done,reject)=>{const child=spawn('tar',['-czf','-',...paths],{stdio:['ignore',archive.fd,'inherit']});child.on('error',reject);child.on('exit',code=>code===0?done():reject(Error('No se pudo crear el archivo.')));});
 await archive.close();
 const checksum=createHash('sha256').update(await readFile(output)).digest('hex');await digest.writeFile(`${checksum}  ${basename(output)}\n`);await digest.close();
 console.log('Paquete de desarrollo creado: '+output);
}catch(error){await archive.close().catch(()=>{});await digest?.close().catch(()=>{});await rm(output,{force:true});if(digest)await rm(output+'.sha256',{force:true});throw error;}
