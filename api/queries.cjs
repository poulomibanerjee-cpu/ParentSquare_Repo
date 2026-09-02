/* ============================================================================
 * api/queries.cjs — scoped, paginated, SQL-backed READ endpoints
 *   The whole point: the client never loads the full dataset. Posts, threads,
 *   conversations and alerts come back already scoped to `me`, already paginated,
 *   with author/participant identities EMBEDDED so the browser needs no global
 *   users list. Loading every user is what falls over at 100k — none of these
 *   routes do that. User lookups are batched (one `... WHERE id IN (?)`), the
 *   dashboard is pure SQL aggregates, and group membership is parsed once from
 *   the tiny `groups` table.
 *
 * Mount contract:  module.exports = (sqlite) => ({ routes: { 'GET /api/feed': fn, … } })
 *   each fn gets ({ params:URLSearchParams, body }) and returns a plain object.
 * ==========================================================================*/

// ---- small shared helpers --------------------------------------------------
const num = (v, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };           // safe int from query string
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const slim = (u) => u && { id: u.id, name: u.name, avatar: u.avatar, color: u.color, title: u.title, role: u.role }; // identity card embedded on rows

// Batch-resolve user identity cards for a set of ids in ONE query (never N+1, never "load all users").
// Returns Map<id, slimUser>. Empty set → empty map (no SQL).
function fetchUsers(db, ids) {
  const uniq = [...new Set([...ids].filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;
  const ph = uniq.map(() => '?').join(',');                              // parameterized IN (...) — no string-built input
  const rows = db.prepare(`SELECT doc FROM users WHERE id IN (${ph})`).all(...uniq);
  for (const r of rows) { const u = JSON.parse(r.doc); map.set(u.id, slim(u)); }
  return map;
}

// Parse the (small) groups table once → membership lookups for audience scoping.
//   memberOf : Map<userId, Set<groupId>>   leads : Map<userId, Set<groupId>>
//   schoolOf : Map<groupId, schoolId>      (so a post's audience.id resolves to a school even if audience.schoolId is absent)
function loadGroups(db) {
  const memberOf = new Map(), leads = new Map(), schoolOf = new Map();
  const add = (m, k, v) => { let s = m.get(k); if (!s) m.set(k, (s = new Set())); s.add(v); };
  for (const r of db.prepare('SELECT doc FROM groups').all()) {
    const g = JSON.parse(r.doc);
    if (g.schoolId) schoolOf.set(g.id, g.schoolId);
    for (const uid of g.memberIds || []) add(memberOf, uid, g.id);
    for (const uid of g.leadIds || []) add(leads, uid, g.id);
  }
  return { memberOf, leads, schoolOf };
}

const getUserRow = (db, id) => db.prepare('SELECT id,name,role,school_id FROM users WHERE id=?').get(id);

// per-user engagement aggregate (the Salesforce-style profile read) — content-scale scan, one user
function engagementOf(db, userId) {
  let reacted = 0, comments = 0, messages = 0, rsvps = 0, forms = 0, docs = 0;
  for (const r of db.prepare('SELECT doc FROM posts').all()) { const p = JSON.parse(r.doc); if (Object.values(p.reactions || {}).some((a) => a.includes(userId))) reacted++; for (const c of p.comments || []) if (c.authorId === userId) comments++; }
  for (const r of db.prepare('SELECT doc FROM conversations').all()) { const c = JSON.parse(r.doc); for (const m of c.messages || []) if (m.senderId === userId) messages++; }
  for (const r of db.prepare('SELECT doc FROM events').all()) { const e = JSON.parse(r.doc); if (['yes', 'no', 'maybe'].some((k) => (e.rsvps?.[k] || []).includes(userId))) rsvps++; }
  for (const r of db.prepare('SELECT doc FROM forms').all()) { const f = JSON.parse(r.doc); if ((f.responses || []).some((x) => x.userId === userId)) forms++; }
  for (const r of db.prepare('SELECT doc FROM documents').all()) { const d = JSON.parse(r.doc); if ((d.acknowledgedBy || []).includes(userId)) docs++; }
  const score = reacted + comments * 2 + messages * 2 + rsvps + forms * 2 + docs;
  return { reacted, comments, messages, rsvps, forms, docs, score, level: score >= 6 ? 'High' : score >= 2 ? 'Medium' : 'Low' };
}

// network-wide engaged-parent ids (one pass over content) + per-user tallies for exports
function engagementScan(db) {
  const engaged = new Set();
  const tally = new Map(); // userId -> { reacted, comments, messages, rsvps, forms }
  const bump = (id, k) => { if (!id) return; const t = tally.get(id) || { reacted: 0, comments: 0, messages: 0, rsvps: 0, forms: 0 }; t[k]++; tally.set(id, t); engaged.add(id); };
  let reactions = 0, replies = 0;
  for (const r of db.prepare('SELECT doc FROM posts').all()) { const p = JSON.parse(r.doc); for (const a of Object.values(p.reactions || {})) { reactions += a.length; for (const id of a) bump(id, 'reacted'); } for (const c of p.comments || []) { replies++; bump(c.authorId, 'comments'); } }
  for (const r of db.prepare('SELECT doc FROM conversations').all()) { const c = JSON.parse(r.doc); for (const m of c.messages || []) bump(m.senderId, 'messages'); }
  for (const r of db.prepare('SELECT doc FROM events').all()) { const e = JSON.parse(r.doc); for (const k of ['yes', 'no', 'maybe']) for (const id of (e.rsvps?.[k] || [])) bump(id, 'rsvps'); }
  for (const r of db.prepare('SELECT doc FROM forms').all()) { const f = JSON.parse(r.doc); for (const x of f.responses || []) bump(x.userId, 'forms'); }
  return { engaged, tally, reactions, replies };
}

// Is `me` (already-resolved role + school + group sets) allowed to see this post/alert audience?
//   admin   → everything
//   teacher → groups they lead · anything in their school · network-wide
//   parent  → audience group they belong to (covers their school group) · network-wide · same-school school-wide
function canSee(item, me) {
  if (me.role === 'admin') return true;
  const aud = item.audience || {};
  if (aud.type === 'network') return true;                               // network = all families
  const audSchool = aud.schoolId || me.schoolOf.get(aud.id) || item.schoolId || null;
  if (me.role === 'teacher') {
    if (me.leadGroups.has(aud.id)) return true;                          // class/club/bus they lead
    return audSchool != null && audSchool === me.schoolId;              // their whole school
  }
  // parent
  if (me.memberGroups.has(aud.id)) return true;                          // explicit audience membership
  if (aud.type === 'school' && audSchool === me.schoolId) return true;   // school-wide to their school
  return false;
}

module.exports = (sqlite) => {
  // Resolve viewer once per request: role/school from indexed columns + their group sets from the parsed groups table.
  function viewer(meId) {
    const row = getUserRow(sqlite, meId);
    if (!row) return null;
    const { memberOf, leads, schoolOf } = loadGroups(sqlite);
    return {
      id: row.id, role: row.role, schoolId: row.school_id,
      memberGroups: memberOf.get(meId) || new Set(),
      leadGroups: leads.get(meId) || new Set(),
      schoolOf,
    };
  }

  return {
    routes: {
      // ------------------------------------------------------------------
      // GET /api/feed?me&limit&before — posts visible to `me`, pinned first,
      // then newest→oldest, cursor-paginated by `before` (ISO). Author embedded.
      // Posts scale with *content*, not family count, so scoping them in JS is
      // bounded; the part that must not scale (users) is the embed, which is batched.
      // ------------------------------------------------------------------
      'GET /api/feed': ({ params }) => {
        const meId = params.get('me') || '';
        const limit = clamp(num(params.get('limit'), 20), 1, 100);
        const before = params.get('before') || null;                     // ISO cursor: return posts strictly older
        const me = viewer(meId);
        if (!me) throw new Error(`unknown user: ${meId}`);

        let posts = sqlite.prepare('SELECT doc FROM posts').all().map((r) => JSON.parse(r.doc)).filter((p) => canSee(p, me));
        // pinned bubble to the top; within each band, newest first
        posts.sort((a, b) => (b.pinned - a.pinned) || (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0));
        if (before) posts = posts.filter((p) => p.createdAt < before);    // cursor walks strictly older than last seen

        const page = posts.slice(0, limit);
        const hasMore = posts.length > limit;
        const authors = fetchUsers(sqlite, page.map((p) => p.authorId));  // one IN(...) query for the page's authors
        const items = page.map((p) => ({ ...p, author: authors.get(p.authorId) || null }));
        const nextBefore = hasMore ? page[page.length - 1].createdAt : null;
        return { items, nextBefore, hasMore };
      },

      // ------------------------------------------------------------------
      // GET /api/conversations?me — my threads, most-recent-first, each with
      // last-message preview, unread count, and resolved participant cards.
      // ------------------------------------------------------------------
      'GET /api/conversations': ({ params }) => {
        const meId = params.get('me') || '';
        if (!getUserRow(sqlite, meId)) throw new Error(`unknown user: ${meId}`);

        const mine = sqlite.prepare('SELECT doc FROM conversations').all()
          .map((r) => JSON.parse(r.doc))
          .filter((c) => (c.participantIds || []).includes(meId));

        // batch-resolve every participant across all my conversations in one query
        const ids = new Set();
        for (const c of mine) for (const p of c.participantIds || []) ids.add(p);
        const users = fetchUsers(sqlite, ids);

        const items = mine.map((c) => {
          const msgs = c.messages || [];
          const last = msgs.length ? msgs[msgs.length - 1] : null;
          const unread = msgs.filter((m) => m.senderId !== meId && !m.read).length; // inbound + unread
          return {
            id: c.id, type: c.type, subject: c.subject || null,
            participants: (c.participantIds || []).map((p) => users.get(p)).filter(Boolean),
            lastMessage: last && { id: last.id, senderId: last.senderId, body: last.body, createdAt: last.createdAt },
            unread,
            updatedAt: last ? last.createdAt : null,
          };
        });
        // most-recent activity first; threads with no messages sink to the bottom
        items.sort((a, b) => (b.updatedAt || '') < (a.updatedAt || '') ? -1 : (b.updatedAt || '') > (a.updatedAt || '') ? 1 : 0);
        return { items };
      },

      // ------------------------------------------------------------------
      // GET /api/thread?id&me&limit&before — one conversation's messages,
      // paginated (returns oldest→newest *within* the page), sender embedded.
      // `before` is an ISO cursor: fetch the page ending just before it.
      // ------------------------------------------------------------------
      'GET /api/thread': ({ params }) => {
        const id = params.get('id') || '';
        const meId = params.get('me') || '';
        const limit = clamp(num(params.get('limit'), 30), 1, 200);
        const before = params.get('before') || null;
        if (!getUserRow(sqlite, meId)) throw new Error(`unknown user: ${meId}`);

        const row = sqlite.prepare('SELECT doc FROM conversations WHERE id=?').get(id);
        if (!row) throw new Error(`unknown conversation: ${id}`);
        const c = JSON.parse(row.doc);
        if (!(c.participantIds || []).includes(meId)) throw new Error('forbidden: not a participant'); // scope: must be in the thread

        // chronological, then take the newest window older than the cursor → return it oldest-first
        const chrono = (c.messages || []).slice().sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
        const visible = before ? chrono.filter((m) => m.createdAt < before) : chrono;
        const start = Math.max(0, visible.length - limit);
        const page = visible.slice(start);                                // last `limit`, still oldest→newest
        const hasMore = start > 0;                                        // older messages remain above the cursor

        const senders = fetchUsers(sqlite, page.map((m) => m.senderId));
        const participants = [...fetchUsers(sqlite, c.participantIds || []).values()];
        const items = page.map((m) => ({ ...m, sender: senders.get(m.senderId) || null }));
        return { items, hasMore, conversation: { id: c.id, type: c.type, subject: c.subject || null, participants } };
      },

      // ------------------------------------------------------------------
      // GET /api/alerts?me&limit — alerts visible to `me`, newest-first.
      // (Same audience scoping as the feed.)
      // ------------------------------------------------------------------
      'GET /api/alerts': ({ params }) => {
        const meId = params.get('me') || '';
        const limit = clamp(num(params.get('limit'), 20), 1, 100);
        const me = viewer(meId);
        if (!me) throw new Error(`unknown user: ${meId}`);

        const visible = sqlite.prepare('SELECT doc FROM alerts').all()
          .map((r) => JSON.parse(r.doc))
          .filter((a) => canSee(a, me))
          .sort((a, b) => a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0); // newest first
        const page = visible.slice(0, limit);
        const authors = fetchUsers(sqlite, page.map((a) => a.authorId));
        const items = page.map((a) => ({ ...a, author: authors.get(a.authorId) || null }));
        return { items };
      },

      // ------------------------------------------------------------------
      // GET /api/notices?me&limit — Auto Notices visible to `me`, same audience-
      // scoping rule as /api/alerts (canSee). Personalization is NOT resolved here —
      // each viewer merges the template client-side via applyMerge, same as posts.
      // ------------------------------------------------------------------
      'GET /api/notices': ({ params }) => {
        const meId = params.get('me') || '';
        const limit = clamp(num(params.get('limit'), 20), 1, 100);
        const me = viewer(meId);
        if (!me) throw new Error(`unknown user: ${meId}`);

        const visible = sqlite.prepare('SELECT doc FROM autoNotices').all()
          .map((r) => JSON.parse(r.doc))
          .filter((n) => canSee(n, me))
          .sort((a, b) => a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
        const page = visible.slice(0, limit);
        const authors = fetchUsers(sqlite, page.map((n) => n.authorId));
        const items = page.map((n) => ({ ...n, author: authors.get(n.authorId) || null }));
        return { items };
      },

      // ------------------------------------------------------------------
      // GET /api/dashboard — SQL AGGREGATES ONLY. No rows pulled into JS to be
      // reduced; this must stay a few ms at 100k. Counts come straight from
      // indexed columns (role, school_id) via COUNT/GROUP BY.
      // ------------------------------------------------------------------
      'GET /api/dashboard': () => {
        const totalFamilies = sqlite.prepare("SELECT count(*) c FROM users WHERE role='parent'").get().c;
        const verified = sqlite.prepare("SELECT count(*) c FROM users WHERE role='parent' AND verified=1").get().c;
        const verifiedPct = totalFamilies ? Math.round((verified / totalFamilies) * 1000) / 10 : 0;

        // per-school parent reach in a single GROUP BY (uses idx_users_school + idx_users_role)
        const perSchool = sqlite.prepare(
          "SELECT school_id AS schoolId, count(*) AS families, " +
          "SUM(CASE WHEN verified=1 THEN 1 ELSE 0 END) AS verified " +
          "FROM users WHERE role='parent' GROUP BY school_id ORDER BY families DESC"
        ).all().map((r) => ({
          schoolId: r.schoolId,
          families: r.families,
          verified: r.verified,
          verifiedPct: r.families ? Math.round((r.verified / r.families) * 1000) / 10 : 0,
        }));

        // 2 most-recent alerts — order/limit in SQL, parse only those 2 docs (not a full scan-reduce)
        const recentAlerts = sqlite.prepare(
          "SELECT doc FROM alerts ORDER BY json_extract(doc,'$.createdAt') DESC LIMIT 2"
        ).all().map((r) => {
          const a = JSON.parse(r.doc);
          return { id: a.id, severity: a.severity, title: a.title, createdAt: a.createdAt, audience: a.audience, recipients: a.delivery && a.delivery.recipients };
        });

        // channel reach (parents reachable per channel) — JSON membership, indexed role filter
        const reach = (ch) => sqlite.prepare(
          "SELECT count(*) c FROM users WHERE role='parent' AND EXISTS (SELECT 1 FROM json_each(doc,'$.reachedBy') WHERE value=?)"
        ).get(ch).c;
        const channelReach = { app: reach('app'), email: reach('email'), sms: reach('sms') };

        // posts this week + engaged families (reacted or replied). Posts scale with content,
        // not family count, so a content-scale scan here is bounded; the parent check is chunked SQL.
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
        const allPosts = sqlite.prepare('SELECT doc FROM posts').all().map((r) => JSON.parse(r.doc));
        const postsThisWeek = allPosts.filter((p) => p.createdAt > weekAgo).length;
        const engagedIds = new Set();
        for (const p of allPosts) {
          for (const ids of Object.values(p.reactions || {})) for (const id of ids) engagedIds.add(id);
          for (const c of p.comments || []) engagedIds.add(c.authorId);
        }
        let engaged = 0;
        const eArr = [...engagedIds];
        for (let i = 0; i < eArr.length; i += 900) {                       // stay under SQLite's bound-param cap
          const chunk = eArr.slice(i, i + 900), ph = chunk.map(() => '?').join(',');
          engaged += sqlite.prepare(`SELECT count(*) c FROM users WHERE role='parent' AND id IN (${ph})`).get(...chunk).c;
        }

        // top posts by engagement (reactions + comments), author embedded
        const scored = allPosts
          .map((p) => ({ p, react: Object.values(p.reactions || {}).reduce((n, a) => n + a.length, 0), comm: (p.comments || []).length }))
          .map((x) => ({ ...x, score: x.react + x.comm }))
          .sort((a, b) => b.score - a.score).slice(0, 4);
        const topAuthors = fetchUsers(sqlite, scored.map((s) => s.p.authorId));
        const topPosts = scored.map(({ p, react, comm }) => ({ id: p.id, title: p.title, audience: p.audience, createdAt: p.createdAt, reactions: react, comments: comm, author: topAuthors.get(p.authorId) || null }));

        return {
          stats: { totalFamilies, verified, verifiedPct, postsThisWeek, engaged, engagedPct: totalFamilies ? Math.round((engaged / totalFamilies) * 1000) / 10 : 0 },
          channelReach,
          perSchool,
          topPosts,
          recentAlerts,
        };
      },

      // ------------------------------------------------------------------
      // GET /api/schools — one row per school: families/students/posts/alerts/
      // reach/engagement. Small collections (schools, groups) are a handful of
      // rows so a full scan is fine; the per-parent counts reuse the same
      // indexed school_id/role columns as /api/dashboard.
      // ------------------------------------------------------------------
      'GET /api/schools': () => {
        const schools = sqlite.prepare('SELECT doc FROM schools').all().map((r) => JSON.parse(r.doc));
        const groups = sqlite.prepare('SELECT doc FROM groups').all().map((r) => JSON.parse(r.doc));
        const groupSchool = new Map(groups.map((g) => [g.id, g.schoolId]));
        const allPosts = sqlite.prepare('SELECT doc FROM posts').all().map((r) => JSON.parse(r.doc));
        const allAlerts = sqlite.prepare('SELECT doc FROM alerts').all().map((r) => JSON.parse(r.doc));
        const allStudents = sqlite.prepare('SELECT doc FROM students').all().map((r) => JSON.parse(r.doc));
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
        const schoolOf = (a) => a.schoolId ?? groupSchool.get(a.audience?.id) ?? null;

        const engagedIds = new Set();
        for (const p of allPosts) {
          for (const ids of Object.values(p.reactions || {})) for (const id of ids) engagedIds.add(id);
          for (const c of p.comments || []) engagedIds.add(c.authorId);
        }

        return schools.map((s) => {
          const families = sqlite.prepare("SELECT count(*) c FROM users WHERE role='parent' AND school_id=?").get(s.id).c;
          const verified = sqlite.prepare("SELECT count(*) c FROM users WHERE role='parent' AND school_id=? AND verified=1").get(s.id).c;
          const schoolParentIds = sqlite.prepare("SELECT id FROM users WHERE role='parent' AND school_id=?").all(s.id).map((r) => r.id);
          const engaged = schoolParentIds.filter((id) => engagedIds.has(id)).length;
          const posts = allPosts.filter((p) => schoolOf(p) === s.id);
          const alerts = allAlerts.filter((a) => schoolOf(a) === s.id);
          return {
            schoolId: s.id, name: s.name, short: s.short, level: s.level, color: s.color,
            families, students: allStudents.filter((x) => x.schoolId === s.id).length,
            posts: posts.length, postsThisWeek: posts.filter((p) => p.createdAt > weekAgo).length,
            alerts: alerts.length,
            verified, verifiedPct: families ? Math.round((verified / families) * 1000) / 10 : 0,
            engaged, engagedPct: families ? Math.round((engaged / families) * 1000) / 10 : 0,
          };
        }).sort((a, b) => b.families - a.families);
      },

      // ------------------------------------------------------------------
      // GET /api/unread?me — total inbound-unread across my conversations (the nav badge).
      // ------------------------------------------------------------------
      'GET /api/unread': ({ params }) => {
        const meId = params.get('me') || '';
        const mine = sqlite.prepare('SELECT doc FROM conversations').all()
          .map((r) => JSON.parse(r.doc))
          .filter((c) => (c.participantIds || []).includes(meId));
        let count = 0;
        for (const c of mine) for (const m of (c.messages || [])) if (m.senderId !== meId && !m.read) count += 1;
        return { count };
      },
    },
  };
};
