/* ============================================================================
 * admin.js — Dashboard analytics, Alerts (send + history), Moderation queue
 * ==========================================================================*/
import * as C from './core.js';
import { S, el, icon, avatar, userById, studentById, schoolById, groupById, actor, act, timeAgo, dateLabel, fullDate, badge, channelChips, pageHead, btn, modal, toast, emptyState, L, tx, audiencesFor, smartLists, audienceCount, downloadCSV, engagementOf, childrenOf } from './core.js';
import { notify, requestNotifyPermission } from './notify.js';

const parents = () => S.db.users.filter((u) => u.role === 'parent');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// ===========================================================================
// DASHBOARD
// ===========================================================================
function statCard(value, label, sub, kind) {
  return el('div', { class: `card stat-card ${kind || ''}` },
    el('div', { class: 'sc-val' }, value), el('div', { class: 'sc-lbl' }, label), sub ? el('div', { class: 'muted tiny' }, sub) : null);
}
function bar(label, value, total, color) {
  return el('div', { class: 'bar-row' },
    el('div', { class: 'bar-top' }, el('span', {}, label), el('span', { class: 'muted' }, `${value} (${pct(value, total)}%)`)),
    el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: { width: pct(value, total) + '%', background: color } })));
}

export function renderDashboard(main) {
  main.appendChild(pageHead(L('Dashboard', 'Panel'), `${S.db.district.name} · ${fullDate(new Date().toISOString())}`,
    btn(L('Send Alert', 'Enviar alerta'), { kind: 'danger', iconName: 'alert', onclick: () => openSendAlert() })));
  const slot = el('div', {}, el('p', { class: 'muted pad' }, L('Loading…', 'Cargando…')));
  main.appendChild(slot);

  (async () => {
    const d = await C.dashboardData();                                   // SQL aggregates server-side (or computed on-device)
    const s = d.stats, N = s.totalFamilies;
    const pendingMod = (S.db.moderation || []).filter((m) => m.status === 'pending').length;
    C.clear(slot);

    slot.appendChild(el('div', { class: 'dash-stats' },
      statCard(s.verifiedPct + '%', L('Contact reach', 'Alcance de contacto'), `${s.verified}/${N} ${L('families verified', 'familias verificadas')}`, s.verifiedPct >= 80 ? 'good' : 'warn'),
      statCard(N.toLocaleString(), L('Families', 'Familias'), L('across the network', 'en la red')),
      statCard(String(s.postsThisWeek), L('Posts this week', 'Publicaciones esta semana'), L('all channels', 'todos los canales')),
      statCard(s.engagedPct + '%', L('Engaged families', 'Familias activas'), `${s.engaged} ${L('reacted or replied', 'reaccionaron o respondieron')}`, 'good'),
      statCard(String(pendingMod), L('Flagged for review', 'Marcados para revisión'), L('AI moderation', 'Moderación IA'), pendingMod ? 'warn' : '')));

    slot.appendChild(el('div', { class: 'dash-row' },
      el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('Channel reachability', 'Alcance por canal')),
        bar('📱 ' + L('App push', 'App'), d.channelReach.app, N, '#1f6feb'),
        bar('✉️ ' + L('Email', 'Correo'), d.channelReach.email, N, '#8957e5'),
        bar('💬 ' + L('Text (SMS)', 'Texto'), d.channelReach.sms, N, '#1a7f37'),
        el('p', { class: 'muted tiny', style: { marginTop: '8px' } }, L('Smart Alerts text first, then fail over to voice for unconfirmed families.', 'Las alertas inteligentes envían texto primero, luego voz.'))),
      el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('Recent alert delivery', 'Entrega de alertas reciente')),
        ...((S.db.alerts || []).slice(0, 2).map(alertMini)),
        btn(L('View all alerts', 'Ver todas las alertas'), { kind: 'ghost', small: true, onclick: () => C.navigate('alerts') }))));

    slot.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('Top posts by engagement', 'Publicaciones con más interacción')),
      el('div', { class: 'top-posts' }, ...d.topPosts.map((p) => el('div', { class: 'tp-row' },
        avatar(p.author, 30),
        el('div', { class: 'tp-text' }, el('strong', {}, p.title), el('div', { class: 'muted tiny' }, (p.audience?.label || '') + ' · ' + timeAgo(p.createdAt))),
        el('div', { class: 'tp-score' }, `❤️ ${p.reactions}  💬 ${p.comments}`))))));

    slot.appendChild(el('div', { class: 'card' },
      el('div', { class: 'rep-head' }, el('h3', { class: 'card-h' }, L('Engagement by school', 'Interacción por escuela')), btn(L('Full reports', 'Informes completos'), { small: true, kind: 'ghost', iconName: 'report', onclick: () => C.navigate('reports') })),
      el('div', { class: 'school-rows' }, ...d.perSchool.map((row) => el('div', { class: 'school-row' },
        el('div', { class: 'sr-name' }, el('strong', {}, schoolById(row.schoolId)?.short || row.schoolId), el('span', { class: 'muted tiny' }, `${row.families} ${L('families', 'familias')}`)),
        el('div', { class: 'sr-bars' }, bar(L('Reach', 'Alcance'), row.verified, row.families, row.verifiedPct >= 80 ? 'var(--green)' : 'var(--amber)')))))));
  })().catch((e) => { C.clear(slot); slot.appendChild(el('div', { class: 'error' }, 'Dashboard error: ' + (e && e.message))); });
}

