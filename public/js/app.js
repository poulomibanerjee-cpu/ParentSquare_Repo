/* ============================================================================
 * app.js — bootstrap, shell (top bar / persona switcher / nav), router
 * ==========================================================================*/
import * as C from './core.js';
import { S, actor, userById, navigate, setLang, resetDb, loadState, setOnChange, el, icon, avatar, unreadCount, visiblePosts, relevant } from './core.js';
import { renderFeed, openCompose } from './feed.js';
import { renderMessages } from './messages.js';
import { renderSignups, renderForms, renderCalendar } from './engage.js';
import { renderPayments, renderAttendance, renderDocuments } from './records.js';
import { renderDirectory, renderSettings } from './directory.js';
import { renderDashboard, renderModeration, renderAlerts, openSendAlert, renderAutomations, renderReports, renderIntegrations } from './admin.js';

const VIEWS = {
  home: renderFeed, messages: renderMessages, signups: renderSignups, forms: renderForms,
  calendar: renderCalendar, payments: renderPayments, attendance: renderAttendance,
  documents: renderDocuments, directory: renderDirectory, settings: renderSettings,
  dashboard: renderDashboard, moderation: renderModeration, alerts: renderAlerts,
  automations: renderAutomations, reports: renderReports, integrations: renderIntegrations,
};

// nav config per role: [view, labelEN, labelES, iconName]
const NAV = {
  parent: [
    ['home', 'Home', 'Inicio', 'home'], ['messages', 'Messages', 'Mensajes', 'message'],
    ['signups', 'Sign-Ups', 'Inscripciones', 'hand'], ['forms', 'Forms', 'Formularios', 'doc'],
    ['documents', 'Documents', 'Documentos', 'folder'],
    ['calendar', 'Calendar', 'Calendario', 'calendar'], ['payments', 'Payments', 'Pagos', 'card'],
    ['attendance', 'Attendance', 'Asistencia', 'clock'], ['directory', 'Directory', 'Directorio', 'people'],
    ['alerts', 'Alerts', 'Alertas', 'bell'], ['settings', 'Settings', 'Ajustes', 'settings'],
  ],
  teacher: [
    ['home', 'Home', 'Inicio', 'home'], ['messages', 'Messages', 'Mensajes', 'message'],
    ['signups', 'Sign-Ups', 'Inscripciones', 'hand'], ['forms', 'Forms', 'Formularios', 'doc'],
    ['documents', 'Documents', 'Documentos', 'folder'],
    ['calendar', 'Calendar', 'Calendario', 'calendar'], ['directory', 'Directory', 'Directorio', 'people'],
    ['settings', 'Settings', 'Ajustes', 'settings'],
  ],
  admin: [
    ['dashboard', 'Dashboard', 'Panel', 'chart'], ['reports', 'Reports', 'Informes', 'report'],
    ['home', 'Posts', 'Publicaciones', 'home'], ['alerts', 'Alerts', 'Alertas', 'bell'],
    ['automations', 'Automations', 'Automatizaciones', 'bolt'], ['moderation', 'Moderation', 'Moderación', 'shield'],
    ['messages', 'Messages', 'Mensajes', 'message'], ['signups', 'Sign-Ups', 'Inscripciones', 'hand'],
    ['forms', 'Forms', 'Formularios', 'doc'], ['documents', 'Documents', 'Documentos', 'folder'],
    ['calendar', 'Calendar', 'Calendario', 'calendar'], ['attendance', 'Attendance', 'Asistencia', 'clock'],
    ['integrations', 'Integrations', 'Integraciones', 'link'], ['directory', 'Directory', 'Directorio', 'people'],
    ['settings', 'Settings', 'Ajustes', 'settings'],
  ],
};

function switchPersona(uid) {
  S.me = uid; S.lang = userById(uid).language || 'en';
  const r = userById(uid).role;
  S.view = r === 'admin' ? 'dashboard' : 'home'; S.params = {};
  render();
}

// most recent urgent/emergency alert relevant to actor, posted in last 36h
function activeAlert() {
  const me = actor(); if (!me) return null;
  return (S.db.alerts || []).find((a) =>
    a.severity !== 'info' &&
    (Date.now() - new Date(a.createdAt)) < 36 * 3.6e6 &&
    (me.role !== 'parent' || C.inAudience(me.id, a.audience)));
}

let alertDismissed = null;

