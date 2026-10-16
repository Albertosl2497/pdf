// La compatibilidad ampliada solo se permite en otro hostname.
export function isolatedAdOrigin(env){
  if(!env.AD_ORIGIN)return null;
  const ad=new URL(env.AD_ORIGIN),main=new URL(env.APP_ORIGIN);
  const local=url=>url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
  if(ad.origin!==env.AD_ORIGIN||ad.username||ad.password||ad.hostname===main.hostname||!(ad.protocol==='https:'||local(ad)&&local(main)))throw Error('AD_ORIGIN debe ser un origen HTTPS en otro hostname.');
  return ad.origin;
}
export function frameDescriptor(path,env){const origin=isolatedAdOrigin(env);return {src:origin?origin+path:path,isolated:!!origin};}
