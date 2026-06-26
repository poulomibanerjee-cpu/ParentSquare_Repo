/* ============================================================================
 * config.js — Admin → Configure: the structural configuration behind the comms
 * tools. Build rule-based Smart Lists, manage Groups, and author Automations.
 * Admin-only. Everything persists through the normal ops → SQLite.
 * ==========================================================================*/
import * as C from './core.js';
import { S, el, icon, avatar, userById, schoolById, actor, act, badge, pageHead, btn, modal, toast, L, smartLists, SL_FIELDS, countSmartList } from './core.js';

const GROUP_ICON = { class: '🏫', school: '🎒', club: '🎭', team: '⚽', bus: '🚌' };
const GROUP_TYPES = [['school', 'School'], ['class', 'Class'], ['club', 'Club'], ['team', 'Team'], ['bus', 'Bus route']];
const CHANNELS = [['app', 'App'], ['email', 'Email'], ['sms', 'Text'], ['voice', 'Voice']];
const OP_LABEL = { is: 'is', not: 'is not', has: 'includes', hasnot: 'excludes', in: 'in', notin: 'not in' };

const fieldDef = (f) => SL_FIELDS.find((x) => x.field === f) || SL_FIELDS[0];
function valueOptions(def) {
  if (Array.isArray(def.values)) return def.values;
  if (def.values === 'schools') return (S.db.schools || []).map((s) => [s.id, s.short || s.name]);
  if (def.values === 'groups') return (S.db.groups || []).map((g) => [g.id, g.name]);
  if (def.values === 'grades') return ['K', '1', '2', '3', '4', '5', '6', '7', '8'].map((g) => [g, 'Grade ' + g]);
  return [];
}
function ruleSummary(r) {
  const def = fieldDef(r.field);
  const v = (valueOptions(def).find(([val]) => val === r.value) || [r.value, r.value])[1];
  return `${def.label} ${OP_LABEL[r.op] || r.op} ${v}`;
}

// ===========================================================================
// SMART LIST BUILDER
// ===========================================================================
function smartListBuilder(existing) {
  const draft = existing ? JSON.parse(JSON.stringify(existing))
    : { label: '', icon: '🎯', logic: 'all', rules: [{ field: 'language', op: 'is', value: 'es' }] };
  const preview = el('span', { class: 'aud-count' });
  const updatePreview = () => { preview.textContent = `→ ${countSmartList(draft).toLocaleString()} ${L('families match', 'familias coinciden')}`; };

  const rulesWrap = el('div', { class: 'editor-rows' });
  const renderRules = () => {
    C.clear(rulesWrap);
    draft.rules.forEach((r, i) => {
      const def = fieldDef(r.field);
      const fieldSel = el('select', { class: 'inp', style: { flex: '1.3', minWidth: '128px' }, onchange: (e) => { r.field = e.target.value; const d = fieldDef(r.field); r.op = d.ops[0]; const o = valueOptions(d)[0]; r.value = o ? o[0] : ''; renderRules(); updatePreview(); } },
        ...SL_FIELDS.map((d) => el('option', { value: d.field, selected: d.field === r.field }, d.label)));
      const opSel = el('select', { class: 'inp', style: { flex: '0 0 110px' }, onchange: (e) => { r.op = e.target.value; updatePreview(); } },
        ...def.ops.map((o) => el('option', { value: o, selected: o === r.op }, OP_LABEL[o] || o)));
      const valSel = el('select', { class: 'inp', style: { flex: '1.3', minWidth: '128px' }, onchange: (e) => { r.value = e.target.value; updatePreview(); } },
        ...valueOptions(def).map(([v, lbl]) => el('option', { value: v, selected: v === r.value }, lbl)));
      rulesWrap.appendChild(el('div', { class: 'editor-row' }, fieldSel, opSel, valSel,
        draft.rules.length > 1 ? el('button', { class: 'icon-btn', html: icon('x', 16), onclick: () => { draft.rules.splice(i, 1); renderRules(); updatePreview(); } }) : null));
    });
  };
  renderRules(); updatePreview();

  const logicSeg = el('div', { class: 'seg' }, ...[['all', L('Match ALL', 'TODAS')], ['any', L('Match ANY', 'CUALQUIERA')]].map(([v, lbl]) => {
    const b = el('button', { class: 'seg-opt' + (draft.logic === v ? ' on' : ''), onclick: () => { draft.logic = v; logicSeg.querySelectorAll('.seg-opt').forEach((x) => x.classList.remove('on')); b.classList.add('on'); updatePreview(); } }, lbl);
    return b;
  }));

  const m = modal({
    title: existing ? L('Edit Smart List', 'Editar lista') : L('New Smart List', 'Nueva lista inteligente'),
    subtitle: L('A rule-based audience that updates itself as families change', 'Audiencia por reglas que se actualiza sola'), wide: true,
    body: el('div', { class: 'form-grid' },
      el('div', { class: 'two-col' },
        el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Name', 'Nombre')), el('input', { class: 'inp', value: draft.label, placeholder: L('e.g. 3rd-grade Spanish families', 'p. ej. familias de 3.º'), oninput: (e) => (draft.label = e.target.value) })),
        el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Icon', 'Icono')), el('input', { class: 'inp', value: draft.icon, maxlength: 2, oninput: (e) => (draft.icon = e.target.value) }))),
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Match', 'Coincidir')), logicSeg),
      el('div', { class: 'field' }, el('span', { class: 'fl' }, L('Rules', 'Reglas')), rulesWrap,
        el('button', { class: 'btn ghost sm', style: { width: 'fit-content' }, onclick: () => { const d = SL_FIELDS[0], o = valueOptions(d)[0]; draft.rules.push({ field: d.field, op: d.ops[0], value: o ? o[0] : '' }); renderRules(); updatePreview(); } }, '+ ' + L('Add rule', 'Añadir regla'))),
      el('div', { class: 'merge-row' }, preview)),
    actions: [
      btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Save list', 'Guardar lista'), { kind: 'primary', iconName: 'check', onclick: async () => {
        if (!draft.label.trim()) return toast(L('Name the list', 'Nombra la lista'));
        if (!draft.rules.length) return toast(L('Add at least one rule', 'Añade una regla'));
        await act('saveSmartList', { list: draft });
        m.close(); toast(L('Smart List saved', 'Lista guardada'));
      } }),
    ],
  });
}

