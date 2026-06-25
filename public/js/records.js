/* ============================================================================
 * records.js — Payments / Fees + Attendance (events & rules)
 * ==========================================================================*/
import * as C from './core.js';
import { S, el, icon, avatar, userById, studentById, groupById, actor, act, childrenOf, money, dateLabel, fullDate, timeAgo, badge, pageHead, btn, modal, toast, emptyState, L } from './core.js';

// ===========================================================================
// PAYMENTS
// ===========================================================================
function feeRow(fee) {
  const s = studentById(fee.studentId);
  const paid = fee.status === 'paid';
  const overdue = !paid && new Date(fee.dueDate) < new Date();
  return el('div', { class: 'fee' + (paid ? ' paid' : '') },
    el('div', { class: 'fee-main' },
      el('div', {}, el('strong', {}, fee.label), el('div', { class: 'muted tiny' }, `${s?.name || ''} · ${paid ? L('Paid', 'Pagado') + ' ' + dateLabel(fee.paidAt) : L('Due', 'Vence') + ' ' + dateLabel(fee.dueDate)}`)),
      overdue ? badge(L('Overdue', 'Vencido'), 'warn') : null),
    el('div', { class: 'fee-right' },
      el('span', { class: 'fee-amt' }, money(fee.amount)),
      paid ? el('span', { class: 'status done', html: icon('check', 14) }) : btn(L('Pay', 'Pagar'), { small: true, kind: 'primary', onclick: () => payNow(fee) })));
}

function payNow(fee) {
  const s = studentById(fee.studentId);
  const m = modal({
    title: L('Pay Fee', 'Pagar cuota'), subtitle: `${fee.label} · ${s?.name}`,
    body: el('div', { class: 'pay-box' },
      el('div', { class: 'pay-amt' }, money(fee.amount)),
      el('div', { class: 'card-mock' },
        el('div', { class: 'cm-row' }, el('span', { html: icon('card', 18) }), el('span', {}, '•••• •••• •••• 4242')),
        el('div', { class: 'cm-row muted tiny' }, el('span', {}, 'Exp 09/28'), el('span', {}, 'CVC •••'))),
      el('p', { class: 'muted tiny' }, L('Demo payment — no real charge. Powered by a mock Stripe integration.', 'Pago de demostración — sin cargo real.'))),
    actions: [
      btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(`${L('Pay', 'Pagar')} ${money(fee.amount)}`, { kind: 'primary', iconName: 'dollar', onclick: async () => { await act('payFee', { feeId: fee.id }); m.close(); toast(L('Payment successful ✓', 'Pago exitoso ✓')); } }),
    ],
  });
}

export function renderPayments(main) {
  const me = actor();
  if (me.role === 'admin') {
    const fees = S.db.fees;
    const out = fees.filter((f) => f.status !== 'paid').reduce((n, f) => n + f.amount, 0);
    const col = fees.filter((f) => f.status === 'paid').reduce((n, f) => n + f.amount, 0);
    main.appendChild(pageHead(L('Payments', 'Pagos'), L('Fee collection across the school', 'Cobro de cuotas en la escuela')));
    main.appendChild(el('div', { class: 'stat-row' },
      stat(money(col), L('Collected', 'Cobrado'), 'success'),
      stat(money(out), L('Outstanding', 'Pendiente'), 'warn'),
      stat(String(fees.filter((f) => f.status !== 'paid').length), L('Unpaid items', 'Cuotas sin pagar'))));
    main.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('All fees', 'Todas las cuotas')), el('div', { class: 'fee-list' }, ...fees.map(feeRow))));
    return;
  }

  const kidIds = childrenOf(me.id).map((k) => k.id);
  const fees = S.db.fees.filter((f) => kidIds.includes(f.studentId));
  const unpaid = fees.filter((f) => f.status !== 'paid');
  const paidList = fees.filter((f) => f.status === 'paid');
  const total = unpaid.reduce((n, f) => n + f.amount, 0);

  main.appendChild(pageHead(L('Payments', 'Pagos'), L('School fees for your family', 'Cuotas escolares de tu familia')));
  main.appendChild(el('div', { class: 'card balance' },
    el('div', {}, el('p', { class: 'muted' }, L('Total due', 'Total a pagar')), el('div', { class: 'big-amt' }, money(total))),
    unpaid.length ? btn(`${L('Pay all', 'Pagar todo')} (${money(total)})`, { kind: 'primary', iconName: 'dollar', onclick: () => payAll(unpaid) }) : el('span', { class: 'status done', html: icon('check', 16) + ' ' + L('All paid', 'Todo pagado') })));

  if (unpaid.length) main.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('Outstanding', 'Pendiente')), el('div', { class: 'fee-list' }, ...unpaid.map(feeRow))));
  if (paidList.length) main.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('Payment history', 'Historial de pagos')), el('div', { class: 'fee-list' }, ...paidList.map(feeRow))));
}

