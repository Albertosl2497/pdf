import {scrypt as scryptCallback,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {json,readJson} from '../http.js';
import {consume} from '../public-api.js';
const scrypt=promisify(scryptCallback),sha=value=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password){
  if(typeof password!=='string'||password.length<14||password.length>256)throw Error('Usa una contraseña de entre 14 y 256 caracteres.');
  const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return `scrypt-v1$${salt}$${key.toString('hex')}`;
}
async function matches(password,hash){
  const [version,salt,value]=hash.split('$');if(version!=='scrypt-v1'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(value))return false;
  const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return timingSafeEqual(key,Buffer.from(value,'hex'));
}
export class SessionAuth {
  constructor(db,origin){this.db=db;this.secure=new URL(origin).protocol==='https:';this.cookieName=this.secure?'__Host-pdf-session':'pdf-session';this.hashing=false;}
  token(request){const parts=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim());const raw=parts.find(p=>p.startsWith(this.cookieName+'='))?.slice(this.cookieName.length+1);return /^[a-f0-9]{64}$/.test(raw||'')?raw:null;}
  cookie(token,maxAge=28800){return `${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.secure?'; Secure':''}`;}
  async authorize(request){
    const token=this.token(request);if(!token)return {status:401,error:'Inicia sesión para acceder a administración.'};
    const row=this.db.prepare('SELECT email FROM owner_account WHERE id=1 AND EXISTS(SELECT 1 FROM admin_sessions WHERE token_hash=? AND expires_ms>?)').bind(sha(token),Date.now()).first();
    return row?{status:200,email:row.email}:{status:401,error:'Sesión caducada o no válida.'};
  }
  async endpoint(request){
    if(request.method!=='POST')return json({error:'Método no permitido.'},405);
    if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origen no permitido.'},403);
    if(new URL(request.url).pathname==='/api/auth/logout'){
      const token=this.token(request);if(token)this.db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(sha(token)).run();
      const r=json({ok:true});r.headers.set('Set-Cookie',this.cookie('',0));return r;
    }
    try{
      const data=await readJson(request,2048);
      if(typeof data?.email!=='string'||data.email.length>254||typeof data.password!=='string'||data.password.length>256)return json({error:'Credenciales no válidas.'},400);
      if(!await consume(this.db,'admin-login',10,900000))return json({error:'Demasiados intentos. Espera 15 minutos.'},429);
      const owner=this.db.prepare('SELECT email,password_hash FROM owner_account WHERE id=1').first();
      if(!owner)return json({error:'El propietario debe configurarse desde la consola del servidor.'},503);
      if(this.hashing)return json({error:'Espera un momento antes de reintentar.'},429);
      let valid;this.hashing=true;
      try{valid=await matches(data.password,owner.password_hash);}finally{this.hashing=false;}
      if(!valid||data.email.trim().toLowerCase()!==owner.email.toLowerCase())return json({error:'Correo o contraseña incorrectos.'},401);
      const token=randomBytes(32).toString('hex');this.db.prepare('DELETE FROM admin_sessions WHERE expires_ms<=?').bind(Date.now()).run();
      this.db.prepare('INSERT INTO admin_sessions VALUES(?,?)').bind(sha(token),Date.now()+28800000).run();
      const r=json({ok:true});r.headers.set('Set-Cookie',this.cookie(token));return r;
    }catch{return json({error:'No se pudo iniciar sesión. Revisa los datos.'},400);}
  }
}
export async function setOwner(db,email,password){
  if(typeof email!=='string'||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Correo no válido.');
  const hash=await hashPassword(password);
  db.batch([db.prepare('INSERT INTO owner_account VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash').bind(email.trim().toLowerCase(),hash),db.prepare('DELETE FROM admin_sessions'),db.prepare("DELETE FROM request_limits WHERE bucket LIKE 'admin-login:%'")]);
}