// ===========================================================================
// GROUP EDITOR
// ===========================================================================
function groupEditor(existing) {
  const draft = existing
    ? { id: existing.id, name: existing.name, type: existing.type, schoolId: existing.schoolId, leadIds: [...(existing.leadIds || [])], memberIds: [...(existing.memberIds || [])] }
    : { name: '', type: 'club', schoolId: (S.db.schools[0] || {}).id, leadIds: [], memberIds: [] };

  const typeSel = el('select', { class: 'inp', onchange: (e) => (draft.type = e.target.value) }, ...GROUP_TYPES.map(([v, l]) => el('option', { value: v, selected: v === draft.type }, l)));
  const schoolSel = el('select', { class: 'inp', onchange: (e) => { draft.schoolId = e.target.value; renderResults(''); } }, ...(S.db.schools || []).map((s) => el('option', { value: s.id, selected: s.id === draft.schoolId }, s.short || s.name)));

  const results = el('div', { class: 'recip-results' });
  const renderResults = async (q) => {
    const { items } = await C.directoryPage({ q, schoolId: draft.schoolId, limit: 8 });
    C.clear(results);
    items.filter((u) => u.role !== 'parent').forEach((u) => {
      const on = draft.leadIds.includes(u.id);
      results.appendChild(el('button', { class: 'recip' + (on ? ' on' : ''), onclick: () => { draft.leadIds = on ? draft.leadIds.filter((x) => x !== u.id) : [...draft.leadIds, u.id]; renderResults(q); } },
        avatar(u, 28), el('div', { class: 'rc-t' }, el('strong', {}, u.name), el('span', {}, u.title || u.role)), on ? el('span', { class: 'rc-check', html: icon('check', 16) }) : null));
    });
  };
  renderResults('');

  const m = modal({
    title: existing ? L('Edit Group', 'Editar grupo') : L('New Group', 'Nuevo grupo'),
    body: el('div', { class: 'form-grid' },
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Name', 'Nombre')), el('input', { class: 'inp', value: draft.name, placeholder: L('e.g. Robotics Club', 'p. ej. Club de Robótica'), oninput: (e) => (draft.name = e.target.value) })),
      el('div', { class: 'two-col' },
        el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Type', 'Tipo')), typeSel),
        el('label', { class: 'field' }, el('span', { class: 'fl' }, L('School', 'Escuela')), schoolSel)),
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Leaders (staff)', 'Líderes')), el('input', { class: 'inp', placeholder: L('Search staff…', 'Buscar personal…'), oninput: (e) => renderResults(e.target.value) }), results),
      el('p', { class: 'muted tiny' }, L('School-wide membership syncs from the roster; class/club rosters are managed here.', 'La membresía escolar se sincroniza del listado.'))),
    actions: [
      btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(existing ? L('Save', 'Guardar') : L('Create group', 'Crear grupo'), { kind: 'primary', iconName: 'check', onclick: async () => {
        if (!draft.name.trim()) return toast(L('Name the group', 'Nombra el grupo'));
        await act(existing ? 'updateGroup' : 'createGroup', draft);
        m.close(); toast(existing ? L('Group saved', 'Grupo guardado') : L('Group created', 'Grupo creado'));
      } }),
    ],
  });
}

