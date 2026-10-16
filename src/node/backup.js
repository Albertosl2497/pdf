import {mkdir,readdir,unlink,rename,chmod,rm,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import lockfile from 'proper-lockfile';
import {SqliteDatabase} from './database.js';
export async function makeBackup(db,directory){
  await mkdir(directory,{recursive:true,mode:0o700});
  const name=`portal-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}.sqlite`,destination=resolve(directory,name),temporary=destination+'.partial';
  try{await db.backupTo(temporary);const check=new SqliteDatabase(temporary,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').first().integrity_check!=='ok')throw Error('La copia no superó la verificación.');}finally{check.close();}await rename(temporary,destination);return destination;}catch(error){await rm(temporary,{force:true});throw error;}
}
export async function pruneBackups(directory,keep=14){const names=(await readdir(directory)).filter(n=>/^portal-[a-zA-Z0-9-]+\.sqlite$/.test(n)).sort().reverse();for(const name of names.slice(keep))await unlink(resolve(directory,name));}
export async function restoreBackup(source,filename){
  if(resolve(source)===resolve(filename))throw Error('La copia y el destino deben ser distintos.');
  const release=await lockfile.lock(filename,{realpath:false,stale:30000,update:10000,retries:0});let candidate,temporary=filename+'.restore-'+crypto.randomUUID();
  try{
    candidate=new SqliteDatabase(source,{readOnly:true});
    if(candidate.prepare('PRAGMA integrity_check').first().integrity_check!=='ok')throw Error('Copia dañada.');
    for(const table of ['settings','tools','pages','owner_account','admin_sessions'])candidate.prepare(`SELECT 1 FROM ${table} LIMIT 1`).all();
    await mkdir(dirname(filename),{recursive:true,mode:0o700});await candidate.backupTo(temporary);candidate.close();candidate=null;
    // Solo con el bloqueo exclusivo de la aplicación y el servidor detenido.
    const exists=await access(filename).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
    const previous=exists?new SqliteDatabase(filename):null;
    if(previous){try{await makeBackup(previous,resolve(dirname(filename),'backups'));const checkpoint=previous.prepare('PRAGMA wal_checkpoint(TRUNCATE)').first();if(checkpoint.busy)throw Error('La base de datos está ocupada.');}finally{previous.close();}}
    const clean=new SqliteDatabase(temporary);try{for(const table of ['admin_sessions','ad_permits','ad_previews','contact_challenges','config_restore_drafts','config_restore_guards'])if(clean.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(table).first())clean.raw.exec(`DELETE FROM ${table}`);clean.raw.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');}finally{clean.close();}
    await rm(filename+'-wal',{force:true});await rm(filename+'-shm',{force:true});await rename(temporary,filename);await chmod(filename,0o600);
  }finally{candidate?.close();await rm(temporary,{force:true});await rm(temporary+'-wal',{force:true});await rm(temporary+'-shm',{force:true});await release();}
}