function payAll(fees) {
  const total = fees.reduce((n, f) => n + f.amount, 0);
  const m = modal({
    title: L('Pay All Fees', 'Pagar todas las cuotas'), subtitle: `${fees.length} ${L('items', 'cuotas')}`,
    body: el('div', { class: 'pay-box' }, el('div', { class: 'pay-amt' }, money(total)),
      el('div', { class: 'card-mock' }, el('div', { class: 'cm-row' }, el('span', { html: icon('card', 18) }), el('span', {}, '•••• •••• •••• 4242'))),
      el('p', { class: 'muted tiny' }, L('Demo payment — no real charge.', 'Pago de demostración — sin cargo real.'))),
    actions: [btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(`${L('Pay', 'Pagar')} ${money(total)}`, { kind: 'primary', iconName: 'dollar', onclick: async () => { for (const f of fees) await act('payFee', { feeId: f.id }); m.close(); toast(L('All fees paid ✓', 'Todas las cuotas pagadas ✓')); } })],
  });
}

function stat(value, label, kind = '') { return el('div', { class: `stat ${kind}` }, el('div', { class: 'stat-val' }, value), el('div', { class: 'stat-lbl' }, label)); }

// ===========================================================================
// ATTENDANCE
// ===========================================================================
const ATT_META = { absent: ['Absent', 'Ausente', 'warn'], tardy: ['Tardy', 'Tarde', 'cat'], truancy: ['Truancy', 'Ausentismo', 'warn'] };

function attEventRow(ev, showStudent = true) {
  const s = studentById(ev.studentId);
  const [en, es, kind] = ATT_META[ev.type] || [ev.type, ev.type, ''];
  return el('div', { class: 'att-row' },
    el('div', {}, showStudent ? el('strong', {}, s?.name || '—') : null, el('span', { class: 'muted tiny' }, (showStudent ? ' · ' : '') + fullDate(ev.date))),
    el('div', { class: 'att-right' },
      ev.excused ? badge(L('Excused', 'Justificado'), 'cat') : null,
      badge(L(en, es), kind),
      ev.notified ? el('span', { class: 'muted tiny', title: 'Guardians notified' }, '🔔') : null));
}

function ruleRow(r, editable) {
  return el('div', { class: 'rule' },
    el('div', {}, el('strong', {}, r.name), el('div', { class: 'muted tiny' }, r.trigger),
      el('div', { class: 'chips', style: { marginTop: '4px' } }, ...r.channels.map((c) => el('span', { class: 'chip' }, c)))),
    editable
      ? el('button', { class: 'switch' + (r.active ? ' on' : ''), onclick: () => act('toggleRule', { ruleId: r.id }) }, el('span', { class: 'knob' }))
      : badge(r.active ? L('Active', 'Activa') : L('Off', 'Inactiva'), r.active ? 'success' : ''));
}

