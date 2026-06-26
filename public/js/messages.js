/* ============================================================================
 * messages.js — two-way direct & group messaging with auto-translation.
 * Reads come from the scoped endpoints (/api/conversations, /api/thread): the
 * thread list and each thread arrive already scoped to `me` with participant /
 * sender identities EMBEDDED, so the client never loads the conversations table.
 * ==========================================================================*/
import * as C from './core.js';
import { S, el, icon, avatar, userById, actor, act, timeAgo, txMsg, translatedTag, pageHead, btn, modal, toast, L } from './core.js';

const firstName = (u) => u && (u.firstName || (u.name || '').split(' ')[0]);
// participants other than me — from the embedded `participants` cards on the scoped shapes
function others(c) { return (c.participants || []).filter((u) => u.id !== S.me); }
function convTitle(c) {
  if (c.subject) return c.subject;
  const o = others(c);
  return o.length === 1 ? o[0].name : o.map(firstName).filter(Boolean).join(', ');
}

// c = conversation SUMMARY from /api/conversations: { id,type,subject,participants,lastMessage,unread,updatedAt }
function listItem(c, active) {
  const o = others(c);
  const last = c.lastMessage;
  const unread = (c.unread || 0) > 0;
  const preview = last ? last.body : '';
  return el('button', { class: 'conv-item' + (active ? ' active' : '') + (unread ? ' unread' : ''), onclick: () => C.navigate('messages', { conversationId: c.id }) },
    c.type === 'group'
      ? el('div', { class: 'grp-av' }, ...o.slice(0, 2).map((u) => avatar(u, 26)))
      : avatar(o[0], 42),
    el('div', { class: 'ci-text' },
      el('div', { class: 'ci-top' }, el('strong', {}, convTitle(c)), el('span', { class: 'muted tiny' }, last ? timeAgo(last.createdAt) : '')),
      el('p', { class: 'ci-prev' }, (last && last.senderId === S.me ? L('You: ', 'Tú: ') : '') + preview)),
    unread ? el('span', { class: 'unread-dot' }) : null);
}

// m = message from /api/thread with sender card embedded
function bubble(m) {
  const mine = m.senderId === S.me;
  const u = m.sender || userById(m.senderId);
  const t = txMsg(m);
  return el('div', { class: 'bubble-row ' + (mine ? 'me' : 'them') },
    !mine ? avatar(u, 30) : null,
    el('div', { class: 'bubble' + (mine ? ' me' : '') },
      !mine ? el('div', { class: 'b-author' }, u?.name) : null,
      el('p', {}, t.text),
      el('div', { class: 'b-foot' }, el('span', { class: 'b-time' }, timeAgo(m.createdAt)), t.translated ? translatedTag() : null)));
}

