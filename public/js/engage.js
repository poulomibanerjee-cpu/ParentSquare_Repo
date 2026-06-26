/* ============================================================================
 * engage.js — Sign-Ups, Forms & Permission Slips, Calendar/Events
 * ==========================================================================*/
import * as C from './core.js';
import { S, el, icon, avatar, userById, studentById, groupById, actor, act, relevant, childrenOf, inAudience, dateLabel, fullDate, timeAgo, badge, pageHead, btn, modal, toast, emptyState, L, audiencesFor, downloadCSV } from './core.js';
const staff = () => actor().role !== 'parent';

const TYPE_META = {
  conference: ['📅', 'Conferences', 'cat-blue'], volunteer: ['🙌', 'Volunteer', 'cat-green'], item: ['🎁', 'Item Donations', 'cat-amber'],
};

// ===========================================================================
// SIGN-UPS
// ===========================================================================
function claimsOf(slot) { if (!slot.claims) slot.claims = (slot.claimedBy || []).map((u) => ({ userId: u, qty: 1 })); return slot.claims; }
function unitsUsed(su, slot) { const c = claimsOf(slot); return su.type === 'item' ? c.reduce((n, x) => n + (x.qty || 1), 0) : c.length; }
function kidsForAudience(audience, parent) { const kids = childrenOf(parent.id); if (audience?.type === 'class') { const g = groupById(audience.id); return kids.filter((k) => g?.studentIds.includes(k.id)); } return kids; }

function slotRow(su, slot) {
  const me = actor();
  const claims = claimsOf(slot);
  const isItem = su.type === 'item';
  const used = unitsUsed(su, slot);
  const full = used >= slot.capacity;
  const mine = claims.some((c) => c.userId === me.id);
  const capLabel = `${used}/${slot.capacity} ${isItem ? L('brought', 'traído') : L('filled', 'ocupado')}`;
  let right;
  if (me.role === 'parent') {
    right = mine
      ? btn(L('Signed up ✓', 'Apuntado ✓'), { small: true, kind: 'success', onclick: () => act('unclaimSlot', { signupId: su.id, slotId: slot.id, userId: me.id }) })
      : btn(full ? L('Full', 'Lleno') : L('Sign up', 'Apuntarme'), { small: true, kind: full ? 'ghost' : 'primary', onclick: full ? null : () => openClaim(su, slot) });
  } else {
    right = btn('+ ' + L('Add', 'Agregar'), { small: true, kind: 'ghost', onclick: () => openAddSomeone(su, slot) });
  }
  // staff see who signed up (scholar / qty / note); parents don't see other families (privacy)
  const detail = (me.role !== 'parent' && claims.length)
    ? el('div', { class: 'slot-claimers' }, ...claims.map((c) => {
      const u = userById(c.userId), s = c.studentId ? studentById(c.studentId) : null;
      return el('div', { class: 'claimer' }, el('span', {}, (u?.name || '—') + (s ? ` · ${s.firstName}` : '') + (isItem && c.qty > 1 ? ` ×${c.qty}` : '') + (c.addedBy ? ` (${L('added by staff', 'agregado por personal')})` : '')), c.note ? el('span', { class: 'claimer-note' }, '“' + c.note + '”') : null);
    }))
    : null;
  return el('div', { class: 'slot' + (mine ? ' mine' : '') + (full && !mine ? ' full' : '') },
    el('div', { class: 'slot-main' }, el('span', { class: 'slot-label' }, slot.label), el('span', { class: 'slot-cap muted tiny' }, capLabel), detail),
    right);
}

function signupCard(su) {
  const author = userById(su.authorId);
  const [emoji] = TYPE_META[su.type] || ['📝'];
  const totalCap = su.slots.reduce((n, s) => n + s.capacity, 0);
  const totalClaimed = su.slots.reduce((n, s) => n + unitsUsed(su, s), 0);
  const pct = totalCap ? Math.round((totalClaimed / totalCap) * 100) : 0;
  return el('article', { class: 'card signup' },
    el('div', { class: 'su-head' },
      el('span', { class: 'su-emoji' }, emoji),
      el('div', {}, el('h3', {}, su.title),
        el('div', { class: 'ph-line2' }, el('span', { class: 'muted' }, author?.name), el('span', { class: 'muted dot' }, '→ ' + (su.audience?.label || '')),
          su.deadline ? badge(`${L('Due', 'Vence')} ${dateLabel(su.deadline)}`, 'cat') : null)),
      el('div', { class: 'su-prog' }, el('div', { class: 'ring', style: { '--p': pct } }, el('span', { class: 'ring-pct' }, `${pct}%`)))),
    su.description ? el('p', { class: 'su-desc' }, su.description) : null,
    el('div', { class: 'slots' }, ...su.slots.map((s) => slotRow(su, s))));
}

