import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {SqliteDatabase} from '../src/node/database.js';
import {restoreBackup} from '../src/node/backup.js';
const source=process.argv[2];if(!source)throw Error('Uso: npm run backup:verify -- /ruta/copia.sqlite');
const dir=await mkdtemp(join(tmpdir(),'pdf-restore-check-'));let restored,original;
try{
 original=new SqliteDatabase(resolve(source),{readOnly:true});
 const expected=original.prepare('SELECT email,password_hash FROM owner_account WHERE id=1').first();
 if(!expected)throw Error('La copia no contiene un propietario configurado.');
 const counts=Object.fromEntries(['settings','pages','contact_messages','usage_daily'].map(t=>[t,original.prepare(`SELECT count(*) n FROM ${t}`).first().n]));
 original.close();original=null;
 await restoreBackup(resolve(source),join(dir,'check.sqlite'));
 restored=new SqliteDatabase(join(dir,'check.sqlite'),{readOnly:true});
 if(restored.prepare('PRAGMA integrity_check').first().integrity_check!=='ok')throw Error('Integridad incorrecta.');
 const owner=restored.prepare('SELECT email,password_hash FROM owner_account WHERE id=1').first();
 if(JSON.stringify(expected)!==JSON.stringify(owner))throw Error('El propietario no coincide con la copia.');
 for(const [table,count] of Object.entries(counts))if(restored.prepare(`SELECT count(*) n FROM ${table}`).first().n!==count)throw Error('No coincide el contenido de '+table);
 if(restored.prepare('SELECT count(*) n FROM admin_sessions').first().n!==0)throw Error('Sesiones no revocadas.');
 console.log('Recuperación verificada en una base temporal: integridad, propietario, configuración, consultas y estadísticas conservados; sesiones revocadas. La base en uso no se modificó.');
}finally{original?.close();restored?.close();await rm(dir,{recursive:true,force:true});}
