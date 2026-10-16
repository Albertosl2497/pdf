export function configureAdFrame(frame,slot){
 const url=new URL(slot.src,location.href);
 const isolated=slot.isolated===true&&url.hostname!==location.hostname&&(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&['localhost','127.0.0.1'].includes(location.hostname)));
 if(slot.isolated&&!isolated)throw Error('El anuncio requiere otro hostname.');
 frame.setAttribute('sandbox',isolated?'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox':'allow-scripts');
 frame.referrerPolicy='no-referrer';frame.src=url.href;
 frame.dataset.messageOrigin=isolated?url.origin:'null';
}
