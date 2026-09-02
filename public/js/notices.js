/* ============================================================================
 * notices.js — Auto Notices: the SECOND notification type (see server.cjs's
 * sendAutoNotice for the shape). Unlike an Alert (one shared body, broadcast to
 * everyone as-is), an Auto Notice is ONE template but each recipient reads their
 * OWN merged body, personalized from their own scholar's data — same applyMerge
 * mechanism Posts already use for {{scholar_first}}, just surfaced here with a
 * live per-recipient preview at compose time, and its own admin/teacher-facing
 * workspace, distinct from the Alerts list.
 * ==========================================================================*/
import * as C from './core.js';
import { S, el, icon, actor, act, timeAgo, badge, pageHead, btn, modal, toast, emptyState, L, applyMerge, audiencesFor, audienceCount, resolveRecipients } from './core.js';

const ff = (label, control) => el('label', { class: 'field' }, el('span', { class: 'fl' }, label), control);

const NOTICE_TYPES = [
  ['general', L('General', 'General')],
  ['athletics', L('Athletics', 'Deportes')],
  ['enrollment', L('Enrollment / Transfer', 'Inscripción / Traslado')],
  ['attendance', L('Attendance', 'Asistencia')],
  ['academic', L('Academic (test results, grades)', 'Académico (resultados, calificaciones)')],
];
const typeLabel = (v) => (NOTICE_TYPES.find((t) => t[0] === v) || NOTICE_TYPES[0])[1];

export function renderAutoNotices(main) {
  const me = actor();
  main.appendChild(pageHead(
    L('Auto Notices', 'Avisos automáticos'),
    L('Student-specific notices — one template, personalized per scholar', 'Avisos específicos por estudiante — una plantilla, personalizada por estudiante'),
    C.canSendNotices(me) ? btn(L('New Notice', 'Nuevo aviso'), { kind: 'primary', iconName: 'clip', onclick: () => openComposeNotice() }) : null));
  const slot = el('div', { class: 'stack' }, el('p', { class: 'muted pad' }, L('Loading…', 'Cargando…')));
  main.appendChild(slot);

  (async () => {
    const { items: notices } = await C.noticeList({ me: me.id });
    C.clear(slot);
    if (!notices.length) { slot.appendChild(emptyState(L('No notices yet', 'Aún no hay avisos'))); return; }
    notices.forEach((n) => {
      const d = n.delivery || {};
      const canSeeStats = me.role === 'admin' || n.authorId === me.id;
      slot.appendChild(el('article', { class: 'card notice-card', onclick: canSeeStats ? () => openNoticeDetail(n) : null },
        el('div', { class: 'ac-head' },
          el('span', { class: 'ac-icon', html: icon('clip', 20) }),
          el('div', {}, el('div', { class: 'ac-title' }, el('strong', {}, n.title), badge(typeLabel(n.noticeType), 'cat')),
            el('div', { class: 'muted tiny' }, `${n.author?.name || ''} · ${timeAgo(n.createdAt)} · → ${n.audience?.label || ''}`))),
        el('p', { class: 'ac-body' }, n.body),
        canSeeStats ? el('div', { class: 'am-stats muted tiny', style: { marginTop: '6px' } },
          `${d.recipients || 0} ${L('scholars', 'estudiantes')} · ${Math.round(((d.opened || 0) / (d.recipients || 1)) * 100)}% ${L('opened', 'abierto')} · ${L('tap to preview merged notices', 'toca para ver los avisos personalizados')}`) : null));
    });
  })().catch((e) => { C.clear(slot); slot.appendChild(el('div', { class: 'error' }, 'Notices error: ' + (e && e.message))); });
}

function openNoticeDetail(n) {
  const recipients = resolveRecipients(n.audience);
  modal({
    title: n.title, subtitle: `${typeLabel(n.noticeType)} · → ${n.audience?.label || ''}`, wide: true,
    body: el('div', {},
      el('h4', { class: 'card-h' }, L('Merged preview, per recipient', 'Vista previa personalizada, por destinatario')),
      el('div', { class: 'notice-preview-list' }, ...recipients.slice(0, 25).map((r) => el('div', { class: 'notice-preview-row' },
        el('strong', {}, r.name), el('p', { class: 'muted tiny' }, applyMerge(n.body, r))))),
      recipients.length > 25 ? el('p', { class: 'muted tiny' }, `+ ${recipients.length - 25} ${L('more', 'más')}`) : null),
    actions: [],
  });
}

