import {configureAdFrame} from './ad-frame.js';
let revision=0,frames=[],currentSignature='',controller,activeRevision='',resizeTimer;
export function removeAdvertisements(){revision++;controller?.abort();controller=null;for(const box of frames){clearTimeout(box.adTimeout);box.remove();}frames=[];currentSignature='';activeRevision='';}
export async function refreshAdvertisements(){
  if(document.hidden||location.pathname.startsWith('/admin')){removeAdvertisements();return;}
  if(!['/','/herramientas','/guias'].includes(location.pathname)&&!document.querySelector('#tool')){removeAdvertisements();return;}
  const container=document.getElementById('advertising-zone');if(!container){removeAdvertisements();return;}
  const style=getComputedStyle(container),maxWidth=parseFloat(style.maxWidth)||document.documentElement.clientWidth;
  const availableWidth=Math.max(0,Math.min(document.documentElement.clientWidth,maxWidth)-parseFloat(style.paddingLeft||0)-parseFloat(style.paddingRight||0));
  const device=matchMedia('(min-width: 768px)').matches?'desktop':'mobile';
  const signature=location.pathname+':'+device;
  if(frames.some(box=>box.querySelector('iframe').width>availableWidth))removeAdvertisements();
  if(currentSignature===signature&&frames.length)return;
  removeAdvertisements();const token=revision;controller=new AbortController();
  try{
    const response=await fetch('/api/advertising',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:location.pathname,device}),credentials:'omit',signal:controller.signal});
    if(!response.ok)return;const data=await response.json();if(token!==revision)return;
    currentSignature=signature;activeRevision=data.revision||'';
    for(const slot of data.slots||[]){if(slot.width>availableWidth)continue;
      const box=document.createElement('section');box.className='advertisement';box.setAttribute('aria-label','Publicidad');
      const label=document.createElement('p');label.textContent='Publicidad';label.className='small';
      const frame=document.createElement('iframe');frame.title='Banner publicitario';configureAdFrame(frame,slot);frame.width=slot.width;frame.height=slot.height;frame.loading='eager';box.append(label,frame);container.append(box);frames.push(box);box.adTimeout=setTimeout(()=>{box.remove();frames=frames.filter(f=>f!==box);},10000);
    }
  }catch{/* Un bloqueo publicitario o fallo de red no afecta al documento. */}
}
// Elimina primero el contenido: un tercero ya cargado no puede "desenviarse".
// El polling comprueba el interruptor sin renovar banners activos.
async function checkActivation(){
  if(!frames.length||document.hidden)return;
  try{const r=await fetch('/api/advertising/status',{credentials:'omit',cache:'no-store'});if(!r.ok){removeAdvertisements();return;}const data=await r.json();if(!data.enabled)removeAdvertisements();else if(data.revision!==activeRevision){removeAdvertisements();refreshAdvertisements();}}catch{removeAdvertisements();}
}
setInterval(checkActivation,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkActivation();if(!frames.length)refreshAdvertisements();}});
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(refreshAdvertisements,250);});
document.addEventListener('pdf:navigation',()=>{removeAdvertisements();refreshAdvertisements();});

window.addEventListener('message',event=>{if(event.data?.type!=='pdf-ad-state'||!['loaded','failed'].includes(event.data.state))return;const box=frames.find(b=>b.querySelector('iframe')?.contentWindow===event.source);if(!box||event.origin!==box.querySelector('iframe').dataset.messageOrigin)return;clearTimeout(box.adTimeout);if(event.data.state==='failed'){box.remove();frames=frames.filter(f=>f!==box);}});
