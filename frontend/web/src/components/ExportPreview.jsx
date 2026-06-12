// In-app export preview, rendered as plain HTML (not a PDF). This is pure DOM, so
// it shows everywhere the app runs — desktop, mobile browser, and the installed
// PWA (where handing a PDF to a browser tab / pdf.js worker proved unreliable).
// The real PDF is produced only when the user taps Save or Print, via the
// `getFile` thunk → { blob, filename, title }.
import React, { useState } from 'react';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Btn } from '@/components/ui/primitives';
import { deliverFile, printPdfBlob } from '@/lib/fileDelivery';

// Full-screen modal: a paper-like preview sheet + Save/Print toolbar.
export function HtmlPreviewModal({ title, children, getFile, onClose }) {
  const [busy, setBusy] = useState(''); // '' | 'save' | 'print'

  const run = async (action) => {
    if (busy) return;
    setBusy(action);
    try {
      const { blob, filename, title: fileTitle } = await getFile();
      if (action === 'print') {
        printPdfBlob(blob);
      } else {
        const ok = await deliverFile(filename, blob, fileTitle);
        if (ok) onClose?.();
      }
    } finally {
      setBusy('');
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,18,25,0.55)', display: 'flex', flexDirection: 'column' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', maxWidth: 880, margin: '0 auto', background: hf.surface2 }}
      >
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: hf.surface, borderBottom: `1px solid ${hf.borderS}`, flexWrap: 'wrap' }}>
          <div style={{ ...hfText.h2, fontSize: 14, flex: 1, minWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <Btn variant="outline" size="sm" onClick={() => run('print')} disabled={!!busy}>{busy === 'print' ? 'Opening…' : 'Print'}</Btn>
          <Btn variant="primary" size="sm" onClick={() => run('save')} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save PDF'}</Btn>
          <button onClick={onClose} className="hf-btn" aria-label="Close preview" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.ink2, cursor: 'pointer', fontFamily: hfFonts.ui }}>✕</button>
        </div>

        {/* Preview sheet */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', color: '#111', borderRadius: 6, boxShadow: hf.shadowLg, padding: '28px 30px' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// HTML rendering of the bulk students table (mirrors the table PDF's content).
export function StudentsTablePreview({ school, rows, fields, subtitle }) {
  return (
    <div style={{ fontFamily: hfFonts.ui }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{school?.name || 'School'} — Students</div>
      <div style={{ fontSize: 12, color: '#666', margin: '2px 0 14px' }}>{subtitle}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.key} style={{ textAlign: 'left', background: '#2563eb', color: '#fff', padding: '6px 8px', whiteSpace: 'nowrap', border: '1px solid #1e51c9' }}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? i} style={{ background: i % 2 ? '#f7f7f7' : '#fff' }}>
                {fields.map((f) => {
                  const v = f.get(r);
                  return <td key={f.key} style={{ padding: '5px 8px', border: '1px solid #e2e2e2', whiteSpace: 'nowrap' }}>{v == null || v === '' ? '' : String(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// HTML rendering of the single-student black-and-white form (mirrors the form PDF).
export function StudentFormPreview({ student, fields, title, subtitle }) {
  return (
    <div style={{ fontFamily: hfFonts.ui, color: '#000' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, marginTop: 4 }}>{subtitle}</div>}
        </div>
        <div style={{ width: 96, height: 120, border: '1px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 11, flexShrink: 0 }}>Photo</div>
      </div>
      <div style={{ borderTop: '1px solid #000', marginTop: 12 }} />
      <div style={{ marginTop: 8 }}>
        {fields.map((f) => {
          const raw = f.get(student);
          const val = raw == null || raw === '' ? '—' : String(raw);
          return (
            <div key={f.key} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid #d2d2d2' }}>
              <div style={{ width: 150, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{f.label}</div>
              <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{val}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
