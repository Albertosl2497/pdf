# Instalación en VPS KVM 2 de Hostinger

Para la primera instalación de **pdfalinstante.com**, sigue la [guía detallada paso a paso](GUIA-PASO-A-PASO-HOSTINGER.md), con SSH, DNS, Docker, subida, verificaciones y recuperación.

Esta guía corresponde a Node.js 24 y SQLite con Docker Compose y Caddy. No requiere Cloudflare Workers, D1 ni Cloudflare Access. No se ha accedido al VPS ni configurado su DNS. Las pruebas locales no sustituyen la validación en el servidor real.

## Antes de instalar

- VPS Linux de 64 bits con Docker Engine y el plugin Docker Compose instalados mediante el procedimiento oficial de Docker para su distribución.
- Dominio/subdominio real cuyo registro A apunte al VPS. Si existe un registro AAAA, debe apuntar a una IPv6 operativa del mismo servidor o retirarse.
- Puertos TCP 80 y 443 disponibles. Si ya hay Nginx, Apache, otro proxy o contenedores en esos puertos, integrar la aplicación con ese proxy en vez de iniciar el servicio `web` sin revisar. No detener servicios existentes a ciegas.
- Acceso SSH propio, espacio para imagen/datos/copias y copia externa del servidor antes de cambios. No enviar contraseñas SSH por chat.

El procesamiento PDF ocurre en el navegador del visitante. El backend guarda configuración, consultas y contadores. Se limita la aplicación a 1 CPU/512 MB y el proxy a 0,5 CPU/256 MB como punto inicial, no como capacidad máxima comprobada de tráfico del KVM 2. SQLite necesita almacenamiento local persistente y una sola instancia de aplicación.

## Instalar

Subir el paquete al servidor y extraerlo en una carpeta propia, por ejemplo `/opt/herramientas-pdf`. Trabajar siempre en esa carpeta:

```sh
cp .env.example .env
chmod 600 .env
```

Editar `.env`: `DOMAIN` debe ser solo el hostname real, sin `https://`, ruta ni puerto; `ACME_EMAIL`, un correo real del responsable. Mantener `INDEXING_ENABLED=false` durante revisión. El fichero no debe contener contraseñas de administrador.

```sh
docker compose config --quiet
docker compose build
docker compose up -d
```

Caddy solicitará HTTPS real una vez que DNS, puertos y dominio estén correctos. No se ha emitido ningún certificado durante el desarrollo. El contenedor de aplicación no publica su puerto 3000 en Internet; solo lo usa el proxy en la red Docker.

Crear el propietario mediante la consola interactiva. Sustituir el correo por el real:

```sh
docker compose exec app npm run admin:owner -- tu-correo@tu-dominio
```

Tras configurar el propietario, ejecutar `docker compose exec app npm run backup:create` para respaldar también su acceso.

Solicitará una contraseña de 14–256 caracteres sin mostrarla y su confirmación. No ponerla en argumentos, `.env` ni historial. Visitar `/admin/login` bajo el dominio HTTPS configurado. No existe usuario/contraseña por defecto ni registro público de administradores.

## Comprobar antes de abrir al público

```sh
docker compose ps
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)})"
```

Comprobar además mediante el dominio real: HTTPS sin advertencias, login/logout, guardado de marca y guías, prueba sintética de PDF, contacto y consentimiento. Reiniciar `app` y verificar que los datos permanecen. En administración, guardar el dominio principal como origen HTTPS. Completar identidad, contacto legal y textos. Solo después, cambiar `INDEXING_ENABLED=true` y ejecutar `docker compose up -d` para aplicar el entorno. Verificar robots, sitemap y canonical desde el dominio real.

## Copias y recuperación

El volumen `portal_data` contiene `portal.sqlite`, WAL y copias en `/data/backups`. No editar/copiar a ciegas solo el archivo principal mientras hay escrituras. La copia utiliza la API de backup SQLite y comprueba integridad.

La aplicación crea una copia al arrancar y cada 24 horas mientras corre; conserva las 14 automáticas más recientes. No es almacenamiento externo: perder el volumen o el VPS puede perder también las copias. Programar y verificar una copia cifrada externa según el alojamiento elegido antes de producción. Las copias completas contienen correos, hashes de contraseña y consultas: mantenerlas privadas.

