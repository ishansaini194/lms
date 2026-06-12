// Cross-device file save/share. Phones can't reliably take an <a download> blob
// (iOS Safari opens it as a page instead of saving), so we prefer the Web Share
// API (Level 2, with files) which opens the native sheet (Save to Files, share
// to WhatsApp/Drive, etc.). Desktop browsers fall back to a normal download.
// Returns true on success, false if the user cancelled the share sheet.
export async function deliverFile(filename, blob, title) {
  const file = new File([blob], filename, { type: blob.type });
  // Mobile: native share/save sheet. Guarded by canShare({files}) so we only try
  // it where file sharing is actually supported (and the context is secure).
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // user dismissed the sheet
      // Anything else (e.g. share not allowed) → fall through to download.
    }
  }
  // Desktop / unsupported: classic anchor download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

// Print a PDF blob without leaving the app. Works by loading the blob into a
// hidden iframe and calling print() on it — reliable on desktop; mobile webviews
// (and installed PWAs) vary, so the preview modal also offers Save as the
// dependable path. No-op-safe: cleans up the iframe afterwards.
export function printPdfBlob(blob) {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      /* some browsers block programmatic print of cross-context PDFs */
    }
    setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60000);
  };
  document.body.appendChild(iframe);
}
