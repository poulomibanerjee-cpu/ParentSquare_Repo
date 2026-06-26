/* ============================================================================
 * feed.js — home feed (posts) + post composer
 * ==========================================================================*/
import * as C from './core.js';
import { S, el, icon, avatar, userById, groupById, actor, act, visiblePosts, timeAgo, dateLabel, escapeHtml, badge, channelChips, pageHead, btn, modal, toast, translatedTag, L, tx, applyMerge, scholarsInAudience, childrenOf } from './core.js';

const EMOJI = ['👍', '❤️', '🎉', '👏', '🙌'];

function photoTile(att) {
  if (att.dataUrl || att.src) { // real photo: uploaded data URL, or a generated image dropped into public/images
    const url = att.dataUrl || att.src;
    const seed = [...(att.label || att.name || url)].reduce((a, c) => a + c.charCodeAt(0), 0);
    const grad = `linear-gradient(135deg, hsl(${seed % 360} 70% 62%), hsl(${(seed * 7) % 360} 70% 48%))`; // shows if the image file isn't there yet
    const img = el('img', { src: url, alt: att.label || 'photo', decoding: 'async', onerror: (e) => e.target.remove() });
    return el('div', { class: 'photo-tile real', title: att.label || '', style: { background: grad } }, img, att.label ? el('span', { class: 'pt-label' }, att.label) : null);
  }
  if (att.type === 'pdf') {
    return el('a', { class: 'file-chip', onclick: () => toast(L('Demo — file preview not wired up', 'Demo — vista previa no disponible')) },
      el('span', { class: 'fc-ic', html: icon('doc', 18) }), el('span', {}, att.label || att.name), el('span', { class: 'fc-ext' }, 'PDF'));
  }
  const seed = [...(att.name || att.label || 'photo')].reduce((a, c) => a + c.charCodeAt(0), 0); // gradient placeholder for seed images
  const h1 = seed % 360, h2 = (seed * 7) % 360;
  return el('div', { class: 'photo-tile', title: att.label, style: { background: `linear-gradient(135deg, hsl(${h1} 70% 62%), hsl(${h2} 70% 48%))` } },
    el('span', { class: 'pt-ic', html: '📷' }), el('span', { class: 'pt-label' }, att.label || att.name));
}

