> **Status: implemented.** This is the planning doc behind the "teacher alert
> permissions + Auto Notices" work, kept here for the reasoning and explicit scope
> cuts behind it. See `TESTS.md` for the resulting test coverage and `README.md`'s
> feature tour for the shipped description. One thing changed from the plan below
> during implementation, noted at the bottom.

# Teacher alert permissions + Auto Notices as a second notification type

## Context

The user shared Success Academy's actual "Notification Module: Alerts & Auto Notices"
product requirements doc (18 pages). It defines **two genuinely distinct notification
types** — the real point behind "not just notifications, there are two types":

- **Alert** — a broadcast: one message, one body, sent as-is to every recipient in a
  chosen audience (school/class/group). Manually composed, one-way, no personalization.
  Has two severities: regular (schedulable, sender picks channels) and **Urgent**
  (instant, all channels forced on, overrides every family preference).
- **Auto Notice** — the opposite shape: one *template*, but a **different merged body
  per recipient**, personalized from that recipient's own scholar data (e.g. "Dear
  {{scholar_first}}... you're confirmed for {{meets}}"). Not a broadcast.

The doc also specifies alert **permissions**: "Network admins and school leaders must
hold alerting capability by role; other staff, **including teachers, only by explicit
grant**." Today, only admins can even see the Alerts nav item — `NAV.teacher` has no
`alerts` entry at all, and `renderAlerts`'s Send button is hard-gated to
`me.role === 'admin'`. That's the concrete bug behind "teachers are supposed to send
out alerts as well."

