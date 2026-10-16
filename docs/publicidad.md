# Publicidad: configuración y alcance

El adaptador admite banners con `atOptions` y script HTTPS `/CLAVE/invoke.js` o `/22/CLAVE`, conservando la URL exacta entregada y la misma clave de 32 caracteres. El soporte de una ruta no certifica la titularidad del dominio ni la compatibilidad comercial del script. No admite cualquier fragmento HTML, popunders, notificaciones, redirecciones automáticas ni claves secretas. La clave del banner es pública y debe copiarse del código real emitido para el sitio. No hay códigos, seller IDs o anuncios de ejemplo precargados en producción.

## Configurar sin publicar

1. En `/admin`, añadir un banner, elegir formato/dispositivo e indicar clave y URL exactas del código real. Los formatos admitidos son 300×250, 320×50, 320×100 y 728×90; no se debe transformar el código de otro formato para aparentar compatibilidad. Guardar con la activación global desmarcada.
2. Autorizar en `AD_PROVIDER_HOSTS` únicamente los hostnames HTTPS exactos comprobados contra el código y documentación del proveedor. Separarlos por comas, sin comodines, esquema ni rutas. No se proporcionan dominios inventados ni se deduce autenticidad de un hostname. El operador del servidor es responsable de comprobar su procedencia.
3. Reiniciar la aplicación para aplicar las variables. En Compose, editar `.env` y ejecutar `docker compose up -d`. Mantener `ADVERTISING_ENABLED=false` mientras se revisa.
4. Para probar el código real sin activarlo al público, marcar el consentimiento de prueba en administración y usar “Probar banner guardado”. Esto contacta al proveedor y puede tener efectos publicitarios reales: usar el procedimiento de prueba autorizado por el proveedor, no pulsar anuncios propios ni generar tráfico artificial. Sin códigos reales se puede seguir desarrollando el resto del portal.
5. Revisar compatibilidad del origen separado, CSP, recursos necesarios, comportamiento en móvil, política de privacidad y requisitos de consentimiento aplicables. Si el código requiere permisos incompatibles con la frontera de documentos, mantenerlo desactivado y evaluar un adaptador aprobado. No retirar el aislamiento para ocultar el problema.

Las pruebas automáticas utilizan un proveedor sintético interceptado por Playwright, sin solicitar anuncios reales. Incluyen el patrón XHR → iframe interno → scripts dinámicos, eval e imagen de otro dominio observado en el código compartido. No prueban aprobación de Adsterra, impresiones válidas, ingresos ni compatibilidad del código comercial. La obtención de la referencia pública del proveedor no estuvo disponible en este entorno; no se presenta como verificada documentación vigente ni una lista oficial de dominios.

## Activar después de la revisión

Son necesarios simultáneamente:

- `ADVERTISING_ENABLED=true` en servidor.
- Configuración global habilitada desde el panel.
- Revisión declarada por el propietario y al menos un banner completo habilitado, con dominio autorizado.
- Los banners se solicitan automáticamente en páginas habilitadas. No hay opción de publicidad en preferencias; las estadísticas propias continúan desactivadas hasta aceptación.

El banner solo aparece al final del contenido, en inicio, catálogo, listado de guías y herramientas disponibles. Se excluyen contacto, administración, legales, errores y herramientas ocultas/en mantenimiento. Se selecciona un solo banner adecuado al dispositivo y se omite si no cabe; no se fuerza un banner de escritorio en móvil. Sin configuración no se reserva un espacio vacío. La etiqueta “Publicidad” lo distingue de los controles de documentos.

No hay renovación periódica de impresiones. Los cambios de página, dispositivo o configuración pueden reconstruir un banner; la compatibilidad con las políticas reales del proveedor sigue pendiente. Cambiar el ancho dentro del mismo dispositivo no vuelve a cargar un banner que sigue cabiendo.

## Aislamiento y fallos

Sin un origen publicitario separado, el código corre en iframe con `sandbox=allow-scripts`, sin `allow-same-origin`, ventanas emergentes, formularios o navegación del nivel superior. En el VPS se utiliza el origen separado descrito a continuación, con permisos ampliados únicamente allí. El servidor envía además una CSP con sandbox y orígenes de recursos limitados. Las preferencias previas con `advertising:false` ya no controlan la publicidad. La API pública recibe página y dispositivo, sin declarar consentimiento del visitante; admite e ignora el campo legacy `consent` de clientes antiguos. La carga inicial requiere un permiso aleatorio de un uso y 60 segundos emitido al solicitar un banner en una página habilitada. No se envían archivos, nombres, bytes ni contraseñas a la API publicitaria.