// downscale a picked image to a small JPEG data URL (keeps on-device storage tiny)
function readImageDownscaled(file, maxDim = 1100, quality = 0.62) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      try { resolve(c.toDataURL('image/jpeg', quality)); } catch { resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function reactionBar(p) {
  const me = S.me;
  const mine = Object.entries(p.reactions || {}).find(([, ids]) => ids.includes(me))?.[0];
  return el('div', { class: 'reactions' },
    ...EMOJI.map((e) => {
      const n = (p.reactions?.[e] || []).length;
      return el('button', { class: 'react' + (mine === e ? ' on' : '') + (n ? ' has' : ''), onclick: () => act('react', { postId: p.id, userId: me, emoji: e }) },
        el('span', { class: 'rx-e' }, e), n ? el('span', { class: 'rx-n' }, String(n)) : null);
    }));
}

function commentBlock(p) {
  const list = el('div', { class: 'comments' },
    ...(p.comments || []).map((c) => {
      const u = userById(c.authorId);
      return el('div', { class: 'comment' }, avatar(u, 28),
        el('div', { class: 'cm-body' },
          el('div', {}, el('strong', {}, u?.name || 'Unknown'), el('span', { class: 'muted dot' }, timeAgo(c.createdAt))),
          el('p', {}, c.body)));
    }));
  let val = '';
  const input = el('input', { class: 'cm-input', placeholder: L('Write a comment…', 'Escribe un comentario…'), oninput: (e) => (val = e.target.value), onkeydown: (e) => { if (e.key === 'Enter' && val.trim()) submit(); } });
  const submit = () => { if (val.trim()) act('comment', { postId: p.id, userId: S.me, body: val }); };
  return el('div', {}, list,
    el('div', { class: 'cm-add' }, avatar(actor(), 28), input, el('button', { class: 'icon-btn send', html: icon('send', 18), onclick: submit })));
}

function audienceTag(p) {
  return el('span', { class: 'aud', title: 'Audience' }, '→ ' + (p.audience?.label || 'School'));
}

export function postCard(p) {
  const author = p.author || userById(p.authorId);                          // identity embedded by the scoped feed endpoint
  const me = actor();
  const body = tx(p, 'body', 'bodyEs');
  const text = applyMerge(body.text, me);                                  // mail-merge personalization
  const scheduled = p.scheduledFor && new Date(p.scheduledFor) > new Date();
  const kids = me.role === 'parent' ? scholarsInAudience(p.audience, me.id) : []; // child-specific label
  const card = el('article', { class: 'card post' + (p.pinned ? ' pinned' : '') },
    p.pinned ? el('div', { class: 'pin-tag', html: icon('pin', 13) + `<span>${L('Pinned', 'Fijado')}</span>` }) : null,
    el('div', { class: 'post-head' },
      avatar(author, 44),
      el('div', { class: 'ph-meta' },
        el('div', { class: 'ph-line' }, el('strong', {}, author?.name || 'Unknown'),
          author?.title ? el('span', { class: 'muted dot' }, author.title) : null),
        el('div', { class: 'ph-line2' }, audienceTag(p), el('span', { class: 'muted dot' }, timeAgo(p.createdAt)),
          badge(p.category, 'cat'),
          kids.length ? el('span', { class: 'scholar-chip' }, `🎒 ${L('For', 'Para')} ${kids.map((k) => k.firstName).join(' & ')}`) : null,
          scheduled ? badge('🕒 ' + L('Scheduled', 'Programado') + ' ' + dateLabel(p.scheduledFor), 'warn') : null)),
      channelChips(p.channels)),
    el('h3', { class: 'post-title' }, p.title),
    el('div', { class: 'post-body' }, el('p', {}, text), body.translated ? translatedTag() : null),
    (p.attachments && p.attachments.length) ? el('div', { class: 'attach' + (p.attachments.length > 1 ? ' multi' : '') }, ...p.attachments.map(photoTile)) : null,
    el('div', { class: 'post-foot' }, reactionBar(p),
      me.role !== 'parent' ? el('button', { class: 'pin-btn', onclick: () => act('togglePin', { postId: p.id }) }, p.pinned ? L('Unpin', 'Desfijar') : L('Pin', 'Fijar')) : null),
    commentBlock(p));
  return card;
}

export function renderFeed(main) {
  const me = actor();
  const kids = me.role === 'parent' ? childrenOf(me.id) : [];
  const sel = S.params.feedChild;
  const title = me.role === 'admin' ? L('All Posts', 'Todas las publicaciones') : L('Home', 'Inicio');
  const sub = me.role === 'parent'
    ? L(`Updates for ${kids.map((s) => s.firstName).join(' & ') || 'your family'}`, 'Novedades para tu familia')
    : me.role === 'teacher' ? L('Your classroom & school posts', 'Publicaciones de tu salón y escuela')
      : L('Everything posted across the network', 'Todo lo publicado en la red');
  main.appendChild(pageHead(title, sub));

  // per-child filter (fixes "notifications aren't child-specific" for multi-child families)
  if (kids.length > 1) {
    const chip = (id, label) => el('button', { class: 'filter-chip' + ((sel || '') === (id || '') ? ' on' : ''), onclick: () => C.navigate('home', id ? { feedChild: id } : {}) }, label);
    main.appendChild(el('div', { class: 'child-filter' }, el('span', { class: 'muted tiny' }, L('By scholar:', 'Por estudiante:')), chip('', L('All', 'Todos')), ...kids.map((k) => chip(k.id, k.firstName))));
  }

  // feed comes from the scoped, paginated endpoint (server) or the on-device store (offline) — never the whole table
  const feed = el('div', { class: 'feed' }, el('p', { class: 'muted pad' }, L('Loading…', 'Cargando…')));
  main.appendChild(feed);
  let before = null, first = true;
  const load = async () => {
    const data = await C.feedPage({ me: me.id, before });
    if (first) { C.clear(feed); first = false; }
    const old = feed.querySelector('.load-more'); if (old) old.remove();
    let items = data.items || [];
    if (sel && me.role === 'parent') items = items.filter((p) => scholarsInAudience(p.audience, me.id).some((k) => k.id === sel));
    items.forEach((p) => feed.appendChild(postCard(p)));
    before = data.nextBefore;
    if (!feed.querySelector('.post')) feed.appendChild(C.emptyState(L('No posts yet', 'No hay publicaciones')));
    if (data.hasMore) feed.appendChild(el('button', { class: 'btn ghost load-more', style: { display: 'block', margin: '10px auto' }, onclick: () => load() }, L('Load more', 'Ver más')));
  };
  load().catch((e) => { C.clear(feed); feed.appendChild(el('div', { class: 'error' }, 'Feed error: ' + (e && e.message))); });
}

// ---------------------------------------------------------------------------
// COMPOSE (teacher / admin)
// ---------------------------------------------------------------------------
export function openCompose() {
  const me = actor();
  // audiences the author can post to
  const auds = S.db.groups
    .filter((g) => me.role === 'admin' || g.leadIds.includes(me.id) || g.schoolId === me.schoolId)
    .map((g) => ({ type: g.type, id: g.id, label: g.name, schoolId: g.schoolId }));
  let f = { audience: auds[0], title: '', body: '', category: 'Announcement', channels: ['app', 'email'], scheduledFor: '' };

  const channelRow = el('div', { class: 'chk-row' }, ...[['app', 'App'], ['email', 'Email'], ['sms', 'Text'], ['voice', 'Voice']].map(([c, lbl]) => {
    const on = f.channels.includes(c);
    const b = el('button', { class: 'toggle-chip' + (on ? ' on' : ''), onclick: () => { f.channels = f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c]; b.classList.toggle('on'); } }, lbl);
    return b;
  }));

  const audSel = el('select', { class: 'inp', onchange: (e) => (f.audience = auds[e.target.selectedIndex]) }, ...auds.map((a) => el('option', {}, a.label)));
  const catSel = el('select', { class: 'inp', onchange: (e) => (f.category = e.target.value) }, ...['Announcement', 'Classroom', 'Event', 'Reminder'].map((c) => el('option', { value: c }, c)));
  const titleInp = el('input', { class: 'inp', placeholder: 'Post title', oninput: (e) => (f.title = e.target.value) });
  const bodyInp = el('textarea', { class: 'inp', rows: 5, placeholder: 'Share an update with families… tip: {{scholar_first}} personalizes it', oninput: (e) => (f.body = e.target.value) });
  const insertTok = (tok) => { const t = bodyInp, s = t.selectionStart ?? t.value.length, e2 = t.selectionEnd ?? s; t.value = t.value.slice(0, s) + tok + t.value.slice(e2); f.body = t.value; t.focus(); t.selectionStart = t.selectionEnd = s + tok.length; };
  const mergeRow = el('div', { class: 'chk-row merge-row' }, el('span', { class: 'muted tiny' }, L('Personalize:', 'Personalizar:')), ...[['{{scholar_first}}', L('Scholar', 'Estudiante')], ['{{family_last}}', L('Family', 'Familia')], ['{{school}}', L('School', 'Escuela')]].map(([tok, lbl]) => el('button', { class: 'toggle-chip', type: 'button', onclick: () => insertTok(tok) }, '+ ' + lbl)));
  const schedInput = el('input', { class: 'inp', type: 'datetime-local', style: { display: 'none', marginTop: '8px' }, oninput: (e) => (f.scheduledFor = e.target.value ? new Date(e.target.value).toISOString() : '') });
  const schedBtn = el('button', { class: 'switch', type: 'button', onclick: (e) => { const on = schedInput.style.display === 'none'; schedInput.style.display = on ? 'block' : 'none'; e.currentTarget.classList.toggle('on', on); if (!on) f.scheduledFor = ''; } }, el('span', { class: 'knob' }));

  // real photo attachments — picked from the device, downscaled, stored on-device
  const attachments = [];
  const previews = el('div', { class: 'photo-previews' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' }, onchange: async (e) => {
    for (const file of [...e.target.files]) { const dataUrl = await readImageDownscaled(file); if (!dataUrl) continue; const att = { type: 'image', dataUrl, label: '' }; attachments.push(att); const thumb = el('div', { class: 'photo-prev' }, el('img', { src: dataUrl }), el('button', { class: 'photo-rm', type: 'button', html: icon('x', 12), onclick: () => { attachments.splice(attachments.indexOf(att), 1); thumb.remove(); } })); previews.appendChild(thumb); }
    e.target.value = '';
  } });
  const photoControl = el('div', {}, el('button', { class: 'btn ghost sm', type: 'button', onclick: () => fileInput.click() }, el('span', { class: 'bi', html: icon('clip', 15) }), L('Add photos', 'Agregar fotos')), fileInput, previews);

  const m = modal({
    title: L('New Post', 'Nueva publicación'), subtitle: L('Posts deliver across selected channels + auto-translate', 'Las publicaciones se envían por los canales seleccionados'),
    body: el('div', { class: 'form-grid' },
      field(L('Audience', 'Audiencia'), audSel),
      field(L('Category', 'Categoría'), catSel),
      field(L('Title', 'Título'), titleInp),
      field(L('Message', 'Mensaje'), el('div', {}, bodyInp, mergeRow)),
      field(L('Photos', 'Fotos'), photoControl),
      field(L('Send via', 'Enviar por'), channelRow),
      el('div', { class: 'pref-row' }, el('div', {}, el('strong', {}, '🕒 ' + L('Schedule for later', 'Programar para después')), el('div', { class: 'muted tiny' }, L('Personalized AND scheduled', 'Personalizado Y programado'))), schedBtn),
      schedInput),
    actions: [
      btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Post', 'Publicar'), { kind: 'primary', iconName: 'send', onclick: async () => {
        if (!f.title.trim()) return toast(L('Add a title', 'Agrega un título'));
        await act('createPost', { authorId: me.id, audience: f.audience, title: f.title, body: f.body, category: f.category, channels: f.channels, attachments, scheduledFor: f.scheduledFor });
        m.close(); toast(f.scheduledFor ? L('Post scheduled 🕒', 'Publicación programada 🕒') : L('Posted! Delivered to families.', '¡Publicado! Enviado a las familias.'));
      } }),
    ],
  });
}

export function field(label, control) { return el('label', { class: 'field' }, el('span', { class: 'fl' }, label), control); }
