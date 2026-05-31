// UI primitives — ported verbatim from the hi-fi kit.
// Same names, same markup; only change is `const` -> `export const`
// and importing the shared tokens/icons instead of reading window globals.
import React from 'react';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';

export const Card = ({ children, padding = 18, style = {}, hoverable, ...rest }) => (
  <div {...rest} style={{
    background: hf.surface,
    border: `1px solid ${hf.border}`,
    borderRadius: 14,
    padding,
    boxShadow: hf.shadowSm,
    ...style,
  }}>
    {children}
  </div>
);

export const Btn = ({ children, variant = 'ghost', size = 'md', icon, style = {}, ...rest }) => {
  const sizes = {
    sm: { padding: '6px 11px', fontSize: 12, height: 30, gap: 6, radius: 8 },
    md: { padding: '8px 14px', fontSize: 13, height: 36, gap: 7, radius: 9 },
    lg: { padding: '10px 18px', fontSize: 14, height: 42, gap: 8, radius: 10 },
  }[size];
  const variants = {
    primary: { background: hf.primary, color: '#fff', border: `1px solid ${hf.primary}` },
    accent:  { background: hf.accent, color: '#fff', border: `1px solid ${hf.accent}` },
    solid:   { background: hf.ink, color: '#fff', border: `1px solid ${hf.ink}` },
    outline: { background: hf.surface, color: hf.ink, border: `1px solid ${hf.border}` },
    ghost:   { background: 'transparent', color: hf.ink2, border: `1px solid transparent` },
    soft:    { background: hf.primarySoft, color: hf.primary, border: `1px solid ${hf.primaryEdge}` },
  }[variant];
  return (
    <button className="hf-btn" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      gap: sizes.gap, padding: sizes.padding, height: sizes.height,
      fontSize: sizes.fontSize, fontWeight: 550,
      borderRadius: sizes.radius, fontFamily: hfFonts.ui,
      ...variants, ...style,
    }} {...rest}>
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </button>
  );
};

export const Pill = ({ children, tone = 'neutral', style = {}, dot }) => {
  const tones = {
    neutral: { bg: hf.surface2, fg: hf.inkSoft, edge: hf.border },
    primary: { bg: hf.primarySoft, fg: hf.primary, edge: hf.primaryEdge },
    accent:  { bg: hf.accentSoft,  fg: hf.accent,  edge: hf.accentEdge },
    good:    { bg: hf.goodSoft,    fg: hf.good,    edge: 'oklch(0.86 0.04 155)' },
    warn:    { bg: hf.warnSoft,    fg: hf.warn,    edge: 'oklch(0.86 0.06 75)'  },
    dark:    { bg: hf.ink,         fg: '#fff',     edge: hf.ink },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 11, fontWeight: 550,
      background: tones.bg, color: tones.fg,
      border: `1px solid ${tones.edge}`,
      fontFamily: hfFonts.ui, lineHeight: 1.4,
      ...style,
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: tones.fg }} />}
      {children}
    </span>
  );
};

export const Chip = ({ children, active, onClick, style = {} }) => (
  <button onClick={onClick} className="hf-btn" style={{
    padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 550,
    background: active ? hf.ink : hf.surface,
    color: active ? '#fff' : hf.ink2,
    border: `1px solid ${active ? hf.ink : hf.border}`,
    fontFamily: hfFonts.ui,
    ...style,
  }}>{children}</button>
);

