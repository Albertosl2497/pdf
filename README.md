# PDF al Instante

Dominio previsto: **pdfalinstante.com**. DNS, certificado público y disponibilidad del dominio no se han verificado.

Portal en español con procesamiento PDF en el navegador, backend Node.js 24 y base SQLite persistente. El destino principal es un VPS Linux, incluido Hostinger KVM 2. La variante Cloudflare se conserva para compatibilidad y pruebas; no es necesaria para el VPS.

**Guía detallada para instalar pdfalinstante.com:** [Paso a paso en Hostinger](docs/GUIA-PASO-A-PASO-HOSTINGER.md).

**Estado: versión de desarrollo funcional; sin publicación ni acceso al VPS real.** La guía de despliegue está en [docs/vps-hostinger.md](docs/vps-hostinger.md) y la matriz de pendientes en [docs/estado.md](docs/estado.md).

## Desarrollo local

Usar Node >=24.19.0, npm y este checkout. Cada tarea de nube ya está aislada: no crear un worktree adicional.

```sh
cd /workspace/pdf
npm ci --cache /tmp/pdf-npm-cache
npm run build
npm start
```

Por defecto escucha solo en `127.0.0.1:3000` y crea `data/portal.sqlite` y tablas sin reemplazar datos existentes. Variables opcionales: `DATA_DIR`, `HOST`, `PORT`, `APP_ORIGIN`, `INDEXING_ENABLED`. El origen debe coincidir con el que usa el navegador. Si cambia el puerto, cambiar también `APP_ORIGIN`. En producción `APP_ORIGIN` debe ser HTTPS; el proxy termina TLS y Node usa ese origen explícito, sin confiar en cabeceras de proxy suministradas por el visitante.

`npm run dev` compila antes de arrancar; para cambios de código, detener y reiniciar. `/api/health` debe responder `{"status":"ok","database":"ready"}`. Los archivos de datos y contraseñas no se guardan en Git ni en el paquete de entrega.

Crear o recuperar al propietario único:

```sh
npm run admin:owner -- correo-real@dominio
```

La contraseña se solicita de forma oculta por consola. También se permite entrada estándar para automatización segura, sin poner su valor en argumentos. El cambio revoca las sesiones previas. No existe registro público ni credencial predeterminada. Acceder después a `/admin/login`.

## Pruebas

```sh
npm test
# Con el servidor en marcha y Chromium instalado:
TEST_ORIGIN=http://127.0.0.1:3000 npm run test:browser
TEST_ORIGIN=http://127.0.0.1:3000 npm run test:services
# Prueba autónoma del panel, con base temporal aislada:
npm run test:vps
# Aislamiento y consentimiento con proveedor sintético:
npm run test:advertising
```

`CHROMIUM_PATH` permite elegir el ejecutable, por defecto `/usr/bin/chromium`. Las pruebas de servicios sobre una instancia existente guardan eventos y consultas sintéticos en esa base de desarrollo; no ejecutarlas contra una base pública como si fueran tráfico real. La prueba autónoma VPS y las pruebas de integración borran sus bases temporales. Las descargas sintéticas del navegador se guardan en `/tmp/pdf-check`.

Las pruebas cubren motores, rutas, identidad, CSRF, SQLite, D1 local, persistencia tras reinicio, sesiones revocadas, backup/restauración, contacto, agregados y limpieza. Poppler permite comprobar el PDF con un lector independiente; esa prueba se marca omitida si faltan `pdfinfo`/`pdftotext`. No se han probado todos los navegadores móviles, carga pública ni el VPS real.

## Funciones actuales