// parent claims a slot — captures scholar (conferences), quantity (items), and an optional note
function openClaim(su, slot) {
  const me = actor();
  const kids = kidsForAudience(su.audience, me);
  const isItem = su.type === 'item', isConf = su.type === 'conference';
  let studentId = kids[0]?.id || null, qty = 1, note = '';
  const controls = [];
  if (isConf && kids.length > 1) {
    const sel = el('select', { class: 'inp', onchange: (e) => (studentId = kids[e.target.selectedIndex].id) }, ...kids.map((k) => el('option', {}, `${k.firstName} (${L('Gr', 'Gr')} ${k.grade})`)));
    controls.push(field(L('Which scholar?', '¿Cuál estudiante?'), sel));
  }
  if (isItem) {
    const remaining = slot.capacity - unitsUsed(su, slot);
    controls.push(field(`${L('How many will you bring?', '¿Cuántos traerás?')} (${L('still needed', 'faltan')}: ${remaining})`, el('input', { class: 'inp', type: 'number', min: '1', max: String(remaining), value: '1', oninput: (e) => (qty = e.target.value) })));
  }
  controls.push(field(L('Note to the organizer (optional)', 'Nota para el organizador (opcional)'), el('textarea', { class: 'inp', rows: 2, placeholder: isConf ? L('e.g. need a Spanish interpreter', 'p. ej. necesito intérprete de español') : '', oninput: (e) => (note = e.target.value) })));
  const m = modal({
    title: L('Sign up', 'Apuntarme'), subtitle: slot.label, body: el('div', { class: 'form-grid' }, ...controls),
    actions: [btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Confirm', 'Confirmar'), { kind: 'primary', iconName: 'check', onclick: async () => {
        if (isConf && studentId && su.slots.some((s) => claimsOf(s).some((c) => c.userId === me.id && c.studentId === studentId))) return toast(L('That scholar already has a time in this sign-up', 'Ese estudiante ya tiene un horario'));
        await act('claimSlot', { signupId: su.id, slotId: slot.id, userId: me.id, studentId, qty, note });
        m.close(); toast(L('You’re signed up ✓', '¡Apuntado! ✓'));
      } })],
  });
}