El único mensaje aceptado por el padre indica carga/fallo; se comprueban origen del marco (opaco en modo estricto o el origen separado configurado), ventana emisora y valor enumerado. No se intercambian documentos o instrucciones de navegación. Los anuncios no tienen acceso al DOM, localStorage o credenciales del contexto que procesa los archivos. El proveedor sí recibe datos técnicos propios de su conexión. La prueba de aislamiento no constituye una auditoría general de todos los navegadores ni del proveedor.

Si falla o se bloquea el script, se retira su marco; un plazo de diez segundos limita las cargas que no confirman estado. Esto no verifica que se haya servido un anuncio comercial: el éxito de carga de un script no es una impresión validada. El procesamiento y la descarga PDF funcionan independientemente.

Desactivar estadísticas no retira los anuncios. “Desactivar toda la publicidad” revoca permisos pendientes y se refleja en clientes activos en su siguiente comprobación, prevista cada 60 segundos; los navegadores pueden retrasar tareas en segundo plano. Navegar o recargar retira el contenido anterior y vuelve a consultar la configuración del propietario. No se puede garantizar borrado remoto ni detener un cliente desconectado.

## ads.txt

Pegar exclusivamente los registros proporcionados para el dominio real. Se validan estructura y tamaño, se conserva su texto y se sirven como `text/plain` con `nosniff` en `/ads.txt`. Sin registros responde 404. La publicación del archivo no requiere activar banners. No se inventan vendedores ni se acredita titularidad o aprobación con una validación sintáctica. Se admiten registros estándar dominio/vendedor/DIRECT–RESELLER/certificado opcional y comentarios; otras directivas requieren una ampliación revisada.

## Pruebas

`npm test` cubre permisos, datos, orígenes, dominios, `ads.txt`, tokens de un uso y preview privada. `npm run test:advertising` usa una base temporal y respuestas de proveedor sintéticas: verifica carga automática sin aceptar estadísticas, preferencias publicitarias antiguas ignoradas, aislamiento real de DOM/almacenamiento, interruptor global, ausencia de cargas duplicadas por resize, funcionamiento PDF con proveedor bloqueado, vista previa administrativa y desactivación. No ejecutar ensayos automatizados contra códigos comerciales reales.

## Banners dinámicos en un origen separado (VPS)

Compose configura `AD_ORIGIN=https://ads.${DOMAIN}`. Crear DNS A para `ads` apuntando al mismo VPS y, si existe AAAA, mantenerlo correcto o retirar el que apunte a otro servidor. Caddy sirve HTTPS para ambos hostnames. El subdominio ofrece exclusivamente marcos de publicidad con permisos temporales; `/`, `/admin`, `/api/*` y assets devuelven 404. No publica el panel ni una segunda aplicación. Un 404 en la raíz del subdominio es esperado; un error de certificado no lo es.

El marco permite `allow-scripts`, `allow-same-origin` y ventanas publicitarias separadas, conservando el bloqueo de navegación del padre. Los scripts inline y `eval` se permiten solo dentro del origen publicitario. Los enlaces publicitarios pueden abrir otra pestaña; el proveedor debe revisarse para comprobar que no genera ventanas no deseadas. La política del sitio principal sigue sin permitir scripts inline ni `unsafe-eval`, y autoriza únicamente el subdominio configurado como marco adicional. Los documentos, DOM y almacenamiento del sitio principal quedan separados por origen. La cookie de sesión HTTPS usa `__Host-`, sin Domain, y el subdominio no sirve endpoints administrativos ni CORS. Se deshabilita relajar document.domain y se utiliza Origin-Agent-Cluster.

El proveedor recibe datos técnicos y puede almacenar identificadores en el origen publicitario o contactar dominios aprobados al visitar una página con publicidad habilitada. Desactivar publicidad desde administración retira los marcos en la siguiente comprobación, pero no borra cookies del proveedor ni revierte datos enviados. No es una certificación de privacidad o de seguridad de terceros. Un subdominio es otro origen, pero comparte sitio registrable: los controles de CSRF y cookies siguen siendo necesarios.

`AD_PROVIDER_HOSTS` continúa siendo una lista de hostnames exactos para scripts, imágenes, conexiones e iframes. No se acepta `*` ni `https:` global. Para el código y la respuesta compartidos se observaron `bauval.org`, `static.nresystems.com` y `cdn.storageimagedisplay.com`; autorizar esos recursos no certifica la titularidad de los dominios. La URL de destino de un enlace no necesita añadirse como recurso de carga. Si el proveedor exige otros recursos, revisar las peticiones y su función antes de ampliar permisos.

