# PDF al Instante: publicación paso a paso en Hostinger KVM 2

Dominio previsto: **pdfalinstante.com**. Esta guía instala una primera versión funcional con publicidad e indexación desactivadas. No se ha accedido a tu VPS ni comprobado que seas titular del dominio, su DNS o su certificado público. Los nombres de menús de hPanel pueden variar.

## 1. Qué hay y qué falta

Ya existe el programa: 12 herramientas PDF en el navegador, panel privado, logo/colores, SEO por herramienta, guías, consultas de contacto, estadísticas agregadas con consentimiento, copias SQLite y restauración. Los PDF del visitante se procesan en su dispositivo. No hace falta contratar una base de datos ni instalar Node en el sistema: Docker contiene Node y SQLite.

Antes de publicar hay que:

1. Tener acceso SSH al VPS y un dominio registrado que controles.
2. Comprobar el sistema y si el VPS ya aloja otros servicios.
3. Apuntar DNS al VPS y permitir los puertos necesarios.
4. Instalar Docker, subir el paquete y arrancar los contenedores.
5. Obtener HTTPS, crear el propietario y configurar el panel.
6. Completar identidad/contacto legal, revisar contenidos y comprobar herramientas en el dominio real.
7. Guardar una copia fuera del VPS y comprobar que puede recuperarse.
8. Activar indexación cuando todo lo anterior esté revisado.

Para completar todas las aspiraciones del documento maestro siguen pendientes pruebas de carga y móviles reales, revisión legal/editorial y validación comercial con códigos Adsterra reales. La compresión actual convierte páginas en imágenes: pierde texto seleccionable. No se promete compatibilidad universal con todos los PDF. Puedes preparar el servidor y revisar la versión sin activar anuncios; indexación desactivada no significa sitio privado: quien conozca la URL puede visitarlo.

## 2. Datos que debes tener a mano

Anota en tu equipo, sin publicarlos:

| Dato | Dónde obtenerlo | Uso |
| --- | --- | --- |
| IPv4 pública del VPS | hPanel → VPS → tu servidor → información/acceso SSH | DNS y conexión SSH |
| Usuario SSH y puerto | Mismo apartado | Habitualmente `root` y puerto `22`; usa los valores reales |
| Contraseña SSH o clave privada | Credenciales de tu servidor | Solo para entrar por SSH; no enviarla al chat |
| Sistema operativo | Panel del VPS o `cat /etc/os-release` | Esta receta de instalación usa Ubuntu 24.04 LTS |
| Acceso a DNS de pdfalinstante.com | Proveedor que administra los nameservers | Crear/corregir registros |
| Correo real tuyo | Una cuenta que controles | Avisos del certificado y usuario del panel |

En todos los comandos, sustituye `IP_DEL_VPS` por la IPv4 real, `USUARIO_SSH` por tu usuario y `TU_CORREO_REAL` por tu correo. No copies esos marcadores literalmente. Nunca pegues contraseñas dentro de un comando.

## 3. Descargar los archivos en tu ordenador

Descarga del espacio de trabajo estos dos archivos, manteniendo juntos sus nombres originales:

- `pdfalinstante-vps-hostinger.tar.gz`: código, recursos y documentación.
- `pdfalinstante-vps-hostinger.tar.gz.sha256`: huella para comprobar la descarga.

No se suben a `public_html` y no se usa el administrador de archivos de un hosting compartido. Esto es una aplicación para tu **VPS**, con una carpeta propia y Docker.

## 4. Entrar al VPS y revisar sin borrar nada

En Windows abre PowerShell o Terminal; en Mac/Linux abre Terminal. Ejecuta desde tu ordenador, cambiando los marcadores:

```sh
ssh -p 22 USUARIO_SSH@IP_DEL_VPS
```

Si tu puerto SSH no es 22, cambia `22`. La primera conexión muestra una huella: comprueba que corresponde a tu servidor antes de aceptarla. Al escribir la contraseña no se ven caracteres; es normal. Si utilizas clave SSH, usa la conexión que ya te proporcione acceso legítimo al servidor. La terminal web de Hostinger puede servir para los pasos del servidor, pero la subida por `scp` se ejecuta desde tu ordenador.

Ya dentro del VPS:

```sh
cat /etc/os-release
uname -m
free -h
df -h /
sudo ss -ltnp
```

Resultado esperado: Ubuntu 24.04, arquitectura `x86_64` o `aarch64`, espacio libre suficiente y posibilidad de usar 80/443. Si entras como root, `sudo` suele estar disponible; si no lo está, ejecuta los comandos sin `sudo` únicamente en esa sesión root.

**Si ya hay sitios, Nginx, Apache, paneles o contenedores usando 80/443, no sigas la receta de servidor vacío.** Hay que integrar este proyecto con el proxy existente. No reinstales el sistema ni pares otros servicios para liberar puertos. El resto de instrucciones presupone VPS dedicado/disponible para este proyecto. Un sistema distinto a Ubuntu 24.04 necesita el procedimiento Docker de su distribución; no reinstales un VPS con datos para adaptar esta guía.

Si Hostinger ofrece snapshots en tu plan, crea uno antes de modificar un VPS que ya tenga contenido. Un snapshot no reemplaza la copia externa de la base que se explica más adelante.

## 5. Configurar el dominio

En el administrador DNS que realmente controla los nameservers de `pdfalinstante.com`:

| Tipo | Nombre/host | Valor | TTL |
| --- | --- | --- | --- |
| A | `@` o dominio raíz, según el proveedor | IPv4 pública del VPS | Predeterminado o 300 segundos si se permite |

Corrige registros A antiguos que apunten a otro servidor. Si hay un registro AAAA del dominio raíz, debe apuntar a una IPv6 funcional de este VPS; si no tienes esa IPv6 configurada, elimina únicamente ese AAAA incorrecto. No borres registros MX/TXT de correo ni otros registros ajenos al sitio. Si hay CAA restrictivos, asegúrate de que permiten una autoridad que use Caddy, por ejemplo Let's Encrypt.

Esta entrega sirve **solo `pdfalinstante.com`**. No presupone servicio ni redirección de `www.pdfalinstante.com`: un CNAME por sí solo no configura el certificado ni la redirección en Caddy. Usa el dominio raíz en las pruebas y enlaces.

Si administras DNS en Cloudflare, usa inicialmente «Solo DNS» para este registro mientras verificas el HTTPS de origen. No necesitas Cloudflare para esta instalación.

La propagación depende del proveedor y de cachés; no hay un plazo fijo garantizado. Desde el VPS, una vez instalado `dnsutils` en el siguiente paso:

```sh
dig +short A pdfalinstante.com
dig +short AAAA pdfalinstante.com
```

El A debe mostrar tu IPv4. El AAAA debe estar vacío o mostrar la IPv6 correcta. Comprobar también desde tu ordenador ayuda a detectar cachés distintas.

## 6. Instalar Docker en Ubuntu 24.04

Estos comandos son para el VPS, no para tu ordenador. Si Docker ya está instalado y funciona, comprueba sus versiones y omite la instalación. No reemplaces una instalación que usan otras aplicaciones sin revisarla.

```sh
docker --version
docker compose version
```

Si faltan, instala desde el repositorio oficial de Docker. Referencia: https://docs.docker.com/engine/install/ubuntu/

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl dnsutils nano
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Añade el repositorio correspondiente a Ubuntu:

```sh
. /etc/os-release
DOCKER_ARCH="$(dpkg --print-architecture)"
printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$VERSION_CODENAME" "$DOCKER_ARCH" | sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Debe aparecer el mensaje de prueba de Docker y una versión de Compose. Si APT informa paquetes Docker incompatibles, consulta la sección de conflictos de la guía oficial antes de retirar nada. No se necesita instalar MySQL, PHP, Node ni PM2 en el VPS.

## 7. Permitir conexiones

En el firewall de Hostinger asociado al VPS, si existe, permite entrada TCP:

- Puerto SSH real: acceso desde tu IP de administración cuando sea posible.
- `80`: HTTP y validación del certificado.
- `443`: HTTPS para visitantes.

No publiques `3000`: es interno entre Caddy y la aplicación. SQLite no necesita un puerto de red.

Si utilizas UFW en Ubuntu, revisa primero su estado:

```sh
sudo ufw status verbose
```

Si UFW no existe y solo usas el firewall de Hostinger, no necesitas añadir otro para seguir esta guía. Si decides usar UFW en un servidor dedicado, autoriza **primero el puerto SSH real**. Este ejemplo presupone SSH en 22; cámbialo si corresponde:

```sh
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Conserva abierta la sesión y comprueba que puedes entrar con una segunda conexión SSH antes de cerrarla. Los puertos Docker publicados pueden atravesar reglas UFW: por eso Compose solo publica 80/443 y se deben revisar también las reglas del proveedor.