// ===========================================================================
// SCHOOLS — one row per school (families, students, posts, alerts, reach, engagement)
// ===========================================================================
export function renderSchools(main) {
  main.appendChild(pageHead(L('Schools', 'Escuelas'), `${S.db.district.name} · ${L('every location in the network', 'cada ubicación en la red')}`));
  const slot = el('div', {}, el('p', { class: 'muted pad' }, L('Loading…', 'Cargando…')));
  main.appendChild(slot);

  (async () => {
    const rows = await C.schoolsData();
    C.clear(slot);

    const totals = rows.reduce((t, r) => ({
      families: t.families + r.families, students: t.students + r.students,
      posts: t.posts + r.posts, alerts: t.alerts + r.alerts, verified: t.verified + r.verified,
    }), { families: 0, students: 0, posts: 0, alerts: 0, verified: 0 });

    slot.appendChild(el('div', { class: 'dash-stats' },
      statCard(String(rows.length), L('Schools', 'Escuelas'), L('in the network', 'en la red')),
      statCard(totals.families.toLocaleString(), L('Families', 'Familias'), L('across all schools', 'en todas las escuelas')),
      statCard(totals.students.toLocaleString(), L('Students', 'Estudiantes'), L('across all schools', 'en todas las escuelas')),
      statCard(pct(totals.verified, totals.families) + '%', L('Network reach', 'Alcance de la red'), `${totals.verified}/${totals.families} ${L('families verified', 'familias verificadas')}`, pct(totals.verified, totals.families) >= 80 ? 'good' : 'warn')));

    slot.appendChild(el('div', { class: 'card' },
      el('h3', { class: 'card-h' }, L('By school', 'Por escuela')),
      el('div', { class: 'school-list' }, ...rows.map((r) => el('div', { class: 'school-list-row' },
        el('div', { class: 'slr-name' },
          el('span', { class: 'school-dot', style: { background: r.color || 'var(--primary)' } }),
          el('div', {}, el('strong', {}, r.name), el('span', { class: 'muted tiny' }, r.level))),
        el('div', { class: 'slr-stats' },
          el('div', { class: 'slr-stat' }, el('strong', {}, String(r.posts)), el('span', { class: 'muted tiny' }, L('posts', 'publicaciones'))),
          el('div', { class: 'slr-stat' }, el('strong', {}, String(r.alerts)), el('span', { class: 'muted tiny' }, L('alerts', 'alertas'))),
          el('div', { class: 'slr-stat' }, el('strong', {}, String(r.students)), el('span', { class: 'muted tiny' }, L('students', 'estudiantes'))),
          el('div', { class: 'slr-stat' }, el('strong', {}, String(r.families)), el('span', { class: 'muted tiny' }, L('families', 'familias'))),
          el('div', { class: 'slr-stat' }, el('strong', {}, r.engagedPct + '%'), el('span', { class: 'muted tiny' }, L('engaged', 'participación')))),
        el('div', { class: 'slr-bar' }, bar(L('Reach', 'Alcance'), r.verified, r.families, r.verifiedPct >= 80 ? 'var(--green)' : 'var(--amber)')))))));
  })().catch((e) => { C.clear(slot); slot.appendChild(el('div', { class: 'error' }, 'Schools error: ' + (e && e.message))); });
}