export function openComposeNotice() {
  const me = actor();
  const groups = audiencesFor(me);
  let f = { audience: groups[0], noticeType: 'general', title: '', body: '', channels: ['app', 'email'] };

  const countLabel = el('div', { class: 'aud-count muted tiny' });
  const updCount = () => { countLabel.textContent = `→ ${audienceCount(f.audience).toLocaleString()} ${L('scholars in scope', 'estudiantes en alcance')}`; };
  const audSel = el('select', { class: 'inp', onchange: (e) => { f.audience = groups[e.target.selectedIndex]; updCount(); renderPreview(); } },
    ...groups.map((a) => el('option', { selected: a === f.audience }, a.label)));

  const typeSel = el('select', { class: 'inp', onchange: (e) => (f.noticeType = NOTICE_TYPES[e.target.selectedIndex][0]) },
    ...NOTICE_TYPES.map(([v, lbl]) => el('option', { selected: v === f.noticeType }, lbl)));

  const previewList = el('div', { class: 'notice-preview-list' });
  const renderPreview = () => {
    C.clear(previewList);
    const recipients = resolveRecipients(f.audience).slice(0, 8);
    if (!recipients.length) { previewList.appendChild(el('p', { class: 'muted tiny' }, L('No recipients in this scope yet', 'Sin destinatarios en este alcance'))); return; }
    recipients.forEach((r) => previewList.appendChild(el('div', { class: 'notice-preview-row' },
      el('strong', {}, r.name), el('p', { class: 'muted tiny' }, f.body ? applyMerge(f.body, r) : L('(preview appears as you type)', '(la vista previa aparece mientras escribes)')))));
  };

  const bodyInp = el('textarea', { class: 'inp', rows: 4, placeholder: L('Dear {{scholar_first}}… tip: personalize with the tokens below', 'Estimado/a {{scholar_first}}… personaliza con los botones de abajo'), oninput: (e) => { f.body = e.target.value; renderPreview(); } });
  const insertTok = (tok) => { const t = bodyInp, s = t.selectionStart ?? t.value.length, e2 = t.selectionEnd ?? s; t.value = t.value.slice(0, s) + tok + t.value.slice(e2); f.body = t.value; t.focus(); t.selectionStart = t.selectionEnd = s + tok.length; renderPreview(); };
  const mergeRow = el('div', { class: 'chk-row merge-row' }, el('span', { class: 'muted tiny' }, L('Personalize:', 'Personalizar:')), ...[['{{scholar_first}}', L('Scholar', 'Estudiante')], ['{{family_last}}', L('Family', 'Familia')], ['{{school}}', L('School', 'Escuela')]].map(([tok, lbl]) => el('button', { class: 'toggle-chip', type: 'button', onclick: () => insertTok(tok) }, '+ ' + lbl)));

  const channelRow = el('div', { class: 'chk-row' }, ...[['app', 'App'], ['email', 'Email'], ['sms', 'Text']].map(([c, lbl]) => {
    const b = el('button', { class: 'toggle-chip' + (f.channels.includes(c) ? ' on' : ''), onclick: () => { f.channels = f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c]; b.classList.toggle('on'); } }, lbl);
    return b;
  }));

  updCount(); renderPreview();

  const m = modal({
    title: L('New Auto Notice', 'Nuevo aviso automático'),
    subtitle: L('One template — each family sees their own scholar merged in', 'Una plantilla — cada familia ve su propio estudiante personalizado'),
    wide: true,
    body: el('div', { class: 'form-grid' },
      ff(L('Notice type', 'Tipo de aviso'), typeSel),
      ff(L('Recipients', 'Destinatarios'), el('div', {}, audSel, countLabel)),
      ff(L('Title (internal)', 'Título (interno)'), el('input', { class: 'inp', placeholder: L('e.g. Athletics group welcome', 'p. ej. Bienvenida al equipo'), oninput: (e) => (f.title = e.target.value) })),
      ff(L('Message', 'Mensaje'), el('div', {}, bodyInp, mergeRow)),
      ff(L('Send via', 'Enviar por'), channelRow),
      el('h4', { class: 'card-h' }, L('Live preview, per recipient', 'Vista previa en vivo, por destinatario')),
      previewList),
    actions: [
      btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Send now', 'Enviar ahora'), { kind: 'primary', iconName: 'send', onclick: async () => {
        if (!f.title.trim()) return toast(L('Add a title', 'Agrega un título'));
        if (!f.body.trim()) return toast(L('Add a message', 'Agrega un mensaje'));
        if (!f.channels.length) return toast(L('Pick at least one channel', 'Elige un canal'));
        const recipients = audienceCount(f.audience);
        await act('sendAutoNotice', { authorId: me.id, audience: f.audience, noticeType: f.noticeType, title: f.title, body: f.body, channels: f.channels, recipients });
        m.close(); C.navigate('notices');
        toast(L('Notice sent 📨', 'Aviso enviado 📨'));
      } }),
    ],
  });
}
