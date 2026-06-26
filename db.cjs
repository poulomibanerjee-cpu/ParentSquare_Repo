/* ============================================================================
 * db.cjs — real database tier for Family Connect (Node's built-in node:sqlite)
 *   • zero install (SQLite ships with Node 22.5+)
 *   • document tables (id, doc JSON) for every collection — keeps the existing
 *     mutation ops byte-for-byte while giving durable, indexed, queryable storage
 *   • `users` also gets real columns + indexes so we can serve scoped, paginated
 *     queries (the pattern that lets this scale to 100k without shipping the
 *     whole dataset to the browser)
 * ==========================================================================*/
const { DatabaseSync } = require('node:sqlite');

// every array collection in the seed → its own document table
const ARRAY_COLLECTIONS = [
  'schools', 'users', 'students', 'groups', 'posts', 'conversations', 'signups',
  'forms', 'events', 'alerts', 'attendanceRules', 'attendanceEvents', 'fees',
  'documents', 'automations', 'integrations', 'moderation', 'personas',
];
// singletons / maps → key/value table
const KV_KEYS = ['meta', 'district', 'guardianMap', 'studentMap', 'prefs'];

function open(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');     // concurrent reads while writing (closer to a real RDBMS)
  db.exec('PRAGMA synchronous = NORMAL');
  for (const c of ARRAY_COLLECTIONS) {
    if (c === 'users') continue;
    db.exec(`CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, doc TEXT NOT NULL)`);
  }
  // users: real columns drive the scoped directory/audience queries + indexes
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT, role TEXT, school_id TEXT,
    language TEXT, verified INTEGER, email TEXT, doc TEXT NOT NULL)`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_name ON users(name COLLATE NOCASE)');
  db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, doc TEXT NOT NULL)');
  return db;
}

const isEmpty = (db) => db.prepare('SELECT count(*) c FROM users').get().c === 0;

function userCols(u) {
  return [u.id, u.name || '', u.role || '', u.schoolId || null, u.language || 'en', u.verified ? 1 : 0, u.email || '', JSON.stringify(u)];
}

// some collections key on userId (personas) or carry no id (attendance events) — fall back to a stable index key
const keyOf = (it, i) => it.id ?? it.userId ?? `_row_${i}`;

function persistCollection(db, name, arr) {
  db.exec('BEGIN');
  try {
    if (name === 'users') {
      const ins = db.prepare('INSERT OR REPLACE INTO users (id,name,role,school_id,language,verified,email,doc) VALUES (?,?,?,?,?,?,?,?)');
      for (const u of arr) ins.run(...userCols(u));
    } else {
      const ins = db.prepare(`INSERT OR REPLACE INTO ${name} (id,doc) VALUES (?,?)`);
      arr.forEach((it, i) => ins.run(keyOf(it, i), JSON.stringify(it)));
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const persistKv = (db, key, val) => db.prepare('INSERT OR REPLACE INTO kv (key,doc) VALUES (?,?)').run(key, JSON.stringify(val));

function importSeed(db, seed) {
  for (const c of ARRAY_COLLECTIONS) persistCollection(db, c, seed[c] || []);
  for (const k of KV_KEYS) persistKv(db, k, seed[k] ?? {});
}

function reset(db, seed) {
  db.exec('BEGIN');
  try {
    for (const c of ARRAY_COLLECTIONS) db.exec(`DELETE FROM ${c}`);
    db.exec('DELETE FROM kv');
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  importSeed(db, seed);
}

// reconstruct the full in-memory working object (used at demo scale for /api/state)
function loadAll(db) {
  const out = {};
  for (const c of ARRAY_COLLECTIONS) out[c] = db.prepare(`SELECT doc FROM ${c}`).all().map((r) => JSON.parse(r.doc));
  for (const k of KV_KEYS) { const r = db.prepare('SELECT doc FROM kv WHERE key=?').get(k); out[k] = r ? JSON.parse(r.doc) : {}; }
  return out;
}

// ---- scoped, paginated queries (the shape that serves 100k without loading all of it) ----
function searchUsers(db, { q = '', role = '', schoolId = '', limit = 25, offset = 0 } = {}) {
  const where = [], params = [];
  if (role) { where.push('role = ?'); params.push(role); }
  if (schoolId) { where.push('school_id = ?'); params.push(schoolId); }
  if (q) { where.push('(name LIKE ? OR email LIKE ?)'); params.push('%' + q + '%', '%' + q + '%'); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT count(*) c FROM users ${w}`).get(...params).c;
  const rows = db.prepare(`SELECT doc FROM users ${w} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { total, items: rows.map((r) => JSON.parse(r.doc)) };
}

const countRecipients = (db, { role = 'parent', schoolId = '' } = {}) =>
  schoolId
    ? db.prepare('SELECT count(*) c FROM users WHERE role=? AND school_id=?').get(role, schoolId).c
    : db.prepare('SELECT count(*) c FROM users WHERE role=?').get(role).c;

module.exports = { open, isEmpty, importSeed, reset, loadAll, persistCollection, persistKv, searchUsers, countRecipients, ARRAY_COLLECTIONS, KV_KEYS };