- Unir, dividir y ZIP, extraer, reordenar, girar y eliminar páginas PDF; PDF-lib en Web Worker cancelable.
- JPG, PNG y WebP a PDF: Carta/A4/ajustado, margen, orientación y calidad JPEG. Fondo transparente convertido a blanco.
- Credencial frente/reverso en una hoja; fotos con recorte simétrico, brillo y contraste; documentos mixtos PDF/imágenes.
- Miniaturas progresivas, deshacer selección/orden hasta 20 cambios, JPG/PNG desde PDF y ZIP. PDF.js renderiza secuencialmente.
- Compresión real **por rasterización con pérdida**: exige aceptar que desaparecen texto seleccionable, enlaces y anotaciones. Compara bytes y permite conservar el original si la salida crece. No hay modo de compresión que conserve texto/vectoriales.
- Continuar con el resultado dentro de otra herramienta, solo en memoria, sin volver a cargarlo ni guardarlo en almacenamiento persistente.
- HTML inicial útil, catálogo buscable, guías, páginas informativas, alias 301 y 404 reales.
- Publicidad: panel de banners, `ads.txt`, vista previa privada, aislamiento y consentimiento separado; desactivada por defecto, pendiente de códigos comerciales reales. Ver [docs/publicidad.md](docs/publicidad.md).
- Panel: marca/dominio, guías de texto publicables, disponibilidad de herramientas, exportación JSON, auditoría, bandeja de consultas y estadísticas con CSV.

## Seguridad, datos y límites

En VPS las contraseñas usan scrypt con sal; solo se guardan hashes. Las sesiones son tokens aleatorios guardados como hash, caducan a las ocho horas, usan cookie HttpOnly/SameSite Strict/Secure en HTTPS y se revocan al recuperar contraseña. La restauración también invalida sesiones y permisos temporales de contacto/publicidad. El login tiene límite global de diez intentos por quince minutos y un cálculo scrypt concurrente. La recuperación necesita consola del servidor. No hay segundo factor ni recuperación por correo.

SQLite usa WAL, claves foráneas y transacciones. Solo una instancia de aplicación puede abrir el volumen mediante el bloqueo de servicio. No usar varias réplicas ni almacenamiento de red. Los backups usan la API nativa y prueba de integridad; restaurar exige servidor detenido y confirmación explícita. Las copias completas son privadas e incluyen hashes y consultas. El exportado de configuración del panel excluye credenciales y mensajes.

Contacto: token aleatorio de diez minutos, un solo uso y espera mínima de tres segundos; origen propio, JSON limitado, validación y campo trampa. Límites globales de 30 tokens/minuto y 20 consultas/hora, sin guardar IP. Son medidas básicas, no una garantía contra ataques distribuidos. No se aceptan adjuntos ni se envía correo automáticamente.

Estadísticas propias desactivadas hasta aceptación; preferencia en `localStorage` bajo `pdf-preferences-v1`, sin identificadores. La revocación bloquea futuros eventos. Se aceptan solo herramientas/páginas conocidas, eventos enumerados y duración redondeada (máximo una hora), sin nombres ni documentos. Límite global de 600 eventos/minuto. No son visitantes únicos ni prueba de descarga guardada en disco, y pueden incluir automatización.

Límites iniciales: 20 MB/archivo, 50 MB/tarea, 100 páginas/archivos, 30 páginas de renderizado y 20 megapíxeles por imagen. Preflight PNG/JPEG/WebP antes de decodificar, máximo 16384 píxeles por lado; WebP animado rechazado. Renderizado limitado a 8 megapíxeles. No se ha validado capacidad máxima en celulares con poca memoria.

PDF cifrado rechazado; firmas detectadas conservadoramente por `ByteRange`, sin validación criptográfica universal. Conservar originales: las operaciones pueden perder estructuras especiales del documento. La vista previa no ejecuta JavaScript del PDF ni constituye un sanitizador.

No se suben documentos al servidor. Contacto conserva mensajes hasta superar 30 días y se borran en la siguiente limpieza; agregados, 365 días. Limpieza al arrancar y cada 24 horas en Node. Backups al arrancar y cada 24 horas; 14 copias automáticas conservadas, no copia externa. No se ejecutan tareas con el servicio detenido. Los registros técnicos del alojamiento requieren revisar configuración real.