### Aplicar esta actualización al VPS existente

1. Crear el registro DNS `A`, nombre `ads`, valor IPv4 del VPS. Mantener la publicidad pública desactivada.
2. En `/opt/pdfalinstante`, ejecutar `docker compose exec app npm run backup:create` y descargar una copia privada externa según la guía del VPS.
3. Ejecutar `git pull --ff-only origin main`.
4. Editar `.env`, conservando DOMAIN, correo y preferencias existentes. Para esta prueba:

```dotenv
ADVERTISING_ENABLED=false
AD_PROVIDER_HOSTS=bauval.org,static.nresystems.com,cdn.storageimagedisplay.com
```

5. Ejecutar, uno por uno, deteniéndose ante cualquier error:

```sh
docker compose config --quiet
docker compose build
docker compose up -d
docker compose restart web
docker compose ps
```

Reiniciar `web` es necesario para cargar el Caddyfile modificado: `up -d` por sí solo puede dejar el proxy anterior ejecutándose. El reinicio causa una interrupción breve. No borrar volúmenes.

6. Comprobar `getent ahostsv4 ads.pdfalinstante.com`, `curl -I https://ads.pdfalinstante.com` y `docker compose logs --tail=100 web`. La raíz debe devolver 404 sobre HTTPS válido; no usar `curl -k`.
7. Recargar administración con Ctrl+F5. El estado debe indicar `Marco: https://ads.pdfalinstante.com`. Mantener la configuración del banner guardada; no pegar de nuevo scripts en el sitio. Marcar el consentimiento de prueba y usar una sola vez «Probar banner guardado». Revisar imagen visible, consola y móvil sin pulsar anuncios propios.
8. Si hay un bloqueo CSP de otro recurso o una respuesta vacía, mantener publicidad desactivada y revisar el caso. La prueba sintética no garantiza entrega comercial, CORS, cookies o aceptación de impresiones por Adsterra.
9. Solo tras revisar la prueba y las políticas, cambiar `ADVERTISING_ENABLED=true`, ejecutar `docker compose up -d`, marcar en el panel la revisión y activación global, y guardar. Comprobar en una sesión nueva que el banner carga automáticamente, que rechazar estadísticas no lo retira y que desactivar publicidad desde administración impide nuevas cargas.

Sin `AD_ORIGIN`, el adaptador conserva el marco estricto de origen opaco para desarrollo/Workers. No permite inline/eval ni same-origin en el dominio principal. La configuración inválida de AD_ORIGIN impide arrancar Node; no hay fallback permisivo. Este despliegue de dos hostnames está implementado y probado para VPS, no configurado automáticamente en Workers.

Pruebas: `npm test`, `npm run test:advertising` (modo estricto), `npm run test:isolated-ads` (origen separado) y `npm run test:docker` con imagen reconstruida. La última prueba verifica Caddy con CA local explícita, no certificados públicos del dominio real.

## Carga automática para visitantes

Cuando `ADVERTISING_ENABLED=true`, el banner y la activación global están habilitados y la revisión del propietario está guardada, el navegador solicita publicidad al abrir inicio, catálogo, índice de guías o herramientas. Las páginas legales, contacto y administración no cargan banners. No hay casilla ni aceptación publicitaria del visitante y no se envía un consentimiento ficticio a Adsterra. Las estadísticas agregadas siguen siendo opcionales e independientes. Los textos públicos describen la carga automática y las tecnologías del proveedor; el propietario debe comprobar que su operación y configuración cumplen las condiciones aplicables del proveedor y de su público.

El interruptor del servidor y el de administración se conservan para operar y detener la publicidad. «Automática» no garantiza entrega para todos: bloqueadores, falta de inventario, errores del proveedor o límites de ancho pueden impedir verla. Tampoco garantiza impresiones válidas o ingresos. Las pruebas utilizan respuestas sintéticas, sin generar tráfico comercial.

## Ubicación del banner

En las doce páginas de herramientas hay una sola zona publicitaria después de «Cómo usar» y antes de «Preguntas frecuentes», fuera del contenedor de selección, procesamiento y resultados. Inicio y catálogos conservan la zona al final del contenido. El valor interno `placement: footer` se mantiene compatible con la configuración guardada; no requiere recrear el banner ni cambiar códigos. No se crean dos anuncios por página.
