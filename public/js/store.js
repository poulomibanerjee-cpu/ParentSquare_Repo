/* ============================================================================
 * store.js — serverless, on-device database (no backend required)
 * Mirrors the server's mutation ops exactly, but runs entirely in the browser
 * so the app works offline and can be wrapped for the App Store / TestFlight.
 * Data is seeded from the bundled seed.json and persisted to localStorage.
 * ==========================================================================*/
const KEY = 'sa-family-connect-db-v1';
const SEED_VERSION = '2026-06-25.4'; // bump whenever seed/personas change → clients auto-re-seed
let DB = null;
let persistOK = true;

const nowISO = () => new Date().toISOString();
const rid = (p) => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const find = (arr, id) => (arr || []).find((x) => x.id === id);

function persist() {
  if (!persistOK) return;
  try { localStorage.setItem(KEY, JSON.stringify({ v: SEED_VERSION, db: DB })); }
  catch (e) { persistOK = false; console.warn('[store] localStorage unavailable — running in-memory only', e?.name); }
}
async function fetchSeed() {
  const res = await fetch('seed.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('seed.json missing');
  return res.json();
}

export async function loadState() {
  if (DB) return DB;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.v === SEED_VERSION && saved.db) { DB = saved.db; return DB; } // same seed version → use on-device data
  } catch { /* fall through to fresh seed */ }
  DB = await fetchSeed(); // first run OR seed changed → load the fresh dataset
  persist();
  return DB;
}
export async function reset() { DB = await fetchSeed(); persist(); return DB; }
export function mutate(op, payload = {}) {
  const fn = OPS[op];
  if (!fn) return { error: `unknown op: ${op}` };
  const result = fn(DB, payload) ?? null;
  persist();
  return { ok: true, result, state: DB };
}

// ---------------------------------------------------------------------------
// MUTATIONS — kept byte-for-byte in step with server.cjs
// ---------------------------------------------------------------------------
const OPS = {
  react(db, { postId, userId, emoji }) {
    const p = find(db.posts, postId); if (!p) return;
    p.reactions ||= {};
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

  claimSlot(db, { signupId, slotId, userId, studentId, qty, note, addedBy }) {
    const su = find(db.signups, signupId); if (!su) return;
    const slot = find(su.slots, slotId); if (!slot) return;
    slot.claims ||= (slot.claimedBy || []).map((u) => ({ userId: u, qty: 1 })); delete slot.claimedBy;
    if (slot.claims.some((c) => c.userId === userId)) return;                 // already signed up
    const used = su.type === 'item' ? slot.claims.reduce((n, c) => n + (c.qty || 1), 0) : slot.claims.length;
    const remaining = slot.capacity - used;
    if (remaining <= 0) return;                                                // full
    const addQty = su.type === 'item' ? Math.min(Math.max(1, +qty || 1), remaining) : 1;
    slot.claims.push({ userId, studentId: studentId || null, qty: addQty, note: (note || '').trim(), addedBy: addedBy || null });
  },
  unclaimSlot(db, { signupId, slotId, userId }) {
    const su = find(db.signups, signupId); if (!su) return;
    const slot = find(su.slots, slotId); if (!slot) return;
    slot.claims = (slot.claims || (slot.claimedBy || []).map((u) => ({ userId: u }))).filter((c) => c.userId !== userId); delete slot.claimedBy;
  },

  submitForm(db, { formId, userId, studentId, values, signature }) {
    const f = find(db.forms, formId); if (!f) return;
    f.responses ||= [];
    const existing = f.responses.find((r) => r.userId === userId && r.studentId === studentId);
    const rec = { id: existing?.id || rid('resp'), userId, studentId: studentId || null, values: values || {}, signature: signature || null, signedAt: nowISO() };
    if (existing) Object.assign(existing, rec); else f.responses.push(rec);
  },

  rsvp(db, { eventId, userId, status }) {
    const e = find(db.events, eventId); if (!e) return;
    e.rsvps ||= { yes: [], no: [], maybe: [] };
    for (const k of ['yes', 'no', 'maybe']) e.rsvps[k] = (e.rsvps[k] || []).filter((u) => u !== userId);
    if (['yes', 'no', 'maybe'].includes(status)) e.rsvps[status].push(userId);
  },

  sendAlert(db, { authorId, audience, title, body, severity, channels, smartAlert, recipients, scholarIds, scheduledFor }) {
    const grp = (db.groups || []).find((g) => g.id === audience?.id);
    const n = recipients != null ? recipients : (audience?.type === 'network' || !grp) ? db.users.filter((u) => u.role === 'parent').length : grp.memberIds.length;
    const useSms = channels.includes('sms');
    const scheduled = scheduledFor && new Date(scheduledFor) > new Date();
    db.alerts.unshift({
      id: rid('alert'), severity: severity || 'urgent', authorId, audience,
      title: title || '(untitled alert)', body: body || '', bodyEs: null,
      createdAt: nowISO(), channels, smartAlert: !!smartAlert, scholarIds: scholarIds || null, scheduledFor: scheduledFor || null,
      delivery: scheduled ? { recipients: n, sms: 0, smsDelivered: 0, voiceFailover: 0, email: 0, app: 0, opened: 0, confirmed: 0 } : {
        recipients: n, sms: useSms ? n : 0, smsDelivered: useSms ? n - Math.floor(Math.random() * 3) : 0,
        voiceFailover: smartAlert && useSms ? Math.floor(Math.random() * 3) : 0,
        email: channels.includes('email') ? n : 0, app: channels.includes('app') ? Math.floor(n * 0.7) : 0,
        opened: Math.floor(n * (0.55 + Math.random() * 0.3)), confirmed: Math.floor(n * (0.4 + Math.random() * 0.25)),
      },
    });
  },

  toggleRule(db, { ruleId }) { const r = find(db.attendanceRules, ruleId); if (r) r.active = !r.active; },
  payFee(db, { feeId }) { const f = find(db.fees, feeId); if (f && f.status !== 'paid') { f.status = 'paid'; f.paidAt = nowISO(); } },
  ackDocument(db, { docId, userId }) { const d = find(db.documents || [], docId); if (d && !(d.acknowledgedBy ||= []).includes(userId)) d.acknowledgedBy.push(userId); },
  moderate(db, { modId, action }) { const m = find(db.moderation, modId); if (m) m.status = action; },
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
