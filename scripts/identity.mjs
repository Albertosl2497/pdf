import {resolve} from 'node:path';
import {openDatabase} from '../src/node/database.js';
import {SITE_DEFAULTS,validateSite} from '../src/configuration.js';
const [name,country,email]=process.argv.slice(2);
if(!name||!country||!email)throw Error('Uso: npm run admin:identity -- "Nombre público" "País" correo@dominio');
const db=await openDatabase(resolve(process.env.DATA_DIR||'data','portal.sqlite'));
try{
 const row=db.prepare("SELECT value_json FROM settings WHERE key='site'").first();
 const site=validateSite({...SITE_DEFAULTS,...JSON.parse(row.value_json),responsible_name:name,responsible_country:country,contact_email:email});
 db.batch([db.prepare("UPDATE settings SET value_json=json_set(value_json,'$.responsible_name',?,'$.responsible_country',?,'$.contact_email',?),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='site'").bind(site.responsible_name,site.responsible_country,site.contact_email),db.prepare("INSERT INTO audit_log(actor,action) VALUES('console','site.responsible.update')")]);
 console.log('Responsable público actualizado. Marca, dominio, colores, publicidad y credenciales conservados.');
}finally{db.close();}
