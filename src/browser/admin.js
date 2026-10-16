import {themeData,loadTheme} from './configuration-admin.js';
import './advertising-admin.js';
import './backoffice.js';
const $=id=>document.getElementById(id);
const tell=message=>{$('admin-status').textContent=message;};
async function api(path,body){const response=await fetch('/api/admin/'+path,body?{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo completar la operación.');return result;}
async function load(){
  try{
    const data=await api('config'),site=JSON.parse(data.settings.find(s=>s.key==='site')?.value_json||'{}');
    loadTheme(site);$('brand').value=site.brand||'';$('description').value=site.description||'';$('public-origin').value=site.public_origin||'';
    const {tools}=await import('../tools.js');$('tool-settings').replaceChildren();
    for(const tool of tools){const label=document.createElement('label');label.textContent=tool.name;const select=document.createElement('select');for(const [value,text] of [['published','Disponible'],['maintenance','Mantenimiento'],['draft','Oculta']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=data.tools.find(t=>t.slug===tool.slug)?.status||'published';select.onchange=()=>save('tool',{slug:tool.slug,status:select.value});label.append(select);$('tool-settings').append(label);}
    $('saved-pages').replaceChildren();for(const page of data.pages){const button=document.createElement('button');button.textContent=page.title+' ('+page.status+')';button.onclick=()=>{for(const [id,key] of [['page-slug','slug'],['page-title','title'],['page-description','description'],['page-body','body_text'],['page-state','status']])$(id).value=page[key];};$('saved-pages').append(button);}
  }catch(error){tell(error.message);}
}
async function save(path,data){try{await api(path,data);tell('Guardado en la base de datos.');await load();}catch(error){tell(error.message);}}
$('save-site').onclick=()=>save('site',{...themeData(),brand:$('brand').value,description:$('description').value,public_origin:$('public-origin').value});
$('save-page').onclick=()=>save('page',{slug:$('page-slug').value,title:$('page-title').value,description:$('page-description').value,body_text:$('page-body').value,status:$('page-state').value});
$('export').onclick=async()=>{try{const data=await api('export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='configuracion-pdf.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){tell(error.message);}};
load();

document.addEventListener('pdf:configuration-restored',()=>{load();});
