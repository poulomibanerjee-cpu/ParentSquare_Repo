/* ============================================================================
 * seed-scale.cjs — generate a realistic LARGE Family Connect dataset into SQLite
 *   so the scoped queries + emergency fan-out can be tested at true scale.
 *   Same schema/indexes the app uses (db.cjs); writes via persistCollection /
 *   persistKv inside transactions so 100k seeds in well under a minute.
 *
 *   CLI:  node seed-scale.cjs [N] [outPath]
 *         defaults: N=100000   outPath=data/family-connect-100k.db
 *
 *   SAFETY: never writes the demo DB (data/family-connect.db) — defaults to a
 *   separate file and refuses an out path that resolves to the demo DB.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const DBL = require('./db.cjs');

// ---- CLI args -------------------------------------------------------------
const N = Math.max(1, parseInt(process.argv[2], 10) || 100000);
const OUT = process.argv[3] || 'data/family-connect-100k.db';
const SCHOOLS = 50;

// never clobber the live demo DB
const DEMO = path.resolve(__dirname, 'data/family-connect.db');
if (path.resolve(OUT) === DEMO) {
  console.error('Refusing to overwrite the demo DB (data/family-connect.db). Pick another outPath.');
  process.exit(1);
}

// ---- helpers --------------------------------------------------------------
const ms = (t0) => (Number(process.hrtime.bigint() - t0) / 1e6).toFixed(0);
const pick = (a, i) => a[i % a.length];                       // deterministic, fast
const rnd = (n) => Math.floor(Math.random() * n);
const ISO = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

const FIRST = ['Aanya', 'Mateo', 'Liam', 'Sofia', 'Noah', 'Maya', 'Ethan', 'Zoe', 'Lucas', 'Ava', 'Ravi', 'Carmen', 'Jamal', 'Priya', 'Diego', 'Nina', 'Omar', 'Leila', 'Marcus', 'Yuki', 'Grace', 'Andre', 'Isla', 'Kofi', 'Rosa', 'Dev', 'Amara', 'Theo', 'Lena', 'Hugo'];
const LAST = ['Smith', 'Garcia', 'Chen', 'Patel', 'Johnson', 'Nguyen', 'Williams', 'Lopez', 'Brown', 'Kim', 'Davis', 'Martinez', 'Okafor', 'Rossi', 'Cohen', 'Ali', 'Santos', 'Park', 'Reyes', 'Banks', 'Walsh', 'Diallo', 'Ivanov', 'Mwangi', 'Tan', 'Ortiz', 'Haddad', 'Novak', 'Singh', 'Flores'];
const COLORS = ['#E0521C', '#16335B', '#117A65', '#B5179E', '#B7791F', '#0969da', '#6e40c9', '#bf3989', '#1a7f37', '#bc4c00'];
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const COLLEGES = ['Cornell', 'Yale', 'Brown', 'Tufts', 'Rice', 'Duke', 'Emory', 'Smith', 'Bowdoin', 'Amherst', 'Vassar', 'Colgate', 'Hamilton', 'Tulane', 'Pomona'];
const CATEGORIES = ['Announcement', 'Classroom', 'Reminder', 'Event'];
const REACTIONS = ['👏', '🎉', '❤️', '👍', '🙌'];
const POST_TITLES = ['Spirit Week starts Monday! 🎒', 'Picture Day reminder 📸', 'Field trip permission slips due Friday', 'Parent-Teacher conferences open for sign-up', 'Early dismissal this Wednesday', 'Read-a-Thon kickoff 📚', 'Winter concert details 🎶', 'Uniform exchange this weekend', 'Math Olympiad results are in! 🧮', 'Volunteers needed for Field Day'];
const POST_BODIES = ['Quick reminder for our families — please check your child\'s folder tonight and reply with any questions. Thank you for your partnership!', 'A few logistics ahead of next week. Doors open at the usual time; scholars should arrive in full uniform. Details and sign-ups are linked below.', 'We are so proud of our scholars this month. Keep up the reading at home — every 20 minutes counts toward the class goal.', 'Please complete the attached form by the end of the week so we can finalize counts. Reach out if you need a paper copy.'];
const MSG_BODIES = ['Hi! Quick question about pickup today — is the schedule the same?', 'Thank you so much for the update!', 'Got it, see you then.', 'Can you share the form again? I can\'t find it.', 'Will do — appreciate the heads up.', 'My scholar is so excited about this. 🎉'];

console.log(`\n=== Family Connect — generating ${N.toLocaleString()} users into ${OUT} ===\n`);
const T0 = process.hrtime.bigint();

// fresh file (and stale WAL/SHM) so counts/size reflect exactly this run
for (const f of [OUT, OUT + '-wal', OUT + '-shm']) { try { fs.unlinkSync(f); } catch { /* */ } }
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
const db = DBL.open(OUT);

