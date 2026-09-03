# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Success Academy — Family Connect**: a self-contained, zero-dependency ParentSquare-style
family-engagement platform, re-skinned for Success Academy with fictional demo data (see
`README.md` for the full feature tour and persona table, `TESTS.md` for test coverage, and
`PORTING.md` for the (inert, not-wired-in) plan to stand this up on SA's real FastAPI/Postgres
stack). No frontend framework, no bundler, no `npm install` needed to run it — vanilla
ES-module JS + Node's built-in `http`/`fs`/`node:sqlite`.

## Commands

```bash
node server.cjs          # or: npm start — starts the app at http://localhost:4310
node seed.cjs             # regenerate data/seed.json (FAMILIES=5000 node seed.cjs for scale)
npm run reset             # reseed + delete the working SQLite DB (fresh demo state)
npm test                  # test-smoke.cjs — 32 server-side API checks (also resets demo data after)
```

In-app end-to-end suite (138 checks) — open the app, then in the browser console:
```js
(await import('./js/e2e-test.js')).runAll()
```
See `TESTS.md` before adding to either suite — it documents a real timing hazard (the home
feed renders a loading placeholder synchronously, then fills in posts once its paginated
fetch resolves; e2e assertions that read post DOM must `waitFor(...)`, not a single
microtask tick) and the current feature/check inventory.

To preview in the Browser tool, add a `.claude/launch.json` pointing `node server.cjs` at
port 4310 (this file is gitignored — recreate it per environment, don't commit it).

## Architecture

**No build step.** `server.cjs` serves `public/` as static files and mounts a tiny JSON API;
`public/index.html` loads `public/js/app.js` as an ES module, which imports the other
`public/js/*.js` files directly (no bundler, so import paths must be exact, including the
`.js` extension).

**Data flow — single source of truth, generic mutation pipeline:**
- `seed.cjs` generates `data/seed.json` (a full, richly-connected fictional dataset — 1,000
  families, ~1,300 scholars, posts, conversations, alerts, personas, etc.) and also copies it
  to `public/seed.json` for the client's offline fallback.
- `server.cjs` imports that seed into `data/family-connect.db` (SQLite via `node:sqlite`,
  one document-JSON table per collection — see `db.cjs`) on first run, then holds the DB **in
  memory** for the life of the process; every mutation applies to memory first, then
  writes through to SQLite.
- Client: `GET /api/state` fetches the whole in-memory DB once; every write goes through
  `POST /api/mutate {op, payload}`, handled by a big `OPS` table in `server.cjs` (one entry
  per operation — `react`, `createPost`, `sendMessage`, `claimSlot`, `sendAlert`, etc.). The
  server applies the op, persists the touched collection, and returns the new state.
  `GET /api/events` is a Server-Sent Events stream so **other open browser tabs/sessions see
  changes live** (this is what makes cross-persona testing meaningful — sending a message as
  one persona is visible to another persona's session without a manual refresh).
  `POST /api/reset` restores from `seed.json`.
- `api/*.cjs` are additively-mounted route modules for the newer, *scoped/paginated* reads
  (`api/queries.cjs`: `/api/feed`, `/api/conversations`, `/api/alerts`, `/api/dashboard`,
  `/api/unread`; `api/fanout.cjs`: `/api/blast`) — these exist because `GET /api/state`
  shipping the *entire* dataset doesn't scale, and per `PORTING.md` §3 this scoped-endpoint
  pattern is exactly what a real backend should do instead. A broken/half-written module
  under `api/` is logged and skipped at boot, never crashes the server (see `server.cjs`'s
  `mountApiModules()`).
- `public/js/store.js` auto-detects **SERVER mode** (talks to the API above, live SSE sync)
  vs. **DEVICE mode** (falls back to `localStorage` + the bundled `seed.json` when no server
  is reachable, so the Capacitor/TestFlight build still works fully offline). Mutation logic
  in device mode mirrors the server's `OPS` byte-for-byte — if you add a new op to
  `server.cjs`, add the matching case to `store.js` too, or offline mode silently diverges.

**Frontend module layout** (`public/js/`, all vanilla, no JSX/build step):
- `core.js` — state (`S`), the API client, i18n/translation helpers, formatting, and small
  DOM-building primitives (`el`, etc.) used everywhere.
- `app.js` — boot, the shell (top bar, persona switcher, role-based sidebar nav, router,
  alert banner). `VIEWS` maps a view name to its render function; `shellActions()` renders
  the one persistent header action per view (currently just "New Post" on Home) — **don't**
  add a second trigger for an action a page already renders in its own `pageHead()`, that's
  exactly the duplicate-button bug fixed in commit `f0d4750`.
- `feed.js`, `messages.js`, `engage.js` (sign-ups/forms/calendar), `records.js`
  (documents/attendance/payments), `directory.js`, `admin.js` (dashboard/reports/alerts/
  moderation/automations/integrations), `config.js` (admin → Configure: Smart Lists, Groups,
  Automations) — one module per feature area, each exporting `render<View>(main)` functions
  wired into `app.js`'s `VIEWS`.
- `e2e-test.js` — see Commands above.

**Personas, not auth.** There's no login; `?me`-style client-side persona switching
(`core.js#setPersona`) stands in for real identity. `seed.cjs`'s `personas` array is the
switcher's source of truth (`{ userId, label, sub, role }`) — the network-leadership admins
(Abhinav, Poulomi) were added there alongside the original demo cast (Dana, Marcus,
Priya, Carmen) as real evaluators of this pilot, not fictional characters. `app.js`'s `boot()`
hardcodes which persona a fresh page load starts on — update that alongside `seed.cjs` if the
default should change (see the `usr_poulomi` references in both files).

**i18n:** every user-facing string goes through `core.js`'s `L(en, es)` helper, live-toggled
from the top bar — real translation, not a stub (see `README.md`'s persona table: Carmen
Ruiz's whole persona exists to exercise this).

**This is `PORTING.md`'s "prototype" side of a two-repo relationship** — it documents in
detail how this maps onto SA's real production stack (FastAPI/Postgres/Redis/Salesforce
auth/Terraform) if this ever needs to move off Node+SQLite. Read it before making
architectural changes that PORTING.md's mapping table depends on (e.g. the `OPS`-object
mutation pattern, or `/api/state` shipping the whole DB) — those are the exact seams a future
migration is written against.
