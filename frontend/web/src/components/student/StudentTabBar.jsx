// Mobile-only bottom tab bar for the student/parent portal. Fixed to the bottom
// of the viewport; the page scrolls behind it (normal document scroll, no
// trapped flex container). Thumb-friendly: each tab is a ≥56px tap target with
// an icon over a short label, and the bar clears the iOS home-indicator via the
// safe-area inset.
//
// Standalone file (not inside StudentChrome) so the mobile nav can be tweaked or
// debugged in isolation from the desktop sidebar.
import React from 'react';
import { Link } from 'react-router-dom';
import { hf, hfFonts } from '@/lib/styles';

// Base bar height (excluding the safe-area inset). Content should reserve this
// much bottom padding so the last item isn't hidden behind the bar.
export const TAB_BAR_HEIGHT = 58;

export function StudentTabBar({ items, active }) {
  return (
    <nav
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 900,
        display: 'flex',
        background: hf.surface,
        borderTop: `1px solid ${hf.border}`,
        boxShadow: '0 -1px 10px rgba(20,24,32,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            to={item.to}
            aria-label={item.id}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1, textDecoration: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, minHeight: TAB_BAR_HEIGHT, padding: '8px 2px',
              color: isActive ? hf.primary : hf.muted,
              fontFamily: hfFonts.ui,
            }}
          >
            <span style={{ display: 'inline-flex' }}>{item.icon}</span>
            <span style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 550, letterSpacing: '-0.01em' }}>
              {item.id}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
