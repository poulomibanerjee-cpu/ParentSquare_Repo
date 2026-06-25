/* ============================================================================
 * Success Academy — Family Connect : zero-dependency local server
 *   • serves the SPA from /public
 *   • GET  /api/state           -> full working DB (data/db.json)
 *   • POST /api/mutate {op,payload} -> apply op, persist, return new state
 *   • POST /api/reset           -> restore db.json from seed.json
 * Run:  node server.cjs   (then open http://localhost:4310)
 * ==========================================================================*/
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4310;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const SEED = path.join(DATA, 'seed.json');
const DB = path.join(DATA, 'db.json');

// ---- ensure db.json exists (seed it once, and run seed.cjs if missing) -----
function ensureDb() {
  if (!fs.existsSync(SEED)) {
    console.log('· seed.json missing — generating…');
    require('child_process').execSync('node seed.cjs', { cwd: ROOT, stdio: 'inherit' });
  }
  if (!fs.existsSync(DB)) fs.copyFileSync(SEED, DB);
}
ensureDb();

// in-memory cache: parse db.json once, serve from memory, write-through on mutate
let CACHE = null;
const load = () => (CACHE || (CACHE = JSON.parse(fs.readFileSync(DB, 'utf8'))));
const save = () => fs.writeFileSync(DB, JSON.stringify(CACHE));
const nowISO = () => new Date().toISOString();
const rid = (p) => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const find = (arr, id) => arr.find((x) => x.id === id);

