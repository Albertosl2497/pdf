import {imageInfo} from './image-info.js';
import {bySlug} from './tools.js';
export const SITE_DEFAULTS={brand:'PDF al Instante',description:'Utilidades para documentos de escuela, trabajo y trámites.',public_origin:null,primary_color:'#184f99',accent_color:'#00776f',logo_data:''};
export function text(value,max,label='Texto'){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label}: revisa el texto y su longitud máxima (${max}).`);return value.trim();}
function luminance(color){const channels=color.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];}
export function validateSite(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Configuración de sitio no válida.');
 const site={brand:text(input.brand,100,'Marca'),description:text(input.description,500,'Descripción'),public_origin:null,primary_color:input.primary_color??SITE_DEFAULTS.primary_color,accent_color:input.accent_color??SITE_DEFAULTS.accent_color,logo_data:input.logo_data??''};
 if(input.public_origin){const url=new URL(input.public_origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Usa un origen HTTPS sin ruta.');site.public_origin=url.origin;}
 for(const color of [site.primary_color,site.accent_color])if(typeof color!=='string'||!/^#[a-f0-9]{6}$/i.test(color)||1.05/(luminance(color)+.05)<4.5)throw Error('Los colores deben ser hexadecimales y tener contraste mínimo 4.5:1 sobre blanco.');
 if(typeof site.logo_data!=='string'||site.logo_data.length>44000)throw Error('El logo debe ser PNG de hasta 32 KB y 512 × 512 píxeles.');
 if(site.logo_data){if(!/^data:image\/png;base64,[a-zA-Z0-9+/]+={0,2}$/.test(site.logo_data))throw Error('Solo se admite logo PNG, sin SVG, HTML o URL externa.');const bytes=Uint8Array.from(atob(site.logo_data.split(',')[1]),c=>c.charCodeAt(0));const info=imageInfo(bytes);if(info.type!=='png'||bytes.length>32768||info.width>512||info.height>512)throw Error('El logo supera 32 KB o 512 × 512 píxeles.');}
 return site;
}
export function validateSeo(input){
 if(!input||typeof input!=='object'||!Object.hasOwn(bySlug,input.slug))throw Error('Herramienta SEO no válida.');
 const result={slug:input.slug,title:text(input.title,100,'Título SEO'),description:text(input.description,300,'Descripción SEO'),heading:text(input.heading,100,'Encabezado'),intro:text(input.intro,2000,'Introducción'),instructions:[],faq:[]};
 if(!Array.isArray(input.instructions)||!input.instructions.length||input.instructions.length>10||!Array.isArray(input.faq)||input.faq.length>8)throw Error('Usa de 1 a 10 pasos y hasta 8 preguntas frecuentes.');
 result.instructions=input.instructions.map(s=>text(s,500,'Paso'));
 result.faq=input.faq.map(f=>({question:text(f?.question,200,'Pregunta'),answer:text(f?.answer,1000,'Respuesta')}));return result;
}
export async function readSeo(db,slug){const row=db?await db.prepare('SELECT * FROM tool_seo WHERE slug=?').bind(slug).first():null;if(!row)return null;return {...row,instructions:JSON.parse(row.instructions_json),faq:JSON.parse(row.faq_json)};}
export function seoStatement(db,seo){return db.prepare("INSERT INTO tool_seo(slug,title,description,heading,intro,instructions_json,faq_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,description=excluded.description,heading=excluded.heading,intro=excluded.intro,instructions_json=excluded.instructions_json,faq_json=excluded.faq_json,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(seo.slug,seo.title,seo.description,seo.heading,seo.intro,JSON.stringify(seo.instructions),JSON.stringify(seo.faq));}
