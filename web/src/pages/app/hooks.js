import { useEffect, useState } from 'react';

/** Re-renders every `interval` ms so relative times stay fresh. */
export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}
