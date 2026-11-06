import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import FlowButton from '../../components/FlowButton.jsx';
import { scrollToId } from '../../lib/motion.js';

const LINKS = [
  ['teammate', 'Platform'],
  ['console', 'Console'],
  ['how', 'How it works'],
];

/**
 * Floating pill nav.
 *  · a lime pill glides under whichever link you hover
 *  · a dot marks the section currently in view
 *  · the bar tightens and frosts once you start scrolling
 *  · the console CTA slides in after the hero
 */
export default function Nav({ href, user, showCta }) {
  const linksRef = useRef(null);
  const [pill, setPill] = useState(null);
  const [active, setActive] = useState(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const els = LINKS.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setActive(vis.target.id);
      },
      { threshold: [0.25, 0.5], rootMargin: '-20% 0px -40% 0px' },
    );
    els.forEach((el) => io.observe(el));
    const top = () => window.scrollY < window.innerHeight * 2 && setActive(null);
    window.addEventListener('scroll', top, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', top);
    };
  }, []);

  const hover = (e) => {
    const box = linksRef.current.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setPill({ x: r.left - box.left, w: r.width });
  };

  return (
    <header className="lnav-wrap">
      <nav className={`lnav ${compact ? 'compact' : ''}`} aria-label="Main">
        <Link to="/" className="lnav-brand" aria-label="Canopy home">
          <Logo />
        </Link>
        <div className="lnav-links" ref={linksRef} onMouseLeave={() => setPill(null)}>
          <span
            className={`lnav-pill ${pill ? 'on' : ''}`}
            style={pill ? { transform: `translateX(${pill.x}px)`, width: pill.w } : undefined}
            aria-hidden="true"
          />
          {LINKS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onMouseEnter={hover}
              onClick={(e) => {
                e.preventDefault();
                scrollToId(id);
              }}
              className={active === id ? 'active' : ''}
            >
              <Roll>{label}</Roll>
            </a>
          ))}
        </div>
        <div className="lnav-right">
          <Link to={href} className="lnav-login">
            <Roll>{user ? 'Console' : 'Log in'}</Roll>
          </Link>
          <div className={`lnav-cta ${showCta ? 'on' : ''}`} aria-hidden={!showCta}>
            <FlowButton to={href} size="sm" tabIndex={showCta ? 0 : -1}>
              Open console
            </FlowButton>
          </div>
        </div>
      </nav>
    </header>
  );
}

/** Label that rolls up to a fresh copy on hover, the same gesture as the CTA. */
export function Roll({ children }) {
  return (
    <span className="roll" data-label={children}>
      <span>{children}</span>
    </span>
  );
}
