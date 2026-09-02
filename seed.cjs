/* ============================================================================
 * Success Academy — Family Connect : demo data generator (SCALED)
 * Run:  node seed.cjs        (writes data/seed.json)
 * Generates a ~1,000-family network across 3 schools with college-named class
 * sections, while preserving the curated demo cast (Priya / Marcus / Cornell).
 * Scholars (not "students"), chess, hands-on science. All data fictional. Zero deps.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');

// ---- scale knob -----------------------------------------------------------
const N_FAMILIES = Number(process.env.FAMILIES || 1000); // guardian accounts

// ---- deterministic-ish RNG (reproducible) --------------------------------
let _s = 20242025;
function rng() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return ((_s >>> 0) % 100000) / 100000; }
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const pickN = (arr, n) => { const c = [...arr]; const out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(rng() * c.length), 1)[0]); return out; };
const chance = (p) => rng() < p;
const id = (() => { let n = 0; return (p) => `${p}_${(++n).toString(36)}${Math.floor(rng() * 1296).toString(36)}`; })();

// ---- time helpers (anchored to real "now" so the demo always looks fresh) -
const NOW = Date.now();
const HOUR = 36e5, DAY = 864e5;
const at = (ms) => new Date(ms).toISOString();
const daysFromNow = (d, h = 9) => at(NOW + d * DAY - (NOW % DAY) + h * HOUR);
const hoursAgo = (h) => at(NOW - h * HOUR);
const daysAgo = (d, h) => hoursAgo(d * 24 + (h || Math.floor(rng() * 8)));

// ---------------------------------------------------------------------------
// 1. NETWORK + SCHOOLS  (real SA school names; addresses approximate)
// ---------------------------------------------------------------------------
const district = { id: 'net_sa', name: 'Success Academy Charter Schools', shortName: 'Success Academy', motto: 'All children can succeed.' };

const schools = [
  { id: 'sch_hw', name: 'Success Academy Harlem 1', short: 'Harlem 1', level: 'Elementary', grades: ['K', '1', '2', '3', '4'], address: '34 West 118th Street, New York, NY 10026', principal: 'Dr. Alana Reyes', color: '#E0521C', primary: true, weight: 0.5 },
  { id: 'sch_bp', name: 'Success Academy Bronx 2', short: 'Bronx 2', level: 'Middle', grades: ['5', '6', '7', '8'], address: '1330 Bristow Street, Bronx, NY 10459', principal: 'Mr. Desmond Clarke', color: '#16335B', weight: 0.3 },
  { id: 'sch_lh', name: 'SA High School of the Liberal Arts', short: 'Liberal Arts HS', level: 'High', grades: ['9', '10', '11', '12'], address: '37th Street & 10th Ave (Hudson Yards), New York, NY 10018', principal: 'Ms. Yuki Tanaka', color: '#117A65', weight: 0.2 },
];
const PRIMARY = 'sch_hw';
const schoolById = (id) => schools.find((s) => s.id === id);
const weightedSchool = () => { const r = rng(); let a = 0; for (const s of schools) { a += s.weight; if (r <= a) return s.id; } return PRIMARY; };

// ---------------------------------------------------------------------------
// 2. NAME POOLS (intentionally diverse)
// ---------------------------------------------------------------------------
const FIRST = ['Aanya', 'Mateo', 'Zoe', 'Liam', 'Amara', 'Noah', 'Priya', 'Sofia', 'Elijah', 'Mei', 'Diego', 'Layla', 'Kofi', 'Hana', 'Lucas', 'Nia', 'Omar', 'Isabella', 'Jamal', 'Yara', 'Ethan', 'Leila', 'Andre', 'Chloe', 'Rohan', 'Maya', 'Daniel', 'Aisha', 'Marcus', 'Camila', 'Tyler', 'Fatima', 'Ben', 'Sana', 'Caleb', 'Ivy', 'Malik', 'Ruby', 'Sean', 'Tara', 'Victor', 'Wren', 'Xavier', 'Yusuf', 'Zara', 'Ana', 'Bashir', 'Cora', 'Devon', 'Esme', 'Grace', 'Hugo', 'Imani', 'Jonah', 'Kira', 'Leo', 'Maria', 'Nasir', 'Olivia', 'Pedro', 'Quinn', 'Rosa', 'Simon', 'Talia', 'Uma', 'Vera', 'Will', 'Ximena', 'Yael', 'Zion'];
const LAST = ['Sharma', 'Ruiz', 'Bell', 'Okafor', 'Nguyen', 'Johnson', 'Garcia', 'Patel', 'Williams', 'Kim', 'Hernandez', 'Brown', 'Ali', 'Rossi', 'Diallo', 'Cohen', 'Reyes', 'Santos', 'Adams', 'Tran', 'Mensah', 'Lopez', 'Carter', 'Iqbal', 'Park', 'Flores', 'Murphy', 'Osei', 'Singh', 'Romano', 'Hassan', 'Wright', 'Dubois', 'Castillo', 'Abara', 'Petrov', 'Khan', 'Silva', 'Lin', 'Banks', 'Owens', 'Mendez', 'Bauer', 'Cruz', 'Donnelly', 'Eze', 'Fofana', 'Ghosh', 'Haddad', 'Ito', 'Jensen', 'Koch', 'Larsen', 'Muratov', 'Novak', 'Ortega', 'Pierre', 'Qureshi', 'Rahman', 'Suzuki', 'Tesfaye', 'Ulloa', 'Vega', 'Wong', 'Yamada', 'Zhao'];
const STREETS = ['Lenox Ave', 'Frederick Douglass Blvd', 'Adam Clayton Powell Blvd', 'Malcolm X Blvd', 'St Nicholas Ave', 'W 117th St', 'W 119th St', 'Manhattan Ave', 'Morningside Ave', 'Madison Ave', 'Amsterdam Ave', 'Edgecombe Ave', 'Bradhurst Ave', 'Convent Ave'];
// SA classrooms are named after colleges to build a college-going culture
const COLLEGES = ['Cornell', 'Spelman', 'Howard', 'Morehouse', 'Columbia', 'Vassar', 'Amherst', 'Wesleyan', 'Tufts', 'Hampton', 'Bowdoin', 'Williams', 'Yale', 'Brown', 'Rutgers', 'NYU', 'Fordham', 'Barnard', 'Hofstra', 'Pace', 'Adelphi', 'Hunter', 'Baruch', 'Pratt', 'Vanderbilt', 'Emory', 'Tulane', 'Rice', 'Duke', 'Smith'];
let _col = 1; const nextCollege = () => COLLEGES[(_col++) % COLLEGES.length]; // start past 'Cornell' (curated class)
const gradeLabel = (g) => g === 'K' ? 'Kindergarten' : `${g}${g === '1' ? 'st' : g === '2' ? 'nd' : g === '3' ? 'rd' : 'th'} Grade`;

const fullName = (f, l) => `${f} ${l}`;
const COLORS = ['#E0521C', '#16335B', '#117A65', '#B5179E', '#B7791F', '#0969da', '#6e40c9', '#bf3989', '#1a7f37', '#bc4c00'];
const initials = (n) => n.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

function makeUser(role, school, opts = {}) {
  const f = opts.firstName || pick(FIRST);
  const l = opts.lastName || pick(LAST);
  const name = opts.name || fullName(f, l);
  return {
    id: opts.id || id('usr'),
    role, firstName: f, lastName: l, name,
    email: opts.email || `${f}.${l}`.toLowerCase().replace(/[^a-z.]/g, '') + (role === 'parent' ? '@gmail.com' : '@successacademies.org'),
    phone: opts.phone || `(917) 555-${(1000 + Math.floor(rng() * 8999))}`,
    avatar: opts.avatar || initials(name),
    color: opts.color || pick(COLORS),
    language: opts.language || 'en',
    schoolId: school,
    title: opts.title || null,
    address: opts.address || `${100 + Math.floor(rng() * 800)} ${pick(STREETS)}, New York, NY 100${26 + Math.floor(rng() * 9)}`,
    verified: opts.verified ?? chance(0.84),
    reachedBy: opts.reachedBy || (chance(0.62) ? ['app', 'email', 'sms'] : chance(0.5) ? ['email', 'sms'] : ['email']),
    alertPermission: opts.alertPermission || 'none',
  };
}

// ---------------------------------------------------------------------------
// 3. THE DEMO CAST (hand-built so the graph is coherent + a great walkthrough)
// ---------------------------------------------------------------------------
const users = [];
const students = [];
const groups = [];
const guardianMap = {};
const studentMap = {};
function link(parent, kid) { (guardianMap[kid.id] ||= []).push(parent.id); (studentMap[parent.id] ||= []).push(kid.id); }

// --- Admin / staff ---
const dana = makeUser('admin', PRIMARY, { id: 'usr_dana', firstName: 'Dana', lastName: 'Okafor', name: 'Dana Okafor', title: 'Director of Family Engagement', color: '#6e40c9', email: 'dana.okafor@successacademies.org', language: 'en', verified: true, reachedBy: ['app', 'email', 'sms'] });
const alana = makeUser('admin', PRIMARY, { id: 'usr_alana', firstName: 'Alana', lastName: 'Reyes', name: 'Dr. Alana Reyes', title: 'Principal, Harlem 1', color: '#E0521C', verified: true, reachedBy: ['app', 'email', 'sms'] });
const marcus = makeUser('teacher', PRIMARY, { id: 'usr_marcus', firstName: 'Marcus', lastName: 'Bell', name: 'Marcus Bell', title: 'Lead Teacher — 3rd Grade (Cornell)', color: '#16335B', verified: true, reachedBy: ['app', 'email', 'sms'], alertPermission: 'alerts' });
const lena = makeUser('teacher', PRIMARY, { id: 'usr_lena', firstName: 'Lena', lastName: 'Park', name: 'Lena Park', title: 'Art Teacher', color: '#bf3989', verified: true });
const coach = makeUser('teacher', PRIMARY, { id: 'usr_coach', firstName: 'Ray', lastName: 'Santos', name: 'Coach Ray Santos', title: 'PE Teacher & Field Day Lead', color: '#117A65', verified: true });
const chessT = makeUser('teacher', PRIMARY, { id: 'usr_chess', firstName: 'Nadia', lastName: 'Petrov', name: 'Nadia Petrov', title: 'Chess Program Director', color: '#B7791F', verified: true });
const nurse = makeUser('teacher', PRIMARY, { id: 'usr_nurse', firstName: 'Dolores', lastName: 'Murphy', name: 'Nurse Murphy', title: 'School Nurse', color: '#B5179E', verified: true });
// network leadership (the real people evaluating this pilot)
const jarrod = makeUser('admin', PRIMARY, { id: 'usr_jarrod', firstName: 'Jarrod', lastName: 'Wolf', name: 'Jarrod Wolf', title: 'Head, Enterprise AI', email: 'jarrod.wolf@successacademies.org', color: '#1f6feb', verified: true, reachedBy: ['app', 'email', 'sms'] });
const abhinav = makeUser('admin', PRIMARY, { id: 'usr_abhinav', firstName: 'Abhinav', lastName: 'Mathur', name: 'Abhinav Mathur', title: 'Executive, Enterprise Services', email: 'abhinav.mathur@successacademies.org', color: '#6e40c9', verified: true, reachedBy: ['app', 'email', 'sms'] });
const poulomi = makeUser('admin', PRIMARY, { id: 'usr_poulomi', firstName: 'Poulomi', lastName: 'Banerjee', name: 'Poulomi Banerjee', title: 'Lead Mobile Engineer', email: 'poulomi.banerjee@successacademies.org', color: '#0d9488', verified: true, reachedBy: ['app', 'email', 'sms'] });
users.push(dana, alana, marcus, lena, coach, chessT, nurse, jarrod, abhinav, poulomi);

// --- Parents (demo) ---
const priya = makeUser('parent', PRIMARY, { id: 'usr_priya', firstName: 'Priya', lastName: 'Sharma', name: 'Priya Sharma', color: '#0969da', language: 'en', email: 'priya.sharma@gmail.com', verified: true, reachedBy: ['app', 'email', 'sms'] });
const carmen = makeUser('parent', PRIMARY, { id: 'usr_carmen', firstName: 'Carmen', lastName: 'Ruiz', name: 'Carmen Ruiz', color: '#bc4c00', language: 'es', email: 'carmen.ruiz@gmail.com', verified: true, reachedBy: ['app', 'sms'] });
const james = makeUser('parent', PRIMARY, { id: 'usr_james', firstName: 'James', lastName: 'Carter', name: 'James Carter', color: '#1a7f37', language: 'en', verified: true });
users.push(priya, carmen, james);

// --- Scholars (demo) ---
const aanya = { id: 'stu_aanya', firstName: 'Aanya', lastName: 'Sharma', name: 'Aanya Sharma', grade: '3', schoolId: PRIMARY, color: '#0969da' };
const rohan = { id: 'stu_rohan', firstName: 'Rohan', lastName: 'Sharma', name: 'Rohan Sharma', grade: '1', schoolId: PRIMARY, color: '#0969da' };
const mateo = { id: 'stu_mateo', firstName: 'Mateo', lastName: 'Ruiz', name: 'Mateo Ruiz', grade: '3', schoolId: PRIMARY, color: '#bc4c00' };
const tyler = { id: 'stu_tyler', firstName: 'Tyler', lastName: 'Carter', name: 'Tyler Carter', grade: '3', schoolId: PRIMARY, color: '#1a7f37' };
students.push(aanya, rohan, mateo, tyler);
link(priya, aanya); link(priya, rohan); link(carmen, mateo); link(james, tyler);

// ---------------------------------------------------------------------------
// 4. SCALED PROCEDURAL POPULATION — ~1,000 families across the 3 schools
// ---------------------------------------------------------------------------
const demoParents = 3; // priya, carmen, james
for (let i = 0; i < N_FAMILIES - demoParents; i++) {
  const sid = weightedSchool();
  const school = schoolById(sid);
  const last = pick(LAST);
  const parent = makeUser('parent', sid, { lastName: last, language: chance(0.18) ? 'es' : 'en' });
  users.push(parent);
  const nKids = chance(0.32) ? 2 : 1;
  for (let k = 0; k < nKids; k++) {
    const kid = { id: id('stu'), firstName: pick(FIRST), lastName: last, name: '', grade: pick(school.grades), schoolId: sid, color: parent.color };
    kid.name = fullName(kid.firstName, kid.lastName);
    students.push(kid);
    link(parent, kid);
  }
}

const parentPool = users.filter((u) => u.role === 'parent');
const parentsBySchool = {};
schools.forEach((s) => (parentsBySchool[s.id] = parentPool.filter((p) => p.schoolId === s.id)));

// ---------------------------------------------------------------------------
// 5. GROUPS — school "all families", network, college-named class sections
// ---------------------------------------------------------------------------
const A = (type, gid, label) => ({ type, id: gid, label });

// per-school "All Families" groups
const schoolGroupsById = {};
schools.forEach((s) => {
  const g = { id: 'grp_school_' + s.id, type: 'school', name: `${s.short} — All Families`, schoolId: s.id, leadIds: s.id === PRIMARY ? [alana.id, dana.id] : [], memberIds: parentsBySchool[s.id].map((p) => p.id), studentIds: students.filter((x) => x.schoolId === s.id).map((x) => x.id), color: s.color };
  schoolGroupsById[s.id] = g;
  groups.push(g);
});
const schoolGroup = schoolGroupsById[PRIMARY]; // curated posts target Harlem 1

const networkGroup = { id: 'grp_network', type: 'network', name: 'Success Academy — All Families', schoolId: null, leadIds: [dana.id], memberIds: parentPool.map((p) => p.id), studentIds: [], color: '#6e40c9' };
groups.push(networkGroup);

// --- Class sections (Cornell is the curated grade-3 Harlem 1 section) ---
const assigned = new Set();
const guardiansOfScholars = (kids) => [...new Set(kids.flatMap((k) => guardianMap[k.id] || []))];

// Cornell: demo scholars + fill from other Harlem 1 grade-3 scholars
const hwGrade3 = students.filter((s) => s.schoolId === PRIMARY && s.grade === '3' && ![aanya.id, mateo.id, tyler.id].includes(s.id));
const cornellStudents = [aanya, mateo, tyler, ...pickN(hwGrade3, 21)];
cornellStudents.forEach((s) => assigned.add(s.id));
const cornell = { id: 'grp_cornell', type: 'class', name: 'Cornell — 3rd Grade', schoolId: PRIMARY, leadIds: [marcus.id], memberIds: guardiansOfScholars(cornellStudents), studentIds: cornellStudents.map((s) => s.id), color: '#16335B' };
const cornellParentIds = cornell.memberIds;
groups.push(cornell);

// auto-section the rest of Harlem 1 (so directory counts look real)
const SECTION_SIZE = 28;
for (const grade of schoolById(PRIMARY).grades) {
  const pool = students.filter((s) => s.schoolId === PRIMARY && s.grade === grade && !assigned.has(s.id));
  for (let i = 0; i < pool.length; i += SECTION_SIZE) {
    const slice = pool.slice(i, i + SECTION_SIZE);
    slice.forEach((s) => assigned.add(s.id));
    const teacher = makeUser('teacher', PRIMARY, { title: `${gradeLabel(grade)} Lead Teacher` });
    users.push(teacher);
    groups.push({ id: id('grp'), type: 'class', name: `${nextCollege()} — ${gradeLabel(grade)}`, schoolId: PRIMARY, leadIds: [teacher.id], memberIds: guardiansOfScholars(slice), studentIds: slice.map((s) => s.id), color: schoolById(PRIMARY).color });
  }
}
// a couple of representative sections at the other schools (lighter)
for (const sid of ['sch_bp', 'sch_lh']) {
  const school = schoolById(sid);
  for (const grade of school.grades.slice(0, 2)) {
    const pool = students.filter((s) => s.schoolId === sid && s.grade === grade).slice(0, SECTION_SIZE);
    if (!pool.length) continue;
    const teacher = makeUser('teacher', sid, { title: `${gradeLabel(grade)} Lead Teacher` });
    users.push(teacher);
    groups.push({ id: id('grp'), type: 'class', name: `${nextCollege()} — ${gradeLabel(grade)}`, schoolId: sid, leadIds: [teacher.id], memberIds: guardiansOfScholars(pool), studentIds: pool.map((s) => s.id), color: school.color });
  }
}

// clubs + bus (Harlem 1)
const hwParents = parentsBySchool[PRIMARY];
const chessClub = { id: 'grp_chess', type: 'club', name: 'Harlem 1 Chess Team ♟️', schoolId: PRIMARY, leadIds: [chessT.id], memberIds: pickN(hwParents, 40).map((u) => u.id).concat(priya.id, carmen.id), studentIds: pickN(cornellStudents, 12).map((s) => s.id), color: '#B7791F' };
const ptaGroup = { id: 'grp_pta', type: 'club', name: 'Harlem 1 Family Council', schoolId: PRIMARY, leadIds: [alana.id], memberIds: pickN(hwParents, 60).map((u) => u.id).concat(priya.id), studentIds: [], color: '#1a7f37' };
const busRoute = { id: 'grp_bus7', type: 'bus', name: 'Bus Route 7 (Morningside)', schoolId: PRIMARY, leadIds: [], memberIds: pickN(hwParents, 22).map((u) => u.id).concat(priya.id, carmen.id), studentIds: [], color: '#117A65' };
groups.push(chessClub, ptaGroup, busRoute);

// ---------------------------------------------------------------------------
// 6. POSTS (feed) — reactions capped so arrays stay small at scale
// ---------------------------------------------------------------------------
const EMOJI = ['👍', '❤️', '🎉', '👏', '🙌'];
function reactions(pool, intensity = 0.4) {
  const r = {};
  const k = Math.min(Math.round(pool.length * intensity), 70); // cap reactors per post
  pickN(pool, k).forEach((u) => { const e = pick(EMOJI); (r[e] ||= []).push(u.id || u); });
  return r;
}
function comments(authors, lines) {
  return lines.map((l, i) => ({ id: id('cmt'), authorId: authors[i % authors.length].id, body: l, createdAt: daysAgo(rng() * 2) }));
}

const posts = [
  {
    id: 'post_movingup', authorId: alana.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Announcement', pinned: true, createdAt: hoursAgo(20),
    title: '🎓 Moving Up Ceremony — Thursday, June 26',
    body: 'Harlem 1 families, please join us Thursday, June 26 at 10:00 AM in the cafeteria to celebrate our 4th-grade scholars moving up to middle school! Doors open at 9:40. Each scholar may bring up to 4 guests. A reception follows. Scholars should wear their full Success Academy uniform.',
    bodyEs: 'Familias de Harlem 1, acompáñennos el jueves 26 de junio a las 10:00 AM en la cafetería para celebrar a nuestros estudiantes de 4.º grado que pasan a la escuela intermedia. Las puertas abren a las 9:40. Cada estudiante puede traer hasta 4 invitados. Los estudiantes deben usar el uniforme completo de Success Academy.',
    channels: ['app', 'email', 'sms'], attachments: [{ type: 'image', src: 'images/movingup-ceremony.jpg', label: 'Moving Up Ceremony' }],
    reactions: reactions(hwParents, 0.7),
    comments: comments([priya, james], ['Can grandparents attend too?', 'So proud of these scholars! 🎉']),
  },
  {
    id: 'post_chess', authorId: chessT.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Announcement', pinned: false, createdAt: daysAgo(1, 3),
    title: '♟️ Chess Team takes 2nd at the NYC Scholastic Championship!',
    body: 'Incredibly proud of our Harlem 1 Chess Team! Out of 40 schools, our scholars placed 2nd overall and Aanya Sharma earned a top-10 individual board prize. Practices continue through the summer program. Thank you to every family who got scholars to Saturday tournaments all year. ♟️🏆',
    bodyEs: '¡Estoy muy orgullosa de nuestro Equipo de Ajedrez de Harlem 1! De 40 escuelas, nuestros estudiantes quedaron en 2.º lugar y Aanya Sharma ganó un premio individual entre los 10 mejores.',
    channels: ['app', 'email'], attachments: [{ type: 'image', src: 'images/chess-team.jpg', label: 'The Chess Team 🏆' }, { type: 'image', src: 'images/chess-closeup.jpg', label: 'Eyes on the board' }],
    reactions: reactions(hwParents, 0.8),
    comments: comments([carmen, priya, james], ['¡Felicidades a todos! ♟️', 'Aanya was SO excited — thank you Ms. Petrov!', 'Best chess program in the city 🏆']),
  },
  {
    id: 'post_readathon', authorId: marcus.id, audience: A('class', cornell.id, 'Cornell — 3rd Grade'), schoolId: PRIMARY,
    category: 'Classroom', pinned: false, createdAt: daysAgo(2, 5),
    title: 'Cornell\'s End-of-Year Read-a-Thon 📚 — 1,412 books!',
    body: 'What a year of readers! Cornell read 1,412 books together this year. Next Wednesday we celebrate with a "book tasting" — scholars rotate through chapters of summer reading picks. If you can donate individually-wrapped snacks, there\'s a sign-up. Aanya, Mateo, and Tyler all reached Reading Level R — tremendous growth! 🌟',
    bodyEs: '¡Qué año de lectores! Cornell leyó 1,412 libros juntos este año. El próximo miércoles celebraremos con una "degustación de libros". Aanya, Mateo y Tyler alcanzaron el nivel de lectura R.',
    channels: ['app', 'email'], attachments: [{ type: 'image', src: 'images/reading-wall.jpg', label: 'Our Reading Wall' }, { type: 'image', src: 'images/book-tasting.jpg', label: 'Book Tasting' }],
    reactions: reactions(cornellParentIds, 0.8),
    comments: comments([priya, carmen, james], ['Aanya has not stopped talking about this! 📚', '¡Gracias Sr. Bell por todo este año!', 'Tyler read more this year than I did 😅']),
  },
  {
    id: 'post_summerstem', authorId: dana.id, audience: A('network', networkGroup.id, 'Success Academy — All Families'), schoolId: null,
    category: 'Announcement', pinned: false, createdAt: daysAgo(3, 2),
    title: 'Summer STEM Academy — Registration Now Open (network-wide)',
    body: 'Success Academy Summer STEM Academy runs July 7–Aug 1 for rising 1st–8th grade scholars. Free for all enrolled families; includes breakfast & lunch. Mornings focus on reading & math; afternoons on hands-on science, chess, and sports. Space is limited — complete the registration form by June 30. Bus transportation available on existing routes.',
    bodyEs: 'La Academia STEM de Verano de Success Academy se realiza del 7 de julio al 1 de agosto para estudiantes de 1.º a 8.º grado. Gratis para todas las familias inscritas; incluye desayuno y almuerzo.',
    channels: ['app', 'email', 'sms'], attachments: [{ type: 'pdf', name: 'summer-stem-2026.pdf', label: 'Summer STEM Info Packet' }],
    reactions: reactions(parentPool, 0.4),
    comments: [],
  },
  {
    id: 'post_scienceexpo', authorId: lena.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Classroom', pinned: false, createdAt: daysAgo(4, 6),
    title: '🔬 K–4 Science Expo — Photos!',
    body: 'Thank you to everyone who came to our Science Expo! Scholars presented investigations from a full year of hands-on science — from "sink or float" in Kindergarten to electric circuits in 4th grade. Swipe through a few highlights. Your scholar\'s work may be featured!',
    channels: ['app'], attachments: [{ type: 'image', src: 'images/science-circuits.jpg', label: 'Circuit Builders' }, { type: 'image', src: 'images/science-plants.jpg', label: 'Plant Lab' }, { type: 'image', src: 'images/science-bridge.jpg', label: 'Bridge Challenge' }],
    reactions: reactions(hwParents, 0.6), comments: comments([priya], ['Found Aanya\'s circuit board — she was beaming! 🔌']),
  },
  {
    id: 'post_uniform', authorId: dana.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Reminder', pinned: false, createdAt: daysAgo(5, 4),
    title: 'June Lunch Menu + Free/Reduced Meal Forms',
    body: 'The June lunch menu is attached. Reminder: complete your Free/Reduced Meal Benefit form for next school year — it unlocks meal benefits AND helps Success Academy qualify for additional funding. Takes 3 minutes; it\'s in your Forms tab. Uniform reminder: scholars need orange polos + navy bottoms through the last day.',
    channels: ['app', 'email'], attachments: [{ type: 'pdf', name: 'june-menu.pdf', label: 'June Lunch Menu' }],
    reactions: reactions(hwParents, 0.15), comments: [],
  },
  {
    id: 'post_lostfound', authorId: alana.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Reminder', pinned: false, createdAt: daysAgo(6, 7),
    title: 'Lost & Found overflowing — please check before June 27',
    body: 'Our Lost & Found is overflowing with uniform sweaters, water bottles, and lunchboxes! Please stop by the front lobby before the last day. Everything remaining on June 27 will be donated. Labeled items will be sent home with scholars.',
    channels: ['app'], attachments: [], reactions: reactions(hwParents, 0.1), comments: [],
  },
  {
    id: 'post_artshow', authorId: lena.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Classroom', pinned: false, createdAt: daysAgo(3, 5),
    title: '🎨 Spring Art Show — what a turnout!',
    body: 'Over 300 families came through our Spring Art Show. Scholars displayed self-portraits, clay sculptures, and a collaborative mural. So proud of every young artist — prints available soon!',
    bodyEs: 'Más de 300 familias asistieron a nuestra Exposición de Arte de Primavera. ¡Estoy muy orgullosa de cada joven artista!',
    channels: ['app', 'email'], attachments: [{ type: 'image', src: 'images/art-showcase.jpg', label: 'The gallery wall' }, { type: 'image', src: 'images/art-painting.jpg', label: 'Young artists at work' }],
    reactions: reactions(hwParents, 0.55), comments: comments([priya], ['Aanya\'s self-portrait stole the show 🖼️']),
  },
  {
    id: 'post_fieldtrip', authorId: marcus.id, audience: A('class', cornell.id, 'Cornell — 3rd Grade'), schoolId: PRIMARY,
    category: 'Classroom', pinned: false, createdAt: daysAgo(4, 2),
    title: 'Cornell at the Museum of Natural History 🦕',
    body: 'Cornell had a blast at the American Museum of Natural History! We studied ecosystems, marveled at the blue whale, and sketched dinosaur skeletons. Thank you to our chaperones — we couldn\'t do these trips without you.',
    bodyEs: '¡Cornell la pasó genial en el Museo de Historia Natural! Gracias a nuestros acompañantes.',
    channels: ['app', 'email'], attachments: [{ type: 'image', src: 'images/field-trip-museum.jpg', label: 'In the great hall' }, { type: 'image', src: 'images/museum-dino.jpg', label: 'Sketching the dinosaurs' }],
    reactions: reactions(cornellParentIds, 0.7), comments: comments([carmen, james], ['¡Mateo no para de hablar del museo!', 'Tyler drew the T-rex all weekend 🦖']),
  },
  {
    id: 'post_spiritday', authorId: alana.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Event', pinned: false, createdAt: daysAgo(6, 3),
    title: '🧡 Spirit Day was a blast!',
    body: 'Our halls were buzzing for Spirit Day — scholars showed up with energy, pride, and a whole lot of orange. Thank you to the Family Council for the cheer tunnel at arrival!',
    bodyEs: '¡Nuestros pasillos se llenaron de energía y orgullo en el Día del Espíritu Escolar!',
    channels: ['app'], attachments: [{ type: 'image', src: 'images/group-cheer.jpg', label: 'Harlem 1 pride' }, { type: 'image', src: 'images/hallway-art.jpg', label: 'Our hallways' }],
    reactions: reactions(hwParents, 0.45), comments: [],
  },
  {
    id: 'post_sports', authorId: coach.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Event', pinned: false, createdAt: daysAgo(5, 6),
    title: '⚽ Strikers season + Field Day prep',
    body: 'Our after-school Strikers had a fantastic season and Field Day is almost here! Scholars: bring sneakers and a labeled water bottle. Parents: we still need a few volunteers at the relay station.',
    bodyEs: '¡Nuestros Strikers tuvieron una gran temporada y el Día de Campo ya casi llega! Buscamos voluntarios.',
    channels: ['app'], attachments: [{ type: 'image', src: 'images/soccer-team.jpg', label: 'The Strikers' }, { type: 'image', src: 'images/field-day-relay.jpg', label: 'Relay practice' }],
    reactions: reactions(hwParents, 0.4), comments: [],
  },
  {
    id: 'post_kinder', authorId: alana.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Classroom', pinned: false, createdAt: daysAgo(7, 4),
    title: 'A peek into Kindergarten 🌱',
    body: 'Our youngest scholars have grown so much — from morning meeting on the rug to reading their very first books. A little look at the joy in our K classrooms.',
    bodyEs: 'Nuestros estudiantes más pequeños han crecido muchísimo. Aquí un vistazo a la alegría en nuestras aulas de Kínder.',
    channels: ['app', 'email'], attachments: [{ type: 'image', src: 'images/kindergarten-circle.jpg', label: 'Morning meeting' }, { type: 'image', src: 'images/morning-arrival.jpg', label: 'A warm welcome' }],
    reactions: reactions(hwParents, 0.5), comments: [],
  },
  {
    id: 'post_celebrate', authorId: alana.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'), schoolId: PRIMARY,
    category: 'Announcement', pinned: false, createdAt: daysAgo(2, 7),
    title: '🌟 Scholars of the Month',
    body: 'Congratulations to our Scholars of the Month for exceptional focus and kindness to classmates. We are so proud of you!',
    bodyEs: '¡Felicitaciones a nuestros Estudiantes del Mes! Estamos muy orgullosos de ustedes.',
    channels: ['app', 'email'], attachments: [{ type: 'image', src: 'images/celebration-confetti.jpg', label: 'Celebrating our scholars' }, { type: 'image', src: 'images/scholar-portrait.jpg', label: 'Scholar of the Month' }],
    reactions: reactions(hwParents, 0.6), comments: comments([james], ['Congrats to all the kids! 🎉']),
  },
];

// ---------------------------------------------------------------------------
// 7. CONVERSATIONS (direct + group messaging, w/ translation)
// ---------------------------------------------------------------------------
const conversations = [
  {
    id: 'conv_jarrod_abhinav', type: 'direct', participantIds: [jarrod.id, abhinav.id], subject: null,
    messages: [
      { id: id('msg'), senderId: jarrod.id, body: 'Hi Abhinav — here\'s the Family Connect prototype: a ParentSquare-style family-engagement app for Success Academy. Tap the avatar (top-right) to switch personas — admin, teacher, and parent (including a Spanish-speaking family) — to see every side of the platform. Try creating an event, setting up conference sign-ups, or sending an alert (it\'ll buzz your phone). Everything is fictional data and runs on-device. Happy to walk you through it.', lang: 'en', createdAt: hoursAgo(2), read: false },
    ],
  },
  {
    id: 'conv_priya_marcus', type: 'direct', participantIds: [priya.id, marcus.id], subject: null,
    messages: [
      { id: id('msg'), senderId: priya.id, body: 'Hi Mr. Bell! Aanya mentioned a book tasting next week — does she need to bring anything?', lang: 'en', createdAt: daysAgo(1, 5), read: true },
      { id: id('msg'), senderId: marcus.id, body: 'Hi Priya! Nothing required — just her smile 😊 If you\'d like to donate individually-wrapped snacks there\'s an optional sign-up in the Cornell post. Aanya has had a fantastic year — and congrats on the chess prize!', lang: 'en', createdAt: daysAgo(1, 4), read: true },
      { id: id('msg'), senderId: priya.id, body: 'That\'s wonderful to hear. I\'ll grab a slot for pretzels. Thank you for everything this year!', lang: 'en', createdAt: hoursAgo(20), read: true },
      { id: id('msg'), senderId: marcus.id, body: 'Perfect, pretzels are claimed 🥨 See you at the Moving Up ceremony!', lang: 'en', createdAt: hoursAgo(3), read: false },
    ],
  },
  {
    id: 'conv_carmen_marcus', type: 'direct', participantIds: [carmen.id, marcus.id], subject: null,
    messages: [
      { id: id('msg'), senderId: carmen.id, body: '¿Mateo necesita traer su proyecto de lectura mañana?', lang: 'es', bodyEn: 'Does Mateo need to bring his reading project tomorrow?', createdAt: daysAgo(2, 6), read: true },
      { id: id('msg'), senderId: marcus.id, body: 'Yes please — tomorrow is fine. He did a great job on it!', lang: 'en', bodyEs: 'Sí, por favor — mañana está bien. ¡Hizo un trabajo excelente!', createdAt: daysAgo(2, 5), read: true },
      { id: id('msg'), senderId: carmen.id, body: '¡Gracias! Estará listo.', lang: 'es', bodyEn: 'Thank you! It will be ready.', createdAt: daysAgo(2, 5), read: true },
    ],
  },
  {
    id: 'conv_nurse_priya', type: 'direct', participantIds: [nurse.id, priya.id], subject: null,
    messages: [
      { id: id('msg'), senderId: nurse.id, body: 'Hi Ms. Sharma — Rohan\'s updated immunization record is due before the first day next year. You can upload it in the Emergency & Health form. Let me know if you need help!', lang: 'en', createdAt: daysAgo(3, 2), read: true },
      { id: id('msg'), senderId: priya.id, body: 'Thanks Nurse Murphy — our pediatrician visit is July 9, I\'ll upload right after.', lang: 'en', createdAt: daysAgo(3, 1), read: true },
    ],
  },
  {
    id: 'conv_cornell_group', type: 'group', participantIds: [marcus.id, priya.id, carmen.id, james.id], subject: 'Cornell — Moving Up Gift',
    messages: [
      { id: id('msg'), senderId: priya.id, body: 'Hi all! A few of us want to organize a class gift for Mr. Bell. Thinking a bookstore gift card — contribute what you can. I\'ll collect by Wed.', lang: 'en', createdAt: daysAgo(2, 8), read: true },
      { id: id('msg'), senderId: james.id, body: 'Count me in. Great idea 👏', lang: 'en', createdAt: daysAgo(2, 7), read: true },
      { id: id('msg'), senderId: carmen.id, body: '¡Me apunto! ¿A quién le envío el dinero?', lang: 'es', bodyEn: 'I\'m in! Who do I send the money to?', createdAt: daysAgo(2, 7), read: true },
      { id: id('msg'), senderId: priya.id, body: 'I\'ll DM payment info so it stays a surprise 🤫', lang: 'en', createdAt: daysAgo(1, 9), read: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// 8. SIGN-UPS (conference / volunteer / item)
// ---------------------------------------------------------------------------
const signups = [
  {
    id: 'su_conf', type: 'conference', authorId: marcus.id, audience: A('class', cornell.id, 'Cornell — 3rd Grade'),
    title: 'End-of-Year Family–Teacher Conferences', description: 'Optional 15-minute conferences to review your scholar\'s end-of-year report and summer plan. Held in the Cornell classroom.',
    deadline: daysFromNow(4), createdAt: daysAgo(3),
    slots: [
      { id: id('slot'), label: 'Wed Jun 25 · 3:30 PM', capacity: 1, claims: [{ userId: james.id, studentId: tyler.id }] },
      { id: id('slot'), label: 'Wed Jun 25 · 3:45 PM', capacity: 1, claims: [] },
      { id: id('slot'), label: 'Wed Jun 25 · 4:00 PM', capacity: 1, claims: [{ userId: carmen.id, studentId: mateo.id, note: 'Necesito intérprete de español, por favor.' }] },
      { id: id('slot'), label: 'Wed Jun 25 · 4:15 PM', capacity: 1, claims: [] },
      { id: id('slot'), label: 'Thu Jun 26 · 3:30 PM', capacity: 1, claims: [] },
      { id: id('slot'), label: 'Thu Jun 26 · 3:45 PM', capacity: 1, claims: [] },
    ],
  },
  {
    id: 'su_fieldday', type: 'volunteer', authorId: coach.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'),
    title: 'Field Day Volunteers ☀️', description: 'Help make Field Day a blast! Pick a station. Volunteers get a free Field Day t-shirt and lunch.',
    deadline: daysFromNow(2), createdAt: daysAgo(4),
    slots: [
      { id: id('slot'), label: 'Relay Station (8–10 AM)', capacity: 4, claims: pickN(hwParents, 2).map((u) => ({ userId: u.id })) },
      { id: id('slot'), label: 'Water/Snack Station (9–11 AM)', capacity: 4, claims: [{ userId: priya.id }] },
      { id: id('slot'), label: 'Face Painting (10–12 PM)', capacity: 3, claims: pickN(hwParents, 3).map((u) => ({ userId: u.id })) },
      { id: id('slot'), label: 'Setup Crew (7–8 AM)', capacity: 6, claims: pickN(hwParents, 2).map((u) => ({ userId: u.id })) },
      { id: id('slot'), label: 'Cleanup Crew (12–1 PM)', capacity: 6, claims: [] },
    ],
  },
  {
    id: 'su_snacks', type: 'item', authorId: marcus.id, audience: A('class', cornell.id, 'Cornell — 3rd Grade'),
    title: 'Book Tasting — Snack Donations 🥨', description: 'Optional! Bring individually-wrapped snacks for our Read-a-Thon celebration. ~24 scholars.',
    deadline: daysFromNow(5), createdAt: daysAgo(2),
    slots: [
      { id: id('slot'), label: 'Pretzels', capacity: 2, claims: [{ userId: priya.id, qty: 1, note: 'Will bring 2 family-size bags 🥨' }] },
      { id: id('slot'), label: 'Goldfish crackers', capacity: 2, claims: pickN(hwParents, 1).map((u) => ({ userId: u.id, qty: 1 })) },
      { id: id('slot'), label: 'Juice boxes (24-pack)', capacity: 2, claims: [] },
      { id: id('slot'), label: 'Fruit snacks', capacity: 2, claims: [{ userId: carmen.id, qty: 1 }] },
      { id: id('slot'), label: 'Napkins & cups', capacity: 1, claims: [] },
    ],
  },
];

// ---------------------------------------------------------------------------
// 9. FORMS & PERMISSION SLIPS (fillable + e-signature)
// ---------------------------------------------------------------------------
const forms = [
  {
    id: 'form_amnh', type: 'permission', authorId: marcus.id, audience: A('class', cornell.id, 'Cornell — 3rd Grade'),
    title: 'Permission Slip — American Museum of Natural History', description: 'Cornell visits the American Museum of Natural History on Friday, June 27. Departs 8:30 AM, returns ~2:30 PM. Cost $12 (fee waivers available). Signature required to attend.',
    dueDate: daysFromNow(2), createdAt: daysAgo(5), requiresSignature: true,
    fields: [
      { id: 'f1', label: 'Scholar Name', type: 'text', required: true },
      { id: 'f2', label: 'I give permission for my scholar to attend the AMNH field trip', type: 'checkbox', required: true },
      { id: 'f3', label: 'Emergency contact phone (day of trip)', type: 'text', required: true },
      { id: 'f4', label: 'Allergies or medical notes for the day', type: 'textarea', required: false },
      { id: 'f5', label: 'Lunch', type: 'radio', required: true, options: ['Bringing bagged lunch', 'School-provided bagged lunch ($4)'] },
    ],
    responses: [
      { id: id('resp'), userId: james.id, studentId: tyler.id, values: { f1: 'Tyler Carter', f2: true, f3: '(917) 555-2231', f4: 'None', f5: 'Bringing bagged lunch' }, signature: 'James Carter', signedAt: daysAgo(3) },
    ],
  },
  {
    id: 'form_photo', type: 'permission', authorId: dana.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'),
    title: 'Annual Photo & Media Release', description: 'Permission to feature your scholar in Success Academy newsletters, website, and social media. You may decline with no impact to your scholar.',
    dueDate: daysFromNow(10), createdAt: daysAgo(6), requiresSignature: true,
    fields: [
      { id: 'f1', label: 'Scholar Name', type: 'text', required: true },
      { id: 'f2', label: 'Photo/media permission', type: 'radio', required: true, options: ['I grant permission', 'I do NOT grant permission'] },
      { id: 'f3', label: 'Comments', type: 'textarea', required: false },
    ],
    responses: [],
  },
  {
    id: 'form_health', type: 'form', authorId: nurse.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'),
    title: 'Emergency & Health Information (2026–27)', description: 'Required annual update of emergency contacts and health info before the first day of school.',
    dueDate: daysFromNow(30), createdAt: daysAgo(4), requiresSignature: false,
    fields: [
      { id: 'f1', label: 'Scholar Name', type: 'text', required: true },
      { id: 'f2', label: 'Primary emergency contact', type: 'text', required: true },
      { id: 'f3', label: 'Relationship', type: 'text', required: true },
      { id: 'f4', label: 'Emergency phone', type: 'text', required: true },
      { id: 'f5', label: 'Known allergies', type: 'textarea', required: false },
      { id: 'f6', label: 'Current medications', type: 'textarea', required: false },
      { id: 'f7', label: 'Preferred hospital', type: 'text', required: false },
    ],
    responses: [],
  },
  {
    id: 'form_lunch', type: 'form', authorId: dana.id, audience: A('network', networkGroup.id, 'Success Academy — All Families'),
    title: 'Free & Reduced-Price Meal Benefit Form (2026–27)', description: 'Determines meal benefits and supports school funding. All families encouraged to complete — takes ~3 minutes.',
    dueDate: daysFromNow(45), createdAt: daysAgo(5), requiresSignature: true,
    fields: [
      { id: 'f1', label: 'Household size', type: 'text', required: true },
      { id: 'f2', label: 'Do you receive SNAP/TANF benefits?', type: 'radio', required: true, options: ['Yes', 'No'] },
      { id: 'f3', label: 'Total monthly household income (before taxes)', type: 'text', required: false },
      { id: 'f4', label: 'Names of scholars enrolled at Success Academy', type: 'textarea', required: true },
    ],
    responses: [],
  },
];

// ---------------------------------------------------------------------------
// 10. CALENDAR / EVENTS (RSVP — counts scaled, lists kept reasonable)
// ---------------------------------------------------------------------------
const events = [
  { id: 'evt_fieldday', title: 'Field Day', date: daysFromNow(2), start: '8:30 AM', end: '1:00 PM', location: 'Marcus Garvey Park', schoolId: PRIMARY, audience: A('school', schoolGroup.id, 'Harlem 1'), category: 'Athletics', description: 'House-color teams compete in relays, tug-of-war, and more. Rain or shine.', rsvps: { yes: pickN(hwParents, 60).map((u) => u.id).concat(priya.id, james.id), no: [], maybe: [carmen.id] } },
  { id: 'evt_conf', title: 'Family–Teacher Conferences (Cornell)', date: daysFromNow(1), start: '3:30 PM', end: '5:00 PM', location: 'Cornell classroom', schoolId: PRIMARY, audience: A('class', cornell.id, 'Cornell'), category: 'Academic', description: 'Sign up for a 15-min slot in the Sign-Ups tab.', rsvps: { yes: [james.id, carmen.id], no: [], maybe: [] } },
  { id: 'evt_booktasting', title: 'Cornell Book Tasting', date: daysFromNow(3), start: '1:00 PM', end: '2:30 PM', location: 'Cornell classroom', schoolId: PRIMARY, audience: A('class', cornell.id, 'Cornell'), category: 'Classroom', description: 'Read-a-Thon celebration & summer reading kickoff.', rsvps: { yes: [priya.id], no: [], maybe: [] } },
  { id: 'evt_movingup', title: 'Moving Up Ceremony (4th Grade)', date: daysFromNow(2, 10), start: '10:00 AM', end: '11:30 AM', location: 'Cafeteria', schoolId: PRIMARY, audience: A('school', schoolGroup.id, 'Harlem 1'), category: 'Ceremony', description: 'Celebrating our rising 5th-grade scholars! Up to 4 guests per scholar.', rsvps: { yes: pickN(hwParents, 90).map((u) => u.id), no: [], maybe: pickN(hwParents, 20).map((u) => u.id) } },
  { id: 'evt_council', title: 'Family Council End-of-Year Meeting', date: daysFromNow(5), start: '6:00 PM', end: '7:00 PM', location: 'Cafeteria (Zoom available)', schoolId: PRIMARY, audience: A('club', ptaGroup.id, 'Family Council'), category: 'Meeting', description: 'Budget recap, next-year officer elections, summer events.', rsvps: { yes: [priya.id], no: [], maybe: [] } },
  { id: 'evt_lastday', title: 'Last Day of School (Half Day)', date: daysFromNow(3, 8), start: '8:00 AM', end: '11:30 AM', location: 'Harlem 1', schoolId: PRIMARY, audience: A('school', schoolGroup.id, 'Harlem 1'), category: 'Calendar', description: 'Dismissal at 11:30 AM. No aftercare. Report cards posted to Documents.', rsvps: { yes: [], no: [], maybe: [] } },
  { id: 'evt_reportcards', title: 'Report Cards Available', date: daysFromNow(3, 12), start: '4:00 PM', end: null, location: 'Online (Documents tab)', schoolId: PRIMARY, audience: A('school', schoolGroup.id, 'Harlem 1'), category: 'Academic', description: 'End-of-year report cards posted to your Documents.', rsvps: { yes: [], no: [], maybe: [] } },
  { id: 'evt_summerstem', title: 'Summer STEM Academy Begins', date: daysFromNow(13), start: '8:00 AM', end: '3:00 PM', location: 'Harlem 1', schoolId: PRIMARY, audience: A('network', networkGroup.id, 'Network'), category: 'Program', description: 'July 7–Aug 1. Register by June 30.', rsvps: { yes: [], no: [], maybe: [] } },
];

// ---------------------------------------------------------------------------
// 11. ALERTS (urgent mass comms w/ Smart Alert failover + delivery stats)
// ---------------------------------------------------------------------------
const totalHw = hwParents.length;
const alerts = [
  {
    id: 'alert_earlydismissal', severity: 'urgent', authorId: dana.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'),
    title: 'Early Dismissal Today — 12:00 PM (Heat Advisory)', createdAt: hoursAgo(6),
    body: 'Due to a citywide heat advisory and limited A/C in parts of the building, Harlem 1 will dismiss at 12:00 PM today. Aftercare is canceled. Buses will run on the early schedule. Please arrange pickup. Lunch will be served before dismissal.',
    bodyEs: 'Debido a una advertencia de calor en toda la ciudad, Harlem 1 terminará las clases a las 12:00 PM hoy. El cuidado después de clases está cancelado. Los autobuses funcionarán en el horario temprano.',
    channels: ['sms', 'voice', 'app', 'email'], smartAlert: true,
    delivery: { recipients: totalHw, sms: totalHw, smsDelivered: totalHw - 6, voiceFailover: 6, email: totalHw, app: Math.floor(totalHw * 0.7), opened: Math.floor(totalHw * 0.86), confirmed: Math.floor(totalHw * 0.62) },
  },
  {
    id: 'alert_drill', severity: 'info', authorId: alana.id, audience: A('school', schoolGroup.id, 'Harlem 1 — All Families'),
    title: 'Heads-up: Scheduled Safety Drill Thursday', createdAt: daysAgo(2, 3),
    body: 'This Thursday we will conduct a routine, scheduled lockdown drill at 10 AM. This is a DRILL — there is no threat. We share in advance so you can talk with your scholar. Drills help keep everyone prepared and calm.',
    bodyEs: 'Este jueves realizaremos un simulacro de seguridad de rutina a las 10 AM. Es un SIMULACRO — no hay ninguna amenaza. Lo compartimos con anticipación para que pueda hablar con su estudiante.',
    channels: ['app', 'email'], smartAlert: false,
    delivery: { recipients: totalHw, sms: 0, smsDelivered: 0, voiceFailover: 0, email: totalHw, app: Math.floor(totalHw * 0.7), opened: Math.floor(totalHw * 0.71), confirmed: 0 },
  },
];

// ---------------------------------------------------------------------------
// 12. ATTENDANCE (rules + recent events for demo scholars)
// ---------------------------------------------------------------------------
const attendanceRules = [
  { id: 'ar_absent', name: 'Same-day absence notice', trigger: 'Marked absent (unexcused) by 9:30 AM', channels: ['sms', 'app'], active: true },
  { id: 'ar_tardy', name: 'Repeated tardies', trigger: '3+ tardies in a rolling 10 school days', channels: ['email', 'app'], active: true },
  { id: 'ar_truancy', name: 'Truancy threshold (NYSED)', trigger: '10+ unexcused absences (school year)', channels: ['email', 'voice'], active: true },
  { id: 'ar_uniform', name: 'Uniform reminder', trigger: '3+ out-of-uniform days in a month', channels: ['app'], active: false },
];
const attendanceEvents = [
  { id: id('att'), studentId: rohan.id, date: daysAgo(7, 0), type: 'tardy', note: 'Arrived 9:12 AM', notified: true, excused: true },
  { id: id('att'), studentId: tyler.id, date: daysAgo(12, 0), type: 'absent', note: 'Unexcused', notified: true, excused: false },
  { id: id('att'), studentId: mateo.id, date: daysAgo(4, 0), type: 'tardy', note: 'Arrived 8:55 AM', notified: true, excused: true },
];

// ---------------------------------------------------------------------------
// 13. FEES / PAYMENTS
// ---------------------------------------------------------------------------
const fees = [
  { id: 'fee_amnh_aanya', studentId: aanya.id, label: 'AMNH Field Trip', amount: 12.0, dueDate: daysFromNow(2), status: 'unpaid', paidAt: null },
  { id: 'fee_chess_aanya', studentId: aanya.id, label: 'Summer Chess Intensive', amount: 25.0, dueDate: daysFromNow(7), status: 'unpaid', paidAt: null },
  { id: 'fee_uniform_rohan', studentId: rohan.id, label: 'Replacement Uniform Polo', amount: 14.0, dueDate: daysFromNow(1), status: 'unpaid', paidAt: null },
  { id: 'fee_yearbook_aanya', studentId: aanya.id, label: '2025–26 Yearbook', amount: 22.0, dueDate: daysAgo(10), status: 'paid', paidAt: daysAgo(12) },
  { id: 'fee_amnh_tyler', studentId: tyler.id, label: 'AMNH Field Trip', amount: 12.0, dueDate: daysFromNow(2), status: 'paid', paidAt: daysAgo(3) },
  { id: 'fee_amnh_mateo', studentId: mateo.id, label: 'AMNH Field Trip', amount: 12.0, dueDate: daysFromNow(2), status: 'unpaid', paidAt: null },
];

// ---------------------------------------------------------------------------
// 14. DOCUMENTS (secure per-scholar delivery — report cards, score reports…)
// ---------------------------------------------------------------------------
const documents = [
  { id: 'doc_rc_aanya', studentId: aanya.id, title: 'Q4 Report Card (2025–26)', type: 'Report Card', issuedBy: marcus.id, date: daysAgo(1, 2), summary: 'Aanya earned “Advanced” in ELA and Math and “Proficient” in Science. Reading level R. Teacher note: a joyful, curious leader in Cornell — a standout year. Promoted to 4th grade.', acknowledgedBy: [] },
  { id: 'doc_map_aanya', studentId: aanya.id, title: 'Spring NWEA MAP — Score Report', type: 'Assessment', issuedBy: alana.id, date: daysAgo(8, 1), summary: 'Reading RIT 205 (94th percentile), Math RIT 212 (97th percentile). Year-over-year growth exceeded the national norm in both subjects.', acknowledgedBy: [] },
  { id: 'doc_place_aanya', studentId: aanya.id, title: '2026–27 Class Placement Letter', type: 'Letter', issuedBy: alana.id, date: daysAgo(3, 4), summary: 'Aanya is placed in 4th grade, “Spelman” homeroom, with Lead Teacher Ms. A. Johnson. First day is Monday, Aug 18.', acknowledgedBy: [priya.id] },
  { id: 'doc_rc_rohan', studentId: rohan.id, title: 'Q4 Report Card (2025–26)', type: 'Report Card', issuedBy: alana.id, date: daysAgo(1, 3), summary: 'Rohan earned “Proficient” across subjects with strong growth in early reading (Level H). Teacher note: a kind friend who is building stamina and confidence. Promoted to 2nd grade.', acknowledgedBy: [] },
  { id: 'doc_rc_tyler', studentId: tyler.id, title: 'Q4 Report Card (2025–26)', type: 'Report Card', issuedBy: marcus.id, date: daysAgo(1, 5), summary: 'Tyler earned “Proficient/Advanced” with exceptional growth in reading (Level R). Teacher note: a determined, focused scholar. Promoted to 4th grade.', acknowledgedBy: [james.id] },
  { id: 'doc_rc_mateo', studentId: mateo.id, title: 'Boletín de Calificaciones Q4 (2025–26)', type: 'Report Card', issuedBy: marcus.id, date: daysAgo(1, 6), summary: 'Mateo obtuvo “Competente/Avanzado” con un crecimiento sobresaliente en lectura (Nivel R). Nota del maestro: un escritor reflexivo y un gran compañero. Promovido a 4.º grado.', acknowledgedBy: [] },
];

// ---------------------------------------------------------------------------
// 15. MODERATION QUEUE (AI flags — admin feature)
// ---------------------------------------------------------------------------
const moderation = [
  { id: 'mod_1', conversationContext: 'Family comment on "Field Day is this Friday!"', authorId: pick(parentPool).id, body: 'This is the THIRD time the date has changed. Honestly ridiculous and disorganized — whoever is running this should be ashamed.', flag: 'Hostile / unprofessional tone', confidence: 0.78, status: 'pending', createdAt: hoursAgo(9) },
  { id: 'mod_2', conversationContext: 'Direct message to Coach Santos', authorId: pick(parentPool).id, body: 'Can you send me another family\'s phone number? [redacted contact request]', flag: 'Possible PII / contact-sharing request', confidence: 0.64, status: 'pending', createdAt: hoursAgo(28) },
  { id: 'mod_3', conversationContext: 'Class post comment', authorId: pick(parentPool).id, body: 'Ugh this is so stupid', flag: 'Mild profanity', confidence: 0.55, status: 'approved', createdAt: daysAgo(2) },
];

// ---------------------------------------------------------------------------
// 15b. AUTOMATIONS (rule-based outreach — fixes "no automated/rule-based outreach")
// ---------------------------------------------------------------------------
const automations = [
  { id: 'auto_welcome', name: 'New Family Welcome Series', trigger: 'Scholar added in eSD', audienceDesc: 'New families (first 30 days)', type: 'series', steps: 5, channels: ['app', 'email', 'sms'], active: true, lastRun: hoursAgo(5), reached: 128 },
  { id: 'auto_atrisk', name: 'At-Risk Family Re-Engagement', trigger: '3+ absences OR no app opens in 30 days', audienceDesc: 'Families at high risk of leaving', type: 'series', steps: 3, channels: ['sms', 'voice', 'email'], active: true, lastRun: hoursAgo(30), reached: 36 },
  { id: 'auto_absence', name: 'Same-Day Absence Outreach', trigger: 'Unexcused absence by 9:30 AM', audienceDesc: 'Guardians of absent scholars', type: 'trigger', channels: ['sms', 'app'], active: true, lastRun: hoursAgo(7), reached: 412 },
  { id: 'auto_form', name: 'Missing Form Reminder', trigger: 'Required form unsigned, 3 days before due', audienceDesc: 'Guardians with incomplete forms', type: 'trigger', channels: ['app', 'email'], active: true, lastRun: hoursAgo(20), reached: 88 },
  { id: 'auto_conf', name: 'Conference Reminder', trigger: '24 hours before a booked conference slot', audienceDesc: 'Families with conference bookings', type: 'trigger', channels: ['sms', 'app'], active: false, lastRun: null, reached: 0 },
];

// ---------------------------------------------------------------------------
// 15c. INTEGRATIONS (fixes "no Salesforce connection" + "separate login")
// ---------------------------------------------------------------------------
const integrations = [
  { id: 'int_esd', name: 'eSchoolData (eSD)', kind: 'Student Information System', status: 'connected', direction: 'Roster sync (inbound)', detail: 'Rosters & contacts sync nightly. Scholars are auto-enrolled — families need no sign-up to receive messages.', lastSync: hoursAgo(9) },
  { id: 'int_sf', name: 'Salesforce', kind: 'Family CRM', status: 'connected', direction: 'Engagement sync (outbound)', detail: 'Every message, open, RSVP, and form completion posts to the family\'s Salesforce profile in real time — communication is part of the full family record.', lastSync: hoursAgo(1) },
  { id: 'int_sso', name: 'Success Academy SSO', kind: 'Single Sign-On (Google / Microsoft)', status: 'connected', direction: 'Authentication', detail: 'One sign-in with your SA account — no separate Family Connect username or password.', lastSync: hoursAgo(2) },
  { id: 'int_twilio', name: 'Twilio', kind: 'SMS & Voice', status: 'connected', direction: 'Delivery (outbound)', detail: 'Two-way texting and Smart-Alert voice failover.', lastSync: hoursAgo(0.2) },
  { id: 'int_email', name: 'Email Delivery', kind: 'Email', status: 'connected', direction: 'Delivery (outbound)', detail: 'Bulk + transactional email with open tracking.', lastSync: hoursAgo(0.4) },
];

// ---------------------------------------------------------------------------
// 16. NOTIFICATION PREFERENCES (per user)
// ---------------------------------------------------------------------------
const prefs = {};
users.forEach((u) => {
  prefs[u.id] = {
    channels: { app: true, email: u.reachedBy.includes('email'), sms: u.reachedBy.includes('sms'), voice: u.role === 'parent' },
    digest: u.role === 'parent' ? pick(['instant', 'instant', 'daily']) : 'instant',
    quietHours: { enabled: u.role === 'parent', start: '9:00 PM', end: '7:00 AM' },
    language: u.language,
  };
});

// ---------------------------------------------------------------------------
// ASSEMBLE
// ---------------------------------------------------------------------------
const db = {
  meta: { generatedAt: at(NOW), product: 'Success Academy — Family Connect', version: '1.1.0', families: parentPool.length },
  district, schools,
  users, students, groups,
  guardianMap, studentMap,
  posts, conversations, signups, forms, events, alerts, autoNotices: [],
  attendanceRules, attendanceEvents, fees, documents, automations, integrations, moderation, prefs,
  personas: [
    { userId: jarrod.id, label: 'Jarrod Wolf', sub: 'Head, Enterprise AI', role: 'admin' },
    { userId: abhinav.id, label: 'Abhinav Mathur', sub: 'Executive, Enterprise Services', role: 'admin' },
    { userId: poulomi.id, label: 'Poulomi Banerjee', sub: 'Lead Mobile Engineer', role: 'admin' },
    { userId: dana.id, label: 'Dana Okafor', sub: 'Director of Family Engagement', role: 'admin' },
    { userId: marcus.id, label: 'Marcus Bell', sub: 'Lead Teacher — Cornell (3rd)', role: 'teacher' },
    { userId: priya.id, label: 'Priya Sharma', sub: 'Parent of Aanya & Rohan', role: 'parent' },
    { userId: carmen.id, label: 'Carmen Ruiz', sub: 'Parent of Mateo (Español)', role: 'parent' },
  ],
};

const outDir = path.join(__dirname, 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'seed.json'), JSON.stringify(db));
// also expose to the static front end (the serverless on-device store fetches this)
fs.writeFileSync(path.join(__dirname, 'public', 'seed.json'), JSON.stringify(db));

const staff = users.filter((u) => u.role !== 'parent').length;
const sizeMB = (fs.statSync(path.join(outDir, 'seed.json')).size / 1048576).toFixed(2);
console.log('✅ seed.json written — Success Academy (scaled)');
console.log(`   ${parentPool.length} families · ${staff} staff · ${users.length} total accounts · ${students.length} scholars`);
console.log(`   ${groups.length} groups · ${posts.length} posts · ${documents.length} documents · seed.json ${sizeMB} MB`);
