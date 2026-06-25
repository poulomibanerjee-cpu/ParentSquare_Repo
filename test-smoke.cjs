/* ============================================================================
 * test-smoke.cjs — backend integration smoke test
 * Exercises every /api/mutate op against the live server and verifies the
 * resulting state change. Start the server first:  node server.cjs
 * Run:  node test-smoke.cjs
 * ==========================================================================*/
const BASE = process.env.BASE || 'http://localhost:4310';
const state = async () => (await fetch(`${BASE}/api/state`)).json();
const mutate = async (op, payload) => (await fetch(`${BASE}/api/mutate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, payload }) })).json();
const reset = async () => (await fetch(`${BASE}/api/reset`, { method: 'POST' })).json();

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

(async () => {
  console.log(`\n🧪 Success Academy — Family Connect · API smoke test → ${BASE}\n`);
  try { await state(); } catch { console.error('✗ Server not reachable. Start it with: node server.cjs'); process.exit(1); }

  await reset();
  let db = await state();
  const find = (arr, id) => arr.find((x) => x.id === id);

  // 1. react (one-per-user)
  await mutate('react', { postId: 'post_movingup', userId: 'usr_priya', emoji: '🎉' });
  db = await state();
  ok('react adds reaction', (find(db.posts, 'post_movingup').reactions['🎉'] || []).includes('usr_priya'));
  await mutate('react', { postId: 'post_movingup', userId: 'usr_priya', emoji: '👍' });
  db = await state();
  ok('react is one-per-user (switch)', !(find(db.posts, 'post_movingup').reactions['🎉'] || []).includes('usr_priya') && (find(db.posts, 'post_movingup').reactions['👍'] || []).includes('usr_priya'));

  // 2. comment
  const before = find(db.posts, 'post_chess').comments.length;
  await mutate('comment', { postId: 'post_chess', userId: 'usr_priya', body: 'Go team!' });
  db = await state();
  ok('comment appends', find(db.posts, 'post_chess').comments.length === before + 1);

  // 3. createPost + togglePin
  const r = await mutate('createPost', { authorId: 'usr_marcus', audience: { type: 'class', id: 'grp_cornell', label: 'Cornell — 3rd Grade' }, title: 'Test post', body: 'hi', category: 'Classroom', channels: ['app'] });
  db = await state();
  const np = db.posts.find((p) => p.title === 'Test post');
  ok('createPost adds post', !!np);
  await mutate('togglePin', { postId: np.id });
  db = await state();
  ok('togglePin pins', db.posts.find((p) => p.id === np.id).pinned === true);

  // 4. messaging
  const c0 = find((await state()).conversations, 'conv_priya_marcus').messages.length;
  await mutate('sendMessage', { conversationId: 'conv_priya_marcus', senderId: 'usr_priya', body: 'test msg', lang: 'en' });
  db = await state();
  ok('sendMessage appends', find(db.conversations, 'conv_priya_marcus').messages.length === c0 + 1);
  await mutate('markRead', { conversationId: 'conv_priya_marcus', userId: 'usr_priya' });
  db = await state();
  ok('markRead clears others’ unread', find(db.conversations, 'conv_priya_marcus').messages.filter((m) => m.senderId !== 'usr_priya' && !m.read).length === 0);
  const sc = await mutate('startConversation', { participantIds: ['usr_priya', 'usr_lena'], senderId: 'usr_priya', body: 'hello', subject: 'Q' });
  ok('startConversation returns id', typeof sc.result === 'string', sc.result);

  // 5. sign-ups (claim w/ scholar + note → full guard → unclaim → item qty)
  const confSlot = find((await state()).signups, 'su_conf').slots.find((s) => s.label.includes('3:45'));
  await mutate('claimSlot', { signupId: 'su_conf', slotId: confSlot.id, userId: 'usr_priya', studentId: 'stu_aanya', note: 'Need a Spanish interpreter' });
  db = await state();
  const pClaim = find(db.signups, 'su_conf').slots.find((s) => s.id === confSlot.id).claims.find((c) => c.userId === 'usr_priya');
  ok('claimSlot stores scholar + note', !!pClaim && pClaim.studentId === 'stu_aanya' && pClaim.note === 'Need a Spanish interpreter');
  await mutate('claimSlot', { signupId: 'su_conf', slotId: confSlot.id, userId: 'usr_james' });
  db = await state();
  ok('claimSlot respects capacity (full)', !find(db.signups, 'su_conf').slots.find((s) => s.id === confSlot.id).claims.some((c) => c.userId === 'usr_james'));
  await mutate('unclaimSlot', { signupId: 'su_conf', slotId: confSlot.id, userId: 'usr_priya' });
  db = await state();
  ok('unclaimSlot releases', !find(db.signups, 'su_conf').slots.find((s) => s.id === confSlot.id).claims.some((c) => c.userId === 'usr_priya'));
  const itemSlot = find((await state()).signups, 'su_snacks').slots.find((s) => /Juice/.test(s.label));
  await mutate('claimSlot', { signupId: 'su_snacks', slotId: itemSlot.id, userId: 'usr_priya', qty: 5 });
  db = await state();
  const iClaim = find(db.signups, 'su_snacks').slots.find((s) => s.id === itemSlot.id).claims.find((c) => c.userId === 'usr_priya');
  ok('item claim clamps qty to capacity (2)', !!iClaim && iClaim.qty === 2);

  // 6. forms (submit w/ signature)
  await mutate('submitForm', { formId: 'form_photo', userId: 'usr_priya', studentId: 'stu_aanya', values: { f1: 'Aanya Sharma', f2: 'I grant permission' }, signature: 'Priya Sharma' });
  db = await state();
  ok('submitForm records signed response', find(db.forms, 'form_photo').responses.some((x) => x.userId === 'usr_priya' && x.signature === 'Priya Sharma'));

  // 7. rsvp
  await mutate('rsvp', { eventId: 'evt_booktasting', userId: 'usr_james', status: 'yes' });
  db = await state();
  ok('rsvp records yes', find(db.events, 'evt_booktasting').rsvps.yes.includes('usr_james'));

  // 8. alerts (send → delivery stats)
  const a0 = (await state()).alerts.length;
  const al = await mutate('sendAlert', { authorId: 'usr_dana', audience: { type: 'school', id: 'grp_school', label: 'Harlem 1' }, title: 'Test Alert', body: 'x', severity: 'urgent', channels: ['sms', 'app'], smartAlert: true });
  db = await state();
  ok('sendAlert prepends alert', db.alerts.length === a0 + 1 && db.alerts[0].title === 'Test Alert');
  ok('sendAlert computes delivery stats', db.alerts[0].delivery && db.alerts[0].delivery.recipients > 0);

  // 9. attendance rule toggle
  const r0 = find((await state()).attendanceRules, 'ar_uniform').active;
  await mutate('toggleRule', { ruleId: 'ar_uniform' });
  db = await state();
  ok('toggleRule flips active', find(db.attendanceRules, 'ar_uniform').active === !r0);

  // 10. fees (pay)
  await mutate('payFee', { feeId: 'fee_amnh_aanya' });
  db = await state();
  ok('payFee marks paid', find(db.fees, 'fee_amnh_aanya').status === 'paid');

  // 11. documents (acknowledge)
  await mutate('ackDocument', { docId: 'doc_rc_aanya', userId: 'usr_priya' });
  db = await state();
  ok('ackDocument records receipt', (find(db.documents, 'doc_rc_aanya').acknowledgedBy || []).includes('usr_priya'));

  // 12. moderation
  await mutate('moderate', { modId: 'mod_1', action: 'blocked' });
  db = await state();
  ok('moderate sets status', find(db.moderation, 'mod_1').status === 'blocked');

  // 13. prefs
  await mutate('savePrefs', { userId: 'usr_priya', prefs: { digest: 'daily' } });
  db = await state();
  ok('savePrefs persists', db.prefs['usr_priya'].digest === 'daily');

  // 14. staff creation flows
  const ev0 = (await state()).events.length;
  await mutate('addEvent', { authorId: 'usr_marcus', audience: { type: 'class', id: 'grp_cornell', label: 'Cornell', schoolId: 'sch_hw' }, title: 'Test Event', date: '2026-06-30T12:00:00', start: '9:00 AM', category: 'Meeting' });
  db = await state();
  ok('addEvent creates event w/ empty RSVPs', db.events.length === ev0 + 1 && db.events.some((e) => e.title === 'Test Event' && e.rsvps && e.rsvps.yes.length === 0));
  const su0 = (await state()).signups.length;
  const suRes = await mutate('createSignup', { authorId: 'usr_marcus', audience: { type: 'class', id: 'grp_cornell', label: 'Cornell' }, type: 'conference', title: 'Test Conf', slots: [{ label: 'Mon 3:00 PM', capacity: 1 }, { label: 'Mon 3:15 PM', capacity: 2 }] });
  db = await state();
  const newSu = db.signups.find((s) => s.title === 'Test Conf');
  ok('createSignup creates w/ slots + ids + empty claims', db.signups.length === su0 + 1 && newSu && newSu.slots.length === 2 && newSu.slots[0].id && newSu.slots[0].claims.length === 0);
  const fm0 = (await state()).forms.length;
  await mutate('createForm', { authorId: 'usr_marcus', audience: { type: 'class', id: 'grp_cornell', label: 'Cornell' }, type: 'permission', title: 'Test Permission', requiresSignature: true, fields: [{ label: 'Scholar Name', type: 'text', required: true }, { label: 'Choice', type: 'radio', required: true, options: ['A', 'B'] }] });
  db = await state();
  const newFm = db.forms.find((x) => x.title === 'Test Permission');
  ok('createForm builds fields (radio options preserved)', db.forms.length === fm0 + 1 && newFm && newFm.requiresSignature === true && newFm.fields.length === 2 && JSON.stringify(newFm.fields[1].options) === JSON.stringify(['A', 'B']));

  // 15. pain-point ops: automations, integrations, event check-in, targeted alert
  const auto0 = (await state()).automations.find((a) => a.id === 'auto_conf').active;
  await mutate('toggleAutomation', { autoId: 'auto_conf' });
  db = await state();
  ok('toggleAutomation flips active', db.automations.find((a) => a.id === 'auto_conf').active === !auto0);
  const sync0 = (await state()).integrations.find((i) => i.id === 'int_sf').lastSync;
  await mutate('syncIntegration', { intId: 'int_sf' });
  db = await state();
  ok('syncIntegration updates lastSync', db.integrations.find((i) => i.id === 'int_sf').lastSync !== sync0);
  await mutate('eventCheckIn', { eventId: 'evt_conf', userId: 'usr_james' });
  db = await state();
  ok('eventCheckIn records attendance', (db.events.find((e) => e.id === 'evt_conf').attended || []).includes('usr_james'));
  await mutate('sendAlert', { authorId: 'usr_dana', audience: { type: 'smart', id: 'sl_spanish', label: 'Spanish' }, title: 'Targeted test', body: 'Hola {{scholar_first}}', severity: 'info', channels: ['sms'], recipients: 173, scheduledFor: '' });
  db = await state();
  ok('sendAlert honors smart-list recipient count', (db.alerts[0].delivery.recipients) === 173 && db.alerts[0].title === 'Targeted test');

  // 16. unknown op rejected
  const bad = await mutate('nopeNotARealOp', {});
  ok('unknown op rejected', !!bad.error);

  // restore clean state
  await reset();
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed.  (demo data reset)\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
