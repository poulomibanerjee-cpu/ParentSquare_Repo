# Success Academy — Family Connect 🟧

A self-contained, **zero-dependency** local clone of [ParentSquare](https://www.parentsquare.com/) — the K-12 family-engagement platform — re-skinned and populated for **Success Academy Charter Schools** with **fictional data**.

No build step, no `npm install`, no database server. Just Node's built-ins (`http` + `fs`), a vanilla ES-module front end, and a JSON file that persists your interactions.

> Authentic SA touches: scholars (not "students"), classrooms **named after colleges** (Cornell, Spelman…), the chess team, hands-on science, THINK Literacy, orange brand identity, real school names (Harlem 1, Bronx 2, SA High School of the Liberal Arts). All names and data are invented for the demo.

---

## Quick start

```bash
cd parentsquare
node server.cjs          # or: npm start
```

Then open **http://localhost:4310**.

- Demo data is generated on first run and persists to `data/db.json`.
- Click your avatar (top-right) → **Reset demo data** to restore the original seed
  (or `curl -X POST http://localhost:4310/api/reset`, or `npm run reset`).

---

## Persona switching — every side of the platform

Click the avatar (top-right) to switch between four people sharing one dataset:

| Persona | Role | What you'll see |
|---|---|---|
| **Dana Okafor** | 🛡️ Director of Family Engagement | Analytics dashboard, mass alerts + delivery reports, AI moderation, document registry |
| **Marcus Bell** | 🍎 Lead Teacher (Cornell, 3rd) | Class posts, two-way messaging, sign-ups, forms, **Alerts** (explicit grant, scoped to Cornell/Harlem 1), **Auto Notices** |
| **Priya Sharma** | 👪 Parent (English) | Feed, RSVPs, e-sign permission slips, pay fees, report cards |
| **Carmen Ruiz** | 👪 Parent (**Español**) | The whole app **auto-translated to Spanish**, incl. messages & report card |

Toggle **EN / ES** (top bar) any time to watch the entire UI *and* content translate live.

---

## Feature tour (mirrors ParentSquare)

- **🏠 Posts / Feed** — school, class & network announcements with reactions, threaded comments, photo/PDF attachments, multi-channel badges (App / Email / Text), pinning.
- **💬 Messaging** — two-way direct & group conversations with **automatic translation** (Marcus types English → Carmen reads Spanish), unread counts, composer.
- **🙌 Sign-Ups** — family-teacher **conferences**, **volunteer** slots, **item donations**, with live capacity, progress rings, claim/unclaim.
- **✍️ Forms & Permission Slips** — fillable fields with **electronic signature**, due dates, per-scholar status, staff-side response viewer.
- **📁 Documents** — secure per-scholar delivery of **report cards, NWEA MAP score reports, and placement letters**, with read tracking and **acknowledge-receipt**. *(Closest match to ParentSquare's document delivery.)*
- **📅 Calendar & Events** — upcoming events with **RSVP** and a mini month view.
- **🔔 Alerts** — urgent mass notifications with **Smart Alert** (text-first, voice failover) and full **delivery funnels** (sent → delivered → opened → confirmed). Admins/school leaders can send by role; teachers only with an explicit grant, scoped to their own school/classes.
- **📨 Auto Notices** — the *other* notification type: one shared template, but each family sees their **own scholar merged in** (e.g. "Dear {{scholar_first}}..."), not a broadcast. Any teacher or admin can send one.
- **🕐 Attendance** — threshold-based **auto-notification rules** (truancy, tardies…), per-scholar history for families.
- **💳 Payments** — field-trip / uniform / chess fees, mock Stripe checkout, pay-all, history; collection totals for admins.
- **👥 Directory** — groups/classes/teams/bus routes and a searchable contact directory.
- **🛡️ AI Moderation** *(admin)* — flagged messages held for review with confidence scores; approve / block.
- **⚙️ Settings** — per-channel notification preferences, digest frequency, quiet hours, preferred language.

---

## Architecture

```
parentsquare/
├── server.cjs          # zero-dep server: static + /api/state + /api/mutate + /api/reset
├── seed.cjs            # generates data/seed.json (SA-themed connected dataset)
├── package.json        # type:module, scripts (start / seed / reset)
├── data/{seed,db}.json # pristine seed + working copy (your interactions persist)
└── public/
    ├── index.html · styles.css
    └── js/
        ├── core.js     # state, API client, i18n/translation, formatting, DOM + UI primitives
        ├── app.js      # shell: top bar, persona switcher, role-based nav, router, alert banner
        ├── feed.js · messages.js · engage.js · records.js · directory.js · admin.js
```

**State flow:** the browser loads the whole DB from `GET /api/state`. Every action POSTs `{op, payload}` to `/api/mutate`; the server applies the op, writes `db.json`, and returns new state, which re-renders the view.

---

## Scale & performance

Ships with a realistic **1,000-family** network — **~1,040 accounts and ~1,300 scholars** across the 3 schools, in **~30 college-named class sections**, while the curated demo cast (Priya / Marcus / Cornell) stays intact.

It stays snappy at that size:
- **Server holds the DB in memory** (parses `db.json` once, write-through on mutate) → `GET /api/state` is **~7 ms / 0.8 MB**; mutations **~12 ms**.
- **Lists are capped** so no view ever renders thousands of nodes: the directory shows 50 with "search to narrow", group modals show 40 + "+N more", form responses cap at 50. Every admin view renders in **< 3 ms** over the full dataset.
- Reaction arrays are capped in the seed so posts don't carry 700-id blobs.

Change the size: `FAMILIES=5000 npm run seed` (then delete `data/db.json`).

```bash
npm test            # 21-check API smoke test — exercises every mutation op
```

## Notes
- **Everything is fictional.** Names, scholars, and messages are invented. Payments are a mock (no real charge). "Translations" are pre-written Spanish strings, not a live MT call.
- Runs on **Node ≥ 18**. Change the port with `PORT=5000 node server.cjs`.
- Regenerate a fresh dataset: `npm run seed` then delete `data/db.json`.