// ---------------------------------------------------------------------------
// MUTATIONS — every user action funnels through here, then we persist + return
// ---------------------------------------------------------------------------
const OPS = {
  // ---- posts -------------------------------------------------------------
  react(db, { postId, userId, emoji }) {
    const p = find(db.posts, postId); if (!p) return;
    p.reactions ||= {};
    // one reaction per user: clear them from every emoji first
    for (const e of Object.keys(p.reactions)) p.reactions[e] = p.reactions[e].filter((u) => u !== userId);
    const had = (p.reactions[emoji] || []).includes(userId);
    if (!had) (p.reactions[emoji] ||= []).push(userId);
    for (const e of Object.keys(p.reactions)) if (!p.reactions[e].length) delete p.reactions[e];
  },
  comment(db, { postId, userId, body }) {
    const p = find(db.posts, postId); if (!p || !body?.trim()) return;
    (p.comments ||= []).push({ id: rid('cmt'), authorId: userId, body: body.trim(), createdAt: nowISO() });
  },
  createPost(db, { authorId, audience, title, body, category, channels, attachments, scholarIds, scheduledFor }) {
    db.posts.unshift({
      id: rid('post'), authorId, audience, schoolId: audience?.schoolId ?? null,
      category: category || 'Announcement', pinned: false, createdAt: nowISO(),
      title: title || '(untitled)', body: body || '', bodyEs: null,
      channels: channels && channels.length ? channels : ['app'],
      attachments: attachments || [], reactions: {}, comments: [],
      scholarIds: scholarIds || null, scheduledFor: scheduledFor || null,
    });
  },
  togglePin(db, { postId }) { const p = find(db.posts, postId); if (p) p.pinned = !p.pinned; },

  // ---- messaging ---------------------------------------------------------
  sendMessage(db, { conversationId, senderId, body, lang }) {
    const c = find(db.conversations, conversationId); if (!c || !body?.trim()) return;
    c.messages.push({ id: rid('msg'), senderId, body: body.trim(), lang: lang || 'en', createdAt: nowISO(), read: false });
  },
  markRead(db, { conversationId, userId }) {
    const c = find(db.conversations, conversationId); if (!c) return;
    c.messages.forEach((m) => { if (m.senderId !== userId) m.read = true; });
  },
  startConversation(db, { participantIds, senderId, subject, body, type }) {
    const conv = { id: rid('conv'), type: type || (participantIds.length > 2 ? 'group' : 'direct'), participantIds, subject: subject || null, messages: [] };
    if (body?.trim()) conv.messages.push({ id: rid('msg'), senderId, body: body.trim(), lang: 'en', createdAt: nowISO(), read: false });
    db.conversations.unshift(conv);
    return conv.id;
  },

  // ---- sign-ups ----------------------------------------------------------
  claimSlot(db, { signupId, slotId, userId, studentId, qty, note, addedBy }) {
    const su = find(db.signups, signupId); if (!su) return;
    const slot = find(su.slots, slotId); if (!slot) return;
    slot.claims ||= (slot.claimedBy || []).map((u) => ({ userId: u, qty: 1 })); delete slot.claimedBy;
    if (slot.claims.some((c) => c.userId === userId)) return;
    const used = su.type === 'item' ? slot.claims.reduce((n, c) => n + (c.qty || 1), 0) : slot.claims.length;
    const remaining = slot.capacity - used;
    if (remaining <= 0) return;
    const addQty = su.type === 'item' ? Math.min(Math.max(1, +qty || 1), remaining) : 1;
    slot.claims.push({ userId, studentId: studentId || null, qty: addQty, note: (note || '').trim(), addedBy: addedBy || null });
  },
  unclaimSlot(db, { signupId, slotId, userId }) {
    const su = find(db.signups, signupId); if (!su) return;
    const slot = find(su.slots, slotId); if (!slot) return;
    slot.claims = (slot.claims || (slot.claimedBy || []).map((u) => ({ userId: u }))).filter((c) => c.userId !== userId); delete slot.claimedBy;
  },

  // ---- forms -------------------------------------------------------------
  submitForm(db, { formId, userId, studentId, values, signature }) {
    const f = find(db.forms, formId); if (!f) return;
    f.responses ||= [];
    const existing = f.responses.find((r) => r.userId === userId && r.studentId === studentId);
    const rec = { id: existing?.id || rid('resp'), userId, studentId: studentId || null, values: values || {}, signature: signature || null, signedAt: nowISO() };
    if (existing) Object.assign(existing, rec); else f.responses.push(rec);
  },

  // ---- events ------------------------------------------------------------
  rsvp(db, { eventId, userId, status }) {
    const e = find(db.events, eventId); if (!e) return;
    e.rsvps ||= { yes: [], no: [], maybe: [] };
    for (const k of ['yes', 'no', 'maybe']) e.rsvps[k] = (e.rsvps[k] || []).filter((u) => u !== userId);
    if (['yes', 'no', 'maybe'].includes(status)) e.rsvps[status].push(userId);
  },

  // ---- alerts (admin send) ----------------------------------------------
  sendAlert(db, { authorId, audience, title, body, severity, channels, smartAlert, recipients, scholarIds, scheduledFor }) {
    const grp = (db.groups || []).find((g) => g.id === audience?.id);
    const n = recipients != null ? recipients : (audience?.type === 'network' || !grp) ? db.users.filter((u) => u.role === 'parent').length : grp.memberIds.length;
    const useSms = channels.includes('sms');
    const alert = {
      id: rid('alert'), severity: severity || 'urgent', authorId, audience,
      title: title || '(untitled alert)', body: body || '', bodyEs: null,
      createdAt: nowISO(), channels, smartAlert: !!smartAlert, scholarIds: scholarIds || null, scheduledFor: scheduledFor || null,
      delivery: {
        recipients: n,
        sms: useSms ? n : 0,
        smsDelivered: useSms ? n - Math.floor(Math.random() * 3) : 0,
        voiceFailover: smartAlert && useSms ? Math.floor(Math.random() * 3) : 0,
        email: channels.includes('email') ? n : 0,
        app: channels.includes('app') ? Math.floor(n * 0.7) : 0,
        opened: Math.floor(n * (0.55 + Math.random() * 0.3)),
        confirmed: Math.floor(n * (0.4 + Math.random() * 0.25)),
      },
    };
    db.alerts.unshift(alert);
  },

  // ---- attendance rules --------------------------------------------------
  toggleRule(db, { ruleId }) { const r = find(db.attendanceRules, ruleId); if (r) r.active = !r.active; },

  // ---- fees --------------------------------------------------------------
  payFee(db, { feeId }) { const f = find(db.fees, feeId); if (f && f.status !== 'paid') { f.status = 'paid'; f.paidAt = nowISO(); } },

  // ---- documents (acknowledge receipt of a secure document) --------------
  ackDocument(db, { docId, userId }) { const d = find(db.documents || [], docId); if (d && !(d.acknowledgedBy ||= []).includes(userId)) d.acknowledgedBy.push(userId); },

  // ---- moderation --------------------------------------------------------
  moderate(db, { modId, action }) { const m = find(db.moderation, modId); if (m) m.status = action; }, // 'approved' | 'blocked'

  // ---- preferences -------------------------------------------------------
  savePrefs(db, { userId, prefs }) { db.prefs[userId] = { ...db.prefs[userId], ...prefs }; },

  // ---- staff creation flows ----------------------------------------------
  addEvent(db, { authorId, audience, title, date, start, end, location, category, description }) {
    db.events.push({ id: rid('evt'), title: title || '(untitled)', date, start: start || '', end: end || null, location: location || '', schoolId: audience?.schoolId ?? null, audience, category: category || 'Event', description: description || '', rsvps: { yes: [], no: [], maybe: [] } });
  },
  createSignup(db, { authorId, audience, type, title, description, deadline, slots }) {
    db.signups.unshift({ id: rid('su'), type: type || 'volunteer', authorId, audience, title: title || '(untitled)', description: description || '', deadline: deadline || null, createdAt: nowISO(), slots: (slots || []).map((s) => ({ id: rid('slot'), label: s.label, capacity: Math.max(1, +s.capacity || 1), claims: [] })) });
  },
  createForm(db, { authorId, audience, type, title, description, dueDate, requiresSignature, fields }) {
    db.forms.unshift({ id: rid('form'), type: type || 'form', authorId, audience, title: title || '(untitled)', description: description || '', dueDate: dueDate || null, createdAt: nowISO(), requiresSignature: !!requiresSignature, fields: (fields || []).map((f, i) => ({ id: 'f' + (i + 1), label: f.label, type: f.type || 'text', required: !!f.required, ...(f.options ? { options: f.options } : {}) })), responses: [] });
  },
  eventCheckIn(db, { eventId, userId }) { const e = find(db.events, eventId); if (!e) return; e.attended ||= []; e.attended = e.attended.includes(userId) ? e.attended.filter((u) => u !== userId) : [...e.attended, userId]; },
  toggleAutomation(db, { autoId }) { const a = (db.automations || []).find((x) => x.id === autoId); if (a) a.active = !a.active; },
  syncIntegration(db, { intId }) { const i = (db.integrations || []).find((x) => x.id === intId); if (i) i.lastSync = nowISO(); },
};

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const json = (res, code, obj) => { const s = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) }); res.end(s); };

function body(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback for unknown non-asset paths
      if (!path.extname(filePath)) return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, d2) => { if (e2) { res.writeHead(404); res.end('Not found'); } else { res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(d2); } });
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      if (req.method === 'GET' && req.url === '/api/state') return json(res, 200, load());
      if (req.method === 'POST' && req.url === '/api/reset') { CACHE = JSON.parse(fs.readFileSync(SEED, 'utf8')); save(); return json(res, 200, CACHE); }
      if (req.method === 'POST' && req.url === '/api/mutate') {
        const { op, payload } = await body(req);
        const fn = OPS[op];
        if (!fn) return json(res, 400, { error: `unknown op: ${op}` });
        const db = load();
        const result = fn(db, payload || {}) ?? null;
        save();
        return json(res, 200, { ok: true, result, state: db });
      }
      return json(res, 404, { error: 'no such endpoint' });
    }
    serveStatic(req, res);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`\n  🟧 Success Academy — Family Connect → http://localhost:${PORT}\n  (ParentSquare-style demo · data persists to data/db.json · POST /api/reset to reset)\n`);
});