// ---- schools (sch_0 .. sch_49) -------------------------------------------
const LEVELS = ['Elementary', 'Middle', 'High'];
const schools = Array.from({ length: SCHOOLS }, (_, i) => ({
  id: 'sch_' + i,
  name: `Success Academy ${i + 1}`,
  short: `SA ${i + 1}`,
  level: pick(LEVELS, i),
  grades: GRADES,
  color: pick(COLORS, i),
  primary: i === 0,
}));
DBL.persistCollection(db, 'schools', schools);
console.log(`schools      : ${schools.length}`);

// ---- users (~92% parents, ~8% staff) -------------------------------------
// Pre-bucket parents + staff per school so groups/posts/students draw cheaply.
const parentsBySchool = Array.from({ length: SCHOOLS }, () => []);
const staffBySchool = Array.from({ length: SCHOOLS }, () => []);
const users = new Array(N);
for (let i = 0; i < N; i++) {
  const sIdx = i % SCHOOLS;
  const f = pick(FIRST, i), l = pick(LAST, i * 7 + 3);
  const isStaff = i % 12 === 0;                          // ~8% staff
  const role = isStaff ? (i % 24 === 0 ? 'admin' : 'teacher') : 'parent';
  const id = 'usr_' + i;
  const u = {
    id, role,
    firstName: f, lastName: l, name: `${f} ${l}`,
    email: `${f}.${l}.${i}`.toLowerCase() + (role === 'parent' ? '@gmail.com' : '@successacademies.org'), // unique via i
    avatar: (f[0] + l[0]).toUpperCase(),
    color: pick(COLORS, i * 3),
    language: i % 5 === 0 ? 'es' : 'en',                 // ~20% Spanish
    schoolId: 'sch_' + sIdx,
    title: role === 'parent' ? null : (role === 'admin' ? 'School Director' : 'Lead Teacher'),
    verified: i % 3 !== 0,                               // ~2/3 verified
  };
  users[i] = u;
  (role === 'parent' ? parentsBySchool : staffBySchool)[sIdx].push(u);
}
const tUsers = process.hrtime.bigint();
DBL.persistCollection(db, 'users', users);
console.log(`users        : ${users.length}  (insert ${ms(tUsers)} ms)  staff ~${users.filter((u) => u.role !== 'parent').length}`);

// ---- students (~1.3*N) + guardianMap / studentMap ------------------------
// Walk parents round-robin per school, giving each 1–3 kids in that school,
// until we reach the target. guardianMap: stu->[usr]; studentMap: usr->[stu].
const TARGET_STUDENTS = Math.round(1.3 * N);
const students = new Array(TARGET_STUDENTS);
const guardianMap = {};
const studentMap = {};
const studentsBySchool = Array.from({ length: SCHOOLS }, () => []);
let made = 0, cursor = Array(SCHOOLS).fill(0);
while (made < TARGET_STUDENTS) {
  const sIdx = made % SCHOOLS;
  const pool = parentsBySchool[sIdx];
  if (!pool.length) { // school with no parents (tiny N) — skip to avoid infinite loop
    if (cursor.every((c, k) => !parentsBySchool[k].length)) break;
    made++; continue;
  }
  const parent = pool[cursor[sIdx]++ % pool.length];
  const f = pick(FIRST, made * 2 + 1);
  const stu = {
    id: 'stu_' + made,
    firstName: f, lastName: parent.lastName, name: `${f} ${parent.lastName}`,
    grade: pick(GRADES, made), schoolId: parent.schoolId, color: parent.color,
  };
  students[made] = stu;
  studentsBySchool[sIdx].push(stu.id);
  guardianMap[stu.id] = [parent.id];
  (studentMap[parent.id] ||= []).push(stu.id);
  made++;
}
students.length = made;                                  // trim if we broke early
const tStu = process.hrtime.bigint();
DBL.persistCollection(db, 'students', students);
DBL.persistKv(db, 'guardianMap', guardianMap);
DBL.persistKv(db, 'studentMap', studentMap);
console.log(`students     : ${students.length}  (insert ${ms(tStu)} ms)  guardianMap ${Object.keys(guardianMap).length}  studentMap ${Object.keys(studentMap).length}`);

