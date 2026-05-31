// Design tokens — ported verbatim from the hi-fi kit so every screen can
// reference the same names (hf, hfFonts, hfText) it did as window globals.

export const hf = {
  // surfaces
  bg: '#f4f2ec',
  surface: '#ffffff',
  surface2: '#faf9f5',
  border: '#e7e4dc',
  borderS: '#efece4',
  divider: '#f1eee7',

  // ink
  ink: '#15181d',
  ink2: '#2c313a',
  inkSoft: '#525a68',
  muted: '#8a93a3',
  faint: '#b8bfca',

  // brand — deep indigo, school-trusty
  primary: 'oklch(0.45 0.15 265)',
  primaryHover: 'oklch(0.40 0.16 265)',
  primarySoft: 'oklch(0.965 0.018 265)',
  primaryEdge: 'oklch(0.88 0.04 265)',

  // accent — coral for urgency / fees
  accent: 'oklch(0.62 0.17 30)',
  accentSoft: 'oklch(0.965 0.025 30)',
  accentEdge: 'oklch(0.88 0.06 30)',

  // semantic
  good: 'oklch(0.55 0.12 155)',
  goodSoft: 'oklch(0.96 0.025 155)',
  warn: 'oklch(0.66 0.15 75)',
  warnSoft: 'oklch(0.965 0.04 75)',

  // shadows
  shadowSm: '0 1px 2px rgba(20,24,32,0.04), 0 1px 1px rgba(20,24,32,0.03)',
  shadowMd: '0 2px 6px rgba(20,24,32,0.05), 0 1px 2px rgba(20,24,32,0.04)',
  shadowLg: '0 8px 24px rgba(20,24,32,0.08), 0 2px 6px rgba(20,24,32,0.04)',
};

export const hfFonts = {
  ui: "'Inter', -apple-system, system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

export const hfText = {
  display: { fontFamily: hfFonts.ui, fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 },
  h1: { fontFamily: hfFonts.ui, fontSize: 26, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.2 },
  h2: { fontFamily: hfFonts.ui, fontSize: 17, fontWeight: 650, letterSpacing: '-0.005em' },
  h3: { fontFamily: hfFonts.ui, fontSize: 14, fontWeight: 600 },
  body: { fontFamily: hfFonts.ui, fontSize: 13, fontWeight: 400, lineHeight: 1.5 },
  small: { fontFamily: hfFonts.ui, fontSize: 12, fontWeight: 400, lineHeight: 1.45 },
  caption: { fontFamily: hfFonts.ui, fontSize: 11, fontWeight: 500, color: hf.muted },
  micro: { fontFamily: hfFonts.ui, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: hf.muted },
  num: { fontFamily: hfFonts.mono, fontVariantNumeric: 'tabular-nums' },
};
