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
import { renderConfig } from './config.js';

const VIEWS = {
  home: renderFeed, messages: renderMessages, signups: renderSignups, forms: renderForms,
  calendar: renderCalendar, payments: renderPayments, attendance: renderAttendance,
  documents: renderDocuments, directory: renderDirectory, settings: renderSettings,
  dashboard: renderDashboard, moderation: renderModeration, alerts: renderAlerts,
  automations: renderAutomations, reports: renderReports, integrations: renderIntegrations,
  config: renderConfig,
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
    ['config', 'Configure', 'Configurar', 'sliders'], ['settings', 'Settings', 'Ajustes', 'settings'],
  ],
};

// mobile bottom-bar: just the few primary destinations — everything else lives in the "More" sheet
const MOBILE_PRIMARY = {
  parent: ['home', 'messages', 'calendar', 'alerts'],
  teacher: ['home', 'messages', 'calendar', 'signups'],
  admin: ['dashboard', 'home', 'messages', 'alerts'],
};
const isMobile = () => !!(window.matchMedia && matchMedia('(max-width: 860px)').matches);

function switchPersona(uid) {
  S.me = uid; S.lang = userById(uid).language || 'en';
  const r = userById(uid).role;
  S.view = r === 'admin' ? 'dashboard' : 'home'; S.params = {};
  render();
  C.refreshUnread().then(render);   // refresh the unread badge for the new persona
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

  return el('header', { class: 'topbar', id: 'topbar' },
    el('div', { class: 'brand', onclick: () => navigate(me.role === 'admin' ? 'dashboard' : 'home') },
      el('div', { class: 'brand-mark' }, el('span', {})),
      el('div', { class: 'brand-text' }, el('strong', {}, d.shortName), el('span', {}, 'Family Connect'))),
    // iOS-style collapsing title: shows the current screen name once the large title scrolls under the bar
    el('div', { class: 'nav-title', id: 'nav-title' }),
    el('div', { class: 'topbar-right' }, C.isViewer() ? el('span', { class: 'badge warn viewer-pill', html: icon('shield', 13) + `<span>${C.L('View only', 'Solo lectura')}</span>` }) : null, langToggle, personaWrap));
}

// unread/attention badge count for a given nav view
function badgeForView(view) {
  const me = actor();
  if (view === 'messages') return unreadCount();
  if (view === 'moderation') return (S.db.moderation || []).filter((m) => m.status === 'pending').length;
  if (view === 'documents' && me.role === 'parent') {
    const myKids = S.db.studentMap[me.id] || [];
    return (S.db.documents || []).filter((d) => myKids.includes(d.studentId) && !(d.acknowledgedBy || []).includes(me.id)).length;
  }
  return 0;
}
function navButton([view, en, es, ic]) {
  const b = badgeForView(view);
  return el('button', { class: 'nav-item' + (S.view === view ? ' active' : ''), onclick: () => navigate(view) },
    el('span', { class: 'ni-icon', html: icon(ic) }),
    el('span', { class: 'ni-label' }, C.L(en, es)),
    b ? el('span', { class: 'ni-badge' }, String(b)) : null);
}

function sidebar() {
  const me = actor();
  const all = NAV[me.role] || NAV.parent;

  // desktop: full vertical nav
  if (!isMobile()) {
    return el('nav', { class: 'sidebar' },
      el('div', { class: 'side-scroll' }, ...all.map(navButton)),
      el('div', { class: 'side-foot' },
        el('p', { class: 'muted tiny' }, C.L('Demo · fictional data', 'Demostración · datos ficticios')),
        el('p', { class: 'muted tiny' }, S.db.district.motto)));
  }

  // mobile: 4 primary tabs + a "More" tab that opens the sheet
  const lookup = Object.fromEntries(all.map((it) => [it[0], it]));
  const primaryViews = MOBILE_PRIMARY[me.role] || MOBILE_PRIMARY.parent;
  const primary = primaryViews.map((v) => lookup[v]).filter(Boolean);
  const restBadge = all.filter((it) => !primaryViews.includes(it[0])).reduce((n, it) => n + badgeForView(it[0]), 0);
  const moreActive = openMenu === 'more' || !primaryViews.includes(S.view);
  return el('nav', { class: 'sidebar' },
    el('div', { class: 'side-scroll' },
      ...primary.map(navButton),
      el('button', { class: 'nav-item more-nav' + (moreActive ? ' active' : ''), onclick: () => toggleMenu('more') },
        el('span', { class: 'ni-icon', html: icon('grid') }),
        el('span', { class: 'ni-label' }, C.L('More', 'Más')),
        restBadge ? el('span', { class: 'ni-badge' }, String(restBadge)) : null)));
}