export const Avatar = ({ name = '', size = 36, style = {} }) => {
  const initials = name.split(' ').map(n => n[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  const h = (name.charCodeAt(0) * 37 + (name.charCodeAt(1) || 0) * 13) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, oklch(0.72 0.10 ${h}), oklch(0.55 0.13 ${(h+40)%360}))`,
      color: '#fff', fontFamily: hfFonts.ui, fontWeight: 650,
      fontSize: size * 0.38, letterSpacing: '-0.01em',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
      ...style,
    }}>{initials}</div>
  );
};

export const SubjectIcon = ({ subject, size = 32 }) => {
  const map = {
    English: { glyph: 'En', h: 220 },
    Maths:   { glyph: '∑',  h: 30  },
    EVS:     { glyph: '🌿', h: 150, plain: true },
    Hindi:   { glyph: 'हि', h: 320 },
    Reading: { glyph: '📖', h: 50,  plain: true },
    PE:      { glyph: '⚽', h: 90,  plain: true },
    Art:     { glyph: '🎨', h: 350, plain: true },
    Music:   { glyph: '🎵', h: 280, plain: true },
    Library: { glyph: '📚', h: 110, plain: true },
  };
  const m = map[subject] || { glyph: subject?.[0] || '?', h: 200 };
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: `oklch(0.96 0.04 ${m.h})`,
      border: `1px solid oklch(0.88 0.06 ${m.h})`,
      color: `oklch(0.40 0.13 ${m.h})`,
      fontFamily: m.plain ? 'inherit' : hfFonts.ui,
      fontSize: m.plain ? size * 0.55 : size * 0.42,
      fontWeight: 650, letterSpacing: '-0.02em',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>{m.glyph}</div>
  );
};

export const SectionHead = ({ title, subtitle, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
    <div>
      <div style={hfText.h2}>{title}</div>
      {subtitle && <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

export const Stat = ({ label, value, hint, tone, icon }) => {
  const toneColor = tone === 'accent' ? hf.accent : tone === 'good' ? hf.good : hf.ink;
  return (
    <Card padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...hfText.small, color: hf.muted, fontWeight: 550 }}>{label}</span>
        {icon}
      </div>
      <div style={{ ...hfText.num, fontSize: 28, fontWeight: 700, color: toneColor, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      {hint && <div style={{ ...hfText.small, color: hf.muted, marginTop: -2 }}>{hint}</div>}
    </Card>
  );
};

export const Sparkbar = ({ values, max = 100, color = hf.primary, height = 28 }) => (
  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height }}>
    {values.map((v, i) => (
      <div key={i} style={{
        flex: 1, height: `${(v/max)*100}%`, minHeight: 2,
        background: i === values.length - 1 ? color : hf.borderS,
        borderRadius: 2,
      }} />
    ))}
  </div>
);

export const ModalShell = ({ title, subtitle, children, footer, width = 520, accent }) => (
  <div className="hf" style={{
    width: '100%', height: '100%', padding: 24, boxSizing: 'border-box',
    background: 'rgba(20,24,32,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: hfFonts.ui, color: hf.ink,
  }}>
    <div style={{
      width, maxHeight: '100%', background: hf.surface,
      borderRadius: 16, boxShadow: hf.shadowLg,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      border: `1px solid ${hf.border}`,
    }}>
      <div style={{
        padding: '18px 22px 14px',
        borderBottom: `1px solid ${hf.borderS}`,
        background: accent ? hf.accentSoft : hf.surface,
      }}>
        <div style={{ ...hfText.h2, fontSize: 18 }}>{title}</div>
        {subtitle && <div style={{ ...hfText.small, color: hf.muted, marginTop: 3 }}>{subtitle}</div>}
      </div>
      <div className="hf-scroll" style={{ padding: 22, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {children}
      </div>
      {footer && (
        <div style={{
          padding: '14px 22px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
        }}>{footer}</div>
      )}
    </div>
  </div>
);

export const StateFrame = ({ title, children }) => (
  <div className="hf" style={{
    width: '100%', height: '100%', padding: 20, boxSizing: 'border-box',
    background: hf.bg, fontFamily: hfFonts.ui, color: hf.ink,
    display: 'flex', flexDirection: 'column',
  }}>
    <div style={{ ...hfText.caption, marginBottom: 10 }}>{title}</div>
    <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
  </div>
);

// ─── Form field primitives (real controlled inputs) ──────────────────────
// Shared by all Add/Edit modals so forms are genuinely typeable and
// consistently styled. Swap the onChange wiring to API submits later.
const fieldInputBase = {
  width: '100%', padding: '9px 12px', background: hf.surface,
  border: `1px solid ${hf.border}`, borderRadius: 9,
  fontSize: 13, color: hf.ink, fontFamily: hfFonts.ui, outline: 'none',
};

export const FInput = ({ value, onChange, placeholder, type = 'text', disabled = false }) => (
  <input
    type={type}
    value={value ?? ''}
    placeholder={placeholder}
    disabled={disabled}
    onChange={(e) => onChange?.(e.target.value)}
    style={disabled ? { ...fieldInputBase, background: hf.surface2, color: hf.muted, cursor: 'not-allowed' } : fieldInputBase}
  />
);

export const FSelect = ({ value, onChange, options = [], disabled = false }) => (
  <select
    value={value ?? ''}
    disabled={disabled}
    onChange={(e) => onChange?.(e.target.value)}
    style={{ ...fieldInputBase, appearance: 'none', cursor: disabled ? 'not-allowed' : 'pointer', ...(disabled ? { background: hf.surface2, color: hf.muted } : {}) }}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

export const FTextarea = ({ value, onChange, placeholder, rows = 3 }) => (
  <textarea
    value={value ?? ''}
    placeholder={placeholder}
    rows={rows}
    onChange={(e) => onChange?.(e.target.value)}
    style={{ ...fieldInputBase, resize: 'vertical', lineHeight: 1.5 }}
  />
);
