#!/bin/sh
# Ejecutar desde el checkout del VPS. No detiene ni restaura producción.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
backup_directory="${1:-/root/pdfalinstante-backups}"
if [ -L "$backup_directory" ]; then
  echo 'El directorio de copias no debe ser un enlace simbólico.' >&2
  exit 1
fi
umask 077
mkdir -p "$backup_directory"
chmod 700 "$backup_directory"
backup_source="$(docker compose exec -T app node scripts/backup.mjs --path)"
backup_name="$(basename -- "$backup_source")"
case "$backup_name" in
  portal-*.sqlite) ;;
  *) echo 'No se recibió el nombre de una copia válida.' >&2; exit 1 ;;
esac
case "$backup_name" in *[!a-zA-Z0-9.-]*) echo 'Nombre no válido.' >&2; exit 1 ;; esac
if [ "$backup_source" != "/data/backups/$backup_name" ]; then
  echo 'La copia debe estar en /data/backups.' >&2
  exit 1
fi
# Ensayo en una base temporal distinta. Si falla, no se anuncia copia verificada.
docker compose exec -T app node scripts/verify-backup.mjs "$backup_source"
backup_destination="$backup_directory/$backup_name"
if [ -e "$backup_destination" ] || [ -L "$backup_destination" ]; then
  echo 'Ya existe ese destino; no se sobrescribe.' >&2
  exit 1
fi
docker compose cp "app:$backup_source" "$backup_destination"
chmod 600 "$backup_destination"
(cd "$backup_directory" && sha256sum "$backup_name" > "$backup_name.sha256")
printf '\nCopia verificada y preparada para descargar:\n%s\n%s.sha256\n' "$backup_destination" "$backup_destination"
printf 'Todavía está dentro del VPS. Descárgala a almacenamiento privado externo.\n'
