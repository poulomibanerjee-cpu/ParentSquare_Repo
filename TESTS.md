# Family Connect — feature & flow inventory + test suites

Two automated suites cover the app. **170 checks, all passing.**

## How to run

```bash
npm test          # 32 server-side checks — every mutation op via the HTTP API, incl. the persona roster
```

In-app end-to-end (138 checks) — open the app, then in the browser console:
```js
(await import('./js/e2e-test.js')).runAll()
// → { total: 138, passed: 138, failed: 0, failures: [] }
```
The e2e suite drives the **real app through the same `act()` pipeline the UI uses**, creates data, and asserts on both state and rendered DOM. It resets the on-device store before and after, so it's safe to run anytime.

> The home feed renders a "Loading…" placeholder synchronously, then fills in real posts once
> its scoped, paginated fetch (`C.feedPage`) resolves — by design, so the client never has to
> load the whole posts table. The e2e suite's feed-dependent assertions poll (bounded, via a
> small `waitFor` helper) rather than assume a single render tick, so they don't race that fetch.

---

## Features & flows covered

### Posts / Feed
- React (and one-reaction-per-user switching), comment, pin/unpin
- Create a post; create a **scheduled** post (hidden from families until its time, visible to author)
- Mail-merge personalization (`{{scholar_first}}`) renders per-reader
- Child-specific "🎒 For [Scholar]" labels; per-child feed filter narrows the feed
- Real photo upload (device → downscaled → on-device → rendered `<img>`)

### Messaging
- Send a message; mark-read clears unread; start a group conversation
- Two-way **auto-translation** (EN→ES for a Spanish-reading parent)

### Sign-Ups
- Claim a conference slot **with scholar + note**; capacity guard; unclaim
- Item slot **quantity** (clamped to remaining); staff **"add someone"** (records `addedBy`)
- Create a sign-up with generated slots

### Forms
- Submit with values + **e-signature**; build a new form (incl. radio options)

### Calendar
- RSVP (single-status); create an event; **check-in**; RSVP roster + CSV export

### Documents
- Acknowledge receipt of a report card (badge decrements)

### Payments
- Pay a fee (marks paid)

### Attendance
- Toggle a notification rule

### Alerts
- **Smart-list** targeting with live recipient counts; **scheduled** alert (0 opened until sent)
- Smart-Alert delivery funnel; real device notification on send

### Admin / leadership
- **Automations** toggle (rule-based outreach)
- **Integrations** sync (eSD / Salesforce / SSO / Twilio)
- **Reports**: one-click CSV export of any dataset (verified 1,000-row export); family sentiment; per-school engagement
- **Moderation** approve/block; **Settings** save prefs

### Cross-cutting
- Smart-list resolution, merge fields, engagement scoring, audience counts
- **Render sweep**: every view renders without error for every persona (admin / teacher / parent)
- Created items (event, sign-up, form, post) actually appear in their views
- Full ES translation of UI + content

### Persona roster
- Poulomi Banerjee is present in `users` and the persona switcher (admin role, SA email)
- She's the app's default persona on a fresh load
- Switching to her renders the admin dashboard with her name in the top bar
