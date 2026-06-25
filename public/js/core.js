/* ============================================================================
 * core.js — shared state, API client, i18n, formatting, DOM + UI primitives
 * ==========================================================================*/

// ---------------------------------------------------------------------------
// STATE (single source of truth held in memory; server persists the DB)
// ---------------------------------------------------------------------------
export const S = {
  db: null,        // full DB from /api/state
  me: null,        // current persona userId
  lang: 'en',      // 'en' | 'es'  (drives translation demo)
  view: 'home',    // current route
  params: {},      // route params (e.g. open conversation id)
};

let _onChange = null;
export const setOnChange = (fn) => { _onChange = fn; };
const ping = () => _onChange && _onChange();

// ---------------------------------------------------------------------------
// DATA — backed by an on-device store (serverless; works offline)
// ---------------------------------------------------------------------------
import * as store from './store.js';
export async function loadState() { S.db = await store.loadState(); return S.db; }
export async function act(op, payload) {
  const res = store.mutate(op, payload);
  if (res.state) S.db = res.state;
  ping();
  return res;
}
export async function resetDb() { S.db = await store.reset(); ping(); }

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
export const unreadCount = () => myConversations().reduce((n, c) => n + c.messages.filter((m) => m.senderId !== S.me && !m.read).length, 0);

// audiences the current actor may post/create to (groups they lead, their school, or all if admin)
export function audiencesFor(me) {
  return (S.db?.groups || [])
    .filter((g) => me.role === 'admin' || g.leadIds.includes(me.id) || g.schoolId === me.schoolId)
    .map((g) => ({ type: g.type, id: g.id, label: g.name, schoolId: g.schoolId }));
}

// ---------------------------------------------------------------------------
// SMART LISTS — rule-based, dynamic audiences (fixes grade-only targeting)
// ---------------------------------------------------------------------------
export function smartLists() {
  const parents = (S.db?.users || []).filter((u) => u.role === 'parent');
  const atRisk = new Set((S.db?.attendanceEvents || []).filter((e) => e.type === 'absent' || e.type === 'truancy').flatMap((e) => S.db.guardianMap[e.studentId] || []));
  const inGrp = (gid) => { const g = groupById(gid); return (u) => !!g && g.memberIds.includes(u.id); };
  const defs = [
    { id: 'sl_spanish', label: 'Spanish-preferring families', icon: '🌐', match: (u) => u.language === 'es' },
    { id: 'sl_unverified', label: 'Unconfirmed contacts', icon: '⚠️', match: (u) => !u.verified },
    { id: 'sl_atrisk', label: 'At-risk families (attendance)', icon: '🚩', match: (u) => atRisk.has(u.id) },
    { id: 'sl_noapp', label: 'Not yet on the app', icon: '📲', match: (u) => !(u.reachedBy || []).includes('app') },
    { id: 'sl_chess', label: 'Chess Team families', icon: '♟️', match: inGrp('grp_chess') },
    { id: 'sl_bus7', label: 'Bus Route 7', icon: '🚌', match: inGrp('grp_bus7') },
  ];
  return defs.map((s) => ({ ...s, type: 'smart', count: parents.filter(s.match).length }));
}
export function resolveRecipients(audience) {
  const parents = (S.db?.users || []).filter((u) => u.role === 'parent');
  if (!audience) return [];
  if (audience.type === 'smart') { const sl = smartLists().find((s) => s.id === audience.id); return sl ? parents.filter(sl.match) : []; }
  if (audience.type === 'network') return parents;
  const g = groupById(audience.id); if (!g) return [];
  if (audience.type === 'school') return parents.filter((u) => g.memberIds.includes(u.id) || u.schoolId === g.schoolId);
  return parents.filter((u) => g.memberIds.includes(u.id));
}
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
    el('button', { class: 'icon-btn', onclick: close, html: icon('x') }));
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
