// iOS (incl. iPadOS, which masquerades as a Mac) can't save an <a download> blob
// — Safari opens it as a page instead — so there we must use the native share
// sheet. Everywhere else we want a direct, one-tap save.
function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Save a file to the device. On Android/desktop this is a plain download — it
// drops straight into Downloads with no chooser, which is what non-technical
// users expect from "Save". Only on iOS (where direct download doesn't work) do
// we fall back to the Web Share sheet (Save to Files / share to Drive, etc.).
// Returns true on success, false if an iOS share was cancelled.
export async function deliverFile(filename, blob, title) {
  if (isIOS()) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false; // user dismissed the sheet
        // Anything else → fall through to a download attempt.
      }
    }
  }
  // Android / desktop / PWA: direct download, no share chooser.
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