// ===========================================================================
// AUTOMATION EDITOR
// ===========================================================================
function automationEditor(existing) {
  const auds = [...(S.db.groups || []).map((g) => g.name), ...smartLists().map((s) => `${s.icon} ${s.label}`)];
  const draft = existing
    ? { id: existing.id, name: existing.name, trigger: existing.trigger, audienceDesc: existing.audienceDesc, channels: [...(existing.channels || ['app'])], active: existing.active !== false }
    : { name: '', trigger: '', audienceDesc: auds[0] || '', channels: ['app'], active: true };

  const chanRow = el('div', { class: 'chk-row' }, ...CHANNELS.map(([c, lbl]) => {
    const b = el('button', { class: 'toggle-chip' + (draft.channels.includes(c) ? ' on' : ''), onclick: () => { draft.channels = draft.channels.includes(c) ? draft.channels.filter((x) => x !== c) : [...draft.channels, c]; b.classList.toggle('on'); } }, lbl);
    return b;
  }));
  const audSel = el('select', { class: 'inp', onchange: (e) => (draft.audienceDesc = e.target.value) }, ...auds.map((a) => el('option', { value: a, selected: a === draft.audienceDesc }, a)));

  const m = modal({
    title: existing ? L('Edit Automation', 'Editar automatización') : L('New Automation', 'Nueva automatización'),
    subtitle: L('Rule-based outreach that runs itself — no spreadsheets', 'Comunicación automática por reglas'), wide: true,
    body: el('div', { class: 'form-grid' },
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Name', 'Nombre')), el('input', { class: 'inp', value: draft.name, placeholder: L('e.g. New Family Welcome Series', 'p. ej. Serie de bienvenida'), oninput: (e) => (draft.name = e.target.value) })),
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('When (trigger)', 'Cuando (disparador)')), el('input', { class: 'inp', value: draft.trigger, placeholder: L('e.g. Scholar added in eSD', 'p. ej. Estudiante añadido en eSD'), oninput: (e) => (draft.trigger = e.target.value) })),
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Audience', 'Audiencia')), audSel),
      el('label', { class: 'field' }, el('span', { class: 'fl' }, L('Send via', 'Enviar por')), chanRow)),
    actions: [
      btn(L('Cancel', 'Cancelar'), { kind: 'ghost', onclick: () => m.close() }),
      btn(L('Save', 'Guardar'), { kind: 'primary', iconName: 'check', onclick: async () => {
        if (!draft.name.trim()) return toast(L('Name the automation', 'Nombra la automatización'));
        await act('saveAutomation', { auto: draft });
        m.close(); toast(L('Automation saved', 'Automatización guardada'));
      } }),
    ],
  });
}

// ===========================================================================
// THE CONFIGURE HUB
// ===========================================================================
const sectionHead = (title, action) => el('div', { class: 'rep-head', style: { marginTop: '6px' } }, el('h3', { class: 'sec-h', style: { margin: '0' } }, title), action);
const rowActions = (...kids) => el('div', { class: 'mod-actions' }, ...kids.filter(Boolean));

