import {detectType,LIMITS} from './validation.js';
/** Lee dimensiones de cabeceras antes de entregar imágenes al decodificador. */
export function imageInfo(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),type=detectType(bytes),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const fail=()=>{throw Error('La cabecera de la imagen está dañada o no es compatible.');};
  let width,height;
  if(type==='png'){
    if(bytes.length<33||view.getUint32(8)!==13||new TextDecoder().decode(bytes.subarray(12,16))!=='IHDR')fail();
    width=view.getUint32(16);height=view.getUint32(20);
  }else if(type==='jpg'){
    let at=2;
    while(at+3<bytes.length){
      if(bytes[at++]!==255)fail();while(bytes[at]===255)at++;
      const marker=bytes[at++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
      if(at+2>bytes.length)fail();const length=view.getUint16(at);if(length<2||at+length>bytes.length)fail();
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)fail();height=view.getUint16(at+3);width=view.getUint16(at+5);break;}at+=length;
    }
  }else if(type==='webp'){
    if(bytes.length<25||view.getUint32(4,true)+8>bytes.length)fail();
    let at=12;
    while(at+8<=bytes.length){
      const name=new TextDecoder().decode(bytes.subarray(at,at+4)),length=view.getUint32(at+4,true),data=at+8;
      if(data+length>bytes.length)fail();
      if(name==='VP8X'){if(length<10)fail();if(bytes[data]&2)throw Error('No se admiten imágenes WebP animadas.');width=1+bytes[data+4]+(bytes[data+5]<<8)+(bytes[data+6]<<16);height=1+bytes[data+7]+(bytes[data+8]<<8)+(bytes[data+9]<<16);break;}
      if(name==='VP8 '){if(length<10||bytes[data+3]!==157||bytes[data+4]!==1||bytes[data+5]!==42)fail();width=view.getUint16(data+6,true)&16383;height=view.getUint16(data+8,true)&16383;break;}
      if(name==='VP8L'){if(length<5||bytes[data]!==47)fail();width=1+bytes[data+1]+((bytes[data+2]&63)<<8);height=1+(bytes[data+2]>>6)+(bytes[data+3]<<2)+((bytes[data+4]&15)<<10);break;}
      at=data+length+(length%2);
    }
  }else throw Error('Selecciona una imagen JPG, PNG o WebP.');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)fail();
  if(width*height>LIMITS.imagePixels||width>16384||height>16384)throw Error('La imagen supera los 20 megapíxeles o los 16384 píxeles por lado. Redúcela antes de continuar.');
  return {width,height,type};
}
