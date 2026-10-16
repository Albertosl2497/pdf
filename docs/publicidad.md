# Publicidad: configuración y alcance

El adaptador admite banners con `atOptions` y script HTTPS `/CLAVE/invoke.js`. No admite cualquier fragmento HTML, popunders, notificaciones, redirecciones automáticas ni claves secretas. La clave del banner es pública y debe copiarse del código real emitido para el sitio. No hay códigos, seller IDs o anuncios de ejemplo precargados en producción.

## Configurar sin publicar

1. En `/admin`, añadir un banner, elegir formato/dispositivo e indicar clave y URL exactas del código real. Los formatos admitidos son 300×250, 320×50, 320×100 y 728×90; no se debe transformar el código de otro formato para aparentar compatibilidad. Guardar con la activación global desmarcada.
2. Autorizar en `AD_PROVIDER_HOSTS` únicamente los hostnames HTTPS exactos comprobados contra el código y documentación del proveedor. Separarlos por comas, sin comodines, esquema ni rutas. No se proporcionan dominios inventados ni se deduce autenticidad de un hostname. El operador del servidor es responsable de comprobar su procedencia.
3. Reiniciar la aplicación para aplicar las variables. En Compose, editar `.env` y ejecutar `docker compose up -d`. Mantener `ADVERTISING_ENABLED=false` mientras se revisa.
4. Para probar el código real sin activarlo al público, marcar el consentimiento de prueba en administración y usar “Probar banner guardado”. Esto contacta al proveedor y puede tener efectos publicitarios reales: usar el procedimiento de prueba autorizado por el proveedor, no pulsar anuncios propios ni generar tráfico artificial. Sin códigos reales se puede seguir desarrollando el resto del portal.
5. Revisar compatibilidad de sandbox/CSP, recursos necesarios, comportamiento en móvil, política de privacidad y requisitos de consentimiento aplicables. Si el código requiere permisos incompatibles con la frontera de documentos, mantenerlo desactivado y evaluar un adaptador aprobado. No retirar el aislamiento para ocultar el problema.

Los únicos ensayos ejecutados en esta tarea utilizan un proveedor sintético interceptado por Playwright, sin solicitar anuncios reales. No prueban aprobación de Adsterra, impresiones válidas, ingresos ni compatibilidad del código comercial. La obtención de la referencia pública del proveedor no estuvo disponible en este entorno; no se presenta como verificada documentación vigente ni una lista oficial de dominios.

## Activar después de la revisión

Son necesarios simultáneamente:

- `ADVERTISING_ENABLED=true` en servidor.
- Configuración global habilitada desde el panel.
- Revisión declarada por el propietario y al menos un banner completo habilitado, con dominio autorizado.
- Aceptación explícita del visitante para publicidad. Aceptar estadísticas no acepta anuncios; ambos permisos empiezan desactivados.

El banner solo aparece al final del contenido, en inicio, catálogo, listado de guías y herramientas disponibles. Se excluyen contacto, administración, legales, errores y herramientas ocultas/en mantenimiento. Se selecciona un solo banner adecuado al dispositivo y se omite si no cabe; no se fuerza un banner de escritorio en móvil. Sin configuración no se reserva un espacio vacío. La etiqueta “Publicidad” lo distingue de los controles de documentos.

No hay renovación periódica de impresiones. Los cambios de página, dispositivo o configuración pueden reconstruir un banner; la compatibilidad con las políticas reales del proveedor sigue pendiente. Cambiar el ancho dentro del mismo dispositivo no vuelve a cargar un banner que sigue cabiendo.

## Aislamiento y fallos

El código del proveedor corre en iframe con `sandbox=allow-scripts`, sin `allow-same-origin`, ventanas emergentes, formularios o navegación del nivel superior. El servidor envía además una CSP con sandbox y orígenes de recursos limitados. La carga inicial requiere un permiso aleatorio de un uso y 60 segundos emitido tras consentimiento. No se envían archivos, nombres, bytes ni contraseñas a la API publicitaria.

El único mensaje aceptado por el padre indica carga/fallo; se comprueban origen opaco, ventana emisora y valor enumerado. No se intercambian documentos o instrucciones de navegación. Los anuncios no tienen acceso al DOM, localStorage o credenciales del contexto que procesa los archivos. El proveedor sí recibe datos técnicos propios de su conexión. La prueba de aislamiento no constituye una auditoría general de todos los navegadores ni del proveedor.

Si falla o se bloquea el script, se retira su marco; un plazo de diez segundos limita las cargas que no confirman estado. Esto no verifica que se haya servido un anuncio comercial: el éxito de carga de un script no es una impresión validada. El procesamiento y la descarga PDF funcionan independientemente.

Revocar consentimiento retira los marcos y evita futuras cargas. No revierte datos ya recibidos por terceros. “Desactivar toda la publicidad” revoca permisos pendientes y se refleja en clientes activos en su siguiente comprobación, prevista cada 60 segundos; los navegadores pueden retrasar tareas en segundo plano. Navegar, recargar o revocar consentimiento retira el contenido anterior. No se puede garantizar borrado remoto ni detener un cliente desconectado.

## ads.txt

Pegar exclusivamente los registros proporcionados para el dominio real. Se validan estructura y tamaño, se conserva su texto y se sirven como `text/plain` con `nosniff` en `/ads.txt`. Sin registros responde 404. La publicación del archivo no requiere activar banners. No se inventan vendedores ni se acredita titularidad o aprobación con una validación sintáctica. Se admiten registros estándar dominio/vendedor/DIRECT–RESELLER/certificado opcional y comentarios; otras directivas requieren una ampliación revisada.

## Pruebas

`npm test` cubre permisos, datos, orígenes, dominios, `ads.txt`, tokens de un uso y preview privada. `npm run test:advertising` usa una base temporal y respuestas de proveedor sintéticas: verifica ausencia de carga antes del consentimiento, aislamiento real de DOM/almacenamiento, revocación, ausencia de cargas duplicadas por resize, funcionamiento PDF con proveedor bloqueado, vista previa administrativa y desactivación. No ejecutar ensayos automatizados contra códigos comerciales reales.