// ===========================================================================
// ALERTS
// ===========================================================================
function alertMini(a) {
  const d = a.delivery || {};
  return el('div', { class: `alert-mini sev-${a.severity}`, onclick: () => openAlertDetail(a) },
    el('div', { class: 'am-top' }, el('strong', {}, a.title), a.smartAlert ? badge('Smart Alert', 'cat') : null),
    el('div', { class: 'am-stats muted tiny' }, `${d.recipients || 0} ${L('sent', 'enviado')} · ${pct(d.opened, d.recipients)}% ${L('opened', 'abierto')} · ${pct(d.confirmed, d.recipients)}% ${L('confirmed', 'confirmado')}`));
}

function deliveryFunnel(a) {
  const d = a.delivery || {};
  const rows = [
    ['📨 ' + L('Recipients', 'Destinatarios'), d.recipients, '#6e7781'],
    a.channels.includes('sms') ? ['💬 ' + L('Text delivered', 'Texto entregado'), d.smsDelivered, '#1a7f37'] : null,
    a.smartAlert && a.channels.includes('sms') ? ['📞 ' + L('Voice failover', 'Respaldo de voz'), d.voiceFailover, '#bc4c00'] : null,
    a.channels.includes('email') ? ['✉️ ' + L('Email sent', 'Correo enviado'), d.email, '#8957e5'] : null,
    ['👁️ ' + L('Opened', 'Abierto'), d.opened, '#1f6feb'],
    ['✅ ' + L('Confirmed receipt', 'Recibo confirmado'), d.confirmed, '#1a7f37'],
  ].filter(Boolean);
  return el('div', {}, ...rows.map(([lbl, v, c]) => bar(lbl, v || 0, d.recipients || 1, c)));
}

function openAlertDetail(a) {
  const body = tx(a, 'body');
  modal({ title: a.title, subtitle: `${L('Sent', 'Enviado')} ${timeAgo(a.createdAt)} · ${userById(a.authorId)?.name}`, wide: true,
    body: el('div', {},
      el('div', { class: `sev-tag sev-${a.severity}` }, a.severity.toUpperCase()),
      el('p', { class: 'alert-detail-body' }, body.text),
      el('div', { class: 'chk-row', style: { margin: '6px 0 14px' } }, channelChips(a.channels), a.smartAlert ? badge('⚡ Smart Alert', 'cat') : null),
      el('h4', { class: 'card-h' }, L('Delivery report', 'Informe de entrega')), deliveryFunnel(a)),
    actions: [] });
}

export function renderAlerts(main) {
  const me = actor();
  main.appendChild(pageHead(L('Alerts', 'Alertas'), me.role === 'admin' ? L('Urgent mass notifications & delivery reports', 'Notificaciones urgentes e informes de entrega') : L('Important notifications from your school', 'Notificaciones importantes de tu escuela'),
    me.role === 'admin' ? btn(L('Send Alert', 'Enviar alerta'), { kind: 'danger', iconName: 'alert', onclick: () => openSendAlert() }) : null));
  const slot = el('div', { class: 'stack' }, el('p', { class: 'muted pad' }, L('Loading…', 'Cargando…')));
  main.appendChild(slot);

  (async () => {
    const { items: alerts } = await C.alertList({ me: me.id });          // scoped to me, newest-first, author embedded
    C.clear(slot);
    if (!alerts.length) { slot.appendChild(emptyState(L('No alerts', 'No hay alertas'))); return; }
    alerts.forEach((a) => {
      const body = tx(a, 'body');
      const d = a.delivery || {};
      slot.appendChild(el('article', { class: `card alert-card sev-${a.severity}`, onclick: me.role === 'admin' ? () => openAlertDetail(a) : null },
        el('div', { class: 'ac-head' },
          el('span', { class: 'ac-icon', html: icon('alert', 20) }),
          el('div', {}, el('div', { class: 'ac-title' }, el('strong', {}, a.title), badge(a.severity, a.severity === 'info' ? 'cat' : 'warn'), a.smartAlert ? badge('⚡ Smart', 'cat') : null),
            el('div', { class: 'muted tiny' }, `${a.author?.name || ''} · ${timeAgo(a.createdAt)} · → ${a.audience?.label || ''}`)),
          channelChips(a.channels)),
        el('p', { class: 'ac-body' }, body.text),
        me.role === 'admin' ? el('div', { class: 'am-stats muted tiny', style: { marginTop: '6px' } }, `${d.recipients || 0} ${L('sent', 'enviado')} · ${pct(d.opened, d.recipients)}% ${L('opened', 'abierto')} · ${pct(d.confirmed, d.recipients)}% ${L('confirmed', 'confirmado')} · ${L('tap for report', 'toca para ver informe')}`) : null));
    });
  })().catch((e) => { C.clear(slot); slot.appendChild(el('div', { class: 'error' }, 'Alerts error: ' + (e && e.message))); });
}

