const keyCache=new Map();
const decodePart=part=>Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function authorize(request,env,fetchKeys=fetch) {
  if(env.AUTH)return env.AUTH.authorize(request);
  const team=env.ACCESS_TEAM_DOMAIN, audience=env.ACCESS_AUD,owner=env.OWNER_EMAIL;
  if(!team||!audience||!owner)return {status:503,error:'Configura Cloudflare Access y la identidad del propietario para habilitar administración.'};
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team))return {status:503,error:'Configuración de identidad no válida.'};
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token||token.length>16384)return {status:401,error:'Autenticación requerida.'};
  try {
    const parts=token.split('.');if(parts.length!==3)throw Error();
    const header=JSON.parse(new TextDecoder().decode(decodePart(parts[0]))), claims=JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
    const now=Date.now()/1000;
    if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==`https://${team}`||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||(claims.nbf&&claims.nbf>now+30)||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(audience))throw Error();
    let keys=keyCache.get(team);
    if(!keys||keys.expires<Date.now()) {
      const response=await fetchKeys(`https://${team}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error();const body=await response.json();
      if(!Array.isArray(body.keys))throw Error();keys={values:body.keys,expires:Date.now()+300000};keyCache.set(team,keys);
    }
    const jwk=keys.values.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error();
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodePart(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error();
    if(typeof claims.email!=='string'||claims.email.toLowerCase()!==owner.toLowerCase())return {status:403,error:'Acceso reservado al propietario.'};
    return {status:200,email:claims.email};
  }catch{return {status:401,error:'Identidad no válida o caducada.'};}
}
