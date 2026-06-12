// In-app PDF preview. Renders the actual generated PDF (pixel-identical to what
// gets saved/printed) inside a modal using pdf.js, so it works everywhere the
// app runs — desktop, mobile browser, and the installed PWA (where there is no
// browser tab to hand a PDF off to). Buttons: Save (native share/download) and
// Print. pdf.js is loaded lazily so it only ships when a preview is opened.
import React, { useEffect, useRef, useState } from 'react';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Btn } from '@/components/ui/primitives';
import { deliverFile, printPdfBlob } from '@/lib/fileDelivery';

// Cap device-pixel-ratio so very high-DPI phones don't allocate huge canvases.
const MAX_DPR = 2;

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  // Vite resolves this to a hashed URL for the worker bundle.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

export function PdfPreviewModal({ blob, filename, title, onClose }) {
  const scrollRef = useRef(null);   // scroll area (gives us the render width)
  const pagesRef = useRef(null);    // canvases mount here
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let doc = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        doc = await pdfjs.getDocument({ data }).promise;
        const host = pagesRef.current;
        const scroller = scrollRef.current;
        if (!host || !scroller || cancelled) return;
        host.innerHTML = '';
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        // Fit each page to the available width (minus a little padding).
        const targetW = Math.max(280, scroller.clientWidth - 24);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = targetW / base.width;
          const vp = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.cssText = `width:100%;height:auto;display:block;margin:0 auto 12px;background:#fff;box-shadow:${hf.shadowLg};border-radius:4px;`;
          host.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          if (cancelled) return;
        }
        setStatus('ready');
      } catch (e) {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      if (doc) doc.destroy?.();
    };
  }, [blob]);

  const onSave = async () => {
    setBusy(true);
    try { await deliverFile(filename, blob, title); } finally { setBusy(false); }
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
          <Btn variant="outline" size="sm" onClick={() => printPdfBlob(blob)} disabled={status !== 'ready'}>Print</Btn>
          <Btn variant="primary" size="sm" onClick={onSave} disabled={busy || status === 'error'}>{busy ? 'Saving…' : 'Save'}</Btn>
          <button onClick={onClose} className="hf-btn" aria-label="Close preview" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.ink2, cursor: 'pointer', fontFamily: hfFonts.ui }}>✕</button>
        </div>

        {/* Page canvases */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          <div ref={pagesRef} />
          {status === 'loading' && (
            <div style={{ ...hfText.small, color: hf.muted, textAlign: 'center', padding: '40px 0' }}>Rendering preview…</div>
          )}
          {status === 'error' && (
            <div style={{ ...hfText.small, color: hf.muted, textAlign: 'center', padding: '40px 0' }}>
              Couldn’t render the preview here. Use <strong>Save</strong> to download the PDF instead.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
