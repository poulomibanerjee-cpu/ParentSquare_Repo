/* ============================================================================
 * core.js — shared state, API client, i18n, formatting, DOM + UI primitives
 * ==========================================================================*/

// ---------------------------------------------------------------------------
// STATE (single source of truth held in memory; server persists the DB)
// ---------------------------------------------------------------------------
export const S = {
  db: null,        // bootstrap DB (bounded reference data) from /api/state
  me: null,        // current persona userId
  lang: 'en',      // 'en' | 'es'  (drives translation demo)
  view: 'home',    // current route
  params: {},      // route params (e.g. open conversation id)
  unread: 0,       // cached inbound-unread count for the nav badge (server mode)
};

let _onChange = null;
export const setOnChange = (fn) => { _onChange = fn; };
const ping = () => _onChange && _onChange();

// ---------------------------------------------------------------------------
// DATA — backed by an on-device store (serverless; works offline)
// ---------------------------------------------------------------------------
import * as store from './store.js';
export async function loadState() {
  S.db = await store.loadState();
  store.subscribe((db) => { S.db = db; ping(); refreshUnread().then(ping); }); // live updates: re-render + refresh the unread badge
  return S.db;
}
// read-only "admin viewer" accounts — they see everything an admin does but can't change data
// (demo: Abhinav evaluates safely). In production this is a role/claim, not a hardcoded id.
const VIEWER_IDS = new Set(['usr_abhinav']);
export const isViewer = () => VIEWER_IDS.has(S.me);

export async function act(op, payload) {
  if (isViewer() && op !== 'markRead') {                                   // markRead is automatic/cosmetic — allow it silently
    toast(L('View-only access — changes are disabled for this account', 'Acceso de solo lectura — los cambios están desactivados'));
    return { viewer: true };
  }
  const res = await store.mutate(op, payload);
  if (res && res.state) S.db = res.state;
  ping();
  return res;
}
export async function resetDb() { S.db = await store.reset(); ping(); }
export const dataMode = () => store.mode();

export function navigate(view, params = {}) { S.view = view; S.params = params; ping(); window.scrollTo(0, 0); }
export function setPersona(userId) { S.me = userId; S.lang = (userById(userId)?.language) || 'en'; S.view = 'home'; S.params = {}; ping(); }
export function setLang(l) { S.lang = l; ping(); }

// ---------------------------------------------------------------------------
// DATA ACCESS
// ---------------------------------------------------------------------------
export const actor = () => userById(S.me);
export const userById = (id) => S.db?.users.find((u) => u.id === id);
export const studentById = (id) => S.db?.students.find((s) => s.id === id);
export const groupById = (id) => S.db?.groups.find((g) => g.id === id);
export const schoolById = (id) => S.db?.schools.find((s) => s.id === id);
export const childrenOf = (userId) => (S.db?.studentMap[userId] || []).map(studentById).filter(Boolean);
export const guardiansOf = (studentId) => (S.db?.guardianMap[studentId] || []).map(userById).filter(Boolean);

// is `userId` in the audience of a post/signup/form/event/alert?
export function inAudience(userId, audience) {
  if (!audience) return false;
  const u = userById(userId); if (!u) return false;
  if (audience.type === 'network') return true;
  const g = groupById(audience.id);
  if (audience.type === 'school') {
    if (g && g.memberIds.includes(userId)) return true;
    return g ? g.schoolId === u.schoolId : (audience.schoolId ? audience.schoolId === u.schoolId : false);
  }
  return g ? (g.memberIds.includes(userId) || g.leadIds.includes(userId)) : false;
}

// posts visible to the current actor
export function visiblePosts() {
  const me = actor(); if (!me) return [];
  const list = S.db.posts.filter((p) => {
    if (p.scheduledFor && new Date(p.scheduledFor) > new Date() && me.role !== 'admin' && p.authorId !== me.id) return false; // scheduled, not yet sent
    if (me.role === 'admin') return true;                       // admins see all
    if (p.authorId === me.id) return true;                      // own posts
    if (me.role === 'teacher') {                                 // posts to groups they lead + school/network
      if (p.audience?.type === 'network') return true;
      const g = groupById(p.audience?.id);
      if (g && (g.leadIds.includes(me.id) || g.schoolId === me.schoolId)) return true;
      return inAudience(me.id, p.audience);
    }
    return inAudience(me.id, p.audience);                        // parents: audience membership
  });
  return list.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.createdAt) - new Date(a.createdAt)));
}