// staff manually add a family who signed up offline
function openAddSomeone(su, slot) {
  const me = actor();
  const g = groupById(su.audience?.id);
  let pool = S.db.users.filter((u) => u.role === 'parent');
  if (g) pool = pool.filter((u) => g.memberIds.includes(u.id) || (su.audience?.type === 'school' && u.schoolId === g.schoolId));
  const claimed = new Set(claimsOf(slot).map((c) => c.userId));
  let picked = null;
  const results = el('div', { class: 'recip-results' });
  const render = (q) => { C.clear(results); pool.filter((u) => !claimed.has(u.id) && u.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8).forEach((u) => results.appendChild(el('button', { class: 'recip' + (picked === u.id ? ' on' : ''), onclick: () => { picked = u.id; render(q); } }, avatar(u, 28), el('div', { class: 'rc-t' }, el('strong', {}, u.name), el('span', {}, childrenOf(u.id).map((k) => k.firstName).join(', ') || L('Parent', 'Padre'))), picked === u.id ? el('span', { class: 'rc-check', html: icon('check', 16) }) : null))); };
  render('');
  const m = modal({
    title: L('Add a family', 'Agregar familia'), subtitle: slot.label,
    body: el('div', { class: 'form-grid' }, field(L('Search families who signed up offline', 'Buscar familias inscritas en persona'), el('div', {}, el('input', { class: 'inp', placeholder: L('Type a name…', 'Escribe un nombre…'), oninput: (e) => render(e.target.value) }), results))),
    actions: [btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Add', 'Agregar'), { kind: 'primary', iconName: 'check', onclick: async () => { if (!picked) return toast(L('Pick a family', 'Elige una familia')); await act('claimSlot', { signupId: su.id, slotId: slot.id, userId: picked, addedBy: me.id }); m.close(); toast(L('Family added', 'Familia agregada')); } })],
  });
}

export function renderSignups(main) {
  const list = relevant(S.db.signups);
  main.appendChild(pageHead(L('Sign-Ups', 'Inscripciones'), L('Conferences, volunteering & classroom needs', 'Conferencias, voluntariado y necesidades del salón'),
    staff() ? btn(L('New Sign-Up', 'Nueva inscripción'), { kind: 'primary', iconName: 'plus', onclick: openSignupComposer }) : null));
  if (!list.length) return main.appendChild(emptyState(L('No sign-ups right now', 'No hay inscripciones')));
  main.appendChild(el('div', { class: 'stack' }, ...list.map(signupCard)));
}

// ===========================================================================
// FORMS & PERMISSION SLIPS
// ===========================================================================
function kidsForForm(form, parent) {
  const kids = childrenOf(parent.id);
  if (form.audience.type === 'class') { const g = groupById(form.audience.id); return kids.filter((k) => g?.studentIds.includes(k.id)); }
  return kids; // school / network → all kids
}
function responseFor(form, userId, studentId) { return (form.responses || []).find((r) => r.userId === userId && (studentId ? r.studentId === studentId : true)); }

function formCard(form) {
  const me = actor();
  const author = userById(form.authorId);
  const isPerm = form.type === 'permission';
  const head = el('div', { class: 'su-head' },
    el('span', { class: 'su-emoji' }, isPerm ? '✍️' : '📋'),
    el('div', {}, el('h3', {}, form.title),
      el('div', { class: 'ph-line2' }, el('span', { class: 'muted' }, author?.name), el('span', { class: 'muted dot' }, '→ ' + (form.audience?.label || '')),
        badge(`${L('Due', 'Vence')} ${dateLabel(form.dueDate)}`, 'cat'), isPerm ? badge(L('Signature', 'Firma'), 'warn') : null)));

  if (me.role === 'parent') {
    const kids = kidsForForm(form, me);
    const rows = (isPerm ? kids : [null]).map((kid) => {
      const r = responseFor(form, me.id, kid?.id);
      const done = !!r;
      return el('div', { class: 'form-row' },
        el('span', { class: 'fr-name' }, kid ? `${kid.firstName} (${L('Gr', 'Gr')} ${kid.grade})` : form.title),
        done ? el('span', { class: 'status done', html: icon('check', 14) + ' ' + L('Completed', 'Completado') }) : el('span', { class: 'status todo' }, L('Action needed', 'Acción requerida')),
        btn(done ? L('View / Edit', 'Ver / Editar') : L('Complete', 'Completar'), { small: true, kind: done ? 'ghost' : 'primary', onclick: () => openForm(form, kid) }));
    });
    return el('article', { class: 'card form' }, head, form.description ? el('p', { class: 'su-desc' }, form.description) : null, el('div', { class: 'form-rows' }, ...rows));
  }

  // staff / admin
  const n = (form.responses || []).length;
  return el('article', { class: 'card form' }, head, form.description ? el('p', { class: 'su-desc' }, form.description) : null,
    el('div', { class: 'form-rows' },
      el('div', { class: 'form-row' },
        el('span', { class: 'fr-name' }, `${n} ${L('response(s)', 'respuesta(s)')}`),
        el('span', {}),
        btn(L('View responses', 'Ver respuestas'), { small: true, kind: 'ghost', onclick: () => viewResponses(form) }))));
}

export function renderForms(main) {
  const list = relevant(S.db.forms);
  main.appendChild(pageHead(L('Forms & Permission Slips', 'Formularios y permisos'), L('Complete and e-sign — auto-translated to your language', 'Completa y firma electrónicamente'),
    staff() ? btn(L('New Form', 'Nuevo formulario'), { kind: 'primary', iconName: 'plus', onclick: openFormComposer }) : null));
  if (!list.length) return main.appendChild(emptyState(L('No forms right now', 'No hay formularios')));
  main.appendChild(el('div', { class: 'stack' }, ...list.map(formCard)));
}

function openForm(form, kid) {
  const me = actor();
  const existing = responseFor(form, me.id, kid?.id);
  const values = { ...(existing?.values || {}) };
  let signature = existing?.signature || '';

  const controls = form.fields.map((f) => {
    let ctrl;
    if (f.type === 'textarea') ctrl = el('textarea', { class: 'inp', rows: 3, oninput: (e) => (values[f.id] = e.target.value) }, values[f.id] || '');
    else if (f.type === 'checkbox') { ctrl = el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!values[f.id], onchange: (e) => (values[f.id] = e.target.checked) }), el('span', {}, f.label)); return el('div', { class: 'field' }, ctrl); }
    else if (f.type === 'radio') ctrl = el('div', { class: 'radio-group' }, ...f.options.map((o) => el('label', { class: 'radio' }, el('input', { type: 'radio', name: f.id, checked: values[f.id] === o, onchange: () => (values[f.id] = o) }), el('span', {}, o))));
    else ctrl = el('input', { class: 'inp', value: values[f.id] || '', oninput: (e) => (values[f.id] = e.target.value) });
    return el('label', { class: 'field' }, el('span', { class: 'fl' }, f.label + (f.required ? ' *' : '')), ctrl);
  });

  const sigInp = form.requiresSignature ? el('input', { class: 'inp sig', placeholder: L('Type full name to sign', 'Escribe tu nombre para firmar'), value: signature, oninput: (e) => (signature = e.target.value) }) : null;

  const m = modal({
    title: form.title, subtitle: kid ? `${L('For', 'Para')} ${kid.name}` : form.audience.label, wide: true,
    body: el('div', { class: 'form-grid' }, ...controls,
      form.requiresSignature ? el('label', { class: 'field' }, el('span', { class: 'fl' }, '✍️ ' + L('Electronic signature', 'Firma electrónica')), sigInp, el('span', { class: 'muted tiny' }, L('By typing your name you agree this is your legal signature.', 'Al escribir tu nombre aceptas que es tu firma legal.'))) : null),
    actions: [
      btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Submit', 'Enviar'), { kind: 'primary', iconName: 'check', onclick: async () => {
        const missing = form.fields.filter((f) => f.required && !values[f.id]);
        if (missing.length) return toast(L('Complete required fields', 'Completa los campos obligatorios'));
        if (form.requiresSignature && !signature.trim()) return toast(L('Signature required', 'Firma requerida'));
        await act('submitForm', { formId: form.id, userId: me.id, studentId: kid?.id, values, signature });
        m.close(); toast(L('Submitted — thank you!', '¡Enviado, gracias!'));
      } }),
    ],
  });
}

