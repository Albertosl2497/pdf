import {refreshAdvertisements} from './advertisements.js';
import {isAllowed,setAllowed,trackView} from './telemetry.js';
const $=id=>document.getElementById(id);
const preferences=$('preferences');
function refresh(){refreshAdvertisements();if($('statistics-consent'))$('statistics-consent').checked=isAllowed();if($('preference-state'))$('preference-state').textContent=isAllowed()?'Estadísticas opcionales activadas.':'Estadísticas opcionales desactivadas.';}
$('open-preferences')?.addEventListener('click',()=>{preferences.hidden=false;refresh();$('statistics-consent').focus();});
$('save-preferences')?.addEventListener('click',()=>{const before=isAllowed();setAllowed($('statistics-consent').checked);refresh();preferences.hidden=true;$('open-preferences').focus();if(!before&&isAllowed())trackView();});
$('reject-preferences')?.addEventListener('click',()=>{setAllowed(false);refresh();preferences.hidden=true;$('open-preferences').focus();});
document.addEventListener('pdf:consent',refresh);refresh();trackView();
const form=$('contact-form');
if(form){
  let token='';const status=$('contact-status'),send=$('send-contact');
  async function prepare(){send.disabled=true;try{const r=await fetch('/api/contact/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await r.json();if(!r.ok)throw Error(data.error);token=data.token;status.textContent='Escribe tu consulta.';setTimeout(()=>{send.disabled=false;},data.min_wait_ms);}catch(error){status.textContent=error.message||'No se pudo preparar el formulario. Recarga para reintentar.';}}
  form.addEventListener('submit',async e=>{e.preventDefault();if(send.disabled)return;send.disabled=true;try{const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('contact-email').value,message:$('contact-message').value,website:$('contact-website').value,token})});const data=await r.json();if(!r.ok)throw Error(data.error);form.reset();status.textContent=data.message;token='';send.textContent='Consulta guardada';}catch(error){const message=error.message;await prepare();status.textContent=message;}});
  prepare();
}
