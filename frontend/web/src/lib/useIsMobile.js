// Single source of truth for the responsive breakpoint. Used wherever the
// layout must branch structurally (sidebar ↔ bottom tab bar, multi-col ↔
// stacked). matchMedia-based: no resize/scroll spam, one listener per consumer.
//
// Kept as its own module (not inlined in a chrome) so the breakpoint and the
// branching logic live in one obvious place — easier to tune and debug.
import { useState, useEffect } from 'react';

// < 768px is treated as "mobile / phone". Tailwind's `md` breakpoint, a common
// phone/tablet split; phones (~360–430px) and small tablets fall under it.
export const MOBILE_MAX = 767;

export function useIsMobile(maxWidth = MOBILE_MAX) {
  const query = `(max-width: ${maxWidth}px)`;
  const get = () => (typeof window !== 'undefined' && window.matchMedia(query).matches);
  const [isMobile, setIsMobile] = useState(get);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(mql.matches); // sync in case it changed between render and effect
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return isMobile;
}