export function renderConfig(main) {
  main.appendChild(pageHead(L('Configure', 'Configurar'), L('Smart lists, groups & automations — the structure behind your comms', 'Listas, grupos y automatizaciones')));

  // ---- Smart Lists ----
  main.appendChild(sectionHead(L('Smart Lists', 'Listas inteligentes'), btn(L('New list', 'Nueva lista'), { kind: 'primary', small: true, iconName: 'plus', onclick: () => smartListBuilder() })));
  main.appendChild(el('div', { class: 'stack' }, ...smartLists().map((s) => el('div', { class: 'card' },
    el('div', { class: 'su-head' },
      el('span', { class: 'su-emoji' }, s.icon),
      el('div', { style: { flex: 1, minWidth: 0 } }, el('strong', {}, s.label),
        el('div', { class: 'muted tiny' }, (s.rules || []).map(ruleSummary).join(s.logic === 'any' ? '  ·  OR  ·  ' : '  ·  AND  ·  '))),
      el('span', {}, badge(`${s.count.toLocaleString()} ${L('families', 'familias')}`, 'cat'))),
    rowActions(
      s.builtin ? el('span', { class: 'muted tiny', style: { alignSelf: 'center' } }, L('Built-in', 'Predefinida')) : btn(L('Edit', 'Editar'), { small: true, kind: 'ghost', onclick: () => smartListBuilder(s) }),
      s.builtin ? null : btn(L('Delete', 'Eliminar'), { small: true, kind: 'ghost', onclick: async () => { if (confirm(L('Delete this smart list?', '¿Eliminar esta lista?'))) { await act('deleteSmartList', { id: s.id }); toast(L('Deleted', 'Eliminada')); } } }))))));

  // ---- Groups ----
  main.appendChild(sectionHead(L('Groups', 'Grupos'), btn(L('New group', 'Nuevo grupo'), { kind: 'primary', small: true, iconName: 'plus', onclick: () => groupEditor() })));
  main.appendChild(el('div', { class: 'stack' }, ...(S.db.groups || []).map((g) => el('div', { class: 'card' },
    el('div', { class: 'su-head' },
      el('span', { class: 'su-emoji' }, GROUP_ICON[g.type] || '👥'),
      el('div', { style: { flex: 1, minWidth: 0 } }, el('strong', {}, g.name),
        el('div', { class: 'muted tiny' }, `${(g.memberIds || []).length.toLocaleString()} ${L('families', 'familias')} · ${schoolById(g.schoolId)?.short || L('Network', 'Red')}`)),
      el('span', {}, badge(g.type, 'cat'))),
    rowActions(
      btn(L('Edit', 'Editar'), { small: true, kind: 'ghost', onclick: () => groupEditor(g) }),
      btn(L('Delete', 'Eliminar'), { small: true, kind: 'ghost', onclick: async () => { if (confirm(L('Delete this group?', '¿Eliminar este grupo?'))) { await act('deleteGroup', { id: g.id }); toast(L('Deleted', 'Eliminado')); } } }))))));

  // ---- Automations ----
  main.appendChild(sectionHead(L('Automations', 'Automatizaciones'), btn(L('New automation', 'Nueva automatización'), { kind: 'primary', small: true, iconName: 'plus', onclick: () => automationEditor() })));
  main.appendChild(el('div', { class: 'stack' }, ...(S.db.automations || []).map((a) => el('div', { class: 'card auto-card' + (a.active ? '' : ' off') },
    el('div', { class: 'auto-head' },
      el('div', { style: { flex: 1, minWidth: 0 } }, el('h3', {}, a.name), el('div', { class: 'muted tiny' }, `${a.trigger || L('Triggered', 'Activado')} · → ${a.audienceDesc || ''}`)),
      el('button', { class: 'switch' + (a.active ? ' on' : ''), onclick: () => act('toggleAutomation', { autoId: a.id }) }, el('span', { class: 'knob' }))),
    rowActions(
      btn(L('Edit', 'Editar'), { small: true, kind: 'ghost', onclick: () => automationEditor(a) }),
      btn(L('Delete', 'Eliminar'), { small: true, kind: 'ghost', onclick: async () => { if (confirm(L('Delete this automation?', '¿Eliminar?'))) { await act('deleteAutomation', { id: a.id }); toast(L('Deleted', 'Eliminada')); } } }))))));
}
