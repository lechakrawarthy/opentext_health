import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Gauge, Siren, Route, ShieldCheck, ScrollText, Radio, Database } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import FlowButton from '../components/FlowButton.jsx';
import Nav from './landing/Nav.jsx';
import LatencyStory from './landing/LatencyStory.jsx';
import ConsoleCrop from './landing/ConsoleCrops.jsx';
import { useAuth } from '../lib/auth.jsx';
import { BRAND } from '../lib/brand.js';
import { useInView, usePrefersReducedMotion, useScrollProgress, useSmoothScroll, clamp, mix, lerpColor } from '../lib/motion.js';

const SIGNALS = [
  { icon: Activity, label: 'Health checks', anim: 'beat' },
  { icon: Gauge, label: 'Latency p95', anim: 'needle' },
  { icon: Siren, label: 'Auto incidents', anim: 'ring' },
  { icon: Route, label: 'Failure path', anim: 'draw' },
  { icon: ShieldCheck, label: 'Role access', anim: 'pop' },
  { icon: ScrollText, label: 'Audit trail', anim: 'draw' },
  { icon: Radio, label: 'Live stream', anim: 'ring' },
  { icon: Database, label: 'Data console', anim: 'pop' },
];

const STATEMENT =
  'Canopy is an API health teammate that checks every endpoint, spots the failure, pinpoints the hop where it broke and hands the right person the next step to fix it.';

const INK = [15, 59, 44];
const SPROUT = [116, 196, 58];
const MIST = [250, 252, 240];

/* =============================================================================
   Story: hero → lime flood → pinned statement
   The sticky stage is driven by scroll position inside a tall wrapper.
     --a   0→1  the flood front travels DOWN the screen (centre leads, sides lag)
     hero       translates up at scroll speed
     words      light up one by one: mist → sprout → ink
============================================================================= */

function useStory({ story, hero, statement, words, onPastHero }) {
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    const el = story.current;
    if (!el || reduce) return;
    let raf = 0;
    let past = false;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const y = -el.getBoundingClientRect().top;
      const a = clamp(y / (vh * 1.2));
      el.style.setProperty('--a', a.toFixed(4));
      if (hero.current) hero.current.style.transform = `translate3d(0, ${-clamp(y, 0, vh * 1.3)}px, 0)`;
      if (statement.current) statement.current.style.opacity = clamp((y - vh * 0.9) / (vh * 0.22)).toFixed(3);
      const b = clamp((y - vh * 1.1) / (vh * 1.35));
      const list = words.current;
      const n = list.length;
      for (let i = 0; i < n; i++) {
        const w = list[i];
        if (!w) continue;
        const t = clamp((b * (n + 4) - i) / 4);
        if (t <= 0) {
          w.style.opacity = '0';
          continue;
        }
        const c = t < 0.35 ? MIST : t < 0.7 ? lerpColor(MIST, SPROUT, (t - 0.35) / 0.35) : lerpColor(SPROUT, INK, (t - 0.7) / 0.3);
        w.style.opacity = clamp(t / 0.25).toFixed(3);
        w.style.color = `rgb(${c[0]},${c[1]},${c[2]})`;
        w.style.transform = `translate3d(0, ${mix(8, 0, clamp(t / 0.5))}px, 0)`;
        w.style.filter = t < 0.3 ? `blur(${mix(4, 0, t / 0.3).toFixed(2)}px)` : 'none';
      }
      const isPast = y > vh * 0.55;
      if (isPast !== past) {
        past = isPast;
        onPastHero(isPast);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [story, hero, statement, words, onPastHero, reduce]);
  return reduce;
}

