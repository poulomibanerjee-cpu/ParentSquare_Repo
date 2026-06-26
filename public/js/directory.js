/* ============================================================================
 * directory.js — Directory (groups & people) + Settings (notification prefs)
 * ==========================================================================*/
import * as C from './core.js';
import { S, el, icon, avatar, userById, studentById, groupById, actor, act, childrenOf, guardiansOf, badge, pageHead, btn, modal, toast, emptyState, L, engagementOf } from './core.js';
import { notify, requestNotifyPermission, notifyState } from './notify.js';
const engStat = (n, lbl) => el('div', { class: 'eng-stat' }, el('strong', {}, String(n)), el('span', { class: 'muted tiny' }, lbl));

const GROUP_ICON = { class: '🏫', school: '🎒', network: '🌐', club: '🎭', team: '⚽', bus: '🚌' };

// ===========================================================================
// DIRECTORY
// ===========================================================================
function groupCard(g) {
  const leads = g.leadIds.map(userById).filter(Boolean);
  return el('button', { class: 'card group-card', onclick: () => openGroup(g) },
    el('span', { class: 'gc-emoji' }, GROUP_ICON[g.type] || '👥'),
    el('div', { class: 'gc-text' }, el('strong', {}, g.name),
      el('div', { class: 'muted tiny' }, `${g.memberIds.length} ${L('families', 'familias')}${g.studentIds.length ? ' · ' + g.studentIds.length + ' ' + L('scholars', 'estudiantes') : ''}`),
      leads.length ? el('div', { class: 'muted tiny' }, L('Led by', 'Dirigido por') + ' ' + leads.map((l) => l.name).join(', ')) : null),
    el('span', { class: 'gc-arrow', html: '›' }));
}

function personRow(u) {
  const kids = childrenOf(u.id);
  return el('div', { class: 'person', onclick: () => openPerson(u) },
    avatar(u, 38),
    el('div', { class: 'pr-text' }, el('strong', {}, u.name),
      el('div', { class: 'muted tiny' }, u.title || (u.role === 'parent' ? (kids.length ? L('Parent of', 'Padre de') + ' ' + kids.map((k) => k.firstName).join(' & ') : L('Parent / Guardian', 'Padre / Tutor')) : u.role))),
    u.language === 'es' ? el('span', { class: 'lang-badge' }, 'ES') : null,
    u.verified ? el('span', { class: 'verified', title: 'Contact verified', html: icon('check', 14) }) : el('span', { class: 'muted tiny' }, L('unverified', 'sin verificar')));
}

function openGroup(g) {
  const members = g.memberIds.map(userById).filter(Boolean);
  const leads = g.leadIds.map(userById).filter(Boolean);
  const CAP = 40;
  const shown = members.slice(0, CAP);
  modal({ title: g.name, subtitle: `${members.length} ${L('members', 'miembros')}`, wide: true,
    body: el('div', {},
      leads.length ? el('div', { class: 'dir-sec' }, el('h4', {}, L('Leaders', 'Líderes')), ...leads.map(personRow)) : null,
      el('div', { class: 'dir-sec' }, el('h4', {}, L('Families', 'Familias')),
        ...(members.length ? shown.map(personRow) : [el('p', { class: 'muted' }, L('No members', 'Sin miembros'))]),
        members.length > CAP ? el('div', { class: 'list-more' }, L(`+ ${members.length - CAP} more families`, `+ ${members.length - CAP} familias más`)) : null)),
    actions: [] });
}

function openPerson(u) {
  const kids = childrenOf(u.id);
  const guardians = u.role === 'parent' ? [] : [];
  modal({ title: u.name, subtitle: u.title || (u.role === 'parent' ? L('Parent / Guardian', 'Padre / Tutor') : u.role),
    body: el('div', { class: 'person-detail' },
      el('div', { class: 'pd-head' }, avatar(u, 64), el('div', {}, el('strong', {}, u.name), el('p', { class: 'muted' }, u.title || ''),
        el('div', { class: 'pill-row' }, u.verified ? el('span', { class: 'verified-pill', html: icon('check', 13) + ' ' + L('Verified contact', 'Contacto verificado') }) : null,
          u.role === 'parent' ? el('span', { class: 'verified-pill sf' }, '☁️ ' + L('Synced to Salesforce', 'Sincronizado con Salesforce')) : null))),
      el('div', { class: 'pd-grid' },
        info(L('Email', 'Correo'), u.email), info(L('Phone', 'Teléfono'), u.phone),
        info(L('Language', 'Idioma'), u.language === 'es' ? 'Español' : 'English'),
        info(L('School', 'Escuela'), C.schoolById(u.schoolId)?.short || '—'),
        info(L('Reached via', 'Contacto por'), (u.reachedBy || []).join(', '))),
      kids.length ? el('div', { class: 'dir-sec' }, el('h4', {}, L('Scholars', 'Estudiantes')), ...kids.map((k) => el('div', { class: 'person' }, avatar({ name: k.name, avatar: k.firstName[0], color: k.color }, 32), el('div', { class: 'pr-text' }, el('strong', {}, k.name), el('div', { class: 'muted tiny' }, `${L('Grade', 'Grado')} ${k.grade}`))))) : null,
      u.role === 'parent' ? (() => { const e = engagementOf(u.id); return el('div', { class: 'dir-sec' }, el('h4', {}, '☁️ ' + L('Engagement (on the Salesforce profile)', 'Interacción (en el perfil de Salesforce)')), el('div', { class: 'engage-grid' }, el('div', { class: 'eng-level lvl-' + e.level.toLowerCase() }, e.level), engStat(e.reacted, L('reactions', 'reacciones')), engStat(e.messages, L('messages', 'mensajes')), engStat(e.rsvps, 'RSVPs'), engStat(e.forms, L('forms', 'formularios')), engStat(e.docs, L('docs', 'docs')))); })() : null),
    actions: [u.id !== S.me ? btn(L('Message', 'Mensaje'), { kind: 'primary', iconName: 'message', onclick: async () => { const existing = S.db.conversations.find((c) => c.type === 'direct' && c.participantIds.length === 2 && c.participantIds.includes(S.me) && c.participantIds.includes(u.id)); if (existing) { C.navigate('messages', { conversationId: existing.id }); } else { const r = await act('startConversation', { participantIds: [S.me, u.id], senderId: S.me, body: '' }); C.navigate('messages', { conversationId: r.result }); } } }) : null].filter(Boolean) });
}

