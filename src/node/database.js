import {DatabaseSync,backup} from 'node:sqlite';
import {readFile,mkdir,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
class Statement {
  constructor(database,sql,args=[]){this.database=database;this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.database,this.sql,args);}
  first(column){const row=this.database.prepare(this.sql).get(...this.args);return column?row?.[column]??null:row??null;}
  all(){return {results:this.database.prepare(this.sql).all(...this.args),success:true};}
  run(){const result=this.database.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}};}
  execute(){const statement=this.database.prepare(this.sql);return statement.columns().length?this.all():this.run();}
}
export class SqliteDatabase {
  constructor(filename,{readOnly=false}={}){
    this.filename=filename;this.raw=new DatabaseSync(filename,{readOnly});
    this.raw.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    if(!readOnly)this.raw.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  }
  prepare(sql){return new Statement(this.raw,sql);}
  batch(statements){this.raw.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute());this.raw.exec('COMMIT');return results;}catch(error){this.raw.exec('ROLLBACK');throw error;}}
  close(){this.raw.close();}
  async backupTo(destination){await backup(this.raw,destination);await chmod(destination,0o600);}
}
export async function openDatabase(filename){
  await mkdir(dirname(filename),{recursive:true,mode:0o700});
  const db=new SqliteDatabase(filename);
  try{
    db.raw.exec(await readFile(new URL('../../schema.sql',import.meta.url),'utf8'));
    db.raw.exec(`CREATE TABLE IF NOT EXISTS owner_account(id INTEGER PRIMARY KEY CHECK(id=1),email TEXT NOT NULL,password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,expires_ms INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS session_expiry ON admin_sessions(expires_ms);`);
    await chmod(filename,0o600);return db;
  }catch(error){db.close();throw error;}
}