## 8. Subir el paquete desde tu ordenador

Deja la sesión SSH abierta y abre otra terminal **en tu ordenador**.

### Windows PowerShell

Si descargaste los archivos en Descargas:

```powershell
cd "$HOME\Downloads"
Get-FileHash .\pdfalinstante-vps-hostinger.tar.gz -Algorithm SHA256
Get-Content .\pdfalinstante-vps-hostinger.tar.gz.sha256
scp -P 22 .\pdfalinstante-vps-hostinger.tar.gz .\pdfalinstante-vps-hostinger.tar.gz.sha256 USUARIO_SSH@IP_DEL_VPS:
```

Compara la huella calculada con los 64 caracteres del archivo `.sha256`; mayúsculas y minúsculas son equivalentes. Si descargaste en otra carpeta, usa esa ruta.

### Mac o Linux

```sh
cd ~/Downloads
scp -P 22 pdfalinstante-vps-hostinger.tar.gz pdfalinstante-vps-hostinger.tar.gz.sha256 USUARIO_SSH@IP_DEL_VPS:
```

`scp` usa `-P` mayúscula para el puerto; `ssh` usa `-p` minúscula. Los dos puntos finales indican tu carpeta personal remota. Si utilizas una clave no predeterminada, añade `-i RUTA_A_TU_CLAVE` a `scp` y `ssh`.

## 9. Verificar y extraer en el VPS

Regresa a la terminal SSH del VPS. La descarga llegó a la carpeta personal del usuario SSH:

```sh
cd ~
sha256sum -c pdfalinstante-vps-hostinger.tar.gz.sha256
```

Debe decir `OK`. Si no coincide, vuelve a descargar/subir; no instales un archivo que falla la comprobación. La huella detecta errores de transferencia, no sustituye descargar de una fuente confiable.

Para una **instalación nueva**:

```sh
sudo mkdir -p /opt/pdfalinstante
sudo ls -la /opt/pdfalinstante
```

La carpeta debe estar vacía. Si ya hay un proyecto instalado allí, usa el procedimiento de actualización de la sección 16; no extraigas encima a ciegas.

```sh
sudo tar -xzf "$HOME/pdfalinstante-vps-hostinger.tar.gz" -C /opt/pdfalinstante
cd /opt/pdfalinstante
sudo cp .env.example .env
sudo chmod 600 .env
sudo nano .env
```

Deja el contenido así, cambiando únicamente el correo por una cuenta real tuya:

```dotenv
DOMAIN=pdfalinstante.com
ACME_EMAIL=TU_CORREO_REAL
INDEXING_ENABLED=false
ADVERTISING_ENABLED=false
AD_PROVIDER_HOSTS=
```

No agregues contraseñas al archivo. En nano: `Ctrl+O`, `Enter` para guardar, y `Ctrl+X` para salir. El dominio no lleva `https://`, barra final ni ruta.

Trabaja siempre desde `/opt/pdfalinstante`: el nombre del proyecto Compose determina sus volúmenes. No cambies la carpeta ni el nombre del proyecto después de instalar sin planificar la transferencia de datos.

## 10. Construir y arrancar

En el VPS:

```sh
cd /opt/pdfalinstante
sudo docker compose config --quiet
sudo docker compose build
sudo docker compose up -d
sudo docker compose ps
```

La construcción descarga dependencias y crea la aplicación; puede tardar varios minutos. No cierres la terminal hasta que termine. `config --quiet` termina sin texto cuando todo está bien. Si aparece un error, resuélvelo antes de continuar.

Comprueba registros:

```sh
sudo docker compose logs --tail=100 app
sudo docker compose logs --tail=100 web
```

Debe aparecer `app` en ejecución y saludable; `web` también en ejecución. Caddy obtiene y renueva el certificado con el dominio y los puertos correctos. El certificado no está incluido en el paquete. Puede necesitar tiempo y reintentos; no reconstruyas ni borres datos de certificados repetidamente.