function viewResponses(form) {
  const all = form.responses || [];
  const CAP = 50;
  const rows = all.slice(0, CAP).map((r) => {
    const u = userById(r.userId), s = studentById(r.studentId);
    return el('div', { class: 'resp' },
      el('div', { class: 'resp-h' }, avatar(u, 28), el('strong', {}, u?.name || '—'), s ? el('span', { class: 'muted' }, '· ' + s.name) : null, el('span', { class: 'muted tiny dot' }, timeAgo(r.signedAt)), r.signature ? el('span', { class: 'sig-badge' }, '✍️ ' + r.signature) : null),
      el('div', { class: 'resp-vals' }, ...form.fields.map((f) => el('div', { class: 'rv' }, el('span', { class: 'muted tiny' }, f.label), el('span', {}, String(r.values[f.id] ?? '—'))))));
  });
  if (all.length > CAP) rows.push(el('div', { class: 'list-more' }, L(`+ ${all.length - CAP} more responses`, `+ ${all.length - CAP} respuestas más`)));
  modal({ title: form.title, subtitle: `${all.length} ${L('responses', 'respuestas')}`, wide: true, body: all.length ? el('div', { class: 'resp-list' }, ...rows) : emptyState(L('No responses yet', 'Aún no hay respuestas')), actions: [] });
}

// ===========================================================================
// CALENDAR / EVENTS
// ===========================================================================
const CAT_COLOR = { Athletics: '#1a7f37', Academic: '#1f6feb', Classroom: '#8957e5', Ceremony: '#bf3989', Meeting: '#9a6700', Calendar: '#6e7781', Program: '#bc4c00' };
// event color comes from the admin-configured categories first, then legacy fallbacks
const catColor = (name) => (C.eventCategories().find((c) => c.name === name) || {}).color || CAT_COLOR[name] || '#1f6feb';

function rsvpBar(e) {
  const me = actor();
  if (me.role !== 'parent') {
    return el('div', { class: 'rsvp-staff' },
      el('span', { class: 'rsvp-counts muted tiny' }, `✅ ${e.rsvps.yes.length} ${L('going', 'asistirán')} · 🤔 ${e.rsvps.maybe.length} ${L('maybe', 'quizá')} · ✖️ ${e.rsvps.no.length} ${L('no', 'no')}${(e.attended || []).length ? ' · ✔️ ' + e.attended.length + ' ' + L('checked in', 'registrados') : ''}`),
      btn(L('RSVP roster & export', 'Lista y exportar'), { small: true, kind: 'ghost', iconName: 'people', onclick: () => openRsvpRoster(e.id) }));
  }
  const my = ['yes', 'no', 'maybe'].find((k) => e.rsvps[k].includes(me.id));
  return el('div', { class: 'rsvp-bar' }, ...[['yes', L('Going', 'Asistiré'), 'success'], ['maybe', L('Maybe', 'Quizá'), 'warn'], ['no', L("Can't", 'No puedo'), 'ghost']].map(([k, lbl]) =>
    btn(lbl, { small: true, kind: my === k ? 'primary' : 'ghost', onclick: () => act('rsvp', { eventId: e.id, userId: me.id, status: my === k ? 'none' : k }) })));
}

