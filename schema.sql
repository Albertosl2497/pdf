PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO settings (key, value_json) VALUES
  ('site', '{"brand":"PDF al Instante","description":"Utilidades para documentos de escuela, trabajo y trámites.","public_origin":null}'),
  ('limits', '{"file_mb":20,"task_mb":50,"pdf_pages":100,"render_pages":30}'),
  ('advertising', '{"enabled":false,"provider":"adsterra","status":"pending_configuration"}');

-- Límites iniciales; los motores de navegador aplican sus propios máximos técnicos.
CREATE TABLE IF NOT EXISTS tools (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  engine TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','maintenance')),
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status != 'published' OR (engine IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Agregados sin IP, identificadores de visitantes ni nombres de archivos.
-- Tabla anterior reservada; los eventos consentidos actuales se guardan en usage_daily.
CREATE TABLE IF NOT EXISTS daily_metrics (
  day TEXT NOT NULL,
  tool_slug TEXT NOT NULL REFERENCES tools(slug),
  event TEXT NOT NULL CHECK (event IN ('started','completed','failed','cancelled','downloaded')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, tool_slug, event)
);

CREATE TABLE IF NOT EXISTS ad_slots (
  id TEXT PRIMARY KEY,
  placement TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  public_config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(public_config_json))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Solo agregados: sin IP, cookies de seguimiento o identificadores de visitante.
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  event TEXT NOT NULL CHECK(event IN ('view','started','completed','failed','cancelled','downloaded')),
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
  duration_ms_total INTEGER NOT NULL DEFAULT 0 CHECK(duration_ms_total >= 0),
  PRIMARY KEY(day,tool_slug,event)
);
CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','read')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS contact_created_at ON contact_messages(created_at);
CREATE TABLE IF NOT EXISTS contact_challenges (
  token_hash TEXT PRIMARY KEY,
  created_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS request_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL
);

-- Permisos efímeros de carga publicitaria, sin datos de documentos o visitantes.
CREATE TABLE IF NOT EXISTS ad_permits (
  token_hash TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL,
  expires_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_previews (
  token_hash TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  expires_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_seo (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  heading TEXT NOT NULL,
  intro TEXT NOT NULL,
  instructions_json TEXT NOT NULL CHECK(json_valid(instructions_json)),
  faq_json TEXT NOT NULL CHECK(json_valid(faq_json)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS config_restore_drafts (
  token_hash TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  baseline_hash TEXT NOT NULL,
  expires_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS config_history (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS config_restore_guards (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK(valid=1)
);
