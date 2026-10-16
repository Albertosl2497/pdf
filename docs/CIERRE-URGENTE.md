# Cierre urgente: identidad pública y copia fuera del VPS

## Alcance y estado

Este procedimiento mantiene la aplicación en `/opt/pdfalinstante`, conserva .env y volúmenes, y no modifica credenciales de acceso, anuncios o dominio. Las páginas públicas describen publicidad automática, estadísticas opcionales, contacto guardado sin envío automático y procesamiento local de documentos. Los textos son una base adaptada al funcionamiento comprobado; el propietario debe completar identidad/domicilio que corresponda y revisar su adecuación jurídica y a las condiciones de sus proveedores. No constituyen una certificación de cumplimiento.

Los datos personales reales no se incorporan al código ni a los valores por defecto. Se guardan en SQLite desde la consola o el panel. No se inventa domicilio, RFC, razón social, jurisdicción o identidad.

## 1. Actualizar el programa en el VPS

Desde la sesión SSH (no desde un PowerShell local sin conexión):

```sh
cd /opt/pdfalinstante
docker compose exec app npm run backup:create
git pull --ff-only origin main
docker compose build
docker compose up -d
docker compose ps
```

Ejecutar uno por uno y detenerse ante cualquier error. No borrar volúmenes. Los cambios de esta entrega no necesitan modificar DNS o Caddy.

## 2. Guardar identidad pública

En administración, dentro de Identidad del sitio, completar nombre/razón social, correo público y país juntos. La dirección pública es un campo separado; no publicar datos que no se quieran hacer públicos. Guardar configuración y revisar `/privacidad`, `/cookies`, `/terminos`, `/sobre-nosotros` y `/contacto`.

También se pueden guardar los tres campos principales desde la consola:

```sh
docker compose exec app npm run admin:identity -- "NOMBRE PÚBLICO" "PAÍS" correo-publico@dominio
```

No introducir los marcadores literalmente: sustituir por datos reales. Este comando conserva el resto de la configuración y el acceso del propietario; no cambia el correo de inicio de sesión. La dirección postal, si corresponde, se completa desde el panel. No sustituir un domicilio obligatorio por uno ficticio. Si está pendiente, la revisión del aviso no puede darse por cerrada.

Los datos públicos están incluidos en el exportado de configuración y en la copia SQLite. Importar un JSON antiguo puede reemplazarlos por campos vacíos; volver a revisarlos después de restaurar configuración. El JSON no sustituye una copia completa.

## 3. Crear y ensayar una copia completa

En el VPS:

```sh
cd /opt/pdfalinstante
sh scripts/vps-backup.sh
```

El script:

1. Crea una copia consistente con la API de SQLite y comprueba integridad.
2. Restaura esa copia en una **base temporal distinta**, sin detener ni sustituir la base en uso.
3. Comprueba que se conserva el propietario, configuración, consultas y estadísticas; revoca sesiones en la base temporal restaurada.
4. Elimina la base temporal y prepara la copia en `/root/pdfalinstante-backups/`, con directorio 700 y archivo 600.
5. Genera un archivo `.sha256` para comprobar la descarga.

Debe indicar «Recuperación verificada» y mostrar dos rutas: `.sqlite` y `.sqlite.sha256`. Si falla la comprobación, no se anuncia una copia verificada: conservar el error y no ejecutar restauración en producción como prueba.

El ensayo usa el espacio temporal del contenedor (32 MB en la configuración actual). Si la base crece y falla por espacio, debe ensayarse en otro entorno privado con espacio suficiente; no cambiar ni borrar la base activa para resolverlo. No ejecutar dos mantenimientos simultáneamente.

Esta copia preparada **todavía está en el mismo VPS**. Falta descargarla.

## 4. Descargar desde Windows

Abrir **otra pestaña de PowerShell en tu ordenador**, sin cerrar la sesión SSH existente. La línea debe comenzar por `PS C:\...`, no por `root@...`.

Crear una carpeta local para las copias:

```powershell
New-Item -ItemType Directory -Force "$HOME\Documents\PDFalInstante-Respaldos"
Set-Location "$HOME\Documents\PDFalInstante-Respaldos"
```

Descargar las copias y checksums preparados en la carpeta privada del VPS:

```powershell
scp -P 22 "root@2.24.222.228:/root/pdfalinstante-backups/*" .
```

Introducir la contraseña SSH solo cuando la solicite, nunca en el comando o en el chat. Los archivos tienen nombres únicos; descargar no elimina la copia del servidor. Esta orden copia únicamente el directorio dedicado a respaldos, no todo /root. Si usas otra IP, usuario o puerto, sustituirlos.

Si `scp` falla, la copia externa aún no está completada. Comprobar la carpeta local y no asumir que la operación terminó por ver un archivo parcial.

## 5. Comprobar SHA-256 en Windows

Desde la misma carpeta local de PowerShell, ejecutar el bloque completo:

```powershell
Get-ChildItem -Filter *.sqlite.sha256 | ForEach-Object {
    $backupChecksumLine = (Get-Content -LiteralPath $_.FullName -Raw).Trim()
    $backupChecksumParts = $backupChecksumLine -split '\s+', 2
    if ($backupChecksumParts.Count -ne 2) { throw "Checksum no válido: $($_.Name)" }
    $backupLocalFile = Join-Path $_.DirectoryName $backupChecksumParts[1]
    $backupActualHash = (Get-FileHash -LiteralPath $backupLocalFile -Algorithm SHA256).Hash
    if ($backupActualHash -ne $backupChecksumParts[0]) { throw "La copia no coincide: $backupLocalFile" }
    Write-Host "OK: $backupLocalFile"
}
```

Debe mostrar al menos un `OK` y ningún error. Si no se descargó ningún `.sha256`, el bloque no imprime resultados y no acredita la descarga. La verificación confirma que la copia local coincide con la que superó el ensayo temporal en el VPS; no demuestra disponibilidad futura, retención externa automática ni un restablecimiento completo del sistema operativo.

## 6. Guardar y mantener

Los archivos incluyen correos, mensajes y hashes de contraseñas. Mantenerlos en una cuenta de ordenador protegida y almacenamiento cifrado (por ejemplo una unidad con cifrado del sistema). No enviarlos al chat, publicarlos en GitHub, guardarlos en public_html o compartirlos con enlaces públicos. No se ha configurado ni comprobado cifrado de tu ordenador desde este entorno.

Repetir creación, ensayo, descarga y checksum antes de cada actualización importante y con la frecuencia que permita tu tolerancia a perder consultas/configuración. Las copias automáticas del contenedor siguen reteniendo las 14 más recientes. El directorio `/root/pdfalinstante-backups` y la carpeta del ordenador **no tienen rotación automática**; revisar y eliminar copias antiguas según una política propia, conservando las necesarias para recuperación y privacidad. No se ha contratado ni configurado un destino externo automático.

Para recuperar producción, consultar `docs/vps-hostinger.md`: la restauración real exige detener app y elegir una copia confiable. No hacerlo ahora, porque el ensayo temporal ya comprueba la recuperación de la copia sin reemplazar datos vivos.

## Criterios para dar por terminado este cierre

- Responsable, país y correo público correctos en todas las páginas mencionadas.
- Domicilio/datos legales que resulten necesarios completados y revisión del aviso pendiente resuelta.
- Copia completa con propietario creada y ensayo temporal aprobado.
- Copia y checksum descargados al ordenador y al menos un resultado OK.
- Ubicación privada y retención de las copias definidas por el propietario.

Solo el propietario puede confirmar los pasos realizados en su VPS y ordenador; preparar los comandos no equivale a haberlos ejecutado allí.
