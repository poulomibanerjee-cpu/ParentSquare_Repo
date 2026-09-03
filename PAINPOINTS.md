# ParentSquare pain points → how Family Connect fixes them

A demo map for the *ParentSquare: Current Pain Points* doc (SA, Jun 2026). Switch to **Poulomi Banerjee** (admin, the default persona on load) to see the staff/leadership fixes; switch to **Priya Sharma** (parent, 2 kids) for the family fixes.

| # | ParentSquare pain point | Family Connect fix | Where to look |
|---|---|---|---|
| 1 | Separate login, no SSO (480 support cases) | Single sign-on; no separate password | **Integrations → Success Academy SSO** |
| 2 | Notifications not child-specific; duplicates | Every post auto-labeled "🎒 For [Scholar]"; per-child feed filter; one message per family | **Priya → Home** ("By scholar" chips; "For Aanya" vs "For Aanya & Rohan") |
| 3 | Targeting is grade-only, built by hand | **Smart Lists** — rule-based audiences with live recipient counts | **Alerts → Send Alert → Audience** (Spanish-preferring, Unconfirmed, At-risk…) |
| 4 | Can't personalize *and* schedule | Merge fields (`{{scholar_first}}`) **and** Schedule-for-later, together | **Send Alert** (Personalize buttons + Schedule toggle) |
| 5 | Must log into web to DM | It's a phone app — DM from your pocket (real notifications) | **Messages** + **Settings → Device notifications** |
| 6 | Built-in forms need a login → staff use Google Forms | Forms work with no separate login (auto-enroll + SSO); families actually complete them | **Forms** + eSD note in **Integrations** |
| 7 | RSVP/attendance unused; can't pull lists | RSVP **roster + check-in + CSV export** | **Calendar →** event **→ RSVP roster & export** (staff) |
| 8 | Getting data out is very limited (critical) | One-click **CSV export** of any dataset (1,000-row engagement export verified) | **Reports → Export any dataset** |
| 9 | No Salesforce connection | Engagement **synced to Salesforce**; shown on each family's profile | **Integrations → Salesforce**; **Directory →** open a family |
| 10 | No automated/rule-based outreach | **Automations** incl. "At-Risk Family Re-Engagement" (the doc's exact example) | **Automations** |
| 11 | Dashboards unused (low satisfaction) | A dashboard staff use — sentiment, exportable, per-school | **Dashboard** + **Reports** |
| 12 | Use varies a lot by school | **Per-school engagement** breakdown (e.g. Harlem 1 67% vs Bronx 2 6% engaged) | **Reports → Engagement by school**; **Dashboard** |

Everything is fictional data and runs on-device. Notes still simulated (be honest in the demo): live machine translation, real payment capture, and the actual SMS/email/voice fan-out. Device notifications, CSV export, and all the flows above are real.