export function myConversations() {
  const me = S.me;
  return (S.db?.conversations || [])
    .filter((c) => c.participantIds.includes(me))
    .sort((a, b) => new Date(b.messages.at(-1)?.createdAt || 0) - new Date(a.messages.at(-1)?.createdAt || 0));
}
export const unreadCount = () => store.mode() === 'server' ? (S.unread || 0) : myConversations().reduce((n, c) => n + c.messages.filter((m) => m.senderId !== S.me && !m.read).length, 0);

// ---------------------------------------------------------------------------
// SCOPED DATA ACCESS — the heavy/unbounded reads. In SERVER mode these hit the
// paginated, SQL-backed API (the client never loads the whole dataset); in
// DEVICE/offline mode they compute the SAME shape from the on-device DB so the
// PWA still works. Views call these and never touch the big collections directly.
// ---------------------------------------------------------------------------
const apiGet = async (path) => { const r = await fetch(path, { cache: 'no-store' }); if (!r.ok) throw new Error(`${path} → ${r.status}`); return r.json(); };
const slimUser = (u) => u && { id: u.id, name: u.name, avatar: u.avatar, color: u.color, title: u.title, role: u.role };
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export async function feedPage({ me = S.me, limit = 20, before = null } = {}) {
  if (store.mode() === 'server') return apiGet(`/api/feed?${qs({ me, limit, before })}`);
  let posts = visiblePosts();
  if (before) posts = posts.filter((p) => p.createdAt < before);
  const page = posts.slice(0, limit);
  return { items: page.map((p) => ({ ...p, author: slimUser(userById(p.authorId)) })), nextBefore: posts.length > limit ? page.at(-1)?.createdAt : null, hasMore: posts.length > limit };
}

export async function conversationList({ me = S.me } = {}) {
  if (store.mode() === 'server') return apiGet(`/api/conversations?${qs({ me })}`);
  const items = myConversations().map((c) => {
    const msgs = c.messages || [], last = msgs.at(-1);
    return { id: c.id, type: c.type, subject: c.subject || null,
      participants: (c.participantIds || []).map((p) => slimUser(userById(p))).filter(Boolean),
      lastMessage: last && { id: last.id, senderId: last.senderId, body: last.body, createdAt: last.createdAt },
      unread: msgs.filter((m) => m.senderId !== me && !m.read).length, updatedAt: last ? last.createdAt : null };
  });
  return { items };
}

export async function threadPage({ id, me = S.me, limit = 30, before = null } = {}) {
  if (store.mode() === 'server') return apiGet(`/api/thread?${qs({ id, me, limit, before })}`);
  const conv = (S.db?.conversations || []).find((x) => x.id === id);
  if (!conv) throw new Error('unknown conversation');
  const chrono = (conv.messages || []).slice().sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
  const visible = before ? chrono.filter((m) => m.createdAt < before) : chrono;
  const start = Math.max(0, visible.length - limit), page = visible.slice(start);
  return { items: page.map((m) => ({ ...m, sender: slimUser(userById(m.senderId)) })), hasMore: start > 0,
    conversation: { id: conv.id, type: conv.type, subject: conv.subject || null, participants: (conv.participantIds || []).map((p) => slimUser(userById(p))).filter(Boolean) } };
}

export async function alertList({ me = S.me, limit = 20 } = {}) {
  if (store.mode() === 'server') return apiGet(`/api/alerts?${qs({ me, limit })}`);
  const u = actor();
  const items = (S.db?.alerts || []).filter((a) => u.role === 'admin' || inAudience(u.id, a.audience))
    .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, limit)
    .map((a) => ({ ...a, author: slimUser(userById(a.authorId)) }));
  return { items };
}

export async function noticeList({ me = S.me, limit = 20 } = {}) {
  if (store.mode() === 'server') return apiGet(`/api/notices?${qs({ me, limit })}`);
  const u = actor();
  const items = (S.db?.autoNotices || []).filter((n) => u.role === 'admin' || inAudience(u.id, n.audience))
    .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, limit)
    .map((n) => ({ ...n, author: slimUser(userById(n.authorId)) }));
  return { items };
}