export function openSendAlert() {
  const me = actor();
  const groups = S.db.groups.filter((g) => me.role === 'admin' || g.leadIds.includes(me.id)).map((g) => ({ type: g.type, id: g.id, label: g.name, schoolId: g.schoolId }));
  const smarts = smartLists().map((s) => ({ type: 'smart', id: s.id, label: s.label, icon: s.icon, count: s.count }));
  const auds = [...groups, ...smarts];
  let f = { audience: groups.find((a) => a.type === 'school') || groups[0] || auds[0], title: '', body: '', severity: 'urgent', channels: ['sms', 'app', 'email'], smartAlert: true, scheduledFor: '' };

  const countLabel = el('div', { class: 'aud-count muted tiny' });
  const updCount = () => { countLabel.textContent = `→ ${audienceCount(f.audience).toLocaleString()} ${L('families match', 'familias coinciden')}`; };
  const audSel = el('select', { class: 'inp', onchange: (e) => { f.audience = auds[e.target.selectedIndex]; updCount(); } },
    el('optgroup', { label: L('Groups', 'Grupos') }, ...groups.map((a) => el('option', { selected: a === f.audience }, a.label))),
    el('optgroup', { label: L('Smart Lists (rule-based)', 'Listas inteligentes (por reglas)') }, ...smarts.map((a) => el('option', {}, `${a.icon} ${a.label} (${a.count})`))));

  const sevSeg = el('div', { class: 'seg' }, ...[['info', L('Info', 'Información')], ['urgent', L('Urgent', 'Urgente')], ['emergency', L('Emergency', 'Emergencia')]].map(([v, lbl]) => {
    const b = el('button', { class: 'seg-opt sev-opt sev-' + v + (f.severity === v ? ' on' : ''), onclick: () => { f.severity = v; sevSeg.querySelectorAll('.seg-opt').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, lbl);
    return b;
  }));
  const channelRow = el('div', { class: 'chk-row' }, ...[['sms', 'Text'], ['app', 'App'], ['email', 'Email'], ['voice', 'Voice']].map(([c, lbl]) => {
    const b = el('button', { class: 'toggle-chip' + (f.channels.includes(c) ? ' on' : ''), onclick: () => { f.channels = f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c]; b.classList.toggle('on'); } }, lbl);
    return b;
  }));
  const smartBtn = el('button', { class: 'switch' + (f.smartAlert ? ' on' : ''), onclick: (e) => { f.smartAlert = !f.smartAlert; e.currentTarget.classList.toggle('on'); } }, el('span', { class: 'knob' }));

  const bodyInp = el('textarea', { class: 'inp', rows: 4, placeholder: L('What families need to know… tip: {{scholar_first}} personalizes it', 'Lo que las familias deben saber…'), oninput: (e) => (f.body = e.target.value) });
  const insertTok = (tok) => { const t = bodyInp, s = t.selectionStart ?? t.value.length, e2 = t.selectionEnd ?? s; t.value = t.value.slice(0, s) + tok + t.value.slice(e2); f.body = t.value; t.focus(); t.selectionStart = t.selectionEnd = s + tok.length; };
  const mergeRow = el('div', { class: 'chk-row merge-row' }, el('span', { class: 'muted tiny' }, L('Personalize:', 'Personalizar:')), ...[['{{scholar_first}}', L('Scholar', 'Estudiante')], ['{{family_last}}', L('Family', 'Familia')], ['{{school}}', L('School', 'Escuela')]].map(([tok, lbl]) => el('button', { class: 'toggle-chip', type: 'button', onclick: () => insertTok(tok) }, '+ ' + lbl)));
  const schedInput = el('input', { class: 'inp', type: 'datetime-local', style: { display: 'none', marginTop: '8px' }, oninput: (e) => (f.scheduledFor = e.target.value ? new Date(e.target.value).toISOString() : '') });
  const schedBtn = el('button', { class: 'switch', type: 'button', onclick: (e) => { const on = schedInput.style.display === 'none'; schedInput.style.display = on ? 'block' : 'none'; e.currentTarget.classList.toggle('on', on); if (!on) f.scheduledFor = ''; } }, el('span', { class: 'knob' }));

  const m = modal({
    title: L('Send Alert', 'Enviar alerta'), subtitle: L('Target precisely, personalize, and schedule — all at once', 'Segmenta, personaliza y programa — todo a la vez'), wide: true,
    body: el('div', { class: 'form-grid' },
      ff(L('Severity', 'Gravedad'), sevSeg),
      ff(L('Audience', 'Audiencia'), el('div', {}, audSel, countLabel)),
      ff(L('Title', 'Título'), el('input', { class: 'inp', placeholder: L('e.g. Early dismissal today', 'p. ej. Salida temprana hoy'), oninput: (e) => (f.title = e.target.value) })),
      ff(L('Message', 'Mensaje'), el('div', {}, bodyInp, mergeRow)),
      ff(L('Send via', 'Enviar por'), channelRow),
      el('div', { class: 'pref-row' }, el('div', {}, el('strong', {}, '⚡ Smart Alert'), el('div', { class: 'muted tiny' }, L('Text first; auto-call families who don’t confirm', 'Texto primero; llamar a quienes no confirmen'))), smartBtn),
      el('div', { class: 'pref-row' }, el('div', {}, el('strong', {}, '🕒 ' + L('Schedule for later', 'Programar para después')), el('div', { class: 'muted tiny' }, L('Personalized AND scheduled — PS makes you pick one', 'Personalizado Y programado'))), schedBtn),
      schedInput),
    actions: [
      btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Send now', 'Enviar ahora'), { kind: 'danger', iconName: 'send', onclick: async () => {
        if (!f.title.trim()) return toast(L('Add a title', 'Agrega un título'));
        if (!f.channels.length) return toast(L('Pick at least one channel', 'Elige un canal'));
        const recipients = audienceCount(f.audience);
        await act('sendAlert', { authorId: me.id, audience: f.audience, title: f.title, body: f.body, severity: f.severity, channels: f.channels, smartAlert: f.smartAlert, recipients, scheduledFor: f.scheduledFor });
        m.close(); C.navigate('alerts');
        if (f.scheduledFor) return toast(L('Alert scheduled ⏰', 'Alerta programada ⏰'));
        const buzzed = (await requestNotifyPermission()) && await notify((f.severity === 'emergency' ? '🚨 ' : '🔔 ') + f.title, f.body);
        toast(buzzed ? L('Alert sent — your device buzzed ⚡', 'Alerta enviada — tu dispositivo sonó ⚡') : L(`Alert sent to ${recipients.toLocaleString()} families ⚡`, 'Alerta enviada ⚡'));
      } }),
    ],
  });
  updCount();
}
const ff = (label, control) => el('label', { class: 'field' }, el('span', { class: 'fl' }, label), control);

