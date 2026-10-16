const KEY='pdf-preferences-v1';
let allowed=false,adsAllowed=false;
try{const stored=JSON.parse(localStorage.getItem(KEY)||'null');allowed=stored?.statistics===true;adsAllowed=stored?.advertising===true;}catch{}
export const isAllowed=()=>allowed;
export const advertisingAllowed=()=>adsAllowed;
export function setAllowed(value,advertising=adsAllowed){allowed=value;adsAllowed=advertising;try{localStorage.setItem(KEY,JSON.stringify({statistics:value,advertising:adsAllowed}));}catch{}document.dispatchEvent(new CustomEvent('pdf:consent',{detail:value}));}
export function track(event,tool,duration=0){
  if(!allowed)return;
  const duration_ms=Math.min(3600000,Math.max(0,Math.round(duration/1000)*1000));
  return fetch('/api/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,tool,event,duration_ms}),keepalive:true}).catch(()=>{});
}
export function trackView(){const path=location.pathname.slice(1)||'inicio';if(path.startsWith('admin')||path.startsWith('guias/'))return;return track('view',path);}
window.addEventListener('storage',e=>{if(e.key===KEY){try{const stored=JSON.parse(e.newValue||'null');allowed=stored?.statistics===true;adsAllowed=stored?.advertising===true;}catch{allowed=false;adsAllowed=false;}document.dispatchEvent(new CustomEvent('pdf:consent',{detail:allowed}));}});