Prueba la aplicación internamente y luego el dominio público:

```sh
sudo docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
curl -I http://pdfalinstante.com
curl -I https://pdfalinstante.com
curl -fsS https://pdfalinstante.com/api/health
```

Esperado: salud HTTP 200, HTTP redirige a HTTPS, HTTPS responde sin errores de certificado. No uses `curl -k` para dar la prueba por buena. Abre también `https://pdfalinstante.com` en el navegador y revisa el candado/certificado.

## 11. Crear tu acceso privado

Todavía en el VPS, sustituye el correo:

```sh
cd /opt/pdfalinstante
sudo docker compose exec app npm run admin:owner -- TU_CORREO_REAL
```

Te pide escribir una contraseña de **14 a 256 caracteres** y repetirla. No se muestra en pantalla. Guárdala en un gestor de contraseñas. No hay cuenta ni contraseña predeterminada. Usa la consola interactiva, sin `-T`, para que se oculte lo que escribes.

Abre en tu navegador:

```text
https://pdfalinstante.com/admin/login
```

Inicia sesión con ese correo y contraseña. No existe registro público de administradores. Si olvidas la contraseña, repetir el comando por SSH cambia el propietario único y revoca sus sesiones; no hay recuperación por email.

Guarda una copia completa después de crear el propietario:

```sh
sudo docker compose exec app npm run backup:create
```

## 12. Configurar el panel y el contenido

Desde el panel:

1. Guarda la marca **PDF al Instante**.
2. En el origen público/dominio guarda exactamente `https://pdfalinstante.com`. Configurarlo es necesario para canonical y sitemap; el `.env` configura el servidor, este campo configura los enlaces públicos.
3. Revisa descripción, colores y logo. Logo permitido: PNG hasta 32 KB y 512 × 512 píxeles. Los colores deben alcanzar contraste mínimo 4.5:1 con blanco.
4. Revisa disponibilidad de herramientas; deja publicadas solo las que hayas comprobado.
5. En SEO por herramienta revisa título, metadescripción, encabezado, introducción, pasos y preguntas frecuentes. Guarda cada herramienta por separado.
6. Crea/revisa guías útiles con contenido propio.
7. Revisa en las páginas públicas privacidad, términos, contacto y sobre el proyecto. La entrega incluye textos iniciales; deben ajustarse a tu responsable real y operación. Si el panel no permite editar un texto legal, se modifica en `src/index.js`, se reconstruye y se vuelve a comprobar. No se deben anunciar como políticas definitivas sin revisión.
8. Mantén la publicidad desactivada. No necesitas códigos Adsterra para que las herramientas funcionen.
9. Exporta el JSON de configuración y guárdalo fuera del servidor. Esa exportación no contiene credenciales, mensajes ni toda la base.

El contacto guarda consultas en tu bandeja privada: **no envía emails automáticamente**. Tendrás que revisar el panel. Las estadísticas registran agregados con consentimiento; no son un conteo de visitantes únicos.

## 13. Lista de comprobación antes de anunciar el sitio

Haz las pruebas desde tu ordenador y, al menos, un teléfono. Usa documentos sintéticos sin información privada:

- [ ] HTTP lleva a HTTPS; HTTPS no muestra advertencias.
- [ ] El dominio abre PDF al Instante y los recursos cargan sin errores.
- [ ] Dos PDF pequeños se unen, se descargan y abren correctamente.
- [ ] Dividir/extraer y organizar respetan el orden de páginas.
- [ ] Girar y eliminar generan el resultado esperado.
- [ ] Fotos JPG/PNG se convierten; PDF a imágenes descarga lo esperado.
- [ ] Credencial, fotos de tareas y preparación de trámites producen archivos legibles.
- [ ] Compresión avisa que convierte a imágenes y permite conservar el original si aumenta el peso.
- [ ] Login, guardado de marca, SEO y logout funcionan; después de salir el panel vuelve a pedir acceso.
- [ ] Una consulta de contacto de prueba aparece en la bandeja. El formulario requiere esperar unos segundos tras abrirlo.
- [ ] No aparecen anuncios; la medición respeta aceptación y rechazo.
- [ ] Los textos legales y contacto corresponden al responsable real.
- [ ] Existe una copia completa descargada fuera del VPS y se ha ensayado su restauración en un entorno separado.