## Despliegue

`Dockerfile`, `compose.yaml`, `.env.example` y `deploy/Caddyfile` preparan Node sin root, volumen privado persistente, HTTPS con Caddy, límites de recursos y reinicio automático. Completar dominio y correo reales antes de usar Compose. No se ha publicado el portal ni solicitado certificados de producción. Ver la guía completa para instalar, actualizar, respaldar y recuperar.

La indexación permanece desactivada hasta configurar un origen público real y `INDEXING_ENABLED=true`. Revisar identidad/contacto legal, funcionamiento, canonical, robots y sitemap antes de activarla. No hay garantía de indexación ni resultados Search Console.

## Arquitectura y licencias

`src/node/` contiene servidor, SQLite, sesiones y backups; `src/index.js` es el router Web Request compartido. `src/browser/` contiene interfaz, motores en worker y panel. `schema.sql` contiene las tablas compartidas; las tablas de credenciales/sesiones solo las crea el adaptador Node. `scripts/build.mjs` sirve bibliotecas localmente, sin CDN durante el procesamiento.

PDF-lib 1.17.1 (MIT), PDF.js 5.4.624 (Apache-2.0), fflate 0.8.3 (MIT), proper-lockfile 4.1.2 (MIT), esbuild (MIT) y Playwright/Wrangler/Miniflare (Apache-2.0). El build genera `dist/THIRD_PARTY_NOTICES.txt`, conserva avisos del bundle y copia licencias de fuentes, CMaps y WASM de PDF.js.

Para la variante Cloudflare: `npm run dev:cloudflare`, `db:init:local` y `wrangler.toml` se conservan. Necesita D1 y Access reales en producción; el ID de D1 sigue siendo un marcador. Los comandos de propietario, SQLite y backups Node no aplican a Workers. No existe todavía migración automática de contenido D1 remoto a SQLite; el proyecto no tiene datos remotos verificados que trasladar.

## Pendientes

Verificación de Adsterra con códigos y dominio reales, ingresos/costos, pruebas de carga y móviles reales, revisión legal/editorial y publicación en VPS. Las copias externas requieren un destino y política del propietario. OCR, Office↔PDF, firma dibujada y edición avanzada son extensiones previstas y no se anuncian como disponibles. Consultar `docs/estado.md` para límites y requisitos restantes.

## Paquete de entrega

`npm run package:release` compila y genera `release/herramientas-pdf-vps-desarrollo.tar.gz` con checksum SHA-256. Usa una lista explícita de código, assets, pruebas y documentación: excluye `.env`, datos, credenciales, `.git` y dependencias locales. No sobrescribe un paquete existente; indicar otra ruta a `node scripts/package.mjs /ruta/nueva.tar.gz` después de compilar. El nombre indica desarrollo: consultar pendientes antes de publicarlo como producto completo.

### Marca, SEO y recuperación desde el panel

La marca inicial es **PDF al Instante** y el dominio previsto es **pdfalinstante.com**. Esto no configura DNS ni certifica disponibilidad o HTTPS del dominio. El panel permite cambiar nombre, origen público, colores con contraste mínimo 4.5:1 y logo PNG local de hasta 32 KB y 512 × 512 píxeles. Cada herramienta tiene título SEO, metadescripción, H1, introducción, pasos y preguntas frecuentes editables, visibles en el HTML del servidor.

El exportado JSON versión 2 incluye marca, publicidad, guías, estados de herramientas y SEO. La importación admite versiones 1 y 2, valida antes de aplicar y exige escribir `RESTAURAR`. La revisión caduca a los diez minutos y se invalida si cambia la configuración. La aplicación es transaccional y guarda hasta diez configuraciones anteriores descargables; conserva propietario, consultas, estadísticas y auditoría. Restaura la publicidad desactivada y pendiente de revisión. No sustituye el backup SQLite completo ni las copias fuera del servidor. Límite de importación: 512 KB y 50 guías.