// ---------------------------------------------------------------------------
// SHELL PIECES
// ---------------------------------------------------------------------------
function topbar() {
  const me = actor();
  const d = S.db.district;

  // persona dropdown
  const menu = el('div', { class: 'persona-menu' },
    el('div', { class: 'pm-label' }, 'Switch persona — see every side of the platform'),
    ...S.db.personas.map((p) => {
      const u = userById(p.userId);
      return el('button', { class: 'pm-item' + (p.userId === S.me ? ' active' : ''), onclick: () => { closeMenus(); switchPersona(p.userId); } },
        avatar(u, 34),
        el('div', { class: 'pm-text' }, el('strong', {}, p.label), el('span', {}, p.sub)),
        el('span', { class: `role-pill ${p.role}` }, p.role));
    }),
    el('div', { class: 'pm-foot' },
      el('button', { class: 'link-btn', onclick: async () => { closeMenus(); if (confirm('Reset all demo data to its original seed? Your sent messages, RSVPs, sign-ups, etc. will be cleared.')) { await resetDb(); C.toast('Demo data reset'); } } }, '↺ Reset demo data')));

  const personaBtn = el('button', { class: 'persona-btn', onclick: () => toggleMenu('persona') },
    avatar(me, 32),
    el('div', { class: 'pb-text' }, el('strong', {}, me.name), el('span', {}, me.title || (me.role === 'parent' ? C.L('Parent / Guardian', 'Padre / Tutor') : me.role))),
    el('span', { class: 'caret', html: '▾' }));

  const personaWrap = el('div', { class: 'persona-wrap', id: 'persona-wrap' }, personaBtn, menu);

  // language toggle
  const langToggle = el('div', { class: 'lang-toggle', title: 'Translation demo — flip the whole UI + content' },
    el('span', { class: 'bi', html: icon('globe', 16) }),
    ...[['en', 'EN'], ['es', 'ES']].map(([code, lbl]) =>
      el('button', { class: 'lang-opt' + (S.lang === code ? ' active' : ''), onclick: () => setLang(code) }, lbl)));

  return el('header', { class: 'topbar' },
    el('div', { class: 'brand', onclick: () => navigate(me.role === 'admin' ? 'dashboard' : 'home') },
      el('div', { class: 'brand-mark' }, el('span', {})),
      el('div', { class: 'brand-text' }, el('strong', {}, d.shortName), el('span', {}, 'Family Connect'))),
    el('div', { class: 'topbar-right' }, langToggle, personaWrap));
}

function sidebar() {
  const me = actor();
  const items = NAV[me.role] || NAV.parent;
  const unread = unreadCount();
  const myKids = S.db.studentMap[me.id] || [];
  const docUnread = me.role === 'parent' ? (S.db.documents || []).filter((d) => myKids.includes(d.studentId) && !(d.acknowledgedBy || []).includes(me.id)).length : 0;
  return el('nav', { class: 'sidebar' },
    el('div', { class: 'side-scroll' }, ...items.map(([view, en, es, ic]) => {
      const badgeN = view === 'messages' ? unread : view === 'documents' ? docUnread : view === 'moderation' ? (S.db.moderation || []).filter((m) => m.status === 'pending').length : 0;
      return el('button', { class: 'nav-item' + (S.view === view ? ' active' : ''), onclick: () => navigate(view) },
        el('span', { class: 'ni-icon', html: icon(ic) }),
        el('span', { class: 'ni-label' }, C.L(en, es)),
        badgeN ? el('span', { class: 'ni-badge' }, String(badgeN)) : null);
    })),
    el('div', { class: 'side-foot' },
      el('p', { class: 'muted tiny' }, C.L('Demo · fictional data', 'Demostración · datos ficticios')),
      el('p', { class: 'muted tiny' }, S.db.district.motto)));
}

function alertBanner() {
  const a = activeAlert();
  if (!a || alertDismissed === a.id) return null;
  const { text } = C.tx(a, 'title');
  const body = C.tx(a, 'body');
  return el('div', { class: `alert-banner sev-${a.severity}` },
    el('span', { class: 'ab-icon', html: icon('alert', 22) }),
    el('div', { class: 'ab-text' },
      el('strong', {}, (a.severity === 'emergency' ? '🚨 ' : '⚠️ ') + (a.title || text)),
      el('p', {}, body.text)),
    actor().role === 'parent' ? el('button', { class: 'ab-confirm', onclick: () => { alertDismissed = a.id; C.toast(C.L('Receipt confirmed — thank you', 'Recibo confirmado — gracias')); render(); } }, C.L('Confirm receipt', 'Confirmar recibo')) : null,
    el('button', { class: 'ab-x', html: icon('x', 18), onclick: () => { alertDismissed = a.id; render(); } }));
}