// ---- groups: one school group each + a few class groups per school -------
const groups = [];
const CLASSES_PER_SCHOOL = 4;
const CLASS_SIZE = 25;
for (let s = 0; s < SCHOOLS; s++) {
  const parents = parentsBySchool[s], staff = staffBySchool[s];
  const sid = 'sch_' + s;
  // whole-school group — every parent in the school is a member
  groups.push({
    id: 'grp_school_' + sid, type: 'school', name: `${schools[s].short} — All Families`,
    schoolId: sid, leadIds: staff.slice(0, 2).map((u) => u.id),
    memberIds: parents.map((p) => p.id), studentIds: studentsBySchool[s], color: schools[s].color,
  });
  // class groups — slices of the school's parents
  for (let c = 0; c < CLASSES_PER_SCHOOL && parents.length; c++) {
    const start = (c * CLASS_SIZE) % Math.max(1, parents.length);
    const slice = parents.slice(start, start + CLASS_SIZE);
    if (!slice.length) break;
    const lead = staff[c % Math.max(1, staff.length)];
    groups.push({
      id: `grp_${sid}_c${c}`, type: 'class',
      name: `${pick(COLLEGES, s * 4 + c)} — ${pick(GRADES, c)} Grade`,
      schoolId: sid, leadIds: lead ? [lead.id] : [],
      memberIds: slice.map((p) => p.id),
      studentIds: studentsBySchool[s].slice(start, start + CLASS_SIZE), color: schools[s].color,
    });
  }
}
DBL.persistCollection(db, 'groups', groups);
console.log(`groups       : ${groups.length}  (${SCHOOLS} school + ${groups.length - SCHOOLS} class)`);

// ---- posts (a few thousand, spread across schools/authors) ---------------
// Authors are staff; audience is that school's group. Some pinned, some with
// comments/reactions so feed + comment pagination have real material.
const POST_COUNT = Math.min(4000, Math.max(200, Math.round(N / 25)));
const posts = new Array(POST_COUNT);
for (let i = 0; i < POST_COUNT; i++) {
  const s = i % SCHOOLS, sid = 'sch_' + s;
  const staff = staffBySchool[s], parents = parentsBySchool[s];
  const author = staff.length ? pick(staff, i) : (parents[0] || users[0]);
  // reactions: a handful of real parent ids per post
  const reactions = {};
  if (parents.length) {
    const emoji = pick(REACTIONS, i);
    reactions[emoji] = parents.slice(i % parents.length, (i % parents.length) + 3 + rnd(6)).map((p) => p.id);
  }
  // comments: a couple from parents
  const comments = [];
  for (let c = 0; c < (i % 3); c++) {
    const cp = parents.length ? pick(parents, i + c) : author;
    comments.push({ id: `cmt_${i}_${c}`, authorId: cp.id, body: pick(MSG_BODIES, i + c), createdAt: ISO(rnd(20)) });
  }
  posts[i] = {
    id: 'post_' + i, authorId: author.id,
    audience: { type: i % 5 === 0 ? 'school' : 'class', id: 'grp_school_' + sid, schoolId: sid, label: `${schools[s].short} — All Families` },
    schoolId: sid, category: pick(CATEGORIES, i), pinned: i % 37 === 0,
    createdAt: ISO(rnd(60)), title: pick(POST_TITLES, i), body: pick(POST_BODIES, i),
    channels: i % 2 ? ['app', 'email'] : ['app', 'email', 'sms'],
    reactions, comments, attachments: [],
  };
}
DBL.persistCollection(db, 'posts', posts);
console.log(`posts        : ${posts.length}`);