export default function Landing() {
  const { user } = useAuth();
  const href = user ? '/app' : '/login';
  const story = useRef(null);
  const hero = useRef(null);
  const statement = useRef(null);
  const words = useRef([]);
  const [pastHero, setPastHero] = useState(false);
  const statementWords = useMemo(() => STATEMENT.split(' '), []);
  const reduce = useStory({ story, hero, statement, words, onPastHero: setPastHero });
  useSmoothScroll();

  return (
    <div className="landing">
      <Nav href={href} user={user} showCta={pastHero} />

      {/* ------------------------------ Story ------------------------------ */}
      <section className={`story ${reduce ? 'story-static' : ''}`} ref={story}>
        <div className="stage">
          <div className="flood" aria-hidden="true">
            <div className="flood-trail" />
            <div className="flood-front" />
            <div className="flood-bloom" />
            <div className="flood-leaf" />
            <div className="grain" />
          </div>

          <div className="hero" ref={hero}>
            <div className="container hero-inner">
              <h1 className="hero-title">
                <span className="wipe" style={{ '--d': '120ms' }}>
                  Know which <span className="accent">API</span> is failing
                </span>
                <span className="wipe" style={{ '--d': '320ms' }}>
                  and exactly where to look
                </span>
              </h1>
            </div>
            <div className="container hero-grid">
              <div className="hero-grid-left">
                <p className="hero-lead rise" style={{ '--d': '900ms' }}>
                  Platform teams keep watch with <span className="accent">Canopy</span>
                </p>
                <div className="rise" style={{ '--d': '1050ms' }}>
                  <FlowButton to={href}>{user ? 'Open console' : 'Get started'}</FlowButton>
                </div>
              </div>
              <ul className="hero-cells">
                {SIGNALS.map(({ icon: Icon, label, anim }, i) => (
                  <li key={label} className={`hero-cell hc-${anim}`} style={{ '--d': `${950 + i * 70}ms` }}>
                    <span className="cell-in">
                      <Icon size={20} strokeWidth={2.1} />
                      <span>{label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="statement" ref={statement}>
            <p className="statement-text" aria-label={STATEMENT}>
              {statementWords.map((w, i) => (
                <Fragment key={i}>
                  <span ref={(el) => (words.current[i] = el)} className="sw" aria-hidden="true">
                    {w}
                  </span>{' '}
                </Fragment>
              ))}
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------- Deep forest hand-off ------------------------- */}
      <Deep />

      {/* --------------------------- Heartbeat ribbon -------------------------- */}
      <Heartbeat />

      {/* --------------------------- Console crops -------------------------- */}
      <section className="console-sec" id="console">
        <div className="container">
          <div className="sec-head sec-head-split">
            <div>
              <Reveal as="span" className="eyebrow-l">
                Inside the console
              </Reveal>
              <WipeHeading as="h2" className="sec-title">
                From <span className="accent">something’s broken</span> to the person who can fix it
              </WipeHeading>
            </div>
            <Reveal as="p" className="sec-aside" delay={150}>
              The same screens your team works in every day, not a demo built for a slide.
            </Reveal>
          </div>
          <div className="cap-grid">
            {[
              ['map', 'Service health', 'Uptime strips, latency and status for every endpoint, streamed as checks land.'],
              ['triage', 'Needs attention', 'Failing and slow endpoints, ranked, each with the hop to look at first.'],
              ['path', 'Diagnosis', 'Where the request broke, the likely causes, and numbered next steps.'],
              ['access', 'Roles & permissions', 'The super admin decides who can view, run, edit data or manage people.'],
            ].map(([k, t, d], i) => (
              <Reveal key={k} className="cap-cell" delay={(i % 2) * 120}>
                <div className="cap-visual">
                  <ConsoleCrop kind={k} />
                </div>
                <div className="cap-text">
                  <span className="cap-n">0{i + 1}</span>
                  <div>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------ Steps ------------------------------ */}
      <Steps />

      {/* ------------------------------ Closing ----------------------------- */}
      <Closing href={href} user={user} />
    </div>
  );
}

/* ============================== Building blocks ============================= */

function WipeHeading({ as: Tag = 'h2', className = '', children }) {
  const [ref, inView] = useInView({ threshold: 0.35 });
  return (
    <Tag ref={ref} className={`${className} wipe-view ${inView ? 'in' : ''}`}>
      {children}
    </Tag>
  );
}

function Reveal({ as: Tag = 'div', className = '', delay = 0, children }) {
  const [ref, inView] = useInView({ threshold: 0.2 });
  return (
    <Tag ref={ref} className={`${className} reveal ${inView ? 'in' : ''}`} style={{ '--d': `${delay}ms` }}>
      {children}
    </Tag>
  );
}

const AUDIENCE = [
  ['Platform teams', 'Scheduled checks on every endpoint, with latency budgets and status that updates the moment it changes.'],
  ['On-call engineers', 'When a service drifts past its budget, it is flagged before anyone files a ticket.'],
  ['Service owners', 'Consecutive failures open an incident with the hop to look at. Recovery closes it on its own.'],
  ['Super admins', 'Decide who can view, run, edit the database or manage people. Every change is audited.'],
];

/**
 * Pinned deep-forest chapter. While it is pinned, scroll draws the latency chart
 * from the last hour up to now, and the audience rows light up in step with the story.
 */
function Deep() {
  const ref = useRef(null);
  const chart = useRef(null);
  const [step, setStep] = useState(-1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp(-r.top / Math.max(1, r.height - vh));
      chart.current?.set(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : p);
      setStep(r.top > vh * 0.3 ? -1 : Math.min(3, Math.floor(p * 4.2)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <section className="deep" id="teammate" ref={ref}>
      <div className="deep-stage">
        <div className="deep-left">
          <div className="deep-copy">
            <Reveal as="span" className="eyebrow-d">
              Built for the people on call
            </Reveal>
            <WipeHeading as="h2" className="deep-title">
              An API teammate that works the way your on-call does
            </WipeHeading>
            <ol className="aud">
              {AUDIENCE.map(([k, v], i) => (
                <li key={k} className={i === step ? 'on' : i < step ? 'past' : ''}>
                  <span className="aud-n">0{i + 1}</span>
                  <div>
                    <span className="aud-k">{k}</span>
                    <p>{v}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="deep-right">
          <LatencyStory api={chart} />
        </div>
      </div>
    </section>
  );
}

/** A heartbeat line that draws itself as you scroll, with check results surfacing at each beat. */
function Heartbeat() {
  const ref = useRef(null);
  const path = useRef(null);
  const head = useRef(null);
  const [p, setP] = useState(0);
  useScrollProgress(ref, (v) => {
    const t = clamp((v - 0.15) / 0.6);
    setP(t);
    const el = path.current;
    if (!el) return;
    el.style.strokeDashoffset = String(1 - t);
    const len = el.getTotalLength();
    const pt = el.getPointAtLength(len * t);
    if (head.current) {
      head.current.style.left = `${(pt.x / 1200) * 100}%`;
      head.current.style.top = `${20 + pt.y}px`;
      head.current.style.opacity = t > 0.01 && t < 0.995 ? '1' : '0';
    }
  });

  const beats = [
    { x: 150, label: 'GET /identity/token', meta: '200 · 46 ms', tone: 'ok' },
    { x: 420, label: 'GET /documents/upload', meta: '200 · 118 ms', tone: 'ok' },
    { x: 690, label: 'GET /reporting/export', meta: '500 · incident opened', tone: 'fail' },
    { x: 960, label: 'GET /reporting/export', meta: '200 · recovered', tone: 'ok' },
  ];
  const beat = (x, h, dip = 14) => `L${x - 24} 70 L${x - 12} ${70 + dip * 0.4} L${x - 4} ${70 - h} L${x + 6} ${70 + dip} L${x + 16} 70`;
  const d = `M0 70 ${beat(150, 38)} ${beat(420, 44)} L640 70 L660 70 L672 96 L684 104 L696 98 L708 76 L720 70 ${beat(960, 40)} L1200 70`;

  return (
    <section className="beat" ref={ref} aria-label="Every check, every 30 seconds">
      <div className="container beat-head">
        <span className="eyebrow-l">Every check, every 30 seconds</span>
      </div>
      <div className="beat-wrap">
        <svg viewBox="0 0 1200 160" preserveAspectRatio="none" className="beat-svg" aria-hidden="true">
          <defs>
            <linearGradient id="beat-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1200" y2="0">
              <stop offset="0.52" stopColor="#74c43a" />
              <stop offset="0.55" stopColor="#d9463f" />
              <stop offset="0.6" stopColor="#d9463f" />
              <stop offset="0.64" stopColor="#74c43a" />
            </linearGradient>
          </defs>
          <path d="M0 70 L1200 70" className="beat-base" />
          <path ref={path} d={d} className="beat-line" pathLength="1" />
        </svg>
        <span ref={head} className="beat-head-dot" aria-hidden="true" />
        {beats.map((b, i) => (
          <div
            key={i}
            className={`beat-tag beat-${b.tone} ${p > b.x / 1200 ? 'on' : ''}`}
            style={{ left: `${(b.x / 1200) * 100}%` }}
          >
            <code>{b.label}</code>
            <b>{b.meta}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function Steps() {
  const ref = useRef(null);
  const bar = useRef(null);
  const [p, setP] = useState(0);
  useScrollProgress(ref, (v) => {
    const t = clamp((v - 0.25) / 0.45);
    if (bar.current) bar.current.style.transform = `scaleX(${t})`;
    setP(t);
  });
  const steps = [
    ['01', 'Watch', 'Register an endpoint with its expected status, timeout and latency budget. Checks start the moment you save.'],
    ['02', 'Pinpoint', 'Failures are classified (DNS, TLS, refused, gateway auth, 5xx or timeout) and placed on the request path.'],
    ['03', 'Resolve', 'The owning team acknowledges, follows the guided steps and leaves notes. Healthy checks confirm the recovery.'],
  ];
  return (
    <section className="how" id="how" ref={ref}>
      <div className="container">
        <div className="sec-head">
          <Reveal as="span" className="eyebrow-l">
            How it works
          </Reveal>
          <WipeHeading as="h2" className="sec-title">
            Watch. Pinpoint. Resolve.
          </WipeHeading>
        </div>
        <div className="how-track" aria-hidden="true">
          <span ref={bar} className="how-fill" />
        </div>
        <ol className="how-steps">
          {steps.map(([n, t, b], i) => (
            <li key={n} className={`how-step ${p >= i / 3 + 0.02 ? 'on' : ''}`}>
              <span className="how-n">{n}</span>
              <h3>{t}</h3>
              <p>{b}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Closing CTA: a second lime bowl rises from below as the section scrolls into view. */
function Closing({ href, user }) {
  const ref = useRef(null);
  useScrollProgress(ref, (v) => {
    const c = clamp(v / 0.42);
    ref.current?.style.setProperty('--c', (c * c * (3 - 2 * c)).toFixed(4));
  });
  return (
    <section className="closing" ref={ref}>
      <div className="closing-bowl" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="container closing-inner">
        <WipeHeading as="h2" className="closing-title">
          Stop guessing which API broke. Start with where.
        </WipeHeading>
        <Reveal delay={200}>
          <FlowButton to={href}>{user ? 'Open the console' : 'Sign in to the console'}</FlowButton>
        </Reveal>
      </div>
      <footer className="lfoot container">
        <Logo size={22} />
        <span>{BRAND.category}</span>
        <span className="lfoot-brand">{BRAND.line}</span>
        <span className="push">© {new Date().getFullYear()}</span>
      </footer>
    </section>
  );
}