// header compose button (teacher/admin) shown on Posts/Home + Alerts
function shellActions() {
  const me = actor();
  if (me.role === 'parent') return null;
  const acts = [];
  if (S.view === 'home') acts.push(el('button', { class: 'fab', onclick: () => openCompose(), html: icon('plus', 18) + `<span>${C.L('New Post', 'Nueva publicación')}</span>` }));
  if (me.role === 'admin' && S.view === 'alerts') acts.push(el('button', { class: 'fab danger', onclick: () => openSendAlert(), html: icon('alert', 17) + `<span>${C.L('Send Alert', 'Enviar alerta')}</span>` }));
  return acts.length ? el('div', { class: 'shell-actions' }, ...acts) : null;
}

// ---------------------------------------------------------------------------
// MENUS
// ---------------------------------------------------------------------------
let openMenu = null;
function toggleMenu(name) { openMenu = openMenu === name ? null : name; syncMenus(); }
function closeMenus() { openMenu = null; syncMenus(); }
function syncMenus() { const pw = document.getElementById('persona-wrap'); if (pw) pw.classList.toggle('open', openMenu === 'persona'); }
document.addEventListener('click', (e) => { if (openMenu && !e.target.closest('.persona-wrap')) closeMenus(); });

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
function render() {
  const app = document.getElementById('app');
  C.clear(app);
  const main = el('main', { class: 'main', id: 'main' });
  const banner = alertBanner();
  const fn = VIEWS[S.view] || VIEWS.home;
  try { fn(main); }
  catch (e) { console.error(e); main.appendChild(el('div', { class: 'error' }, 'View error: ' + e.message)); }

  app.appendChild(el('div', { class: 'layout' },
    topbar(),
    el('div', { class: 'body-row' },
      sidebar(),
      el('div', { class: 'content' }, banner, shellActions(), main))));
  syncMenus();
}

// ---------------------------------------------------------------------------
// PULL-TO-REFRESH (touch devices) — native-feeling re-pull of the current view
// ---------------------------------------------------------------------------
function setupPullToRefresh() {
  const ind = el('div', { class: 'ptr', id: 'ptr' }, el('div', { class: 'ptr-spin' }));
  document.body.appendChild(ind);
  const THRESH = 72; let startY = 0, dist = 0, pulling = false, busy = false;
  const reset = () => { ind.style.transform = ''; ind.style.opacity = ''; ind.classList.remove('ready'); };
  addEventListener('touchstart', (e) => { if (!busy && window.scrollY <= 0 && e.touches.length === 1) { startY = e.touches[0].clientY; pulling = true; dist = 0; } }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!pulling) return;
    dist = e.touches[0].clientY - startY;
    if (dist > 0 && window.scrollY <= 0) { const d = Math.min(dist, 120); ind.style.opacity = Math.min(d / THRESH, 1); ind.style.transform = `translateX(-50%) translateY(${Math.min(d * 0.5, 56)}px)`; ind.classList.toggle('ready', d >= THRESH); }
  }, { passive: true });
  addEventListener('touchend', () => {
    if (!pulling) return; pulling = false;
    if (dist >= THRESH) { busy = true; ind.classList.add('spin'); ind.style.transform = 'translateX(-50%) translateY(48px)'; render(); setTimeout(() => { ind.classList.remove('spin'); reset(); busy = false; C.toast(C.L('Refreshed', 'Actualizado')); }, 500); }
    else reset();
    dist = 0;
  });
}

// ---------------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------------
(async function boot() {
  await loadState();
  setOnChange(render);
  // default persona: Jarrod (network leadership) — opens on the admin dashboard for the demo
  const start = S.db.personas.find((p) => p.userId === 'usr_jarrod') || S.db.personas[0];
  S.me = start.userId; S.lang = userById(S.me).language || 'en';
  S.view = userById(S.me).role === 'admin' ? 'dashboard' : 'home';
  render();
  setupPullToRefresh();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
