/* ============================================================================
 * e2e-test.js — in-app end-to-end flow tests.
 * Loaded on demand:  const { runAll } = await import('./js/e2e-test.js'); await runAll();
 * Drives the real app through the same act() pipeline the UI uses, creates data,
 * and asserts on state + rendered DOM. Resets the on-device store before & after.
 * ==========================================================================*/
import * as C from './core.js';

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail: cond ? '' : detail });
const tick = () => Promise.resolve(); // microtask — render() is synchronous; setTimeout is throttled in bg tabs
// the home feed is the one view that renders a "Loading…" placeholder synchronously, then
// fills in real posts once its scoped, paginated fetch (C.feedPage) resolves — a single
// microtask tick() isn't enough to wait for that. Poll (bounded) instead of guessing a delay.
const waitFor = async (cond, timeout = 500, interval = 20) => {
  const start = Date.now();
  while (!cond() && Date.now() - start < timeout) await new Promise((r) => setTimeout(r, interval));
  return cond();
};
const db = () => C.S.db;
const post = (id) => db().posts.find((p) => p.id === id);
const su = (id) => db().signups.find((s) => s.id === id);
const form = (id) => db().forms.find((f) => f.id === id);
const evt = (id) => db().events.find((e) => e.id === id);
const fee = (id) => db().fees.find((f) => f.id === id);
const doc = (id) => (db().documents || []).find((d) => d.id === id);
const slotByLabel = (suId, m) => su(suId).slots.find((s) => m.test(s.label));
const claims = (slot) => slot.claims || (slot.claimedBy || []).map((u) => ({ userId: u }));

// ---- persona checks: Poulomi Banerjee (added as the default network-leadership persona) ---
async function personaChecks() {
  // must run before any setPersona() call in the suite — asserts the app's real boot() default,
  // which the suite itself restores at the end of every run (see runAll), so this holds on repeat runs too.
  ok('default persona on load is Poulomi Banerjee', C.S.me === 'usr_poulomi', `S.me was ${C.S.me}`);

  const persona = db().personas.find((p) => p.userId === 'usr_poulomi');
  ok('Poulomi Banerjee listed in the persona switcher', persona?.label === 'Poulomi Banerjee' && persona?.role === 'admin');

  C.setPersona('usr_poulomi');
  C.navigate('dashboard'); await tick();
  const main = document.querySelector('.main');
  ok('Poulomi Banerjee renders the admin dashboard', main && main.children.length > 0 && !document.querySelector('.main .error'));
  ok('top bar shows Poulomi Banerjee\'s name', document.body.textContent.includes('Poulomi Banerjee'));
}