// staff RSVP roster — view who's coming, check them in, export the list (fixes "can't pull RSVP lists")
function openRsvpRoster(eventId) {
  const e = S.db.events.find((x) => x.id === eventId); if (!e) return;
  const attended = e.attended || [];
  const list = [...(e.rsvps.yes || []).map((id) => ({ id, status: L('Going', 'Asistirá') })), ...(e.rsvps.maybe || []).map((id) => ({ id, status: L('Maybe', 'Quizá') }))];
  const exportRoster = () => downloadCSV(`rsvp-${e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.csv`, ['yes', 'maybe', 'no'].flatMap((k) => (e.rsvps[k] || []).map((id) => ({ Family: userById(id)?.name || '', Scholars: childrenOf(id).map((s) => s.name).join('; '), Response: k === 'yes' ? 'Going' : k === 'maybe' ? 'Maybe' : "Can't", CheckedIn: (e.attended || []).includes(id) ? 'Yes' : 'No' }))));
  const body = list.length ? el('div', { class: 'roster' }, ...list.map((r) => {
    const u = userById(r.id); const here = attended.includes(r.id);
    return el('div', { class: 'roster-row' + (here ? ' here' : '') },
      el('div', { class: 'rr-name' }, avatar(u, 28), el('div', {}, el('strong', {}, u?.name || '—'), el('div', { class: 'muted tiny' }, childrenOf(r.id).map((k) => k.firstName).join(', ')))),
      el('span', { class: 'roster-status muted tiny' }, r.status),
      btn(here ? L('Checked in ✓', 'Registrado ✓') : L('Check in', 'Registrar'), { small: true, kind: here ? 'success' : 'ghost', onclick: async () => { await act('eventCheckIn', { eventId, userId: r.id }); m.close(); openRsvpRoster(eventId); } }));
  })) : emptyState(L('No RSVPs yet', 'Sin confirmaciones'));
  const m = modal({ title: e.title, subtitle: `${(e.rsvps.yes || []).length} ${L('going', 'asistirán')} · ${attended.length} ${L('checked in', 'registrados')}`, wide: true, body,
    actions: [btn(L('Export CSV', 'Exportar CSV'), { kind: 'ghost', iconName: 'doc', onclick: exportRoster }), btn(L('Done', 'Listo'), { kind: 'primary', onclick: () => m.close() })] });
}

function eventRow(e) {
  const d = new Date(e.date);
  return el('article', { class: 'card event' },
    el('div', { class: 'ev-date', style: { background: catColor(e.category) } },
      el('span', { class: 'ev-mon' }, d.toLocaleDateString(undefined, { month: 'short' })), el('span', { class: 'ev-day' }, String(d.getDate()))),
    el('div', { class: 'ev-main' },
      el('div', { class: 'ev-top' }, el('h3', {}, e.title), badge(e.category, 'cat')),
      el('p', { class: 'ev-meta muted' }, `${dateLabel(e.date)} · ${e.start}${e.end ? '–' + e.end : ''} · ${e.location}`),
      e.description ? el('p', { class: 'ev-desc' }, e.description) : null,
      rsvpBar(e)));
}