Comprueba persistencia después de guardar un cambio reconocible de marca/SEO:

```sh
cd /opt/pdfalinstante
sudo docker compose restart app
sudo docker compose ps
```

Espera a que esté saludable, vuelve al panel y comprueba que el cambio sigue guardado. El reinicio causa una interrupción breve.

## 14. Copia completa fuera del VPS

No basta con tener copias dentro del mismo servidor. La aplicación crea copias al arrancar y cada 24 horas de actividad, conservando las 14 más recientes; también puedes crear una manual. Todas siguen dentro del volumen hasta que las descargues.

En el VPS:

```sh
cd /opt/pdfalinstante
sudo docker compose exec app npm run backup:create
sudo docker compose exec app ls -lt /data/backups
```

Elige el nombre exacto de una copia reciente terminada en `.sqlite`. Sustituye `NOMBRE_REAL.sqlite` en el siguiente comando:

```sh
sudo docker compose cp app:/data/backups/NOMBRE_REAL.sqlite "$HOME/pdfalinstante-copia.sqlite"
sudo chown "$(id -u):$(id -g)" "$HOME/pdfalinstante-copia.sqlite"
chmod 600 "$HOME/pdfalinstante-copia.sqlite"
```

Desde otra terminal **en tu ordenador**, dentro de una carpeta privada:

```sh
scp -P 22 USUARIO_SSH@IP_DEL_VPS:pdfalinstante-copia.sqlite .
```

Guárdala en almacenamiento privado/cifrado. Contiene hashes de acceso y consultas personales; no la publiques ni la subas al repositorio. Usa nombres con fecha al archivar copias sucesivas para no confundirlas. Repite antes de cada actualización importante y según la pérdida de datos que estés dispuesto a aceptar. Una copia externa automática exige elegir un destino y configurar su acceso: no está configurada por este paquete.

Restaurar una base completa requiere parada. Consulta también `docs/vps-hostinger.md`. Primero conserva una copia del estado actual y comprueba cuidadosamente la copia elegida. Si la copia está en tu ordenador, súbela al VPS y cópiala al volumen **antes** de parar `app`:

```sh
sudo docker compose cp "$HOME/pdfalinstante-copia.sqlite" app:/data/copia-a-restaurar.sqlite
sudo docker compose exec -u root app chown node:node /data/copia-a-restaurar.sqlite
sudo docker compose stop app
sudo docker compose run --rm --no-deps app npm run backup:restore -- /data/copia-a-restaurar.sqlite --confirm-replace
sudo docker compose up -d app
sudo docker compose ps
```

El `chown` concede acceso a la copia al usuario sin privilegios del contenedor; no cambia el usuario del servicio. Si el comando de restauración falla, revisa el error antes de asumir que la copia se aplicó. La herramienta valida integridad, guarda el estado anterior y revoca sesiones. Una restauración recupera los datos del momento de la copia, no los cambios posteriores. Tendrás que iniciar sesión con el propietario de esa copia o recuperarlo por consola. No pruebes una recuperación destructiva contra producción como ejercicio: ensáyala primero en un entorno separado.

La restauración JSON del panel solo recupera configuración/contenido: valida la copia, muestra el resumen y exige escribir `RESTAURAR`. Guarda hasta diez estados previos y desactiva la publicidad restaurada. No recupera mensajes, contraseñas ni toda la base SQLite.

## 15. Abrir a buscadores

Cuando hayas terminado la revisión:

```sh
cd /opt/pdfalinstante
sudo nano .env
```

Cambia solo:

```dotenv
INDEXING_ENABLED=true
```

Guarda y aplica con:

```sh
sudo docker compose up -d
curl -fsS https://pdfalinstante.com/robots.txt
curl -fsS https://pdfalinstante.com/sitemap.xml
```

Antes de activar, verifica que el origen público del panel es `https://pdfalinstante.com`. Con indexación desactivada es normal que robots bloquee y no haya un sitemap indexable. Después, revisa que el sitemap contiene el dominio correcto y que las páginas públicas tienen canonical correcto. Puedes registrar el dominio en Google Search Console, verificarlo con el método que te ofrezca y enviar `https://pdfalinstante.com/sitemap.xml`. La indexación y la posición no están garantizadas.