// ---- data-flow tests: exercise every mutation through act() -----------------
async function dataFlows() {
  // posts: react / comment / pin / create (+scheduled)
  await C.act('react', { postId: 'post_movingup', userId: 'usr_priya', emoji: '❤️' });
  ok('react adds reaction', (post('post_movingup').reactions['❤️'] || []).includes('usr_priya'));
  await C.act('react', { postId: 'post_movingup', userId: 'usr_priya', emoji: '👍' });
  ok('react is one-per-user (switches)', !(post('post_movingup').reactions['❤️'] || []).includes('usr_priya') && (post('post_movingup').reactions['👍'] || []).includes('usr_priya'));
  await C.act('comment', { postId: 'post_movingup', userId: 'usr_priya', body: 'Test comment' });
  ok('comment appends', post('post_movingup').comments.some((c) => c.body === 'Test comment'));
  const pinned0 = post('post_readathon').pinned;
  await C.act('togglePin', { postId: 'post_readathon' });
  ok('togglePin flips', post('post_readathon').pinned === !pinned0);
  const nPosts = db().posts.length;
  await C.act('createPost', { authorId: 'usr_marcus', audience: { type: 'class', id: 'grp_cornell', label: 'Cornell', schoolId: 'sch_hw' }, title: 'E2E New Post', body: 'Hi {{scholar_first}}!', category: 'Classroom', channels: ['app'] });
  ok('createPost prepends', db().posts.length === nPosts + 1 && db().posts[0].title === 'E2E New Post');
  await C.act('createPost', { authorId: 'usr_marcus', audience: { type: 'class', id: 'grp_cornell', label: 'Cornell', schoolId: 'sch_hw' }, title: 'E2E Scheduled', body: 'later', channels: ['app'], scheduledFor: new Date(Date.now() + 864e5).toISOString() });
  ok('createPost stores schedule', !!db().posts.find((p) => p.title === 'E2E Scheduled').scheduledFor);

  // messaging
  const conv = db().conversations.find((c) => c.id === 'conv_priya_marcus');
  const nMsg = conv.messages.length;
  await C.act('sendMessage', { conversationId: 'conv_priya_marcus', senderId: 'usr_priya', body: 'E2E hello', lang: 'en' });
  ok('sendMessage appends', db().conversations.find((c) => c.id === 'conv_priya_marcus').messages.length === nMsg + 1);
  await C.act('markRead', { conversationId: 'conv_priya_marcus', userId: 'usr_priya' });
  ok('markRead clears unread', db().conversations.find((c) => c.id === 'conv_priya_marcus').messages.every((m) => m.senderId === 'usr_priya' || m.read));
  const r = await C.act('startConversation', { participantIds: ['usr_priya', 'usr_marcus', 'usr_james'], senderId: 'usr_priya', subject: 'E2E group', body: 'hey all' });
  ok('startConversation creates group', !!r.result && db().conversations.find((c) => c.id === r.result)?.type === 'group');

  // sign-ups: conference (scholar+note), capacity guard, unclaim, item qty clamp, add-someone
  const cs = slotByLabel('su_conf', /3:45/);
  await C.act('claimSlot', { signupId: 'su_conf', slotId: cs.id, userId: 'usr_priya', studentId: 'stu_aanya', note: 'interpreter' });
  let s = slotByLabel('su_conf', /3:45/);
  ok('claimSlot stores scholar+note', claims(s).some((c) => c.userId === 'usr_priya' && c.studentId === 'stu_aanya' && c.note === 'interpreter'));
  await C.act('claimSlot', { signupId: 'su_conf', slotId: cs.id, userId: 'usr_james' });
  ok('claimSlot capacity guard', !claims(slotByLabel('su_conf', /3:45/)).some((c) => c.userId === 'usr_james'));
  await C.act('unclaimSlot', { signupId: 'su_conf', slotId: cs.id, userId: 'usr_priya' });
  ok('unclaimSlot releases', !claims(slotByLabel('su_conf', /3:45/)).some((c) => c.userId === 'usr_priya'));
  const juice = slotByLabel('su_snacks', /Juice/);
  await C.act('claimSlot', { signupId: 'su_snacks', slotId: juice.id, userId: 'usr_priya', qty: 9 });
  ok('item claim clamps qty to capacity', claims(slotByLabel('su_snacks', /Juice/)).find((c) => c.userId === 'usr_priya')?.qty === 2);
  const open = slotByLabel('su_fieldday', /Cleanup/);
  await C.act('claimSlot', { signupId: 'su_fieldday', slotId: open.id, userId: 'usr_carmen', addedBy: 'usr_marcus' });
  ok('add-someone records addedBy', claims(slotByLabel('su_fieldday', /Cleanup/)).find((c) => c.userId === 'usr_carmen')?.addedBy === 'usr_marcus');
  const nSu = db().signups.length;
  await C.act('createSignup', { authorId: 'usr_marcus', audience: { type: 'class', id: 'grp_cornell', label: 'Cornell' }, type: 'conference', title: 'E2E Conf', slots: [{ label: 'Mon 3:00 PM', capacity: 1 }, { label: 'Mon 3:15 PM', capacity: 1 }] });
  ok('createSignup builds slots', db().signups.length === nSu + 1 && db().signups[0].slots.length === 2 && db().signups[0].slots[0].claims.length === 0);

  // forms: submit + create
  await C.act('submitForm', { formId: 'form_amnh', userId: 'usr_priya', studentId: 'stu_aanya', values: { f1: 'Aanya Sharma', f2: true, f3: '(917) 555-0000', f5: 'Bringing bagged lunch' }, signature: 'Priya Sharma' });
  ok('submitForm records response', form('form_amnh').responses.some((x) => x.userId === 'usr_priya' && x.signature === 'Priya Sharma'));
  const nForms = db().forms.length;
  await C.act('createForm', { authorId: 'usr_marcus', audience: { type: 'class', id: 'grp_cornell', label: 'Cornell' }, type: 'permission', title: 'E2E Form', requiresSignature: true, fields: [{ label: 'Scholar', type: 'text', required: true }, { label: 'Pick', type: 'radio', required: true, options: ['A', 'B'] }] });
  ok('createForm builds fields w/ radio options', db().forms.length === nForms + 1 && JSON.stringify(db().forms[0].fields[1].options) === JSON.stringify(['A', 'B']));

  // calendar: rsvp + create + check-in
  await C.act('rsvp', { eventId: 'evt_conf', userId: 'usr_priya', status: 'maybe' });
  ok('rsvp records', evt('evt_conf').rsvps.maybe.includes('usr_priya'));
  await C.act('rsvp', { eventId: 'evt_conf', userId: 'usr_priya', status: 'yes' });
  ok('rsvp moves (one status)', evt('evt_conf').rsvps.yes.includes('usr_priya') && !evt('evt_conf').rsvps.maybe.includes('usr_priya'));
  const nEvt = db().events.length;
  await C.act('addEvent', { authorId: 'usr_marcus', audience: { type: 'class', id: 'grp_cornell', label: 'Cornell', schoolId: 'sch_hw' }, title: 'E2E Event', date: '2026-06-30T12:00:00', start: '5:00 PM', category: 'Classroom' });
  ok('addEvent creates w/ empty rsvps', db().events.length === nEvt + 1 && db().events.find((e) => e.title === 'E2E Event').rsvps.yes.length === 0);
  await C.act('eventCheckIn', { eventId: 'evt_conf', userId: 'usr_james' });
  ok('eventCheckIn records', (evt('evt_conf').attended || []).includes('usr_james'));

  // payments + documents
  await C.act('payFee', { feeId: 'fee_amnh_aanya' });
  ok('payFee marks paid', fee('fee_amnh_aanya').status === 'paid');
  await C.act('ackDocument', { docId: 'doc_rc_aanya', userId: 'usr_priya' });
  ok('ackDocument records receipt', doc('doc_rc_aanya').acknowledgedBy.includes('usr_priya'));

  // attendance rules, automations, integrations
  const rule0 = db().attendanceRules.find((x) => x.id === 'ar_uniform').active;
  await C.act('toggleRule', { ruleId: 'ar_uniform' });
  ok('toggleRule flips', db().attendanceRules.find((x) => x.id === 'ar_uniform').active === !rule0);
  const auto0 = db().automations.find((a) => a.id === 'auto_conf').active;
  await C.act('toggleAutomation', { autoId: 'auto_conf' });
  ok('toggleAutomation flips', db().automations.find((a) => a.id === 'auto_conf').active === !auto0);
  const sync0 = db().integrations.find((i) => i.id === 'int_sf').lastSync;
  await C.act('syncIntegration', { intId: 'int_sf' });
  ok('syncIntegration updates lastSync', db().integrations.find((i) => i.id === 'int_sf').lastSync !== sync0);

  // alerts: targeted + scheduled
  await C.act('sendAlert', { authorId: 'usr_dana', audience: { type: 'smart', id: 'sl_spanish', label: 'Spanish' }, title: 'E2E Targeted', body: 'Hola {{scholar_first}}', severity: 'info', channels: ['sms'], recipients: 204 });
  ok('sendAlert honors recipient count', db().alerts[0].title === 'E2E Targeted' && db().alerts[0].delivery.recipients === 204);
  await C.act('sendAlert', { authorId: 'usr_dana', audience: { type: 'school', id: 'grp_school_sch_hw', label: 'Harlem 1' }, title: 'E2E Scheduled Alert', body: 'soon', severity: 'urgent', channels: ['app'], recipients: 10, scheduledFor: new Date(Date.now() + 864e5).toISOString() });
  ok('scheduled alert has 0 opened (not sent)', db().alerts[0].title === 'E2E Scheduled Alert' && db().alerts[0].delivery.opened === 0);

  // moderation + prefs
  await C.act('moderate', { modId: 'mod_1', action: 'approved' });
  ok('moderate sets status', db().moderation.find((m) => m.id === 'mod_1').status === 'approved');
  await C.act('savePrefs', { userId: 'usr_priya', prefs: { digest: 'daily' } });
  ok('savePrefs persists', db().prefs['usr_priya'].digest === 'daily');

  // smart-list resolution + merge + engagement helpers
  ok('smartLists resolve to live counts', C.smartLists().find((s2) => s2.id === 'sl_spanish').count > 0);
  ok('applyMerge personalizes for parent', C.applyMerge('Hi {{scholar_first}}', C.userById('usr_priya')).includes('Aanya'));
  ok('engagementOf returns a level', ['Low', 'Medium', 'High'].includes(C.engagementOf('usr_priya').level));
  ok('audienceCount works for smart list', C.audienceCount({ type: 'smart', id: 'sl_unverified' }) > 0);
  ok('at-risk smart list resolves from attendance', C.audienceCount({ type: 'smart', id: 'sl_atrisk' }) >= 1);

  // message auto-translation EN→ES for a Spanish-reading parent
  C.setLang('es');
  const fromMarcus = db().conversations.find((c) => c.id === 'conv_carmen_marcus').messages.find((m) => m.senderId === 'usr_marcus');
  const t = C.txMsg(fromMarcus);
  ok('message auto-translates EN→ES for reader', t.translated && /[áéíóúñ¡]/i.test(t.text));
  C.setLang('en');

  // scheduled post is hidden from families until its time (author = marcus, audience = Cornell incl. Aanya)
  C.setPersona('usr_priya');
  ok('scheduled post hidden from families', !C.visiblePosts().some((p) => p.title === 'E2E Scheduled'));
  C.setPersona('usr_marcus');
  ok('scheduled post visible to its author', C.visiblePosts().some((p) => p.title === 'E2E Scheduled'));
}