// ===========================================================================
// MODERATION
// ===========================================================================
function modCard(m) {
  const u = userById(m.authorId);
  const resolved = m.status !== 'pending';
  return el('article', { class: 'card mod-card ' + m.status },
    el('div', { class: 'mod-head' },
      el('span', { class: 'mod-flag' }, '⚠️ ' + m.flag),
      el('span', { class: 'mod-conf muted tiny' }, `${Math.round(m.confidence * 100)}% ${L('confidence', 'confianza')}`)),
    el('div', { class: 'mod-context muted tiny' }, m.conversationContext + ' · ' + timeAgo(m.createdAt)),
    el('blockquote', { class: 'mod-body' }, el('div', { class: 'mq-author' }, avatar(u, 24), el('strong', {}, u?.name || '—')), el('p', {}, '“' + m.body + '”')),
    resolved
      ? el('div', { class: 'mod-resolved' }, m.status === 'approved' ? '✅ ' + L('Approved & delivered', 'Aprobado y enviado') : '🚫 ' + L('Blocked', 'Bloqueado'))
      : el('div', { class: 'mod-actions' },
        btn(L('Approve', 'Aprobar'), { kind: 'success', iconName: 'check', small: true, onclick: () => act('moderate', { modId: m.id, action: 'approved' }) }),
        btn(L('Block', 'Bloquear'), { kind: 'danger', iconName: 'x', small: true, onclick: () => act('moderate', { modId: m.id, action: 'blocked' }) })));
}