La publicidad requiere un proceso aparte: códigos reales, revisión de los dominios del proveedor, pruebas de compatibilidad del aislamiento, consentimiento y habilitación en servidor y panel. Sigue `docs/publicidad.md`; no la actives solo cambiando una casilla.

## 16. Actualizar sin perder datos

Para futuras entregas, siempre desde `/opt/pdfalinstante` y usando el mismo proyecto Compose:

1. Crea y descarga una copia completa. Guarda también `.env` privadamente y exporta configuración.
2. Conserva el paquete anterior y revisa las notas de cambios/migraciones. No supongas que una base nueva puede abrirla cualquier versión anterior.
3. Sube el nuevo paquete con un nombre distinto, verifica su checksum y comprueba que es una entrega confiable. Los paquetes oficiales del proyecto incluyen `.env.example`, no tu `.env`.
4. Extrae únicamente el paquete del programa en `/opt/pdfalinstante`, sin borrar la carpeta ni los volúmenes. Sustituye el marcador por el archivo real de la nueva entrega:

```sh
cd /opt/pdfalinstante
sudo tar -xzf "$HOME/NUEVO_PAQUETE.tar.gz" -C /opt/pdfalinstante
sudo docker compose config --quiet
sudo docker compose build
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 app web
```

5. Repite salud, login, persistencia y una operación PDF. La actualización puede causar una breve interrupción.

No uses `docker compose down -v`, `docker volume prune` ni reinstales el sistema como mantenimiento: puedes perder la base y los certificados. No cambies de carpeta/proyecto Compose para actualizar. Si una actualización falla, conserva los registros y revisa compatibilidad antes de volver al código anterior; recuperar datos exige la copia adecuada.

## 17. Problemas frecuentes

| Síntoma | Qué comprobar / hacer |
| --- | --- |
| SSH no conecta | IP, usuario, puerto real y firewall de Hostinger. No cambies DNS para arreglar SSH. |
| `scp` no encuentra el archivo | Estás en la terminal de tu ordenador y en la carpeta de la descarga; revisa nombre y extensión. |
| Checksum incorrecto | Repite descarga/subida y vuelve a verificar. |
| Compose pide `DOMAIN` o `ACME_EMAIL` | Estás en `/opt/pdfalinstante`, existe `.env` y ambos valores están completos. |
| `port is already allocated` | Otro servicio usa 80/443. Identifícalo con `sudo ss -ltnp`; integra el proxy, no detengas sitios ajenos a ciegas. |
| Dominio no abre o muestra otro sitio | Registros A/AAAA, nameservers y caché DNS. Usa el dominio raíz, no www. |
| HTTPS/certificado falla | DNS correcto, 80/443 accesibles, CAA compatible y `docker compose logs --tail=100 web`. No ignores el certificado. |
| Error 502 | Estado/salud de `app` y sus registros. No publiques 3000 para resolverlo. |
| No puedes entrar al panel | Usa HTTPS, correo exacto y contraseña. Tras demasiados intentos espera el límite de 15 minutos; si se perdió la clave, recupera por SSH. |
| `permission denied` con Docker | Usa `sudo docker ...` como en la guía. |
| Falta espacio o build falla | `df -h /`, registros del build y conectividad. No borres volúmenes ni desactives TLS como solución. |
| Restauración dice base bloqueada | Detén `app` y evita otro proceso usando esa base. Tras una caída abrupta el bloqueo puede tardar al menos 30 segundos en caducar; no lo borres para forzar acceso. |
| Datos parecen desaparecer | Verifica que usas la misma carpeta y proyecto Compose; no inicialices otros volúmenes sin investigar. |
| No llegan emails de contacto | El sistema guarda consultas en el panel; no tiene envío automático por correo. |
| No aparece en Google | Verifica indexación, origen, sitemap y Search Console. Publicar no garantiza indexación inmediata. |

Para revisar problemas sin revelar secretos, conserva la salida de:

```sh
cd /opt/pdfalinstante
sudo docker compose ps
sudo docker compose logs --tail=100 app web
```

Revisa los registros antes de compartirlos y oculta datos personales. No compartas `.env`, contraseñas, claves SSH ni bases SQLite.
