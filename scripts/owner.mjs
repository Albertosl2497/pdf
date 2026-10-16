import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {resolve} from 'node:path';
import {openDatabase} from '../src/node/database.js';
import {setOwner} from '../src/node/session.js';
const email=process.argv[2];
if(!email){console.error('Uso: npm run admin:owner -- correo@dominio (contraseña por entrada estándar)');process.exit(1);}
let password;
if(process.stdin.isTTY){
  let muted=false;const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk);done();}});
  const rl=createInterface({input:process.stdin,output,terminal:true});
  process.stdout.write('Contraseña nueva (14–256 caracteres; no se muestra): ');muted=true;
  password=await rl.question('');process.stdout.write('\nRepite la contraseña: ');const confirmation=await rl.question('');process.stdout.write('\n');rl.close();
  if(password!==confirmation)throw Error('Las contraseñas no coinciden.');
}else{let data='';for await(const chunk of process.stdin){data+=chunk;if(data.length>1024)throw Error('Entrada demasiado grande.');}password=data.replace(/\r?\n$/,'');}
const db=await openDatabase(resolve(process.env.DATA_DIR||'data','portal.sqlite'));
try{await setOwner(db,email,password);console.log('Propietario guardado; sesiones anteriores revocadas.');}finally{db.close();password='';}
