export function LogoMark({ size = 28, dark = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <rect width="32" height="32" rx="9" fill={dark ? '#b9e769' : '#0f3b2c'} />
      <g fill="none" strokeLinecap="round">
        <circle cx="16" cy="16" r="9" stroke={dark ? '#0f3b2c' : '#b9e769'} strokeWidth="2.6" strokeDasharray="10 4.2" className="logo-ring" />
        <path d="M9.5 16h3l2-4 3 8 2-4h3" stroke={dark ? '#0f3b2c' : '#f4f7d8'} strokeWidth="2.2" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function Logo({ dark = false, size = 28 }) {
  return (
    <span className={`logo ${dark ? 'logo-dark' : ''}`}>
      <LogoMark size={size} dark={dark} />
      <span className="logo-word">canopy</span>
    </span>
  );
}
