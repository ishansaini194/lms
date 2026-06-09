// Shared notice-attachment helpers + UI, used by the admin/teacher create forms
// and the admin/teacher/student display rows.
import React from 'react';
import { hf, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Btn } from '@/components/ui/primitives';
import { apiFetch, apiUpload, getToken } from '@/lib/api';

export const MAX_NOTICE_ATTACHMENT = 25 * 1024 * 1024; // 25MB
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];

export function fmtSize(b) {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Returns an error string, or null if the file is acceptable.
export function validateNoticeFile(file) {
  if (!file) return null;
  const name = (file.name || '').toLowerCase();
  if (!ALLOWED_EXT.some(ext => name.endsWith(ext))) return 'Attachment must be a PDF, JPG, or PNG.';
  if (file.size > MAX_NOTICE_ATTACHMENT) return 'Attachment exceeds the 25MB limit.';
  return null;
}

// Create a notice — multipart when a file is attached, plain JSON otherwise
// (so text-only notices behave exactly as before). Attachments are create-only.
export async function createNotice({ fields, file }) {
  if (file) {
    const fd = new FormData();
    fd.append('title', fields.title);
    fd.append('body', fields.body);
    fd.append('target_all_school', String(!!fields.target_all_school));
    (fields.class_year_ids || []).forEach(id => fd.append('class_year_ids', String(id)));
    fd.append('attachment', file);
    return apiUpload('/api/notices', fd);
  }
  return apiFetch('/api/notices', { method: 'POST', body: fields });
}

// Authenticated download (the endpoint needs the Bearer token).
export async function downloadNoticeAttachment(id, name, onError) {
  try {
    const res = await fetch(`/api/notices/${id}/attachment/download`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'attachment';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    onError?.('Could not download the attachment.');
  }
}

// Create-form picker. `file` is the selected File | null.
export const AttachmentPicker = ({ file, onPick, error }) => (
  <div>
    <div style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, marginBottom: 6 }}>
      Attachment <span style={{ color: hf.muted, fontWeight: 400 }}>(PDF or image, max 25MB · optional)</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        padding: '8px 12px', borderRadius: 9, border: `1px solid ${hf.border}`, background: hf.surface,
        ...hfText.small, fontWeight: 600, color: hf.ink2,
      }}>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(e) => onPick(e.target.files?.[0] || null)}
          style={{ display: 'none' }}
        />
        <span style={{ display: 'inline-flex' }}>{I.book}</span>
        {file ? 'Change file' : 'Choose file'}
      </label>
      {file && (
        <span style={{ ...hfText.small, color: hf.ink2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name} · {fmtSize(file.size)}
        </span>
      )}
      {file && <Btn variant="ghost" size="sm" onClick={() => onPick(null)}>Remove</Btn>}
    </div>
    {error && <div style={{ ...hfText.small, color: hf.accent, marginTop: 6 }}>{error}</div>}
  </div>
);

// Display row download button — renders nothing when the notice has no attachment.
export const AttachmentDownload = ({ notice, onError, size = 'sm' }) => {
  if (!notice?.attachment_url) return null;
  const name = notice.attachment_name || 'attachment';
  return (
    <Btn variant="soft" size={size} icon={I.download} onClick={() => downloadNoticeAttachment(notice.id, name, onError)}>
      {name}{notice.attachment_size ? ` · ${fmtSize(notice.attachment_size)}` : ''}
    </Btn>
  );
};