export async function directoryPage({ q = '', role = '', schoolId = '', limit = 25, offset = 0 } = {}) {
  if (store.mode() === 'server') return apiGet(`/api/directory?${qs({ q, role, school: schoolId, limit, offset })}`);
  let list = (S.db?.users || []).filter((u) => (!role || u.role === role) && (!schoolId || u.schoolId === schoolId) && (!q || `${u.name} ${u.email || ''}`.toLowerCase().includes(q.toLowerCase())));
  list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
  return { total: list.length, items: list.slice(offset, offset + limit) };
}

export async function dashboardData() {
  if (store.mode() === 'server') return apiGet('/api/dashboard');
  const P = (S.db?.users || []).filter((u) => u.role === 'parent');
  const verified = P.filter((u) => u.verified).length;
  const posts = S.db?.posts || [];
  const engagedIds = new Set();
  posts.forEach((p) => { Object.values(p.reactions || {}).flat().forEach((id) => engagedIds.add(id)); (p.comments || []).forEach((c) => engagedIds.add(c.authorId)); });
  const engaged = P.filter((u) => engagedIds.has(u.id)).length;
  const reach = (ch) => P.filter((u) => (u.reachedBy || []).includes(ch)).length;
  const bySchool = {};
  P.forEach((u) => { const s = (bySchool[u.schoolId] ||= { schoolId: u.schoolId, families: 0, verified: 0 }); s.families++; if (u.verified) s.verified++; });
  const perSchool = Object.values(bySchool).map((s) => ({ ...s, verifiedPct: s.families ? Math.round((s.verified / s.families) * 1000) / 10 : 0 })).sort((a, b) => b.families - a.families);
  const scored = posts.map((p) => ({ p, reactions: Object.values(p.reactions || {}).flat().length, comments: (p.comments || []).length })).map((x) => ({ ...x, score: x.reactions + x.comments })).sort((a, b) => b.score - a.score).slice(0, 4);
  const topPosts = scored.map(({ p, reactions, comments }) => ({ id: p.id, title: p.title, audience: p.audience, createdAt: p.createdAt, reactions, comments, author: slimUser(userById(p.authorId)) }));
  const recentAlerts = (S.db?.alerts || []).slice().sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, 2).map((a) => ({ id: a.id, severity: a.severity, title: a.title, createdAt: a.createdAt, audience: a.audience, recipients: a.delivery?.recipients }));
  return { stats: { totalFamilies: P.length, verified, verifiedPct: P.length ? Math.round((verified / P.length) * 1000) / 10 : 0, postsThisWeek: posts.filter((p) => Date.now() - new Date(p.createdAt) < 7 * 864e5).length, engaged, engagedPct: P.length ? Math.round((engaged / P.length) * 1000) / 10 : 0 }, channelReach: { app: reach('app'), email: reach('email'), sms: reach('sms') }, perSchool, topPosts, recentAlerts };
}