function miniMonth(events, sel) {
  const today = new Date();
  const y = today.getFullYear(), mo = today.getMonth();
  const first = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const evDays = new Set(events.filter((e) => { const d = new Date(e.date); return d.getMonth() === mo && d.getFullYear() === y; }).map((e) => new Date(e.date).getDate()));
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(el('span', { class: 'cal-cell cal-empty' }));
  for (let d = 1; d <= days; d++) {
    const cls = 'cal-cell' + (d === today.getDate() ? ' today' : '') + (evDays.has(d) ? ' has-ev' : '') + (sel === d ? ' sel' : '');
    cells.push(el('button', { class: cls, type: 'button', onclick: () => C.navigate('calendar', sel === d ? {} : { calDay: d }) }, String(d), evDays.has(d) ? el('span', { class: 'cal-dot' }) : null));
  }
  return el('div', { class: 'card mini-cal' },
    el('div', { class: 'mc-head' }, today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
    el('div', { class: 'cal-grid' }, ...['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => el('span', { class: 'cal-dow' }, d)), ...cells));
}

export function renderCalendar(main) {
  const events = relevant(S.db.events).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const today = new Date();
  const sel = S.params.calDay;
  const shown = sel ? events.filter((e) => { const d = new Date(e.date); return d.getDate() === sel && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }) : events;
  main.appendChild(pageHead(L('Calendar', 'Calendario'), L('Upcoming events — RSVP to let the school know', 'Próximos eventos — confirma tu asistencia'),
    staff() ? btn(L('New Event', 'Nuevo evento'), { kind: 'primary', iconName: 'plus', onclick: openEventComposer }) : null));
  if (!events.length) return main.appendChild(emptyState(L('No upcoming events', 'No hay eventos próximos')));
  if (sel) main.appendChild(el('div', { class: 'child-filter' }, el('span', { class: 'muted tiny' }, `${L('Showing', 'Mostrando')} ${today.toLocaleString(undefined, { month: 'short' })} ${sel}`), btn(L('Show all', 'Ver todos'), { small: true, kind: 'ghost', onclick: () => C.navigate('calendar', {}) })));
  main.appendChild(el('div', { class: 'cal-layout' },
    el('div', { class: 'cal-events stack' }, ...(shown.length ? shown.map(eventRow) : [emptyState(L('No events on this day', 'Sin eventos este día'))])),
    el('div', { class: 'cal-side' }, miniMonth(events, sel), keyDatesCard())));
}

// upcoming key dates from the admin calendar config (no-school days, term boundaries, etc.)
function keyDatesCard() {
  const today = new Date().toISOString().slice(0, 10);
  const dates = C.calendarConfig().keyDates.filter((d) => d.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 5);
  if (!dates.length) return null;
  return el('div', { class: 'card', style: { marginTop: '14px' } }, el('h4', { class: 'card-h' }, L('Key dates', 'Fechas clave')),
    el('div', { class: 'stack', style: { gap: '9px' } }, ...dates.map((d) => el('div', {}, el('strong', { style: { fontSize: '13px' } }, d.label), el('div', { class: 'muted tiny' }, fullDate(d.date))))));
}

// ===========================================================================
// STAFF CREATION FLOWS — make events / set up meetings / build forms
// ===========================================================================
function field(label, control) { return el('label', { class: 'field' }, el('span', { class: 'fl' }, label), control); }
function audienceSelect(me, onpick) {
  const auds = audiencesFor(me);
  const sel = el('select', { class: 'inp', onchange: (e) => onpick(auds[e.target.selectedIndex]) }, ...auds.map((a) => el('option', {}, a.label)));
  return { sel, first: auds[0] };
}
function parseTime(s) { const m = /^\s*(\d{1,2}):(\d{2})\s*(am|pm)?\s*$/i.exec(s || ''); if (!m) return null; let h = +m[1]; const ap = (m[3] || '').toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; return h * 60 + +m[2]; }
function fmtTime(min) { const h = Math.floor(min / 60), mm = min % 60, ap = h >= 12 ? 'PM' : 'AM', hh = h % 12 || 12; return `${hh}:${String(mm).padStart(2, '0')} ${ap}`; }

function slotEditor() {
  const rows = [], list = el('div', { class: 'editor-rows' });
  function addRow(label = '', cap = 1) {
    const row = { label, capacity: cap }; rows.push(row);
    const li = el('input', { class: 'inp', placeholder: L('Label (e.g. Wed 3:30 PM)', 'Etiqueta'), value: label, oninput: (e) => (row.label = e.target.value) });
    const ci = el('input', { class: 'inp cap', type: 'number', min: '1', value: cap, oninput: (e) => (row.capacity = e.target.value) });
    const rowEl = el('div', { class: 'editor-row' }, li, ci, el('button', { class: 'icon-btn', type: 'button', html: icon('x', 16), onclick: () => { rows.splice(rows.indexOf(row), 1); rowEl.remove(); } }));
    list.appendChild(rowEl);
  }
  addRow();
  return { node: el('div', {}, list, el('button', { class: 'btn ghost sm', type: 'button', onclick: () => addRow() }, '+ ' + L('Add slot', 'Agregar espacio'))), addRow, getSlots: () => rows.filter((r) => (r.label || '').trim()).map((r) => ({ label: r.label.trim(), capacity: r.capacity })) };
}

function fieldEditor() {
  const rows = [], list = el('div', { class: 'editor-rows' });
  function addRow(label = '', type = 'text') {
    const row = { label, type, required: true, options: '' }; rows.push(row);
    const li = el('input', { class: 'inp', placeholder: L('Question / field label', 'Etiqueta del campo'), value: label, oninput: (e) => (row.label = e.target.value) });
    const optInp = el('input', { class: 'inp', placeholder: L('Options, comma-separated', 'Opciones, separadas por comas'), oninput: (e) => (row.options = e.target.value) });
    const optWrap = el('div', { style: { display: 'none', marginTop: '6px' } }, optInp);
    const ty = el('select', { class: 'inp', onchange: (e) => { row.type = e.target.value; optWrap.style.display = row.type === 'radio' ? 'block' : 'none'; } }, ...[['text', L('Short text', 'Texto')], ['textarea', L('Paragraph', 'Párrafo')], ['checkbox', L('Checkbox', 'Casilla')], ['radio', L('Multiple choice', 'Opción múltiple')]].map(([v, l]) => el('option', { value: v, selected: v === type }, l)));
    const req = el('label', { class: 'chk tiny' }, el('input', { type: 'checkbox', checked: true, onchange: (e) => (row.required = e.target.checked) }), el('span', {}, L('Required', 'Obligatorio')));
    const rowEl = el('div', { class: 'editor-field' }, el('div', { class: 'editor-row' }, li, ty, el('button', { class: 'icon-btn', type: 'button', html: icon('x', 16), onclick: () => { rows.splice(rows.indexOf(row), 1); rowEl.remove(); } })), optWrap, req);
    list.appendChild(rowEl);
  }
  addRow(L('Scholar Name', 'Nombre del estudiante'));
  return { node: el('div', {}, list, el('button', { class: 'btn ghost sm', type: 'button', onclick: () => addRow() }, '+ ' + L('Add field', 'Agregar campo'))), getFields: () => rows.filter((r) => (r.label || '').trim()).map((r) => ({ label: r.label.trim(), type: r.type, required: r.required, ...(r.type === 'radio' ? { options: r.options.split(',').map((s) => s.trim()).filter(Boolean) } : {}) })) };
}

export function openSignupComposer() {
  const me = actor();
  const { sel: audSel, first } = audienceSelect(me, (a) => (f.audience = a));
  const f = { type: 'conference', title: '', description: '', deadline: '', audience: first };
  const slots = slotEditor();
  const gd = el('input', { class: 'inp', placeholder: 'Wed Jun 25' }), gs = el('input', { class: 'inp', placeholder: '3:30 PM' }), ge = el('input', { class: 'inp', placeholder: '5:00 PM' }), gi = el('input', { class: 'inp cap', type: 'number', min: '5', value: 15 });
  const gen = el('div', { class: 'gen-box' }, el('div', { class: 'muted tiny', style: { marginBottom: '6px' } }, L('Auto-generate conference time slots:', 'Generar horarios de conferencia automáticamente:')),
    el('div', { class: 'gen-row' }, gd, gs, ge, gi,
      el('button', { class: 'btn ghost sm', type: 'button', onclick: () => { const s = parseTime(gs.value), e = parseTime(ge.value), step = Math.max(5, +gi.value || 15); if (s == null || e == null || e <= s) return toast(L('Enter valid start/end times', 'Ingresa horas válidas')); for (let t = s; t + step <= e + 0.001; t += step) slots.addRow(`${gd.value ? gd.value + ' · ' : ''}${fmtTime(t)}`, 1); toast(L('Slots generated', 'Horarios generados')); } }, L('Generate', 'Generar'))));
  const typeSel = el('select', { class: 'inp', onchange: (e) => { f.type = e.target.value; gen.style.display = f.type === 'conference' ? 'block' : 'none'; } }, ...[['conference', L('Conferences / meetings', 'Conferencias / reuniones')], ['volunteer', L('Volunteer slots', 'Voluntariado')], ['item', L('Items to bring', 'Artículos para traer')]].map(([v, l]) => el('option', { value: v }, l)));
  const m = modal({
    title: L('New Sign-Up', 'Nueva inscripción'), subtitle: L('Conferences, volunteering, or items to bring', 'Conferencias, voluntariado o artículos'), wide: true,
    body: el('div', { class: 'form-grid' },
      field(L('Type', 'Tipo'), typeSel), field(L('Audience', 'Audiencia'), audSel),
      field(L('Title', 'Título'), el('input', { class: 'inp', oninput: (e) => (f.title = e.target.value) })),
      field(L('Description', 'Descripción'), el('textarea', { class: 'inp', rows: 2, oninput: (e) => (f.description = e.target.value) })),
      field(L('Sign-up deadline', 'Fecha límite'), el('input', { class: 'inp', type: 'date', oninput: (e) => (f.deadline = e.target.value ? e.target.value + 'T17:00:00' : '') })),
      el('div', {}, el('span', { class: 'fl' }, L('Slots', 'Espacios')), gen, slots.node)),
    actions: [btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Create', 'Crear'), { kind: 'primary', iconName: 'check', onclick: async () => {
        if (!f.title.trim()) return toast(L('Add a title', 'Agrega un título'));
        const sl = slots.getSlots(); if (!sl.length) return toast(L('Add at least one slot', 'Agrega al menos un espacio'));
        await act('createSignup', { authorId: me.id, audience: f.audience, type: f.type, title: f.title, description: f.description, deadline: f.deadline, slots: sl });
        m.close(); toast(L('Sign-up created', 'Inscripción creada')); C.navigate('signups');
      } })],
  });
}

export function openEventComposer() {
  const me = actor();
  const { sel: audSel, first } = audienceSelect(me, (a) => (f.audience = a));
  const cats = C.eventCategories();
  const f = { title: '', date: '', start: '', end: '', location: '', category: (cats[0] || {}).name || 'Event', description: '', audience: first };
  const catSel = el('select', { class: 'inp', onchange: (e) => (f.category = e.target.value) }, ...cats.map((c) => el('option', { selected: c.name === f.category }, c.name)));
  const m = modal({
    title: L('New Event', 'Nuevo evento'),
    body: el('div', { class: 'form-grid' },
      field(L('Title', 'Título'), el('input', { class: 'inp', oninput: (e) => (f.title = e.target.value) })),
      field(L('Audience', 'Audiencia'), audSel),
      field(L('Date', 'Fecha'), el('input', { class: 'inp', type: 'date', oninput: (e) => (f.date = e.target.value) })),
      el('div', { class: 'two-col' }, field(L('Start', 'Inicio'), el('input', { class: 'inp', placeholder: '10:00 AM', oninput: (e) => (f.start = e.target.value) })), field(L('End', 'Fin'), el('input', { class: 'inp', placeholder: '11:30 AM', oninput: (e) => (f.end = e.target.value) }))),
      field(L('Location', 'Lugar'), el('input', { class: 'inp', oninput: (e) => (f.location = e.target.value) })),
      field(L('Category', 'Categoría'), catSel),
      field(L('Description', 'Descripción'), el('textarea', { class: 'inp', rows: 2, oninput: (e) => (f.description = e.target.value) }))),
    actions: [btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Create event', 'Crear evento'), { kind: 'primary', iconName: 'check', onclick: async () => {
        if (!f.title.trim()) return toast(L('Add a title', 'Agrega un título'));
        if (!f.date) return toast(L('Pick a date', 'Elige una fecha'));
        await act('addEvent', { authorId: me.id, audience: f.audience, title: f.title, date: f.date + 'T12:00:00', start: f.start, end: f.end, location: f.location, category: f.category, description: f.description });
        m.close(); toast(L('Event added to the calendar', 'Evento agregado')); C.navigate('calendar');
      } })],
  });
}