export function renderModeration(main) {
  const pending = S.db.moderation.filter((m) => m.status === 'pending');
  const resolved = S.db.moderation.filter((m) => m.status !== 'pending');
  main.appendChild(pageHead(L('Moderation', 'Moderación'), L('AI flags potentially inappropriate messages before they reach families', 'La IA marca mensajes inapropiados antes de llegar a las familias')));
  main.appendChild(el('div', { class: 'mod-banner' }, el('span', { html: icon('shield', 20) }), el('span', {}, L('Real-time AI moderation is ON. Flagged content is held pending review.', 'La moderación con IA está activada.'))));
  main.appendChild(el('h3', { class: 'sec-h' }, `${L('Pending review', 'Pendiente')} (${pending.length})`));
  main.appendChild(pending.length ? el('div', { class: 'stack' }, ...pending.map(modCard)) : emptyState(L('All clear — nothing pending 🎉', 'Todo en orden 🎉')));
  if (resolved.length) { main.appendChild(el('h3', { class: 'sec-h' }, L('Recently resolved', 'Resuelto recientemente'))); main.appendChild(el('div', { class: 'stack' }, ...resolved.map(modCard))); }
}

// ===========================================================================
// AUTOMATIONS — rule-based outreach (fixes "no automated/rule-based outreach")
// ===========================================================================
export function renderAutomations(main) {
  main.appendChild(pageHead(L('Automations', 'Automatizaciones'), L('Rule-based outreach that runs itself — no spreadsheets, no uploads', 'Comunicación automática basada en reglas')));
  main.appendChild(el('div', { class: 'mod-banner' }, el('span', { html: icon('bell', 20) }), el('span', {}, L('Build dynamic lists from any criteria (e.g. “families at high risk of leaving”) and let messages send themselves.', 'Crea listas dinámicas con cualquier criterio y deja que los mensajes se envíen solos.'))));
  main.appendChild(el('div', { class: 'stack' }, ...(S.db.automations || []).map((a) => el('article', { class: 'card auto-card' + (a.active ? '' : ' off') },
    el('div', { class: 'auto-head' },
      el('div', {}, el('h3', {}, a.name), el('div', { class: 'muted tiny' }, (a.type === 'series' ? `${a.steps}-message series` : L('Triggered', 'Activado')) + ' · → ' + a.audienceDesc)),
      el('button', { class: 'switch' + (a.active ? ' on' : ''), onclick: () => act('toggleAutomation', { autoId: a.id }) }, el('span', { class: 'knob' }))),
    el('div', { class: 'auto-trigger' }, el('span', { class: 'auto-when' }, L('WHEN', 'CUANDO')), el('span', {}, a.trigger)),
    el('div', { class: 'auto-foot' }, channelChips(a.channels),
      el('span', { class: 'muted tiny' }, a.active ? `${(a.reached || 0).toLocaleString()} ${L('reached', 'alcanzadas')} · ${L('last run', 'última vez')} ${a.lastRun ? timeAgo(a.lastRun) : '—'}` : L('Paused', 'Pausada')))))));
}