export function renderAttendance(main) {
  const me = actor();
  const isStaff = me.role !== 'parent';
  main.appendChild(pageHead(L('Attendance', 'Asistencia'), isStaff ? L('Automated notification rules & recent activity', 'Reglas automáticas y actividad reciente') : L('Your scholars’ attendance & alerts', 'Asistencia y alertas de tus estudiantes')));

  if (!isStaff) {
    const kids = childrenOf(me.id);
    kids.forEach((kid) => {
      const evs = S.db.attendanceEvents.filter((e) => e.studentId === kid.id);
      const absences = evs.filter((e) => e.type === 'absent' || e.type === 'truancy').length;
      const tardies = evs.filter((e) => e.type === 'tardy').length;
      main.appendChild(el('div', { class: 'card' },
        el('div', { class: 'att-head' }, avatar({ name: kid.name, avatar: kid.firstName[0], color: kid.color }, 36), el('div', {}, el('strong', {}, kid.name), el('div', { class: 'muted tiny' }, `${L('Grade', 'Grado')} ${kid.grade}`)),
          el('div', { class: 'att-stats' }, el('span', {}, `${absences} ${L('absences', 'ausencias')}`), el('span', { class: 'dot' }, `${tardies} ${L('tardies', 'tardanzas')}`))),
        evs.length ? el('div', { class: 'att-list' }, ...evs.map((e) => attEventRow(e, false))) : el('p', { class: 'muted tiny pad' }, L('Perfect attendance! 🎉', '¡Asistencia perfecta! 🎉'))));
    });
    main.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('How you’ll be notified', 'Cómo se te notificará')), el('div', { class: 'rule-list' }, ...S.db.attendanceRules.map((r) => ruleRow(r, false)))));
    return;
  }

  renderAttendanceStaff(main, me);
}

function renderAttendanceStaff(main, me) {
  const editable = me.role === 'admin';
  main.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('Notification rules', 'Reglas de notificación')), el('p', { class: 'muted tiny', style: { margin: '0 0 10px' } }, L('Auto-notify guardians when thresholds are met.', 'Notificar automáticamente a los tutores.')), el('div', { class: 'rule-list' }, ...S.db.attendanceRules.map((r) => ruleRow(r, editable)))));
  const evs = S.db.attendanceEvents.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  main.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, L('Recent attendance activity', 'Actividad reciente')), el('div', { class: 'att-list' }, ...evs.map((e) => attEventRow(e, true)))));
}

// ===========================================================================
// DOCUMENTS — secure per-scholar delivery (report cards, score reports…)
// ===========================================================================
const DOC_EMOJI = { 'Report Card': '📊', 'Assessment': '📈', 'Letter': '✉️' };
const docTypeLabel = (t) => L(t, { 'Report Card': 'Boletín', 'Assessment': 'Evaluación', 'Letter': 'Carta' }[t] || t);

function docRow(doc) {
  const me = actor();
  const acked = (doc.acknowledgedBy || []).includes(me.id);
  return el('div', { class: 'fee' + (acked ? ' paid' : '') },
    el('div', { class: 'fee-main' },
      el('span', { class: 'doc-emoji' }, DOC_EMOJI[doc.type] || '📄'),
      el('div', {}, el('strong', {}, doc.title),
        el('div', { class: 'muted tiny' }, `${docTypeLabel(doc.type)} · ${userById(doc.issuedBy)?.name || 'Success Academy'} · ${dateLabel(doc.date)}`))),
    el('div', { class: 'fee-right' },
      acked ? el('span', { class: 'status done', html: icon('check', 14) + ' ' + L('Acknowledged', 'Confirmado') }) : badge(L('New', 'Nuevo'), 'warn'),
      btn(L('Open', 'Abrir'), { small: true, kind: acked ? 'ghost' : 'primary', onclick: () => openDocument(doc) })));
}

