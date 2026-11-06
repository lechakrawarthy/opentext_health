# Canopy

**API observability & incident response console**, built for OpenText.

Canopy runs scheduled health checks against APIs, shows which endpoint is failing, pinpoints **where** on the request path it broke (DNS, TLS, gateway, service), opens and resolves incidents automatically, and gives a super admin role-based control over who can view, run, edit data or manage people.

This repository is also a **design reference**. Most of this README explains the design system, the motion recipes and the components, so they can be reused in other projects.

> All data is seeded demo data: people, monitors, 24h of check history and incidents. Nothing connects to production systems.

---

## Contents

1. [Quick start](#1-quick-start)
2. [Project structure](#2-project-structure)
3. [Design system](#3-design-system)
4. [Motion recipes](#4-motion-recipes)
5. [Landing page anatomy](#5-landing-page-anatomy)
6. [Component catalogue](#6-component-catalogue)
7. [The console](#7-the-console)
8. [Roles & access](#8-roles--access)
9. [Deployment](#9-deployment)
10. [Customising](#10-customising)

---

## 1. Quick start

Requires **Node.js 22.13+** (Node 24 recommended). The database is SQLite through Node's built-in `node:sqlite`, so there's nothing native to compile.

```bash
npm install
npm run dev          # API on :4000 + Vite on :5173 → open http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | API server (watch mode) and Vite dev server together |
| `npm run build` | Builds the frontend into `web/dist` |
| `npm start` | Production: one server on `:4000` serving the API and the built UI |
| `npm run reset-db` | Deletes `data/canopy.db`; the next start re-seeds it |

### Demo accounts

All of them use the password **`canopy123`**. The login page has one-click buttons for each.

| Person | Email | Role |
| --- | --- | --- |
| Nagasatish Reddy | `superadmin@canopy.dev` | Super Admin: everything, including roles |
| Satish Kumar | `admin@canopy.dev` | Admin: operations & people, not roles |
| Bala Subramanian | `sre@canopy.dev` | SRE / On-call: monitors, incidents, edit data |
| Lakshmi Narayanan | `lakshmi@canopy.dev` | SRE / On-call |
| Veneela Rao | `dev@canopy.dev` | Developer: view, run checks, read data |
| Anudra Menon | `anudra@canopy.dev` | Developer |
| Sudha Iyer | `viewer@canopy.dev` | Viewer: read-only |
| Kiran Varma | `contractor@canopy.dev` | Viewer, **disabled** (shows a revoked account) |

---

## 2. Project structure

```
api/index.js             Vercel serverless entry (wraps server/app.js)
vercel.json              Vercel build output + rewrites
server/                  Express + node:sqlite
  app.js                 the Express app: auth routes, live event stream (SSE), static hosting
  index.js               long-running server: listen + start the check engine
  runtime.js             server vs serverless mode switch
  db.js                  schema, tx() and audit() helpers
  auth.js                scrypt passwords, cookie sessions, requirePerm()
  permissions.js         permission catalogue + default roles
  engine.js              check runner, failure classification, incident state machine
  troubleshoot.js        failure kind → hop, "where to look", causes, steps
  mock.js                demo APIs (healthy, flaky, slow, outage, 401, timeouts)
  seed.js                demo workspace with 24h of history
  routes/                monitoring.js · access.js · data.js

web/src/
  lib/
    motion.js            ★ motion helpers: smooth scroll, scroll progress, in-view, colour lerp
    brand.js             product name / brand line
    api.js auth.jsx live.js toast.jsx format.js
  components/
    FlowButton.jsx       ★ primary CTA
    Logo.jsx Status.jsx LatencyChart.jsx Diagnosis.jsx Modal.jsx NoAccess.jsx
  pages/
    Landing.jsx          ★ story, deep chapter, heartbeat, steps, closing
    landing/             Nav.jsx · LatencyStory.jsx · ConsoleCrops.jsx
    Login.jsx
    app/                 Shell, Overview, Monitors, MonitorDetail, Incidents, DataConsole, Access
  styles/
    base.css             ★ tokens, motion primitives, FlowButton, Roll, Lenis
    landing.css          ★ every landing section
    app.css              console UI
```

★ = the files to study for the design and motion.

---

## 3. Design system

Every token lives in `:root` in [web/src/styles/base.css](web/src/styles/base.css). Change a token there and the whole product follows.

### Colour

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#0f3b2c` | Deep forest. Headlines, primary pill, body text |
| `--deep` / `--deep-2` / `--deep-3` | `#0f3b2c` → `#0a2c21` | **Dark surfaces are the ink itself, a few steps deeper**, so dark chapters and the sidebar read as the same family as the headline colour |
| `--lime` | `#b9e769` | Accent: CTA orb, active nav, toggles, step numbers |
| `--flood` | `#bfe57a` | The full-screen lime of the scroll story |
| `--sprout` | `#74c43a` | Leading edge of text reveals, chart lines |
| `--olive` | `#5f8f35` | Accent word in headlines ("Know which **API**…") |
| `--cream` | `#f6f3c9` | Yellow bloom and the soft rim of the flood |
| `--bg` / `--surface` / `--line` | | Paper, white cards, hairlines |

**Status colours** have fixed meanings. Don't use them for decoration:

| Token | Meaning |
| --- | --- |
| `--up` | operational |
| `--degraded` | over its latency budget |
| `--partial` | some checks in a bucket failed |
| `--down` | failing |
| `--paused` | not checked |
| `--pending` | not yet checked |

### Type

| Token | Font | Use |
| --- | --- | --- |
| `--font-display` | Inter Tight | Headlines at weight 500 with very tight tracking (`-0.04em` to `-0.048em`). Large numbers |
| `--font` | Inter | UI and body text |
| `--mono` | JetBrains Mono | URLs, timings, codes, table data |

### Easing

| Token | Curve | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(.2,.7,.2,1)` | Almost every transition: fast start, long settle |
| `--ease-wipe` | `cubic-bezier(.55,0,.15,1)` | Text wipes and line draws: slow start, confident finish |

### Surfaces

* **Light:** white cards, a 1px `--line` border, `--shadow-sm`, radius 20 / 14 / 10.
* **Lime wash:** layered `radial-gradient`s, never flat fills. Used in the hero, KPI tile, console crops and closing.
* **Grain:** a `.grain` overlay (SVG noise, `soft-light`, 8%) on large gradients to prevent banding.

---

## 4. Motion recipes

There's no animation framework. The only motion library is **Lenis** (smooth scroll); everything else is CSS plus small hooks in [web/src/lib/motion.js](web/src/lib/motion.js).

Rules every effect follows:

1. Animate only `transform`, `opacity`, `clip`/`mask` and SVG dash offsets.
2. Scroll effects write **CSS variables or element styles directly**, once per animation frame. They never set React state per frame.
3. Everything respects `prefers-reduced-motion`: the story un-pins, wipes complete instantly and smooth scroll is off.

### 4.1 Heavy scroll: `useSmoothScroll()`

Lenis with `duration 1.35` and an exponential ease. The page glides and settles instead of stepping; this is the "heavy" feel of large brand sites. Native scroll position is kept, so `position: sticky` and scroll listeners keep working. It's used on the landing page only; the console scrolls natively.

To jump to a section through Lenis, use `scrollToId('console')`.

### 4.2 The flood: downward Gaussian sweep

This is the core effect ([Landing.jsx](web/src/pages/Landing.jsx) `useStory`, [landing.css](web/src/styles/landing.css) `.flood-*`).

A 380vh section holds a `position: sticky` 100vh stage. Scroll inside the section is mapped to `--a` (0 → 1) on the section element. Two layers sit behind the hero:

| Layer | What it is | How `--a` moves it |
| --- | --- | --- |
| `.flood-front` | A huge **ellipse** (130vw × 220vh). Its radial gradient is a solid lime body, then a crisp bright rim (lime → chartreuse → cream → white over ~13% of the radius), then transparent | `translateY` moves its bottom edge **down** from 55vh to 200vh. Because it's an ellipse, the centre leads and the sides lag, producing the visible **U-shaped borderline** |
| `.flood-trail` | A 200vh lime sheet with its own soft lip | Follows the front down, keeps the top corners filled and finishes as solid lime |

At the end, `opacity: calc((0.96 - var(--a)) * 6)` dissolves the front, so the pinned statement sits on clean lime.

Meanwhile the hero content translates up at scroll speed, so it feels like normal scrolling while the colour stays pinned and floods down.

To tune it:

| To change | Edit |
| --- | --- |
| A sharper border | Tighten the 76% → 93% stops on `.flood-front` |
| A deeper U | Narrow its `width` |
| A slower sweep | Raise `vh * 1.2` in `useStory` |

### 4.3 Word-by-word statement

Each word is a `<span>`. A progress value `b` gives every word a local `t`. Over `t` the colour is interpolated **mist → sprout → ink** (`lerpColor`), with opacity, an 8px rise and a 4px blur that clears. The reading edge always glows bright green and then settles to ink.

### 4.4 Wipe-in headings: `.wipe` / `.wipe-view`

A soft-edged left-to-right reveal using a `mask-image` gradient 260% wide, with `mask-position` animated from 100% to 0.

* `.wipe` runs on mount. Stagger it with `style={{'--d':'300ms'}}`.
* `.wipe-view` runs when `.in` is added. The `WipeHeading` component does this with `useInView`.

### 4.5 Rise & reveal: `.rise` / `.reveal`

These fade and lift elements in. `.rise` runs on mount and `.reveal` runs on view (the `Reveal` component). Stagger with `--d`. Console pages use the same idea automatically: direct children of `.page` rise in sequence and the `h1` wipes in.

### 4.6 Pinned chapter: `Deep` + `LatencyStory`

A 280vh section with a sticky stage. Scroll progress `p` drives:

* **The chart:** an SVG `clipPath` rect widens with `p`, so four latency lines draw across the last 60 minutes. Head dots and legend values follow the drawing edge, and the clock counts down from −60 min to now. At fixed points an outage band appears, then "Incident opened", then "Recovered".
* **The copy:** audience rows light up in step (`.on` / `.past`). A lime hairline draws across the active row.

### 4.7 Scroll-drawn line: heartbeat

An SVG path with `pathLength="1"` gets `strokeDashoffset = 1 - t` from scroll. `getPointAtLength` positions a glowing HTML dot at the drawing head, and labels surface as the head passes them. A `userSpaceOnUse` gradient colours only the failure dip red.

The steps section uses the same idea: a progress bar fills with scroll and each step "turns on" as it's reached.

### 4.8 Micro-interactions

| Effect | Where it's defined |
| --- | --- |
| **FlowButton:** the lime orb floods the pill, the label rolls up, the arrow turns | `components/FlowButton.jsx` + `.fb` in base.css |
| **Rolling label:** `<Roll>` / `.roll` uses the same roll gesture for links | `landing/Nav.jsx` + base.css |
| **Nav:** a lime pill glides under the hovered link, a dot marks the active section, the bar tightens and frosts on scroll, the CTA slides in after the hero | `landing/Nav.jsx` |
| Hero signal icons: each has its own hover gesture (beat, needle, ring, draw, pop) | `.hc-*` |
| Load-in: nav drops in, headline wipes, flood settles from the top, grid rule draws, cells rise | `landing.css` |
| Console crops: the newest uptime bar blinks, a permission toggle flips | `landing/ConsoleCrops.jsx` |
| Charts draw on first paint; uptime bars grow from the baseline; failure-path hops arrive in sequence; the failing hop pulses | `app.css` |

---

## 5. Landing page anatomy

| # | Section | Component | Motion |
| --- | --- | --- | --- |
| 1 | Nav | `landing/Nav.jsx` | Hover pill, active dot, compaction, CTA slide-in |
| 2 | Hero → flood → statement | `Landing.jsx` story | §4.2, §4.3 |
| 3 | Deep chapter | `Deep` + `landing/LatencyStory.jsx` | §4.6 (pinned) |
| 4 | Heartbeat | `Heartbeat` | §4.7 |
| 5 | Inside the console | `landing/ConsoleCrops.jsx` | Wipe headline; crops of the real UI, fading into the wash |
| 6 | How it works | `Steps` | Scroll-filled track, steps turn on |
| 7 | Closing | `Closing` | A second lime bowl rises with scroll |

---

## 6. Component catalogue

### Design components

| Component | Props | Notes |
| --- | --- | --- |
| `FlowButton` | `to?`, `size: 'lg'\|'md'\|'sm'`, `block?`, plus any button props | A Link when given `to`, otherwise a button. Pass a string child (it's used for the rolling copy) |
| `Roll` (in `landing/Nav.jsx`) | `children` (string) | Rolling hover label for links |
| `Logo` | `dark?`, `size?` | The mark's ring rotates slowly |
| `WipeHeading`, `Reveal` (in `Landing.jsx`) | `as`, `className`, `delay` | Reveal on view |

### Data components

| Component | Props | Notes |
| --- | --- | --- |
| `StatusDot`, `StatusBadge` | `status`, `pulse?` | `up` `degraded` `down` `paused` `pending` |
| `SeverityTag`, `IncidentState`, `EnvTag` | value | Incident and environment chips |
| `UptimeStrip` | `buckets`, `compact?` | 24h health bars with tooltips |
| `LatencyChart` | `series`, `threshold?`, `height?` | Responsive SVG area chart: draws in, hover tooltip, dashed budget line |
| `Diagnosis`, `FailurePath` | `diagnosis`, `message?`, `compact?` | Where it broke, likely causes, numbered steps |
| `Modal`, `Confirm` | `title`, `onClose`, `footer`… | Esc to close, backdrop click, focus restore |

### Hooks (in `lib/`)

| Hook | Purpose |
| --- | --- |
| `useSmoothScroll()` | Lenis inertial scroll |
| `useScrollProgress(ref, fn)` | Calls `fn(0…1)` each frame as an element crosses the viewport |
| `useInView()` | Becomes true once, on first view |
| `usePrefersReducedMotion()` | Media-query flag |
| `useLiveQuery(path, {filter})` | Fetch plus live refresh from the event stream |
| `useAuth()` | `{ user, can(perm), login, logout }` |
| `useToast()` | Toast notifications |

---

## 7. The console

| Page | What's on it |
| --- | --- |
| **Overview** | KPI tiles, "Needs attention" (with where to look), 24h latency, recent incidents, per-service uptime strips |
| **Monitors** | Filter, search, run a check now, create / edit / pause / delete |
| **Monitor detail** | Uptime and percentiles, the **Diagnosis** panel with the failure path, the latency chart against its budget, failures by type, recent checks |
| **Incidents** | Opened after 2 consecutive failures, auto-resolved after 2 healthy checks. Acknowledge, resolve, reopen, notes, timeline |
| **Data console** | Browse allow-listed tables, double-click to edit permitted cells, delete rows. Every change is audited |
| **Access control** | People, the roles & permissions matrix, audit log |

**Failure classification:**

| Failure | Hop flagged |
| --- | --- |
| DNS | DNS |
| Refused, reset, TLS | Network · TLS |
| 401 / 403 / 404 / 429 | Gateway |
| 5xx, timeout, wrong status, body mismatch | Service |

Hints live in [server/troubleshoot.js](server/troubleshoot.js).

---

## 8. Roles & access

Permissions are grouped into **14 permissions** across four areas:

| Area | Permissions |
| --- | --- |
| Monitoring | view, run, create, edit, delete |
| Incidents | view, manage |
| Database | read, write, delete |
| Administration | users view, users manage, roles manage, audit view |

Each role is a bundle of these, and each person holds one role. Everything is enforced on the server; a request without permission gets a 403. The UI only hides what you can't use.

* Super Admin always has every permission and can't be edited or deleted.
* Only a super admin can grant Super Admin. At least one active super admin must remain.
* Nobody can change their own role or disable themselves.
* Permission changes apply on the person's next request.
* Every change is written to the audit log.

---

## 9. Deployment

Canopy is a **long-running Node server**. It has a background check engine, a SQLite file and a live event stream. Host it anywhere that runs `npm start` continuously, such as Render, Railway, Fly.io, a VM or a container:

```bash
npm ci && npm run build && npm start      # PORT defaults to 4000
```

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Server port (demo monitor URLs are seeded with this port) |
| `CANOPY_DB` | `data/canopy.db` | SQLite file location |

### Vercel

The repo deploys to Vercel as is. [vercel.json](vercel.json) serves `web/dist` from the CDN and rewrites `/api/*` to one serverless function ([api/index.js](api/index.js)), which runs the same Express app.

When `VERCEL` is set, [server/runtime.js](server/runtime.js) switches the app into **serverless mode**:

| Concern | Long-running server | Serverless (Vercel) |
| --- | --- | --- |
| Database | `data/canopy.db` | `/tmp/canopy.db`, seeded on each instance's first request |
| Sessions | random token in the `sessions` table | signed stateless cookie (HMAC), valid on any instance |
| Health checks | background engine every 2 s | due checks run on demand before monitoring reads |
| Demo APIs | real HTTP calls to `/mock/*` | simulated in-process |
| Live updates | event stream (SSE) | screens auto-refresh every 8 s |

Set **`SESSION_SECRET`** in the Vercel project settings to any long random string.

Because each instance has its own temporary database, edits made in the demo (new monitors, role changes) are not shared between instances and reset when an instance is recycled. The seeded demo is always identical. For persistent shared data, point the app at a hosted database such as Turso or Postgres.

---

## 10. Customising

| Change | Where |
| --- | --- |
| Product name / brand line | [web/src/lib/brand.js](web/src/lib/brand.js) |
| Colours, fonts, easing | `:root` in [base.css](web/src/styles/base.css) |
| Flood colours and shape | `.flood-front`, `.flood-trail` in [landing.css](web/src/styles/landing.css) |
| Statement copy | `STATEMENT` in [Landing.jsx](web/src/pages/Landing.jsx) |
| Demo people | `people` in [server/seed.js](server/seed.js), then `npm run reset-db` |
| Roles & permissions | [server/permissions.js](server/permissions.js) |
| Troubleshooting steps | [server/troubleshoot.js](server/troubleshoot.js) |
| Incident sensitivity | `FAIL_THRESHOLD` / `RECOVER_THRESHOLD` in [server/engine.js](server/engine.js) |
