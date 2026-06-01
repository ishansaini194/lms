// Interactive form primitives for the Settings area — ported from the
// Claude Design prototype (settings-fields.jsx) into the project's ES-module +
// hf-token style. Focus-ring / native-reset CSS lives in tokens.css (.set-field).
import React from 'react';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Btn } from '@/components/ui/primitives';

// Field label with optional required marker + right-aligned hint.
export const SetLabel = ({ children, required, hint }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
    <span style={{ ...hfText.small, fontWeight: 600, color: hf.ink2 }}>{children}</span>
    {required && <span style={{ color: hf.accent, fontSize: 11 }}>*</span>}
    {hint && <span style={{ marginLeft: 'auto', fontSize: 11, color: hf.muted }}>{hint}</span>}
  </div>
);

// Text input (mono / prefix / suffix / readOnly / type).
export const SetInput = ({ value, onChange, placeholder, mono, prefix, suffix, type = 'text', readOnly, style = {} }) => (
  <div className={readOnly ? '' : 'set-field'} style={{
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '9px 12px', borderRadius: 9,
    background: readOnly ? hf.surface2 : hf.surface,
    border: `1px solid ${hf.border}`,
    ...style,
  }}>
    {prefix && <span style={{ ...hfText.small, color: hf.muted, fontFamily: mono ? hfFonts.mono : hfFonts.ui, whiteSpace: 'nowrap' }}>{prefix}</span>}
    <input
      type={type}
      value={value ?? ''}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(e) => onChange && onChange(e.target.value)}
      style={{
        flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
        fontFamily: mono ? hfFonts.mono : hfFonts.ui, fontSize: 13,
        color: readOnly ? hf.inkSoft : hf.ink, padding: 0,
      }}
    />
    {suffix && <span style={{ ...hfText.small, color: hf.muted }}>{suffix}</span>}
  </div>
);

export const SetTextArea = ({ value, onChange, placeholder, minHeight = 76, style = {} }) => (
  <textarea
    className="set-field"
    value={value ?? ''}
    placeholder={placeholder}
    onChange={(e) => onChange && onChange(e.target.value)}
    style={{
      width: '100%', resize: 'vertical', minHeight,
      padding: '10px 12px', borderRadius: 9, boxSizing: 'border-box',
      background: hf.surface, border: `1px solid ${hf.border}`,
      fontFamily: hfFonts.ui, fontSize: 13, color: hf.ink, lineHeight: 1.55,
      ...style,
    }}
  />
);

// Native select, restyled with a custom chevron.
export const SetSelect = ({ value, onChange, options, style = {} }) => (
  <div style={{ position: 'relative', ...style }}>
    <select
      className="set-field"
      value={value ?? ''}
      onChange={(e) => onChange && onChange(e.target.value)}
      style={{
        width: '100%', padding: '9px 34px 9px 12px', borderRadius: 9,
        background: hf.surface, border: `1px solid ${hf.border}`,
        fontFamily: hfFonts.ui, fontSize: 13, fontWeight: 550, color: hf.ink,
      }}
    >
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const lab = typeof o === 'string' ? o : o.label;
        return <option key={val} value={val}>{lab}</option>;
      })}
    </select>
    <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: hf.muted, pointerEvents: 'none', display: 'inline-flex' }}>{I.arrDown}</span>
  </div>
);

export const SetToggle = ({ checked, onChange }) => (
  <button
    className="hf-btn"
    onClick={() => onChange && onChange(!checked)}
    role="switch"
    aria-checked={checked}
    style={{
      width: 42, height: 24, borderRadius: 999, padding: 0, flexShrink: 0,
      border: `1px solid ${checked ? hf.primary : hf.border}`,
      background: checked ? hf.primary : hf.surface2,
      position: 'relative', transition: 'background .15s, border-color .15s', cursor: 'pointer',
    }}
  >
    <span style={{
      position: 'absolute', top: 2, left: checked ? 20 : 2,
      width: 18, height: 18, borderRadius: '50%',
      background: '#fff', boxShadow: '0 1px 2px rgba(20,24,32,0.25)',
      transition: 'left .16s cubic-bezier(.22,1,.36,1)',
    }} />
  </button>
);

export const SetToggleRow = ({ title, desc, checked, onChange, icon }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 16px', borderRadius: 11,
    background: hf.surface, border: `1px solid ${hf.border}`,
  }}>
    {icon && <div style={{
      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
      background: checked ? hf.primarySoft : hf.surface2,
      border: `1px solid ${checked ? hf.primaryEdge : hf.borderS}`,
      color: checked ? hf.primary : hf.muted,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{icon}</div>}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...hfText.small, fontWeight: 650, color: hf.ink }}>{title}</div>
      {desc && <div style={{ fontSize: 11.5, color: hf.muted, marginTop: 2, lineHeight: 1.45 }}>{desc}</div>}
    </div>
    <SetToggle checked={checked} onChange={onChange} />
  </div>
);

// Logo: URL-based (no file upload yet — needs object storage at deployment).
// Shows the image if a URL is set, else an initials badge, plus a URL input.
export const LogoSlot = ({ src, initials = 'S', onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <div style={{
      width: 76, height: 76, borderRadius: 16, flexShrink: 0,
      border: src ? `1px solid ${hf.border}` : `1.5px dashed ${hf.border}`,
      background: src ? '#fff' : hf.surface2,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {src
        ? <img src={src} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{
            width: 44, height: 44, borderRadius: 11,
            background: `linear-gradient(135deg, ${hf.primary}, oklch(0.55 0.16 290))`,
            color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{initials}</div>}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <SetInput value={src || ''} onChange={onChange} placeholder="https://…/logo.png" mono />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
        {src && <Btn variant="ghost" size="sm" onClick={() => onChange && onChange('')}>Remove</Btn>}
        <span style={{ fontSize: 11.5, color: hf.muted, lineHeight: 1.45 }}>
          Paste a hosted image URL · direct upload coming with deployment.
        </span>
      </div>
    </div>
  </div>
);

// A labelled field block.
export const Field = ({ label, required, hint, children, style = {} }) => (
  <div style={style}>
    <SetLabel required={required} hint={hint}>{label}</SetLabel>
    {children}
  </div>
);

// Card header (title + subtitle + optional right slot).
export const PanelHead = ({ title, subtitle, right }) => (
  <div style={{ padding: '15px 18px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <div>
      <div style={{ ...hfText.h2 }}>{title}</div>
      {subtitle && <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);
