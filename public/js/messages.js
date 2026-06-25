/* ============================================================================
 * messages.js — two-way direct & group messaging with auto-translation
 * ==========================================================================*/
import * as C from './core.js';
import { S, el, icon, avatar, userById, actor, act, myConversations, timeAgo, txMsg, translatedTag, pageHead, btn, modal, toast, L } from './core.js';

function others(c) { return c.participantIds.filter((id) => id !== S.me).map(userById).filter(Boolean); }
function convTitle(c) {
  if (c.subject) return c.subject;
  const o = others(c);
  return o.length === 1 ? o[0].name : o.map((u) => u.firstName).join(', ');
}

function listItem(c, active) {
  const o = others(c);
  const last = c.messages.at(-1);
  const unread = c.messages.some((m) => m.senderId !== S.me && !m.read);
  const preview = last ? txMsg(last).text : '';
  return el('button', { class: 'conv-item' + (active ? ' active' : '') + (unread ? ' unread' : ''), onclick: () => C.navigate('messages', { conversationId: c.id }) },
    c.type === 'group'
      ? el('div', { class: 'grp-av' }, ...o.slice(0, 2).map((u) => avatar(u, 26)))
      : avatar(o[0], 42),
    el('div', { class: 'ci-text' },
      el('div', { class: 'ci-top' }, el('strong', {}, convTitle(c)), el('span', { class: 'muted tiny' }, last ? timeAgo(last.createdAt) : '')),
      el('p', { class: 'ci-prev' }, (last && last.senderId === S.me ? L('You: ', 'Tú: ') : '') + preview)),
    unread ? el('span', { class: 'unread-dot' }) : null);
}

function bubble(m) {
  const mine = m.senderId === S.me;
  const u = userById(m.senderId);
  const t = txMsg(m);
  return el('div', { class: 'bubble-row ' + (mine ? 'me' : 'them') },
    !mine ? avatar(u, 30) : null,
    el('div', { class: 'bubble' + (mine ? ' me' : '') },
      !mine ? el('div', { class: 'b-author' }, u?.name) : null,
      el('p', {}, t.text),
      el('div', { class: 'b-foot' }, el('span', { class: 'b-time' }, timeAgo(m.createdAt)), t.translated ? translatedTag() : null)));
}

function thread(c, showBack) {
  const o = others(c);
  const head = el('div', { class: 'thread-head' },
    showBack ? el('button', { class: 'thread-back', onclick: () => C.navigate('messages', {}) }, '‹') : null,
    c.type === 'group' ? el('div', { class: 'grp-av' }, ...o.slice(0, 3).map((u) => avatar(u, 30))) : avatar(o[0], 40),
    el('div', {}, el('strong', {}, convTitle(c)),
      el('p', { class: 'muted tiny' }, c.type === 'group' ? `${c.participantIds.length} ${L('participants', 'participantes')}` : (o[0]?.title || L('Parent / Guardian', 'Padre / Tutor')))),
    el('span', { class: 'tx-note', html: icon('globe', 14) + `<span>${L('Auto-translation on', 'Traducción automática activada')}</span>` }));

  const body = el('div', { class: 'thread-body', id: 'thread-body' }, ...c.messages.map(bubble));

  let val = '';
  const input = el('textarea', { class: 'msg-input', rows: 1, placeholder: L('Type a message…', 'Escribe un mensaje…'),
    oninput: (e) => { val = e.target.value; e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; },
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
  const send = async () => {
    if (!val.trim()) return;
    await act('sendMessage', { conversationId: c.id, senderId: S.me, body: val, lang: actor().language });
    val = '';
  };
  const composer = el('div', { class: 'composer' }, input, el('button', { class: 'send-btn', html: icon('send', 20), onclick: send }));

  return el('div', { class: 'thread' }, head, body, composer);
}

export function renderMessages(main) {
  const me = actor();
  const convs = myConversations();
  const mobile = matchMedia('(max-width: 860px)').matches;
  // desktop auto-opens the first conversation; mobile shows the list until one is tapped
  const activeId = S.params.conversationId || (mobile ? null : convs[0]?.id);
  const active = convs.find((c) => c.id === activeId);

  // on mobile, an open thread takes over the screen (with a back button) — skip the page header for room
  if (!(mobile && active)) {
    main.appendChild(pageHead(L('Messages', 'Mensajes'), L('Two-way, auto-translated conversations with staff & families', 'Conversaciones bidireccionales y traducidas'),
      btn(L('New Message', 'Nuevo mensaje'), { kind: 'primary', iconName: 'plus', onclick: () => openNewMessage() })));
  }

  // mark active as read (after this render, to avoid re-entrancy)
  if (active && active.messages.some((m) => m.senderId !== S.me && !m.read)) {
    setTimeout(() => act('markRead', { conversationId: active.id, userId: S.me }), 0);
  }

  const list = el('div', { class: 'conv-list' }, convs.length ? null : el('p', { class: 'muted pad' }, L('No conversations yet', 'No hay conversaciones')),
    ...convs.map((c) => listItem(c, c.id === activeId)));

  if (mobile) {
    main.appendChild(active ? thread(active, true) : list);
  } else {
    main.appendChild(el('div', { class: 'msg-layout' }, list, active ? thread(active, false) : C.emptyState(L('Select a conversation', 'Selecciona una conversación'))));
  }

  // auto-scroll thread to bottom
  setTimeout(() => { const tb = document.getElementById('thread-body'); if (tb) tb.scrollTop = tb.scrollHeight; }, 0);
}

function openNewMessage() {
  const me = actor();
  // candidate recipients: staff for parents; parents+staff for teacher/admin
  const cands = S.db.users.filter((u) => u.id !== me.id && (me.role === 'parent' ? u.role !== 'parent' : true));
  let picked = new Set(), subject = '', bodyVal = '';

  const results = el('div', { class: 'recip-results' });
  const renderResults = (q) => {
    C.clear(results);
    cands.filter((u) => u.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8).forEach((u) => {
      const on = picked.has(u.id);
      results.appendChild(el('button', { class: 'recip' + (on ? ' on' : ''), onclick: () => { on ? picked.delete(u.id) : picked.add(u.id); renderResults(q); } },
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
        const res = await act('startConversation', { participantIds: [me.id, ...picked], senderId: me.id, subject, body: bodyVal });
        m.close(); toast(L('Message sent', 'Mensaje enviado'));
        if (res.result) C.navigate('messages', { conversationId: res.result });
      } }),
    ],
  });
}