// ---- conversations (a few thousand: direct + group threads) --------------
// Direct = parent<->staff in same school; group threads carry many messages
// so thread pagination is exercised.
const CONV_COUNT = Math.min(4000, Math.max(200, Math.round(N / 25)));
const conversations = new Array(CONV_COUNT);
for (let i = 0; i < CONV_COUNT; i++) {
  const s = i % SCHOOLS;
  const parents = parentsBySchool[s], staff = staffBySchool[s];
  const isGroup = i % 6 === 0;
  const a = parents.length ? pick(parents, i) : users[i % N];
  const b = staff.length ? pick(staff, i) : (parents[(i + 1) % Math.max(1, parents.length)] || users[(i + 1) % N]);
  const participantIds = isGroup
    ? [b.id, ...parents.slice(0, 3).map((p) => p.id)].filter((v, k, arr) => arr.indexOf(v) === k)
    : [a.id, b.id];
  const msgCount = isGroup ? 8 + rnd(25) : 1 + rnd(6);   // group threads are long → pagination
  const messages = Array.from({ length: msgCount }, (_, m) => {
    const sender = participantIds[m % participantIds.length];
    return { id: `msg_${i}_${m}`, senderId: sender, body: pick(MSG_BODIES, i + m), lang: 'en', createdAt: ISO(rnd(30)), read: m < msgCount - 1 };
  });
  conversations[i] = {
    id: 'conv_' + i, type: isGroup ? 'group' : 'direct',
    participantIds, subject: isGroup ? pick(POST_TITLES, i) : null, messages,
  };
}
DBL.persistCollection(db, 'conversations', conversations);
console.log(`conversations: ${conversations.length}`);

// ---- prefs (per user) -----------------------------------------------------
const prefs = {};
for (const u of users) {
  prefs[u.id] = {
    channels: { app: true, email: u.verified, sms: u.role === 'parent', voice: false },
    digest: u.role === 'parent' ? 'instant' : 'daily',
    quietHours: { enabled: false, start: '9:00 PM', end: '7:00 AM' },
    language: u.language,
  };
}
DBL.persistKv(db, 'prefs', prefs);

// ---- district / meta singletons (minimal shapes adapted from seed.json) --
DBL.persistKv(db, 'district', { id: 'net_sa', name: 'Success Academy Charter Schools', shortName: 'Success Academy', motto: 'All children can succeed.' });
DBL.persistKv(db, 'meta', { generatedAt: new Date().toISOString(), product: 'Success Academy — Family Connect', version: '1.1.0-scale', families: users.filter((u) => u.role === 'parent').length, scale: { users: N, schools: SCHOOLS } });
console.log(`prefs        : ${Object.keys(prefs).length}   + district/meta singletons`);

// ---- final report ---------------------------------------------------------
try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* */ } // fold WAL into the .db for an honest size
const sizeMB = (fs.statSync(OUT).size / 1048576).toFixed(1);
const wall = ms(T0); // ms (helper divides ns → ms)
console.log(`\n--- done ---`);
console.log(`per-collection counts:`);
const counts = { schools: schools.length, users: users.length, students: students.length, groups: groups.length, posts: posts.length, conversations: conversations.length, prefs: Object.keys(prefs).length, guardianMap: Object.keys(guardianMap).length, studentMap: Object.keys(studentMap).length };
for (const [k, v] of Object.entries(counts)) console.log(`  • ${k.padEnd(14)} ${v.toLocaleString()}`);
console.log(`db file        : ${OUT}  (${sizeMB} MB on disk)`);
console.log(`total wall-clock: ${wall} ms\n`);