**Scope for this pass.** The full doc includes production-scale machinery this
zero-dependency demo shouldn't take on: CSV/SFTP data sources, query-bound sources,
a message library, 18-month audit retention, carrier-level opt-out simulation, digest/
quiet-hours interactions, data-warehouse sync. This plan implements the two real,
demonstrable distinctions the user flagged — permissioned alert sending, and Auto
Notices as a genuinely separate per-recipient-merged feature — using the app's
existing patterns (no file upload; Auto Notice recipients + merge data come from the
app's own scholar/guardian records, which is a strictly better fit here than a CSV).
Explicitly out of scope for this pass: message library, CSV/query data sources, voice/
translation on notices, granular per-template delegation, audit-log UI.

## Part A — Teacher alert permission (scoped sending)

**`seed.cjs`**: add `alertPermission: 'none' | 'alerts' | 'urgent'` to `makeUser`'s
staff records. Admins/school leaders keep implicit full (urgent) authority by role —
no field needed for them. Give `marcus` (the demo teacher) `alertPermission: 'alerts'`
— the explicit-grant path the doc requires, deliberately *not* urgent, since urgent
stays admin-exclusive by default.

**`core.js`**: two small helpers next to `audiencesFor`:
```js
export const canSendAlerts = (u) => u.role === 'admin' || ['alerts','urgent'].includes(u.alertPermission);
export const canSendUrgent = (u) => u.role === 'admin' || u.alertPermission === 'urgent';
```

**`app.js`**:
- Add `['alerts', 'Alerts', 'Alertas', 'bell']` to `NAV.teacher` (currently missing).
- Wherever the sidebar/mobile-nav maps `NAV[me.role]` to elements, filter out the
  `alerts` entry when `!canSendAlerts(me)` is false *and* the role isn't `parent`
  (parents already have read-only alert access today — unchanged) — i.e. teachers
  without the grant still don't see the entry point, per the doc's "must not see the
  corresponding entry point at all."

**`admin.js`**:
- `renderAlerts`: change the Send Alert button gate from `me.role === 'admin'` to
  `canSendAlerts(me)`.
- `openSendAlert`'s audience source: reuse the existing `audiencesFor(me)` helper
  (already used for post/form composition — filters to groups the actor leads or their
  own school, full org for admins) instead of whatever admin-only list it uses today.
  This is the actual "school-scoped sender must not target another school" requirement,
  and it's already-written code, just not wired into the alert composer yet.
- Compose modal: hide/disable the "Urgent" severity option unless `canSendUrgent(me)`.

## Part B — Auto Notices (new, second notification type)

**New file `public/js/notices.js`** (mirrors the one-module-per-feature pattern —
`feed.js`, `messages.js`, `engage.js`, `admin.js`), exporting `renderAutoNotices(main)`
and `openComposeNotice()`:
- Compose: title (internal), recipient scope = an existing group/audience (reuse
  `audiencesFor(me)` again — same scoping rule as Alerts), a body textarea with
  insertable merge tokens (`{{scholar_first}}`, `{{scholar_last}}`, `{{school_name}}` —
  the doc's "implicit merge fields," resolved from the app's own scholar/guardian
  records rather than an uploaded file).
- Preview: list each in-scope guardian with their merged body rendered inline (the
  doc's "two scholars in the same run receive different notices," demonstrated live
  instead of via a data-file preview step).
- Send: persists one row per guardian recipient with their own merged body — this is
  the structural difference from `alerts` (one shared body) that makes it a believable
  second type, not a recolored Alert.

**`seed.cjs`**: new empty `autoNotices: []` collection (add to the `db` object and to
`db.cjs`'s `ARRAY_COLLECTIONS`).

**`server.cjs`**: new `OPS.sendAutoNotice` (mirrors `sendAlert`'s shape: build the row,
prepend, persist, return new state).

**`store.js`**: matching DEVICE-mode case for `sendAutoNotice`, per the file's own
"mirror the server byte-for-byte" contract.

**`app.js`**: import `renderAutoNotices`; add to `VIEWS` as `notices`; add
`['notices', 'Auto Notices', 'Avisos automáticos', 'clip']` to both `NAV.admin` and
`NAV.teacher` (gated the same way as Alerts — only visible where the actor can send to
at least one group, i.e. admin or a teacher leading a class).

**`styles.css`**: small additions for the merge-token chips and the per-recipient
preview list, following the existing `.chip`/`.school-list-row` visual language rather
than inventing a new pattern.

## Verification
1. `npm test` (32 server checks) and the in-app e2e suite (currently 138) — both must
   stay green; add a couple of new e2e checks: Marcus (teacher, has `alerts` grant) can
   see and use the Alerts entry point and send a scoped alert; a second teacher/parent
   without the grant does not see it; a sent Auto Notice produces distinct merged bodies
   per recipient.
2. Manually in the browser: switch to Marcus, confirm "Alerts" appears in his nav, send
   a regular alert scoped to his own class, confirm Urgent isn't offered to him. Switch
   to an admin, confirm Urgent still works. Compose an Auto Notice to a class, confirm
   each guardian's preview shows their own scholar's name merged in, send it, confirm it
   persists after reload (same live-SSE/SQLite path as everything else in this app).
3. Commit + push to `ParentSquare_Repo` once verified, same as the rest of this
   session's work.

---

## Implementation notes (deviations from the plan above)

- **Part B storage shape changed for the better.** The plan above says Auto Notices
  would "persist one row per guardian recipient with their own merged body." While
  building it, `core.js#applyMerge` turned out to already do exactly this
  personalization for Posts (`{{scholar_first}}` etc.), resolved **per-viewer at
  render time** rather than pre-computed and stored per recipient. `sendAutoNotice`
  instead stores one shared-template record (title, body, audience — the same shape
  as an alert), and both the compose-time preview and the sent-notice detail view call
  `applyMerge(body, recipient)` once per guardian to render their personalized version.
  This reuses proven, tested code instead of duplicating storage, and was verified to
  produce genuinely distinct merged bodies per recipient (see `TESTS.md`).
- Auto Notices' permission ended up broader than Alerts' by design: any teacher or
  admin can send one (`canSendNotices`), vs. Alerts' explicit-grant-only model for
  teachers (`canSendAlerts`) — this was a deliberate choice so the two features are
  visibly different in *how* they're gated, not just in *what* they render.