// ===========================================================================
// INTEGRATIONS — eSD, Salesforce, SSO… (fixes "no Salesforce" + "separate login")
// ===========================================================================
export function renderIntegrations(main) {
  main.appendChild(pageHead(L('Integrations', 'Integraciones'), L('Family Connect plugs into the systems SA already runs', 'Se conecta con los sistemas que SA ya usa')));
  main.appendChild(el('div', { class: 'stack' }, ...(S.db.integrations || []).map((i) => el('article', { class: 'card int-card' },
    el('div', { class: 'int-head' },
      el('span', { class: 'int-dot' }),
      el('div', { class: 'int-title' }, el('h3', {}, i.name), el('div', { class: 'muted tiny' }, i.kind + ' · ' + i.direction)),
      badge(L('Connected', 'Conectado'), 'success')),
    el('p', { class: 'su-desc' }, i.detail),
    el('div', { class: 'int-foot' }, el('span', { class: 'muted tiny' }, `${L('Last sync', 'Última sincronización')} ${i.lastSync ? timeAgo(i.lastSync) : '—'}`),
      btn(L('Sync now', 'Sincronizar'), { small: true, kind: 'ghost', onclick: () => { act('syncIntegration', { intId: i.id }); toast(L('Synced ✓', 'Sincronizado ✓')); } }))))));
}