const info = (label, val) => el('div', { class: 'info' }, el('span', { class: 'muted tiny' }, label), el('span', {}, val || '—'));

export function renderDirectory(main) {
  const me = actor();
  main.appendChild(pageHead(L('Directory', 'Directorio'), L('Groups, classes & contacts', 'Grupos, clases y contactos')));

  // groups visible to me
  const groups = S.db.groups.filter((g) => me.role === 'admin' || g.memberIds.includes(me.id) || g.leadIds.includes(me.id) || g.schoolId === me.schoolId);
  const peopleWrap = el('div', { class: 'person-list' });
  const CAP = 50;
  // people come from the scoped, paginated directory endpoint (server-side search) or the on-device store (offline)
  const renderPeople = async (q) => {
    C.clear(peopleWrap);
    peopleWrap.appendChild(el('p', { class: 'muted pad' }, L('Searching…', 'Buscando…')));
    try {
      const { items, total } = await C.directoryPage({ q, schoolId: me.role === 'admin' ? '' : me.schoolId, limit: CAP });
      const rows = me.role === 'parent' ? items.filter((u) => u.role !== 'parent') : items;   // parents see staff only
      C.clear(peopleWrap);
      if (!rows.length) { peopleWrap.appendChild(el('p', { class: 'muted pad' }, L('No matches', 'Sin resultados'))); return; }
      rows.forEach((u) => peopleWrap.appendChild(personRow(u)));
      if (total > items.length) peopleWrap.appendChild(el('div', { class: 'list-more' }, L(`Showing ${rows.length} of ${total} — search to narrow`, `Mostrando ${rows.length} de ${total} — busca para filtrar`)));
    } catch (e) { C.clear(peopleWrap); peopleWrap.appendChild(el('div', { class: 'error' }, 'Directory error: ' + (e && e.message))); }
  };
  renderPeople('');

  main.appendChild(el('div', { class: 'dir-layout' },
    el('div', {},
      el('h3', { class: 'sec-h' }, L('Your Groups', 'Tus grupos')),
      el('div', { class: 'group-grid' }, ...(groups.length ? groups.map(groupCard) : [el('p', { class: 'muted' }, L('No groups', 'Sin grupos'))]))),
    el('div', {},
      el('div', { class: 'search-row' }, el('span', { class: 'si', html: icon('search', 18) }), el('input', { class: 'inp search', placeholder: me.role === 'parent' ? L('Search staff…', 'Buscar personal…') : L('Search people…', 'Buscar personas…'), oninput: (e) => renderPeople(e.target.value) })),
      peopleWrap)));
}

