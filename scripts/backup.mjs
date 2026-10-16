import {resolve} from 'node:path';
import {SqliteDatabase} from '../src/node/database.js';
import {makeBackup,restoreBackup} from '../src/node/backup.js';
const dir=resolve(process.env.DATA_DIR||'data'),filename=resolve(dir,'portal.sqlite');
if(process.argv[2]==='restore'){
  if(!process.argv[3]||process.argv[4]!=='--confirm-replace')throw Error('Detén el servidor. Uso: npm run backup:restore -- /ruta/copia.sqlite --confirm-replace');
  await restoreBackup(resolve(process.argv[3]),filename);console.log('Base restaurada; sesiones revocadas. Se conservó una copia previa si existía.');
}else{
  const db=new SqliteDatabase(filename,{readOnly:true});try{await makeBackup(db,resolve(dir,'backups'));console.log('Copia íntegra guardada en el directorio de backups.');}finally{db.close();}
}