function openDocument(doc) {
  const me = actor();
  const s = studentById(doc.studentId);
  const acked = (doc.acknowledgedBy || []).includes(me.id);
  const m = modal({
    title: doc.title, subtitle: `${s?.name} · ${doc.type} · ${fullDate(doc.date)}`, wide: true,
    body: el('div', {},
      el('div', { class: 'doc-sheet' },
        el('div', { class: 'doc-sheet-head' },
          el('div', { class: 'doc-mark' }, 'SA'),
          el('div', {}, el('strong', {}, 'Success Academy Charter Schools'), el('div', { class: 'muted tiny' }, 'Harlem 1 · Confidential — for the family of ' + (s?.name || '')))),
        el('h4', { class: 'doc-sheet-title' }, doc.title),
        el('p', { class: 'doc-sheet-body' }, doc.summary),
        el('div', { class: 'doc-sheet-foot muted tiny' }, '🔒 ' + L('Secure document delivered to verified guardians only.', 'Documento seguro entregado solo a tutores verificados.'))),
      acked ? el('p', { class: 'muted tiny', style: { marginTop: '10px' } }, '✓ ' + L('You acknowledged receipt.', 'Usted confirmó la recepción.')) : null),
    actions: acked
      ? [btn(L('Close', 'Cerrar'), { kind: 'ghost', onclick: () => m.close() })]
      : [btn(L('Close', 'Cerrar'), { kind: 'ghost', onclick: () => m.close() }),
         btn(L('Acknowledge receipt', 'Confirmar recepción'), { kind: 'primary', iconName: 'check', onclick: async () => { await act('ackDocument', { docId: doc.id, userId: me.id }); m.close(); toast(L('Receipt acknowledged — thank you', 'Recepción confirmada — gracias')); } })],
  });
}

export function renderDocuments(main) {
  const me = actor();
  if (me.role === 'parent') {
    const kids = childrenOf(me.id);
    main.appendChild(pageHead(L('Documents', 'Documentos'), L('Report cards & secure documents for your scholars', 'Boletines y documentos seguros de tus estudiantes')));
    let any = false;
    kids.forEach((kid) => {
      const docs = (S.db.documents || []).filter((d) => d.studentId === kid.id).sort((a, b) => new Date(b.date) - new Date(a.date));
      if (!docs.length) return; any = true;
      main.appendChild(el('div', { class: 'card' },
        el('div', { class: 'att-head' }, avatar({ name: kid.name, avatar: kid.firstName[0], color: kid.color }, 36), el('div', {}, el('strong', {}, kid.name), el('div', { class: 'muted tiny' }, `${L('Grade', 'Grado')} ${kid.grade}`))),
        el('div', { class: 'fee-list' }, ...docs.map(docRow))));
    });
    if (!any) main.appendChild(emptyState(L('No documents yet', 'No hay documentos')));
    return;
  }
  // staff / admin — registry
  const docs = (S.db.documents || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  main.appendChild(pageHead(L('Documents', 'Documentos'), L('Secure documents delivered to families', 'Documentos seguros entregados a las familias')));
  main.appendChild(el('div', { class: 'card' }, el('h3', { class: 'card-h' }, `${docs.length} ${L('documents', 'documentos')}`),
    el('div', { class: 'fee-list' }, ...docs.map((d) => {
      const s = studentById(d.studentId);
      const acks = (d.acknowledgedBy || []).length;
      return el('div', { class: 'fee' }, el('div', { class: 'fee-main' }, el('span', { class: 'doc-emoji' }, DOC_EMOJI[d.type] || '📄'),
        el('div', {}, el('strong', {}, d.title), el('div', { class: 'muted tiny' }, `${s?.name || ''} · ${docTypeLabel(d.type)} · ${dateLabel(d.date)}`))),
        el('div', { class: 'fee-right' }, acks ? badge(L('Acknowledged', 'Confirmado'), 'success') : badge(L('Awaiting', 'Pendiente'), 'warn')));
    }))));
}