// mobile "More" sheet — app-drawer of every non-primary destination
function moreSheet() {
  if (openMenu !== 'more' || !isMobile()) return null;
  const me = actor();
  const all = NAV[me.role] || NAV.parent;
  const primaryViews = MOBILE_PRIMARY[me.role] || MOBILE_PRIMARY.parent;
  const rest = all.filter((it) => !primaryViews.includes(it[0]));
  const sheet = el('div', { class: 'more-sheet' },
    el('div', { class: 'ms-grab' }),
    el('div', { class: 'ms-head' },
      el('strong', {}, C.L('More', 'Más')),
      el('button', { class: 'ms-close', html: icon('x', 20), onclick: () => closeMenus() })),
    el('div', { class: 'ms-grid' }, ...rest.map(([view, en, es, ic]) => {
      const b = badgeForView(view);
      return el('button', { class: 'ms-tile' + (S.view === view ? ' active' : ''), onclick: () => { openMenu = null; navigate(view); } },
        el('span', { class: 'ms-ic', html: icon(ic, 22) }),
        el('span', { class: 'ms-lbl' }, C.L(en, es)),
        b ? el('span', { class: 'ms-badge' }, String(b)) : null);
    })));
  return el('div', { class: 'more-back', onclick: (e) => { if (e.target.classList.contains('more-back')) closeMenus(); } }, sheet);
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
  if (me.role === 'parent' || C.isViewer()) return null;   // viewers are read-only — no compose/send affordances
  const acts = [];
  if (S.view === 'home') acts.push(el('button', { class: 'fab', onclick: () => openCompose(), html: icon('plus', 18) + `<span>${C.L('New Post', 'Nueva publicación')}</span>` }));
  if (me.role === 'admin' && S.view === 'alerts') acts.push(el('button', { class: 'fab danger', onclick: () => openSendAlert(), html: icon('alert', 17) + `<span>${C.L('Send Alert', 'Enviar alerta')}</span>` }));
  return acts.length ? el('div', { class: 'shell-actions' }, ...acts) : null;
}

// ---------------------------------------------------------------------------
// MENUS
// ---------------------------------------------------------------------------
let openMenu = null;
// the "More" sheet is part of render(); the persona menu animates via a class — so re-render for one, sync for the other
function toggleMenu(name) { const prev = openMenu; openMenu = openMenu === name ? null : name; (name === 'more' || prev === 'more') ? render() : syncMenus(); }
function closeMenus() { const prev = openMenu; openMenu = null; prev === 'more' ? render() : syncMenus(); }
function syncMenus() { const pw = document.getElementById('persona-wrap'); if (pw) pw.classList.toggle('open', openMenu === 'persona'); }
document.addEventListener('click', (e) => { if (openMenu === 'persona' && !e.target.closest('.persona-wrap')) closeMenus(); });

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
function render() {
  const app = document.getElementById('app');
  C.clear(app);
  const main = el('main', { class: 'main', id: 'main' });
  // an open conversation takes over the screen on mobile (full-screen thread, hidden tab bar, no banner)
  const mobileThread = isMobile() && S.view === 'messages' && !!S.params.conversationId;
  const banner = mobileThread ? null : alertBanner();
  const fn = VIEWS[S.view] || VIEWS.home;
  try { fn(main); }
  catch (e) { console.error(e); main.appendChild(el('div', { class: 'error' }, 'View error: ' + e.message)); }

  app.appendChild(el('div', { class: 'layout' + (mobileThread ? ' in-thread' : '') },
    topbar(),
    el('div', { class: 'body-row' },
      sidebar(),
      el('div', { class: 'content' }, banner, shellActions(), main))));
  const sheet = moreSheet();
  if (sheet) app.appendChild(sheet);
  syncMenus();
  // on the mobile bottom-nav, keep the active tab in view + feed the iOS collapsing title
  if (isMobile()) {
    const an = document.querySelector('.side-scroll .nav-item.active');
    if (an) an.scrollIntoView({ inline: 'center', block: 'nearest' });
    const nt = document.getElementById('nav-title');
    const h1 = document.querySelector('.page-head h1');
    if (nt) nt.textContent = h1 ? h1.textContent : '';
    onScrollSync();
  }
}

// iOS nav bar: reveal the compact centered title once the large title scrolls under the bar
function onScrollSync() {
  const tb = document.getElementById('topbar'); if (!tb) return;
  if (!isMobile()) { tb.classList.remove('scrolled'); return; }
  const ph = document.querySelector('.page-head');
  const show = ph ? ph.getBoundingClientRect().bottom <= tb.offsetHeight - 2 : window.scrollY > 60;
  tb.classList.toggle('scrolled', show);
}
addEventListener('scroll', onScrollSync, { passive: true });

// re-render when crossing the mobile/desktop breakpoint so the nav swaps cleanly
let _wasMobile = isMobile();
addEventListener('resize', () => {
  const m = isMobile();
  if (m !== _wasMobile) { _wasMobile = m; if (!m && openMenu === 'more') openMenu = null; render(); }
});

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
  C.refreshUnread().then(render);   // populate the unread badge once the persona is set
  setupPullToRefresh();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
