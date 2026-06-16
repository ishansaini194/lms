// Mobile-only bottom tab bar for the admin console. The admin nav has 8 items —
// too many for a bottom bar — so we show 5 primary tabs (Dashboard, Classes,
// Students, Fees, Notices) and tuck the rest (Teachers, Exams, Settings) behind
// a "More" tab that opens a small sheet above the bar.
//
// Same scroll model as the teacher/student tab bars: position:fixed, page
// scrolls behind it, safe-area inset for the iOS home indicator. Standalone file
// so the mobile nav (and its overflow menu) can be tweaked/debugged apart from
// the desktop sidebar.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { hf, hfFonts } from '@/lib/styles';
import { I } from '@/components/icons';

export const TAB_BAR_HEIGHT = 58;

const Tab = ({ icon, label, active, onClick, to }) => {
  const inner = (
    <>
      <span style={{ display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 550, letterSpacing: '-0.01em' }}>{label}</span>
    </>
  );
  const style = {
    flex: 1, textDecoration: 'none', border: 'none', background: 'transparent',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 3, minHeight: TAB_BAR_HEIGHT, padding: '8px 2px', cursor: 'pointer',
    color: active ? hf.primary : hf.muted, fontFamily: hfFonts.ui,
  };
  return to
    ? <Link to={to} aria-label={label} aria-current={active ? 'page' : undefined} style={style}>{inner}</Link>
    : <button type="button" aria-label={label} onClick={onClick} style={style}>{inner}</button>;
};

export function AdminTabBar({ primary, more, active }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = more.some((m) => m.id === active);

  return (
    <>
      {/* Overflow sheet — sits just above the bar; backdrop closes it. */}
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 899 }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', left: 12, right: 12, zIndex: 901,
              bottom: `calc(${TAB_BAR_HEIGHT}px + 10px + env(safe-area-inset-bottom, 0px))`,
              background: hf.surface, border: `1px solid ${hf.border}`, borderRadius: 14,
              boxShadow: hf.shadowLg, overflow: 'hidden',
            }}
          >
            {more.map((m, i) => (
              <Link
                key={m.id}
                to={m.to}
                onClick={() => setMoreOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                  textDecoration: 'none', minHeight: 48,
                  color: m.id === active ? hf.primary : hf.ink,
                  background: m.id === active ? hf.primarySoft : 'transparent',
                  borderTop: i > 0 ? `1px solid ${hf.borderS}` : 'none',
                  fontFamily: hfFonts.ui, fontSize: 14, fontWeight: 600,
                }}
              >
                <span style={{ display: 'inline-flex', color: m.id === active ? hf.primary : hf.muted }}>{m.icon}</span>
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 900,
        display: 'flex', background: hf.surface,
        borderTop: `1px solid ${hf.border}`, boxShadow: '0 -1px 10px rgba(20,24,32,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {primary.map((item) => (
          <Tab key={item.id} icon={item.icon} label={item.label} to={item.to} active={item.id === active} />
        ))}
        <Tab
          icon={I.more}
          label="More"
          active={moreActive || moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        />
      </nav>
    </>
  );
}
