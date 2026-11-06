# Canopy

API observability and incident response console, built for OpenText.

Canopy checks APIs on a schedule and shows which endpoint is failing. It points to where the request broke (DNS, TLS, gateway or the service itself), opens and closes incidents automatically, and gives a super admin control over who can view, run checks, edit data or manage people.

The repo is also meant as a design reference, so a good part of this README covers the design tokens, the scroll animations and the components.

All data is seeded demo data. Nothing here connects to real systems.

## Contents

1. [Running it](#1-running-it)
2. [Project layout](#2-project-layout)
3. [Design tokens](#3-design-tokens)
4. [Motion](#4-motion)
5. [Landing page sections](#5-landing-page-sections)
6. [Components and hooks](#6-components-and-hooks)
7. [The console](#7-the-console)
8. [Roles and access](#8-roles-and-access)
9. [Deployment](#9-deployment)
10. [Limitations](#10-limitations)
11. [Where to change things](#11-where-to-change-things)

---

## 1. Running it

You need Node.js 24. SQLite comes from Node's built-in `node:sqlite`, so there's nothing native to install.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The API runs on port 4000.

| Script | Does |
| --- | --- |
| `npm run dev` | API server (watch mode) and the Vite dev server |
| `npm run build` | Builds the frontend into `web/dist` |
| `npm start` | Runs one server on port 4000 that serves the API and the built frontend |
| `npm run reset-db` | Deletes `data/canopy.db`; the next start seeds it again |

### Demo accounts

Every account uses the password `canopy123`. The login page has a shortcut for each role.

| Name | Email | Role |
| --- | --- | --- |
| Lokesh Kumar | `superadmin@canopy.dev` | Super Admin |
| Nagasatish Reddy | `admin@canopy.dev` | Admin |
| Bala Subramanian | `sre@canopy.dev` | SRE / On-call |
| Lakshmi Narayanan | `lakshmi@canopy.dev` | SRE / On-call |
| Vineela Rao | `dev@canopy.dev` | Developer |
| Anudra Menon | `anudra@canopy.dev` | Developer |
| Sudha Iyer | `viewer@canopy.dev` | Viewer |
| Kiran Varma | `contractor@canopy.dev` | Viewer, disabled |

---

## 2. Project layout

```
api/index.js               Vercel function entry, wraps server/app.js
vercel.json                Vercel output directory and rewrites

server/
  app.js                   Express app: auth routes, event stream, static files
  index.js                 Long-running server: listens and starts the check engine
  runtime.js               Switches between server and serverless mode
  db.js                    Schema plus tx() and audit() helpers
  auth.js                  Password hashing, sessions, requirePerm()
  permissions.js           Permission list and default roles
  engine.js                Runs checks, classifies failures, opens and closes incidents
  troubleshoot.js          Failure type → hop, where to look, causes, next steps
  mock.js                  Demo APIs (healthy, flaky, slow, outage, 401, timeouts)
  seed.js                  Demo workspace with 24 hours of history
  routes/                  monitoring.js, access.js, data.js

web/src/
  lib/motion.js            Smooth scroll, scroll progress, in-view, colour helpers
  lib/brand.js             Product name and brand line
  lib/                     api.js, auth.jsx, live.js, toast.jsx, format.js
  components/              FlowButton, Logo, Status, LatencyChart, Diagnosis, Modal, NoAccess
  pages/Landing.jsx        Landing page
  pages/landing/           Nav, LatencyStory, ConsoleCrops
  pages/Login.jsx
  pages/app/               Shell, Overview, Monitors, MonitorDetail, Incidents, DataConsole, Access
  styles/base.css          Tokens, motion utilities, FlowButton, rolling labels
  styles/landing.css       Landing page
  styles/app.css           Console
```

If you're here for the design, the files to read are `styles/base.css`, `styles/landing.css`, `pages/Landing.jsx` and `lib/motion.js`.

---

## 3. Design tokens

All tokens live in `:root` in [web/src/styles/base.css](web/src/styles/base.css).

### Colour

| Token | Value | Used for |
| --- | --- | --- |
| `--ink` | `#0f3b2c` | Headlines, body text, the primary button |
| `--deep`, `--deep-2`, `--deep-3` | `#0f3b2c` to `#0a2c21` | Dark sections and the console sidebar. These are deeper steps of `--ink`, so dark areas stay in the same colour family as the text |
| `--lime` | `#b9e769` | Accent: button orb, active nav item, toggles |
| `--flood` | `#bfe57a` | The full-screen lime in the landing scroll |
| `--sprout` | `#74c43a` | Chart lines and the leading edge of text reveals |
| `--olive` | `#5f8f35` | The highlighted word in headlines |
| `--cream` | `#f6f3c9` | The yellow glow at the edge of the lime |
| `--bg`, `--surface`, `--line` | | Page background, cards, borders |

The status colours each mean one thing and aren't used for decoration:

| Token | Meaning |
| --- | --- |
| `--up` | Operational |
| `--degraded` | Over its latency budget |
| `--partial` | Some checks failed in that time bucket |
| `--down` | Failing |
| `--paused` | Not being checked |
| `--pending` | Not checked yet |

### Type

| Token | Font | Used for |
| --- | --- | --- |
| `--font-display` | Inter Tight | Headlines and large numbers, weight 500, tracking around `-0.045em` |
| `--font` | Inter | UI and body text |
| `--mono` | JetBrains Mono | URLs, timings, table data |

### Easing

| Token | Curve | Used for |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(.2,.7,.2,1)` | Most transitions |
| `--ease-wipe` | `cubic-bezier(.55,0,.15,1)` | Text wipes and line drawing |

### Surfaces

* Cards are white with a 1px `--line` border, a small shadow, and 20 / 14 / 10 px radii.
* Lime areas are layered radial gradients rather than flat fills.
* Large gradients get a `.grain` overlay (SVG noise at 8%) so they don't band.

---

## 4. Motion

The only animation dependency is Lenis, for smooth scrolling. Everything else is CSS and a few hooks in [web/src/lib/motion.js](web/src/lib/motion.js).

Three rules apply everywhere:

1. Only `transform`, `opacity`, masks and SVG dash offsets are animated.
2. Scroll effects write CSS variables or styles directly once per frame. They never set React state per frame.
3. With `prefers-reduced-motion` on, the story section stops pinning, wipes finish instantly, and smooth scroll is off.

### Smooth scroll

`useSmoothScroll()` runs Lenis with a 1.35 s exponential ease, which is what makes the page feel weighted when you scroll. Native scroll position is kept, so `position: sticky` and scroll listeners still work. It's on the landing page only.

To scroll to a section, use `scrollToId('console')`.

### The lime flood

This lives in `useStory` in [Landing.jsx](web/src/pages/Landing.jsx) and the `.flood-*` rules in [landing.css](web/src/styles/landing.css).

The story section is 380vh tall with a sticky 100vh stage inside it. Scroll position inside the section becomes `--a`, going from 0 to 1. Two layers behind the hero use it:

* **`.flood-front`** is a large ellipse, 130vw by 220vh. Its gradient is solid lime, then a thin bright rim (lime, chartreuse, cream), then transparent. As `--a` goes up, its bottom edge moves down the screen from 55vh to 200vh. Because it's an ellipse, the middle comes down first and the sides follow, which gives the U-shaped edge.
* **`.flood-trail`** is a taller lime sheet that follows the ellipse down and fills the top corners. At the end, the screen is solid lime.

Near the end, the ellipse fades out (`opacity: calc((0.96 - var(--a)) * 6)`) so the statement sits on plain lime. The hero content moves up at scroll speed, so it reads as normal scrolling while the colour floods in behind it.

To tune it:

| To change | Edit |
| --- | --- |
| A sharper edge | Bring the 76% to 93% stops on `.flood-front` closer together |
| A deeper U | Reduce the width of `.flood-front` |
| A slower sweep | Increase the `vh * 1.2` divisor in `useStory` |

### Word-by-word statement

Each word is its own span with its own progress value. As that value rises, the word goes from pale to bright green to ink. At the same time it moves up 8px and a 4px blur clears.

### Heading wipes

`.wipe` and `.wipe-view` reveal text left to right with a soft edge. They use a mask gradient that's 260% wide and animate `mask-position`.

* `.wipe` runs on page load. Add `--d` for a delay, for example `style={{'--d':'300ms'}}`.
* `.wipe-view` runs when the element scrolls into view. Use the `WipeHeading` component.

### Fade and rise

`.rise` (on load) and `.reveal` (on scroll into view) fade elements up. Use `--d` to stagger them. On console pages, the direct children of `.page` do this automatically and the page title wipes in.

### Pinned chart section

The `Deep` component and [LatencyStory.jsx](web/src/pages/landing/LatencyStory.jsx) build this section. It's 280vh tall with a sticky stage, and scroll progress drives two things:

* **The chart.** A clip rect widens so four latency lines draw across the last 60 minutes. Dots and values follow the drawing edge, and the clock counts from −60 min to now. At set points an outage band appears, then an "Incident opened" card, then "Recovered".
* **The copy.** On the left, the four audience rows highlight one after another.

### Heartbeat line

This is an SVG path with `pathLength="1"`. Scroll sets `strokeDashoffset`, and `getPointAtLength` places a dot at the drawing point. Labels appear as the dot passes them, and a gradient turns only the failure dip red.

The "How it works" section uses the same approach with a progress bar.

### Small interactions

| Interaction | Where |
| --- | --- |
| Button hover: the lime circle fills the button, the label rolls up, the arrow turns | `components/FlowButton.jsx`, `.fb` in base.css |
| Rolling link labels | `Roll` in `landing/Nav.jsx`, `.roll` in base.css |
| Nav: hover highlight slides between links, a dot marks the current section, the bar narrows on scroll, the console button slides in after the hero | `landing/Nav.jsx` |
| Hero icons each have a small hover animation | `.hc-*` in landing.css |
| Console previews: the newest uptime bar blinks, a permission toggle switches | `landing/ConsoleCrops.jsx` |
| Console: charts draw in, uptime bars grow, failure-path steps appear in order | app.css |

---

## 5. Landing page sections

| # | Section | Code | Motion |
| --- | --- | --- | --- |
| 1 | Nav | `landing/Nav.jsx` | Hover highlight, current-section dot, narrows on scroll |
| 2 | Hero, lime flood, statement | `Landing.jsx` | Flood and word reveal |
| 3 | Latency chart | `Deep`, `landing/LatencyStory.jsx` | Pinned, scroll-drawn |
| 4 | Heartbeat | `Heartbeat` | Scroll-drawn line |
| 5 | Inside the console | `landing/ConsoleCrops.jsx` | Heading wipe, live details in the previews |
| 6 | How it works | `Steps` | Progress bar, steps light up |
| 7 | Closing | `Closing` | Lime glow rises with scroll |

---

## 6. Components and hooks

### Components

| Component | Props | Notes |
| --- | --- | --- |
| `FlowButton` | `to?`, `size` (`lg`, `md`, `sm`), `block?`, plus button props | Renders a Link when `to` is set, otherwise a button. The child must be a string |
| `Roll` | `children` (string) | Rolling hover label |
| `Logo` | `dark?`, `size?` | |
| `WipeHeading`, `Reveal` | `as`, `className`, `delay` | Animate in on scroll |
| `StatusDot`, `StatusBadge` | `status`, `pulse?` | `up`, `degraded`, `down`, `paused`, `pending` |
| `SeverityTag`, `IncidentState`, `EnvTag` | value | Small labels |
| `UptimeStrip` | `buckets`, `compact?` | 24-hour health bars |
| `LatencyChart` | `series`, `threshold?`, `height?` | SVG area chart with a hover tooltip and a dashed budget line |
| `Diagnosis`, `FailurePath` | `diagnosis`, `message?`, `compact?` | Shows where a request failed and what to try |
| `Modal`, `Confirm` | `title`, `onClose`, `footer` | Closes on Esc or a backdrop click |

### Hooks

| Hook | Does |
| --- | --- |
| `useSmoothScroll()` | Turns on Lenis |
| `useScrollProgress(ref, fn)` | Calls `fn` with 0 to 1 as an element moves through the viewport |
| `useInView()` | Returns true once the element has been seen |
| `usePrefersReducedMotion()` | Reads the reduced-motion setting |
| `useLiveQuery(path, opts)` | Fetches data and refreshes it when new events arrive |
| `useAuth()` | `user`, `can(permission)`, `login`, `logout` |
| `useToast()` | Shows a toast |

---

## 7. The console

| Page | Contents |
| --- | --- |
| Overview | KPIs, endpoints that need attention (with where to look), 24-hour latency, recent incidents, uptime per service |
| Monitors | Filter, search, run a check now, create, edit, pause, delete |
| Monitor detail | Uptime and percentiles, the diagnosis panel, latency against the budget, failures by type, recent checks |
| Incidents | Open after 2 failed checks in a row and close after 2 healthy ones. Acknowledge, resolve, reopen, add notes |
| Data console | Browse permitted tables, double-click to edit allowed cells, delete rows. All changes are audited |
| Access control | People, roles and permissions, audit log |

How failures map to the request path:

| Failure | Shown at |
| --- | --- |
| DNS | DNS |
| Connection refused, reset, TLS | Network / TLS |
| 401, 403, 404, 429 | Gateway |
| 5xx, timeout, wrong status, unexpected body | Service |

The hints for each failure are in [server/troubleshoot.js](server/troubleshoot.js).

---

## 8. Roles and access

There are 14 permissions in four groups:

| Group | Permissions |
| --- | --- |
| Monitoring | view, run, create, edit, delete |
| Incidents | view, manage |
| Database | read, write, delete |
| Administration | view people, manage people, manage roles, view audit log |

A role is a set of permissions, and each person has one role. The server checks every permission and answers 403 when one is missing; the UI only hides what you can't use.

* Super Admin always has every permission and can't be edited or deleted.
* Only a super admin can make someone else a super admin, and at least one active super admin must remain.
* Nobody can change their own role or disable their own account.
* Permission changes take effect on the person's next request.
* Every change is recorded in the audit log.

---

## 9. Deployment

### Any Node host (Render, Railway, Fly.io, a VM)

```bash
npm ci && npm run build && npm start
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Server port |
| `CANOPY_DB` | `data/canopy.db` | SQLite file path |

### Vercel

The repo deploys to Vercel without extra setup. [vercel.json](vercel.json) serves `web/dist` and sends `/api/*` to one function, [api/index.js](api/index.js), which runs the same Express app.

When the `VERCEL` environment variable is present, [server/runtime.js](server/runtime.js) switches to serverless mode:

| | Node host | Vercel |
| --- | --- | --- |
| Database | `data/canopy.db` | `/tmp/canopy.db`, seeded on each instance's first request |
| Sessions | Token stored in the database | Signed cookie |
| Health checks | Background loop every 2 s | Run when someone loads a console page |
| Demo APIs | Real HTTP calls to `/mock/*` | Simulated inside the function |
| Live updates | Server-sent events | Page refreshes every 8 s |

Set `SESSION_SECRET` to a long random string in the Vercel project settings.

---

## 10. Limitations

* **Demo data only.** People, monitors, history and incidents are generated by [server/seed.js](server/seed.js). The demo APIs in `server/mock.js` produce failures on purpose.
* **One check location.** All checks run from a single place. If that host's network has a problem, every monitor will look like it's failing.
* **No custom headers or auth on checks.** Monitors send plain requests. An API that needs a token or API key can't be checked yet.
* **No alerts.** Incidents appear in the console, but nothing is sent to email, Teams or Slack.
* **SQLite on one instance.** On a Node host, data lives in a single file on that machine, which is fine for one instance but not for several. Moving to a shared database like Postgres would need changes in `db.js` and the route queries.
* **Vercel resets data.** Each Vercel instance keeps its own temporary database. Edits such as new monitors or role changes aren't shared between instances and are lost when an instance is recycled. On Vercel, checks also only run while someone is using the console, so history has gaps between visits.
* **Basic session security.** Sessions use a cookie with no separate CSRF token. Sign-in attempts are rate-limited in memory, so the limit resets on restart and isn't shared across instances.
* **No single sign-on.** There's no SSO, SAML or LDAP; accounts are local email and password.
* **No automated tests.** The app has been checked by hand and with scripted browser runs, but there is no test suite in the repo.
* **Desktop first.** The console works on phones, but it's laid out for desktop. Very wide tables scroll sideways on small screens.
* **Retention.** Check results older than 7 days are deleted.

---

## 11. Where to change things

| To change | Edit |
| --- | --- |
| Product name or brand line | [web/src/lib/brand.js](web/src/lib/brand.js) |
| Colours, fonts, easing | `:root` in [base.css](web/src/styles/base.css) |
| Flood colours and shape | `.flood-front` and `.flood-trail` in [landing.css](web/src/styles/landing.css) |
| Statement text | `STATEMENT` in [Landing.jsx](web/src/pages/Landing.jsx) |
| Demo people | `people` in [server/seed.js](server/seed.js), then run `npm run reset-db` |
| Roles and permissions | [server/permissions.js](server/permissions.js) |
| Troubleshooting hints | [server/troubleshoot.js](server/troubleshoot.js) |
| Incident sensitivity | `FAIL_THRESHOLD` and `RECOVER_THRESHOLD` in [server/engine.js](server/engine.js) |
