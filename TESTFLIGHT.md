# Getting Family Connect onto your boss's iPhone

The app is now **serverless** — all data + logic run on-device, so it installs and works
offline with no backend to host. There are two ways to share it:

- **A. Web / PWA link** — works in ~5 minutes, no Apple account, no cost. Best for "let my boss tap around today."
- **B. TestFlight** — a real installable iOS build. Needs a Mac + Xcode + an Apple Developer account ($99/yr). Best for an "official" beta.

---

## A. Instant web link + "Add to Home Screen" (no Apple account)

The whole app is static files in [`public/`](public/). Put that folder on any HTTPS static host:

**Easiest — Netlify Drop:** go to <https://app.netlify.com/drop> and drag the `public/` folder in. You get an HTTPS URL instantly. (Cloudflare Pages, Vercel, or GitHub Pages work the same way.)

Then on the iPhone:
1. Open the URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. It launches full-screen with the orange app icon — looks and feels like a native app (the service worker makes it work offline after first load).

> Each device keeps its own data in local storage. To start fresh, use **avatar → Reset demo data**.

---

## B. TestFlight (native build)

### Prerequisites (only you can do these)
- A **Mac** with **Xcode** (free, from the Mac App Store).
- An **Apple Developer Program** membership — **$99/yr**, enroll at <https://developer.apple.com/programs/>.
- Your boss's **Apple ID email** (to invite as a tester).

### One-time setup
```bash
cd parentsquare
npm install                     # pulls in Capacitor (listed in devDependencies)
npm run seed                    # ensure public/seed.json + icons are fresh
npx cap add ios                 # creates the native ios/ Xcode project
npm i @capacitor/local-notifications   # real push/buzz when alerts are sent
npx @capacitor/assets generate --ios --iconBackgroundColor '#E0521C' --iconBackgroundColorDark '#E0521C'
#   ^ generates all app-icon/splash sizes from public/icon-1024.png
npx cap sync ios                # copies the web app into the iOS project
npx cap open ios                # opens it in Xcode
```

### In Xcode
1. Select the **App** target → **Signing & Capabilities**.
2. Check **Automatically manage signing**, choose your **Team** (your Apple Developer account).
3. Set the **Bundle Identifier** (e.g. `org.successacademies.familyconnect` — must be unique to your account).
4. Pick a **Version** (e.g. `1.0`) and **Build** (e.g. `1`).
5. Top bar: set the run destination to **Any iOS Device (arm64)**.
6. Menu **Product → Archive**. When it finishes, the **Organizer** opens.
7. **Distribute App → App Store Connect → Upload**. Follow the prompts.

### In App Store Connect (<https://appstoreconnect.apple.com>)
1. Your build appears under your app → **TestFlight** after ~10–30 min of processing.
2. Add your boss as an **Internal Tester** (add their Apple ID under *Users and Access* first; internal testers skip Beta App Review and get it immediately — up to 100 people).
   - *External* testers also work but require a short Beta App Review per build.
3. Your boss installs the **TestFlight** app from the App Store, accepts the invite, and taps **Install**.

### Shipping an update
Change any web code, then:
```bash
npm run seed        # if data changed
npx cap sync ios
```
…bump the **Build** number in Xcode, **Archive**, and **Upload** again.

---

## Notifications (real)
Sending an alert — or **Settings → Device notifications → "Enable & send test"** — fires a **real** notification that buzzes the phone:
- On the **TestFlight/native** build it uses `@capacitor/local-notifications` (install step above). iOS will ask for permission the first time.
- In the **web/PWA** it uses the Web Notifications API (works on desktop and on installed iOS PWAs running iOS 16.4+).

Great demo move: open the app as **Dana (admin) → Send Alert** and your phone buzzes with the alert.

## What's real vs. mocked (so you can speak to it)
- **Real & working:** posts/reactions/comments, two-way translated messaging, sign-ups (with scholar/quantity/notes + staff "add someone"), e-sign forms, documents/report cards, calendar RSVP, alerts + delivery stats, **real device notifications**, payments, attendance, directory, AI-moderation queue, notification preferences, persona switching, 1,000-family dataset — all persist on-device.
- **Mocked:** the SMS/email/voice fan-out and cross-device delivery funnels are simulated, live machine translation (Spanish strings are pre-written), and real payment capture (Stripe is a mock).