// ===========================================================================
// SETTINGS — notification preferences
// ===========================================================================
export function renderSettings(main) {
  const me = actor();
  const p = JSON.parse(JSON.stringify(S.db.prefs[me.id] || { channels: { app: true, email: true, sms: true, voice: false }, digest: 'instant', quietHours: { enabled: false, start: '9:00 PM', end: '7:00 AM' }, language: me.language }));

  main.appendChild(pageHead(L('Settings', 'Ajustes'), L('Notification preferences & contact info', 'Preferencias de notificación e información de contacto')));

  const chanToggle = (key, label, sub) => {
    const row = el('div', { class: 'pref-row' }, el('div', {}, el('strong', {}, label), el('div', { class: 'muted tiny' }, sub)),
      el('button', { class: 'switch' + (p.channels[key] ? ' on' : ''), onclick: (e) => { p.channels[key] = !p.channels[key]; e.currentTarget.classList.toggle('on'); } }, el('span', { class: 'knob' })));
    return row;
  };

  const digestSel = el('div', { class: 'seg' }, ...[['instant', L('Instant', 'Al instante')], ['daily', L('Daily digest', 'Resumen diario')], ['off', L('Off', 'Desactivado')]].map(([v, lbl]) => {
    const b = el('button', { class: 'seg-opt' + (p.digest === v ? ' on' : ''), onclick: () => { p.digest = v; digestSel.querySelectorAll('.seg-opt').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, lbl);
    return b;
  }));

  const langSel = el('div', { class: 'seg' }, ...[['en', 'English'], ['es', 'Español']].map(([v, lbl]) => {
    const b = el('button', { class: 'seg-opt' + (p.language === v ? ' on' : ''), onclick: () => { p.language = v; langSel.querySelectorAll('.seg-opt').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, lbl);
    return b;
  }));

  const qhBtn = el('button', { class: 'switch' + (p.quietHours.enabled ? ' on' : ''), onclick: (e) => { p.quietHours.enabled = !p.quietHours.enabled; e.currentTarget.classList.toggle('on'); } }, el('span', { class: 'knob' }));

  main.appendChild(el('div', { class: 'card' },
    el('h3', { class: 'card-h' }, L('How would you like to be notified?', '¿Cómo deseas recibir notificaciones?')),
    chanToggle('app', L('App push', 'Notificación de app'), L('Instant alerts on your phone', 'Alertas instantáneas en tu teléfono')),
    chanToggle('email', L('Email', 'Correo electrónico'), me.email),
    chanToggle('sms', L('Text message', 'Mensaje de texto'), me.phone),
    chanToggle('voice', L('Voice call', 'Llamada de voz'), L('For urgent alerts only', 'Solo para alertas urgentes'))));

  main.appendChild(el('div', { class: 'card' },
    el('h3', { class: 'card-h' }, L('Delivery', 'Entrega')),
    el('div', { class: 'pref-row' }, el('div', {}, el('strong', {}, L('Notification frequency', 'Frecuencia')), el('div', { class: 'muted tiny' }, L('Bundle non-urgent posts into a digest', 'Agrupar publicaciones no urgentes'))), digestSel),
    el('div', { class: 'pref-row' }, el('div', {}, el('strong', {}, L('Quiet hours', 'Horas de silencio')), el('div', { class: 'muted tiny' }, `${p.quietHours.start} – ${p.quietHours.end} (${L('urgent alerts still ring', 'las alertas urgentes siguen sonando')})`)), qhBtn),
    el('div', { class: 'pref-row' }, el('div', {}, el('strong', {}, L('Preferred language', 'Idioma preferido')), el('div', { class: 'muted tiny' }, L('Posts & messages auto-translate to this', 'Las publicaciones se traducen a este idioma'))), langSel)));

  // device push notifications (real)
  const notifLabel = () => { const s = notifyState(); return s === 'native' ? L('Native notifications ready', 'Notificaciones nativas listas') : s === 'granted' ? L('Enabled on this device', 'Activadas en este dispositivo') : s === 'denied' ? L('Blocked — enable in device settings', 'Bloqueadas — actívalas en ajustes') : s === 'unsupported' ? L('Not supported in this browser', 'No compatible con este navegador') : L('Tap to enable', 'Toca para activar'); };
  const notifStatus = el('div', { class: 'muted tiny' }, notifLabel());
  const testBtn = btn(L('Enable & send test', 'Activar y probar'), { kind: 'primary', iconName: 'bell', onclick: async () => { const ok = await requestNotifyPermission(); const sent = ok && await notify('🔔 Success Academy', L('Test notification — this is how alerts reach you.', 'Notificación de prueba — así te llegan las alertas.')); notifStatus.textContent = notifLabel(); toast(sent ? L('Sent! Check your notifications.', '¡Enviada! Revisa tus notificaciones.') : L('Could not enable notifications', 'No se pudieron activar')); } });
  main.appendChild(el('div', { class: 'card' },
    el('h3', { class: 'card-h' }, L('Device notifications', 'Notificaciones del dispositivo')),
    el('div', { class: 'pref-row' }, el('div', {}, el('strong', {}, L('Buzz this phone for alerts', 'Hacer sonar este teléfono')), notifStatus), testBtn)));

  main.appendChild(el('div', { class: 'card' },
    el('h3', { class: 'card-h' }, L('Your contact info', 'Tu información de contacto')),
    el('div', { class: 'pd-grid' }, info(L('Name', 'Nombre'), me.name), info(L('Email', 'Correo'), me.email), info(L('Phone', 'Teléfono'), me.phone), info(L('Role', 'Rol'), me.title || me.role))));

  main.appendChild(el('div', { class: 'save-bar' },
    btn(L('Save preferences', 'Guardar preferencias'), { kind: 'primary', iconName: 'check', onclick: async () => { await act('savePrefs', { userId: me.id, prefs: p }); if (p.language !== S.lang) C.setLang(p.language); toast(L('Preferences saved', 'Preferencias guardadas')); } })));
}