export async function schoolsData() {
  if (store.mode() === 'server') return apiGet('/api/schools');
  const schools = S.db?.schools || [];
  const groupSchool = new Map((S.db?.groups || []).map((g) => [g.id, g.schoolId]));
  const schoolOf = (a) => a.schoolId ?? groupSchool.get(a.audience?.id) ?? null;
  const allPosts = S.db?.posts || [];
  const allAlerts = S.db?.alerts || [];
  const allStudents = S.db?.students || [];
  const weekAgo = Date.now() - 7 * 864e5;
  const engagedIds = new Set();
  allPosts.forEach((p) => { Object.values(p.reactions || {}).flat().forEach((id) => engagedIds.add(id)); (p.comments || []).forEach((c) => engagedIds.add(c.authorId)); });
  return schools.map((s) => {
    const schoolParents = (S.db?.users || []).filter((u) => u.role === 'parent' && u.schoolId === s.id);
    const families = schoolParents.length;
    const verified = schoolParents.filter((u) => u.verified).length;
    const engaged = schoolParents.filter((u) => engagedIds.has(u.id)).length;
    const posts = allPosts.filter((p) => schoolOf(p) === s.id);
    const alerts = allAlerts.filter((a) => schoolOf(a) === s.id);
    return {
      schoolId: s.id, name: s.name, short: s.short, level: s.level, color: s.color,
      families, students: allStudents.filter((x) => x.schoolId === s.id).length,
      posts: posts.length, postsThisWeek: posts.filter((p) => new Date(p.createdAt).getTime() > weekAgo).length,
      alerts: alerts.length,
      verified, verifiedPct: families ? Math.round((verified / families) * 1000) / 10 : 0,
      engaged, engagedPct: families ? Math.round((engaged / families) * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.families - a.families);
}

export async function refreshUnread() {
  try {
    if (store.mode() === 'server') { const r = await apiGet(`/api/unread?${qs({ me: S.me })}`); S.unread = r.count || 0; }
    else S.unread = myConversations().reduce((n, c) => n + c.messages.filter((m) => m.senderId !== S.me && !m.read).length, 0);
  } catch { /* keep last value */ }
}

// Alert-sending authority. Network admins/school leaders (role: admin) hold it by
// role; other staff — including teachers — only via an explicit alertPermission grant.
// 'urgent' is a superset of 'alerts' (can send both regular + Urgent Alerts).
export const canSendAlerts = (u) => u?.role === 'admin' || u?.alertPermission === 'alerts' || u?.alertPermission === 'urgent';
export const canSendUrgent = (u) => u?.role === 'admin' || u?.alertPermission === 'urgent';

// Auto Notices are a separate permission from Alerts (per the doc's "manage auto
// notices" grant) — deliberately broader by default: any teacher can send routine,
// personalized class notices (attendance, athletics, etc.) without an explicit grant,
// unlike the urgent-broadcast Alerts path above.
export const canSendNotices = (u) => u?.role === 'admin' || u?.role === 'teacher';

// audiences the current actor may post/create to (groups they lead, their school, or all if admin)
export function audiencesFor(me) {
  return (S.db?.groups || [])
    .filter((g) => me.role === 'admin' || g.leadIds.includes(me.id) || g.schoolId === me.schoolId)
    .map((g) => ({ type: g.type, id: g.id, label: g.name, schoolId: g.schoolId }));
}

// ---------------------------------------------------------------------------
// SMART LISTS — rule-based, dynamic audiences (fixes grade-only targeting)
// ---------------------------------------------------------------------------
// Rules are DATA (not code) so admins can build/edit Smart Lists in the UI. Vocabulary:
export const SL_FIELDS = [
  { field: 'language', label: 'Preferred language', ops: ['is', 'not'], values: [['es', 'Spanish'], ['en', 'English']] },
  { field: 'verified', label: 'Contact verified', ops: ['is'], values: [['yes', 'Yes'], ['no', 'No']] },
  { field: 'reachedBy', label: 'Channel', ops: ['has', 'hasnot'], values: [['app', 'App'], ['email', 'Email'], ['sms', 'Text']] },
  { field: 'school', label: 'School', ops: ['is', 'not'], values: 'schools' },
  { field: 'grade', label: 'Scholar grade', ops: ['is', 'not'], values: 'grades' },
  { field: 'group', label: 'In group', ops: ['in', 'notin'], values: 'groups' },
  { field: 'atrisk', label: 'Attendance at-risk', ops: ['is'], values: [['yes', 'Yes'], ['no', 'No']] },
];
const _atRiskSet = () => new Set((S.db?.attendanceEvents || []).filter((e) => e.type === 'absent' || e.type === 'truancy').flatMap((e) => S.db.guardianMap?.[e.studentId] || []));

export function matchRule(u, r, ctx) {
  switch (r.field) {
    case 'language': return r.op === 'not' ? u.language !== r.value : u.language === r.value;
    case 'verified': return (!!u.verified) === (r.value === 'yes');
    case 'reachedBy': { const has = (u.reachedBy || []).includes(r.value); return r.op === 'hasnot' ? !has : has; }
    case 'school': return r.op === 'not' ? u.schoolId !== r.value : u.schoolId === r.value;
    case 'grade': { const hit = childrenOf(u.id).some((k) => String(k.grade) === String(r.value)); return r.op === 'not' ? !hit : hit; }
    case 'group': { const g = groupById(r.value); const inG = !!g && (g.memberIds || []).includes(u.id); return r.op === 'notin' ? !inG : inG; }
    case 'atrisk': return ctx.atRisk.has(u.id) === (r.value !== 'no');
    default: return false;
  }
}
export function matchSmartList(u, list, ctx) {
  const rules = list.rules || [];
  if (!rules.length) return false;
  return list.logic === 'any' ? rules.some((r) => matchRule(u, r, ctx)) : rules.every((r) => matchRule(u, r, ctx));
}

// the 6 starter lists, now expressed as rule-data (read-only); admins add their own (S.db.smartLists)
const BUILTIN_SMARTLISTS = [
  { id: 'sl_spanish', label: 'Spanish-preferring families', icon: '🌐', logic: 'all', builtin: true, rules: [{ field: 'language', op: 'is', value: 'es' }] },
  { id: 'sl_unverified', label: 'Unconfirmed contacts', icon: '⚠️', logic: 'all', builtin: true, rules: [{ field: 'verified', op: 'is', value: 'no' }] },
  { id: 'sl_atrisk', label: 'At-risk families (attendance)', icon: '🚩', logic: 'all', builtin: true, rules: [{ field: 'atrisk', op: 'is', value: 'yes' }] },
  { id: 'sl_noapp', label: 'Not yet on the app', icon: '📲', logic: 'all', builtin: true, rules: [{ field: 'reachedBy', op: 'hasnot', value: 'app' }] },
  { id: 'sl_chess', label: 'Chess Team families', icon: '♟️', logic: 'all', builtin: true, rules: [{ field: 'group', op: 'in', value: 'grp_chess' }] },
  { id: 'sl_bus7', label: 'Bus Route 7', icon: '🚌', logic: 'all', builtin: true, rules: [{ field: 'group', op: 'in', value: 'grp_bus7' }] },
];
export const allSmartListDefs = () => [...BUILTIN_SMARTLISTS, ...((S.db?.smartLists) || [])];

export function smartLists() {
  const parents = (S.db?.users || []).filter((u) => u.role === 'parent');
  const ctx = { atRisk: _atRiskSet() };
  return allSmartListDefs().map((s) => ({ ...s, type: 'smart', count: parents.filter((u) => matchSmartList(u, s, ctx)).length }));
}
export function resolveRecipients(audience) {
  const parents = (S.db?.users || []).filter((u) => u.role === 'parent');
  if (!audience) return [];
  if (audience.type === 'smart') {
    const sl = allSmartListDefs().find((s) => s.id === audience.id);
    if (!sl) return [];
    const ctx = { atRisk: _atRiskSet() };
    return parents.filter((u) => matchSmartList(u, sl, ctx));
  }
  if (audience.type === 'network') return parents;
  const g = groupById(audience.id); if (!g) return [];
  if (audience.type === 'school') return parents.filter((u) => g.memberIds.includes(u.id) || u.schoolId === g.schoolId);
  return parents.filter((u) => g.memberIds.includes(u.id));
}
// live count for a draft smart list (used by the builder preview)
export function countSmartList(list) {
  const parents = (S.db?.users || []).filter((u) => u.role === 'parent');
  const ctx = { atRisk: _atRiskSet() };
  return parents.filter((u) => matchSmartList(u, list, ctx)).length;
}

// ---------------------------------------------------------------------------
// CALENDAR CONFIG — event categories + key academic-calendar dates (admin-editable)
// ---------------------------------------------------------------------------
const DEFAULT_CALENDAR = {
  categories: [
    { name: 'Academic', color: '#1f6feb' },
    { name: 'Athletics', color: '#1a7f37' },
    { name: 'Arts', color: '#6e40c9' },
    { name: 'Community', color: '#E0521C' },
    { name: 'Holiday', color: '#cf222e' },
  ],
  keyDates: [
    { label: 'Last day of school (2025–26)', date: '2026-06-26', type: 'term' },
    { label: 'Summer recess begins', date: '2026-06-29', type: 'holiday' },
    { label: 'First day of school (2026–27)', date: '2026-09-02', type: 'term' },
  ],
};
export function calendarConfig() {
  const c = S.db?.calendarConfig;
  if (c && (c.categories?.length || c.keyDates?.length)) {
    return { categories: c.categories?.length ? c.categories : DEFAULT_CALENDAR.categories, keyDates: c.keyDates || [] };
  }
  return JSON.parse(JSON.stringify(DEFAULT_CALENDAR));
}
export const eventCategories = () => calendarConfig().categories;
export const audienceCount = (audience) => resolveRecipients(audience).length;

// scholars a given parent has within a post/item's audience (fixes child-specific labeling)
export function scholarsInAudience(audience, parentId) {
  const kids = childrenOf(parentId);
  if (audience?.type === 'class') { const g = groupById(audience.id); return kids.filter((k) => g?.studentIds.includes(k.id)); }
  return kids;
}

// ---------------------------------------------------------------------------
// MAIL-MERGE personalization (fixes "can't personalize AND schedule")
// ---------------------------------------------------------------------------
export function applyMerge(text, viewer) {
  if (!text || text.indexOf('{{') < 0) return text;
  const kid = childrenOf(viewer?.id)[0];
  const school = schoolById(viewer?.schoolId);
  return text
    .replace(/\{\{\s*scholar_first\s*\}\}/gi, kid?.firstName || 'your scholar')
    .replace(/\{\{\s*scholar\s*\}\}/gi, kid?.firstName || 'your scholar')
    .replace(/\{\{\s*family_last\s*\}\}/gi, viewer?.lastName || 'family')
    .replace(/\{\{\s*school\s*\}\}/gi, school?.short || 'Success Academy');
}

// ---------------------------------------------------------------------------
// ENGAGEMENT — per-family activity (feeds the Salesforce profile + reports)
// ---------------------------------------------------------------------------
export function engagementOf(userId) {
  const db = S.db; let reacted = 0, comments = 0, messages = 0, rsvps = 0, forms = 0, docs = 0;
  (db.posts || []).forEach((p) => { if (Object.values(p.reactions || {}).flat().includes(userId)) reacted++; (p.comments || []).forEach((c) => { if (c.authorId === userId) comments++; }); });
  (db.conversations || []).forEach((c) => c.messages.forEach((m) => { if (m.senderId === userId) messages++; }));
  (db.events || []).forEach((e) => { if (['yes', 'no', 'maybe'].some((k) => (e.rsvps?.[k] || []).includes(userId))) rsvps++; });
  (db.forms || []).forEach((f) => { if ((f.responses || []).some((r) => r.userId === userId)) forms++; });
  (db.documents || []).forEach((d) => { if ((d.acknowledgedBy || []).includes(userId)) docs++; });
  const score = reacted + comments * 2 + messages * 2 + rsvps + forms * 2 + docs;
  return { reacted, comments, messages, rsvps, forms, docs, score, level: score >= 6 ? 'High' : score >= 2 ? 'Medium' : 'Low' };
}

// ---------------------------------------------------------------------------
// CSV EXPORT (fixes "getting data out is very limited")
// ---------------------------------------------------------------------------
export function downloadCSV(filename, rows) {
  if (!rows || !rows.length) { toast(L('Nothing to export', 'Nada que exportar')); return; }
  const cols = Object.keys(rows[0]);
  const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(L(`Exported ${rows.length} rows → ${filename}`, `Exportadas ${rows.length} filas`));
}

// items relevant to actor (parent sees those targeting them / their kids; staff see those they authored or for their groups)
export function relevant(list) {
  const me = actor(); if (!me) return [];
  if (me.role === 'admin') return list;
  return list.filter((x) => x.authorId === me.id || inAudience(me.id, x.audience));
}

// ---------------------------------------------------------------------------
// i18n / translation
// ---------------------------------------------------------------------------
// pick a translated content field based on current language; returns {text, translated}
export function tx(obj, enKey = 'body', esKey = 'bodyEs') {
  if (S.lang === 'es' && obj[esKey]) return { text: obj[esKey], translated: true };
  return { text: obj[enKey] || '', translated: false };
}
// translate a single message for the *reading* actor's language
export function txMsg(m) {
  const lang = S.lang;
  if (lang === 'es') { if (m.lang === 'es') return { text: m.body, translated: false }; if (m.bodyEs) return { text: m.bodyEs, translated: true }; return { text: m.body, translated: false }; }
  if (m.lang === 'en') return { text: m.body, translated: false };
  if (m.bodyEn) return { text: m.bodyEn, translated: true };
  return { text: m.body, translated: false };
}
// UI chrome string
export function L(en, es) { return S.lang === 'es' && es ? es : en; }

// ---------------------------------------------------------------------------
// FORMATTING
// ---------------------------------------------------------------------------
export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 45) return L('just now', 'ahora');
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 604800) return `${Math.round(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function dateLabel(iso) {
  const d = new Date(iso), t = new Date();
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const td = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const diff = Math.round((dd - td) / 86400000);
  if (diff === 0) return L('Today', 'Hoy');
  if (diff === 1) return L('Tomorrow', 'Mañana');
  if (diff === -1) return L('Yesterday', 'Ayer');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
export const fullDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
export const money = (n) => `$${Number(n).toFixed(2)}`;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}
export const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function avatar(user, size = 36) {
  if (!user) return el('div', { class: 'avatar', style: { width: size + 'px', height: size + 'px', background: '#999' } }, '?');
  return el('div', { class: 'avatar', title: user.name, style: { width: size + 'px', height: size + 'px', background: user.color, fontSize: Math.round(size * 0.38) + 'px' } }, user.avatar);
}

export function badge(text, kind = '') { return el('span', { class: `badge ${kind}` }, text); }

// channel chips (app / email / sms / voice)
export function channelChips(channels = []) {
  const map = { app: ['App', 'ch-app'], email: ['Email', 'ch-email'], sms: ['Text', 'ch-sms'], voice: ['Voice', 'ch-voice'] };
  return el('span', { class: 'chips' }, ...channels.map((c) => el('span', { class: `chip ${map[c]?.[1] || ''}` }, map[c]?.[0] || c)));
}

// ---------------------------------------------------------------------------
// ICONS (inline SVG)
// ---------------------------------------------------------------------------
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h14V10', message: 'M21 11.5a8.38 8.38 0 0 1-9 8.5 9 9 0 0 1-4-1L3 20l1.5-4.5A8.5 8.5 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5z',
  hand: 'M7 11V6a2 2 0 0 1 4 0v5m0-1V4a2 2 0 0 1 4 0v7m0-3a2 2 0 0 1 4 0v6a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.3-3.2L3 13a1.6 1.6 0 0 1 2.8-1.5L7 13',
  doc: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
  card: 'M3 7h18v10H3zM3 10h18', people: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 14H4.5a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 7 8.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 12 5.6V4.5a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 18.7 6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', plus: 'M12 5v14M5 12h14', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z',
  check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12', pin: 'M12 17v5M5 9l7-6 7 6-2 2-5-1-5 1z', clip: 'M21 8l-9.5 9.5a4 4 0 0 1-5.7-5.7L14 4a2.7 2.7 0 0 1 3.8 3.8l-8 8a1.3 1.3 0 0 1-1.9-1.9l7.4-7.4',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', alert: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9', dollar: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6z', link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1', report: 'M4 21V4a1 1 0 0 1 1-1h11l4 4v14a1 1 0 0 1-1 1zM8 17v-4M12 17v-7M16 17v-2',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
};
export function icon(name, size = 20) {
  const d = PATHS[name] || PATHS.doc;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d.split(' M').map((seg, i) => `<path d="${i ? 'M' + seg : seg}"/>`).join('')}</svg>`;
}