// ===========================================================================
// REPORTS — flexible reporting + one-click CSV export (fixes "data out is limited")
// ===========================================================================
function perSchoolStats() {
  return S.db.schools.map((s) => {
    const fams = S.db.users.filter((u) => u.role === 'parent' && u.schoolId === s.id);
    const verified = fams.filter((u) => u.verified).length;
    const engaged = fams.filter((u) => engagementOf(u.id).score > 0).length;
    return { school: s.short, families: fams.length, verified, engaged, reachPct: fams.length ? Math.round((verified / fams.length) * 100) : 0, engagedPct: fams.length ? Math.round((engaged / fams.length) * 100) : 0 };
  });
}
function exportRows(kind) {
  const u = (id) => userById(id); const P = S.db.users.filter((x) => x.role === 'parent');
  if (kind === 'engagement') return P.map((p) => { const e = engagementOf(p.id); return { Family: p.name, Email: p.email, School: schoolById(p.schoolId)?.short || '', Scholars: childrenOf(p.id).map((k) => k.name).join('; '), Language: p.language === 'es' ? 'Spanish' : 'English', ContactVerified: p.verified ? 'Yes' : 'No', EngagementLevel: e.level, Reactions: e.reacted, Replies: e.comments, MessagesSent: e.messages, RSVPs: e.rsvps, FormsCompleted: e.forms }; });
  if (kind === 'reach') return P.map((p) => ({ Family: p.name, School: schoolById(p.schoolId)?.short || '', AppPush: (p.reachedBy || []).includes('app') ? 'Yes' : 'No', Email: (p.reachedBy || []).includes('email') ? 'Yes' : 'No', Text: (p.reachedBy || []).includes('sms') ? 'Yes' : 'No', ContactVerified: p.verified ? 'Yes' : 'No' }));
  if (kind === 'rsvps') return S.db.events.flatMap((e) => ['yes', 'maybe', 'no'].flatMap((st) => (e.rsvps?.[st] || []).map((id) => ({ Event: e.title, Date: dateLabel(e.date), Family: u(id)?.name || '', Response: st === 'yes' ? 'Going' : st === 'maybe' ? 'Maybe' : "Can't" }))));
  if (kind === 'forms') return S.db.forms.flatMap((f) => (f.responses || []).map((r) => ({ Form: f.title, Family: u(r.userId)?.name || '', Scholar: studentById(r.studentId)?.name || '', Signature: r.signature || '', SignedAt: r.signedAt })));
  if (kind === 'alerts') return S.db.alerts.map((a) => ({ Alert: a.title, Severity: a.severity, Recipients: a.delivery?.recipients || 0, Opened: a.delivery?.opened || 0, Confirmed: a.delivery?.confirmed || 0, Channels: (a.channels || []).join(' ') }));
  if (kind === 'schools') return perSchoolStats().map((s) => ({ School: s.school, Families: s.families, ContactReachPct: s.reachPct + '%', EngagedFamilies: s.engaged, EngagedPct: s.engagedPct + '%' }));
  return [];
}
function reportTile(title, desc, kind, file) {
  return el('div', { class: 'report-tile' }, el('div', {}, el('strong', {}, title), el('div', { class: 'muted tiny' }, desc)),
    btn(L('Export CSV', 'Exportar CSV'), { small: true, kind: 'ghost', iconName: 'doc', onclick: () => downloadCSV(file, exportRows(kind)) }));
}
export function renderReports(main) {
  const posts = S.db.posts; const P = S.db.users.filter((u) => u.role === 'parent');
  const reactions = posts.reduce((n, p) => n + Object.values(p.reactions || {}).flat().length, 0);
  const replies = posts.reduce((n, p) => n + (p.comments || []).length, 0);
  const flagged = (S.db.moderation || []).length;
  const engaged = P.filter((p) => engagementOf(p.id).score > 0).length;
  main.appendChild(pageHead(L('Reports', 'Informes'), L('Slice it any way — and export anything to CSV', 'Analiza como quieras — y exporta todo a CSV'),
    btn(L('Export engagement', 'Exportar interacción'), { kind: 'primary', iconName: 'chart', onclick: () => downloadCSV('family-engagement.csv', exportRows('engagement')) })));

  // family sentiment
  main.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('Family sentiment', 'Sentimiento de las familias')),
    el('div', { class: 'sentiment' },
      el('div', { class: 'sent-badge good' }, '😊 ' + L('Positive', 'Positivo')),
      el('div', { class: 'sent-stats' },
        el('div', {}, el('strong', {}, reactions.toLocaleString()), el('span', { class: 'muted tiny' }, L('positive reactions', 'reacciones positivas'))),
        el('div', {}, el('strong', {}, replies.toLocaleString()), el('span', { class: 'muted tiny' }, L('family replies', 'respuestas'))),
        el('div', {}, el('strong', {}, pct(engaged, P.length) + '%'), el('span', { class: 'muted tiny' }, L('engaged families', 'familias activas'))),
        el('div', {}, el('strong', {}, String(flagged)), el('span', { class: 'muted tiny' }, L('flagged by AI', 'marcados por IA'))))),
    el('p', { class: 'muted tiny', style: { marginTop: '10px' } }, L('Sentiment blends reactions, reply rate, and AI-flagged tone — the family-experience read PS could never give you.', 'El sentimiento combina reacciones, tasa de respuesta y tono marcado por IA.'))));

  // per-school engagement
  const rows = perSchoolStats();
  main.appendChild(el('div', { class: 'card' },
    el('div', { class: 'rep-head' }, el('h3', { class: 'card-h' }, L('Engagement by school', 'Interacción por escuela')), btn(L('Export', 'Exportar'), { small: true, kind: 'ghost', iconName: 'doc', onclick: () => downloadCSV('engagement-by-school.csv', exportRows('schools')) })),
    el('div', { class: 'school-rows' }, ...rows.map((s) => el('div', { class: 'school-row' },
      el('div', { class: 'sr-name' }, el('strong', {}, s.school), el('span', { class: 'muted tiny' }, `${s.families} ${L('families', 'familias')}`)),
      el('div', { class: 'sr-bars' },
        bar(L('Contact reach', 'Alcance'), s.verified, s.families, s.reachPct >= 80 ? 'var(--green)' : 'var(--amber)'),
        bar(L('Engaged', 'Activas'), s.engaged, s.families, '#1f6feb')))))));

  // exportable datasets
  main.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('Export any dataset', 'Exporta cualquier conjunto de datos')),
    el('div', { class: 'report-tiles' },
      reportTile(L('Family engagement', 'Interacción'), L('Per-family activity & level', 'Actividad por familia'), 'engagement', 'family-engagement.csv'),
      reportTile(L('Contact reachability', 'Alcance de contacto'), L('App / email / text per family', 'Por canal'), 'reach', 'contact-reachability.csv'),
      reportTile(L('Event RSVPs', 'Confirmaciones'), L('Who responded to each event', 'Respuestas por evento'), 'rsvps', 'event-rsvps.csv'),
      reportTile(L('Form responses', 'Respuestas de formularios'), L('Every submission + e-signature', 'Cada envío'), 'forms', 'form-responses.csv'),
      reportTile(L('Alert delivery', 'Entrega de alertas'), L('Reach / opened / confirmed', 'Alcance / abierto'), 'alerts', 'alert-delivery.csv'))));
}