// data = /api/thread result: { items:[message], hasMore, conversation:{id,type,subject,participants} }
function threadView(data, showBack) {
  const c = data.conversation;
  const o = others(c);
  const head = el('div', { class: 'thread-head' },
    showBack ? el('button', { class: 'thread-back', 'aria-label': L('Back', 'Atrás'), onclick: () => C.navigate('messages', {}) }, '‹') : null,
    c.type === 'group' ? el('div', { class: 'grp-av' }, ...o.slice(0, 3).map((u) => avatar(u, 30))) : avatar(o[0], 40),
    el('div', {}, el('strong', {}, convTitle(c)),
      el('p', { class: 'muted tiny' }, c.type === 'group' ? `${(c.participants || []).length} ${L('participants', 'participantes')}` : (o[0]?.title || L('Parent / Guardian', 'Padre / Tutor')))),
    el('span', { class: 'tx-note', html: icon('globe', 14) + `<span>${L('Auto-translation on', 'Traducción automática activada')}</span>` }));

  const body = el('div', { class: 'thread-body', id: 'thread-body' },
    data.hasMore ? el('div', { class: 'muted tiny', style: { textAlign: 'center', padding: '4px 0 8px' } }, L('Earlier messages…', 'Mensajes anteriores…')) : null,
    ...data.items.map(bubble));

  let val = '';
  const input = el('textarea', { class: 'msg-input', rows: 1, placeholder: L('Type a message…', 'Escribe un mensaje…'),
    oninput: (e) => { val = e.target.value; e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; },
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
  const send = async () => {
    if (!val.trim()) return;
    await act('sendMessage', { conversationId: c.id, senderId: S.me, body: val, lang: actor().language });
    val = '';
  };
  const composer = el('div', { class: 'composer' }, input, el('button', { class: 'send-btn', 'aria-label': L('Send', 'Enviar'), html: icon('send', 20), onclick: send }));

  return el('div', { class: 'thread' }, head, body, C.isViewer() ? el('div', { class: 'composer' }, el('span', { class: 'muted tiny', style: { padding: '6px 4px' } }, L('View-only access — messaging is disabled', 'Solo lectura — la mensajería está desactivada'))) : composer);
}

export function renderMessages(main) {
  const mobile = matchMedia('(max-width: 860px)').matches;
  const loading = el('p', { class: 'muted pad' }, L('Loading…', 'Cargando…'));
  main.appendChild(loading);

  (async () => {
    const { items: convs } = await C.conversationList({ me: S.me });
    // desktop auto-opens the first conversation; mobile shows the list until one is tapped
    const activeId = S.params.conversationId || (mobile ? null : convs[0]?.id);
    const active = convs.find((c) => c.id === activeId);
    const threadData = active ? await C.threadPage({ id: active.id, me: S.me, limit: 100 }) : null;
    // mark active as read once (server persists → SSE refreshes the badge)
    if (active && (active.unread || 0) > 0) setTimeout(() => act('markRead', { conversationId: active.id, userId: S.me }), 0);

    loading.remove();
    // on mobile, an open thread takes over the screen (with a back button) — skip the page header for room
    if (!(mobile && active)) {
      main.appendChild(pageHead(L('Messages', 'Mensajes'), L('Two-way, auto-translated conversations with staff & families', 'Conversaciones bidireccionales y traducidas'),
        C.isViewer() ? null : btn(L('New Message', 'Nuevo mensaje'), { kind: 'primary', iconName: 'plus', onclick: () => openNewMessage() })));
    }

    const list = el('div', { class: 'conv-list' }, convs.length ? null : el('p', { class: 'muted pad' }, L('No conversations yet', 'No hay conversaciones')),
      ...convs.map((c) => listItem(c, c.id === activeId)));

    if (mobile) main.appendChild(active ? threadView(threadData, true) : list);
    else main.appendChild(el('div', { class: 'msg-layout' }, list, active ? threadView(threadData, false) : C.emptyState(L('Select a conversation', 'Selecciona una conversación'))));

    setTimeout(() => { const tb = document.getElementById('thread-body'); if (tb) tb.scrollTop = tb.scrollHeight; }, 0);
  })().catch((e) => { loading.textContent = 'Messages error: ' + (e && e.message); });
}

function openNewMessage() {
  const me = actor();
  // candidate recipients: staff for parents; parents+staff for teacher/admin (search is server-scoped via the directory)
  let picked = new Map(), subject = '', bodyVal = '';

  const results = el('div', { class: 'recip-results' });
  const renderResults = async (q) => {
    const { items } = await C.directoryPage({ q, limit: 8, role: me.role === 'parent' ? '' : '' });
    C.clear(results);
    items.filter((u) => u.id !== me.id && (me.role === 'parent' ? u.role !== 'parent' : true)).slice(0, 8).forEach((u) => {
      const on = picked.has(u.id);
      results.appendChild(el('button', { class: 'recip' + (on ? ' on' : ''), onclick: () => { on ? picked.delete(u.id) : picked.set(u.id, u); renderResults(q); } },
        avatar(u, 28), el('div', { class: 'rc-t' }, el('strong', {}, u.name), el('span', {}, u.title || u.role)), on ? el('span', { class: 'rc-check', html: icon('check', 16) }) : null));
    });
  };
  renderResults('');
  const search = el('input', { class: 'inp', placeholder: L('Search staff & families…', 'Buscar…'), oninput: (e) => renderResults(e.target.value) });
  const subjInp = el('input', { class: 'inp', placeholder: L('Subject (optional)', 'Asunto (opcional)'), oninput: (e) => (subject = e.target.value) });
  const bodyInp = el('textarea', { class: 'inp', rows: 4, placeholder: L('Message…', 'Mensaje…'), oninput: (e) => (bodyVal = e.target.value) });

  const m = modal({
    title: L('New Message', 'Nuevo mensaje'),
    body: el('div', { class: 'form-grid' },
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('To', 'Para')), search, results),
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Subject', 'Asunto')), subjInp),
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Message', 'Mensaje')), bodyInp)),
    actions: [
      btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Send', 'Enviar'), { kind: 'primary', iconName: 'send', onclick: async () => {
        if (!picked.size) return toast(L('Pick at least one recipient', 'Elige un destinatario'));
        if (!bodyVal.trim()) return toast(L('Write a message', 'Escribe un mensaje'));
        const res = await act('startConversation', { participantIds: [me.id, ...picked.keys()], senderId: me.id, subject, body: bodyVal });
        m.close(); toast(L('Message sent', 'Mensaje enviado'));
        if (res.result) C.navigate('messages', { conversationId: res.result });
      } }),
    ],
  });
}