// ---------------------------------------------------------------------------
// UI: toast + modal
// ---------------------------------------------------------------------------
export function toast(msg, kind = '') {
  let host = document.getElementById('toasts');
  if (!host) { host = el('div', { id: 'toasts' }); document.body.appendChild(host); }
  const t = el('div', { class: `toast ${kind}` }, msg);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('show'); }, 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 2600);
}

export function modal({ title, subtitle, body, actions, wide }) {
  const back = el('div', { class: 'modal-back' });
  const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 180); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  const head = el('div', { class: 'modal-head' },
    el('div', {},
      el('h3', {}, title),
      subtitle ? el('p', { class: 'muted' }, subtitle) : null),
    el('button', { class: 'icon-btn', onclick: close, html: icon('x'), 'aria-label': L('Close', 'Cerrar') }));
  const foot = actions ? el('div', { class: 'modal-foot' }, ...actions) : null;
  const box = el('div', { class: 'modal' + (wide ? ' wide' : '') }, head, el('div', { class: 'modal-body' }, body), foot);
  back.appendChild(box);
  document.body.appendChild(back);
  setTimeout(() => back.classList.add('show'), 10);
  return { close, back };
}

export function btn(label, { kind = '', onclick, iconName, small } = {}) {
  return el('button', { class: `btn ${kind} ${small ? 'sm' : ''}`, onclick }, iconName ? el('span', { class: 'bi', html: icon(iconName, small ? 15 : 17) }) : null, label);
}

// section header with optional action button
export function pageHead(title, sub, action) {
  return el('div', { class: 'page-head' },
    el('div', {}, el('h1', {}, title), sub ? el('p', { class: 'muted' }, sub) : null),
    action || null);
}

export function emptyState(text, sub) {
  return el('div', { class: 'empty' }, el('div', { class: 'empty-emoji' }, '🗂️'), el('p', {}, text), sub ? el('p', { class: 'muted' }, sub) : null);
}

// translated-content tag
export const translatedTag = () => el('span', { class: 'tx-tag', title: 'Auto-translated', html: `${icon('globe', 12)}<span>${L('Translated', 'Traducido')}</span>` });
