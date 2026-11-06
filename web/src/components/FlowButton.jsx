import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * Primary CTA. Ink pill with a lime orb; on hover the orb floods the pill,
 * the label rolls to a fresh copy and the arrow turns toward the destination.
 *
 *   <FlowButton to="/login">Get started</FlowButton>
 *   <FlowButton type="submit" size="md" block>Sign in</FlowButton>
 */
export default function FlowButton({ to, children, size = 'lg', block = false, className = '', ...rest }) {
  const label = typeof children === 'string' ? children : '';
  const cls = `fb fb-${size} ${block ? 'fb-block' : ''} ${className}`;
  const inner = (
    <>
      <span className="fb-fill" aria-hidden="true" />
      <span className="fb-label" data-label={label}>
        <span>{children}</span>
      </span>
      <span className="fb-orb" aria-hidden="true">
        <ArrowRight size={size === 'sm' ? 15 : 18} strokeWidth={2.2} />
      </span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {inner}
    </button>
  );
}