export function openFormComposer() {
  const me = actor();
  const { sel: audSel, first } = audienceSelect(me, (a) => (f.audience = a));
  const f = { type: 'form', title: '', description: '', dueDate: '', requiresSignature: false, audience: first };
  const fields = fieldEditor();
  const typeSel = el('select', { class: 'inp', onchange: (e) => (f.type = e.target.value) }, el('option', { value: 'form' }, L('Form / survey', 'Formulario / encuesta')), el('option', { value: 'permission' }, L('Permission slip', 'Permiso')));
  const sigBtn = el('button', { class: 'switch', type: 'button', onclick: (e) => { f.requiresSignature = !f.requiresSignature; e.currentTarget.classList.toggle('on'); } }, el('span', { class: 'knob' }));
  const m = modal({
    title: L('New Form', 'Nuevo formulario'), subtitle: L('Build a form or permission slip', 'Crea un formulario o permiso'), wide: true,
    body: el('div', { class: 'form-grid' },
      field(L('Type', 'Tipo'), typeSel), field(L('Audience', 'Audiencia'), audSel),
      field(L('Title', 'Título'), el('input', { class: 'inp', oninput: (e) => (f.title = e.target.value) })),
      field(L('Description', 'Descripción'), el('textarea', { class: 'inp', rows: 2, oninput: (e) => (f.description = e.target.value) })),
      field(L('Due date', 'Fecha límite'), el('input', { class: 'inp', type: 'date', oninput: (e) => (f.dueDate = e.target.value ? e.target.value + 'T17:00:00' : '') })),
      el('div', { class: 'pref-row' }, el('div', {}, el('strong', {}, '✍️ ' + L('Require e-signature', 'Requerir firma electrónica')), el('div', { class: 'muted tiny' }, L('Families type their name to sign', 'Las familias escriben su nombre para firmar'))), sigBtn),
      el('div', {}, el('span', { class: 'fl' }, L('Fields', 'Campos')), fields.node)),
    actions: [btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Create form', 'Crear formulario'), { kind: 'primary', iconName: 'check', onclick: async () => {
        if (!f.title.trim()) return toast(L('Add a title', 'Agrega un título'));
        const ff = fields.getFields(); if (!ff.length) return toast(L('Add at least one field', 'Agrega al menos un campo'));
        await act('createForm', { authorId: me.id, audience: f.audience, type: f.type, title: f.title, description: f.description, dueDate: f.dueDate, requiresSignature: f.requiresSignature, fields: ff });
        m.close(); toast(L('Form created', 'Formulario creado')); C.navigate('forms');
      } })],
  });
}