Copia manual en caliente:

```sh
docker compose exec app npm run backup:create
docker compose exec app ls /data/backups
```

Para sacar una copia concreta fuera del volumen:

```sh
docker compose cp app:/data/backups/NOMBRE_REAL.sqlite ./copia-privada.sqlite
chmod 600 ./copia-privada.sqlite
```

Restauración: requiere detener la aplicación y una copia confiable ya presente en el volumen. Conservar primero una copia externa y anotar el archivo exacto. No ejecutar estos comandos contra producción sin elegir y revisar la copia:

```sh
docker compose stop app
docker compose run --rm --no-deps app npm run backup:restore -- /data/backups/NOMBRE_REAL.sqlite --confirm-replace
docker compose up -d app
```

La herramienta valida integridad/tablas, rechaza restaurar con la aplicación bloqueando la base, guarda una copia del estado anterior y revoca sesiones y permisos temporales restaurados. Tras una caída abrupta puede existir un bloqueo con latido pendiente: esperar al menos 30 segundos antes de reintentar. No borrar el bloqueo para forzar una restauración con el servidor activo. No ejecutar dos tareas de mantenimiento simultáneamente.

Si la copia está solo en el host, usar `docker compose cp ./copia-privada.sqlite app:/data/copia-privada.sqlite` **antes** de detener el contenedor; después ejecutar `docker compose exec -u root app chown node:node /data/copia-privada.sqlite` para que el usuario del servicio pueda leerla, y usar esa ruta al restaurar. No usar `docker compose down -v`: elimina los volúmenes y sus datos.

Recuperar la contraseña requiere acceso legítimo a la consola del VPS: repetir `admin:owner`. Reemplaza el propietario único y revoca todas sus sesiones. No hay restablecimiento por correo ni credenciales de recuperación públicas.

## Actualizar

1. Crear y descargar una copia antes de actualizar.
2. Conservar `.env` y volúmenes. Revisar las notas de esquema: hoy los cambios son aditivos; futuras migraciones incompatibles requerirán procedimiento específico.
3. Sustituir únicamente archivos del programa y ejecutar `docker compose build` y `docker compose up -d`.
4. Comprobar salud, sesión, persistencia y una operación PDF.

La limpieza se ejecuta al arrancar y cada 24 horas de actividad: consultas con más de 30 días, agregados con más de 365 días y tokens vencidos. Si el servicio está detenido, se realiza al volver a arrancar; no se promete eliminación mientras el VPS está apagado. Las copias conservan versiones históricas hasta su rotación. No se guardan archivos PDF personales en el servidor.

## Lo que todavía no constituye la versión completa

La verificación real de códigos Adsterra (el adaptador, aislamiento y consentimiento ya están implementados), pruebas de carga reales y revisión legal/editorial final siguen pendientes. La compresión disponible rasteriza páginas y pierde texto seleccionable. La infraestructura aquí preparada permite publicar una versión limitada con anuncios desactivados después de validar el servidor, no acredita el cumplimiento completo del documento maestro.

## Validación realizada en desarrollo

Se construyó la imagen y se probó como usuario sin root, raíz de solo lectura, límites de memoria y volumen persistente. Se verificaron login, escritura, reinicio con datos conservados, copia y restauración fuera de línea. La configuración de Compose y Caddy pasó validación. Caddy se prueba además con HTTPS y una CA local de prueba confiada explícitamente: eso no acredita un certificado público para tu dominio.

En este entorno de desarrollo, Docker necesitó la resolución del proxy y un certificado de confianza suministrado como secreto de construcción `build_ca`. El Dockerfile admite ese secreto opcional sin incluirlo en la imagen. No se desactivó TLS. Un VPS con salida normal al registro npm no necesita esa configuración específica del entorno de desarrollo.

Para repetir la prueba Docker (destructiva solo para sus propios contenedores y volúmenes temporales), construir `herramientas-pdf:local` y ejecutar `npm run test:docker`; necesita Docker y Python 3. No usarla como prueba de carga ni como despliegue de producción.

Para configurar publicidad posteriormente, consultar `docs/publicidad.md`. Mantener `ADVERTISING_ENABLED=false` hasta comprobar los códigos reales; no se requiere tenerlos para instalar o desarrollar el portal.