// ---- render tests: every view, every persona, renders without error ---------
const VIEWS = {
  admin: ['dashboard', 'reports', 'home', 'alerts', 'automations', 'moderation', 'messages', 'signups', 'forms', 'documents', 'calendar', 'attendance', 'integrations', 'directory', 'settings'],
  teacher: ['home', 'messages', 'signups', 'forms', 'documents', 'calendar', 'directory', 'settings'],
  parent: ['home', 'messages', 'signups', 'forms', 'documents', 'calendar', 'payments', 'attendance', 'directory', 'alerts', 'settings'],
};
async function renderSweep() {
  for (const p of db().personas) {
    C.setPersona(p.userId);
    for (const v of VIEWS[p.role] || VIEWS.parent) {
      C.navigate(v); await tick();
      const main = document.querySelector('.main');
      const errored = !!document.querySelector('.main .error');
      ok(`render ${p.label} / ${v}`, main && main.children.length > 0 && !errored, errored ? 'view threw' : 'empty');
    }
  }
  // create→render: created items actually show in their views
  C.setPersona('usr_marcus');
  C.navigate('calendar'); await tick();
  ok('created event renders in calendar', [...document.querySelectorAll('.event h3')].some((h) => /E2E Event/.test(h.textContent)));
  C.navigate('signups'); await tick();
  ok('created sign-up renders in list', [...document.querySelectorAll('.signup h3')].some((h) => /E2E Conf/.test(h.textContent)));
  C.navigate('forms'); await tick();
  ok('created form renders in list', [...document.querySelectorAll('.form h3')].some((h) => /E2E Form/.test(h.textContent)));
  C.navigate('home');
  const postRendered = await waitFor(() => [...document.querySelectorAll('.post-title')].some((h) => /E2E New Post/.test(h.textContent)));
  ok('created post renders in feed', postRendered);
  // child-specific filter narrows for multi-child parent
  C.setPersona('usr_priya'); C.navigate('home');
  await waitFor(() => document.querySelector('.post'));
  const allN = document.querySelectorAll('.post').length;
  C.navigate('home', { feedChild: 'stu_rohan' });
  await waitFor(() => document.querySelector('.post'));
  const rohanN = document.querySelectorAll('.post').length;
  ok('child filter narrows feed', rohanN <= allN);
  // ES translation — nav labels render synchronously with the shell, no feed wait needed
  C.setPersona('usr_carmen'); C.setLang('es'); C.navigate('home'); await tick();
  ok('ES translation renders Spanish nav', [...document.querySelectorAll('.ni-label')].some((e) => /Inicio|Mensajes/.test(e.textContent)));
  C.setLang('en');
}

export async function runAll() {
  results.length = 0;
  try { await personaChecks(); } catch (e) { ok('personaChecks crashed', false, String(e && e.stack || e)); }
  await C.resetDb(); await tick();
  try { await dataFlows(); } catch (e) { ok('dataFlows crashed', false, String(e && e.stack || e)); }
  try { await renderSweep(); } catch (e) { ok('renderSweep crashed', false, String(e && e.stack || e)); }
  await C.resetDb(); await tick();
  C.setPersona('usr_poulomi');
  const failed = results.filter((r) => !r.pass);
  return { total: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed };
}
