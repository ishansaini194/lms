// Self-service "Change password" card. Used by both the teacher and student
// profile pages. Requires the current password (the backend verifies it), so
// it's safe without any email/SMS verification channel. Locked-out users are
// handled separately by an admin reset-to-default.
import React, { useState } from 'react';
import { hf, hfText } from '@/lib/styles';
import { Card, Btn, FInput } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';

const FieldLabel = ({ children }) => (
  <div style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, marginBottom: 6 }}>{children}</div>
);

export function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const submit = async () => {
    setErr('');
    setOk('');
    if (!current || !next || !confirm) { setErr('All fields are required.'); return; }
    if (next.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setErr('New password and confirmation do not match.'); return; }
    setBusy(true);
    try {
      // Backend takes only old + new; confirm is a client-side check.
      await apiFetch('/api/auth/change-password', { method: 'POST', body: { old_password: current, new_password: next } });
      setOk('Password changed.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e) {
      setErr(e.message || 'Could not change password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding={0}>
      <div style={{ padding: '16px 22px', borderBottom: `1px solid ${hf.borderS}` }}>
        <div style={{ ...hfText.h2, fontSize: 16 }}>Change password</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 22, maxWidth: 420 }}>
        <div>
          <FieldLabel>Current password</FieldLabel>
          <FInput type="password" value={current} onChange={setCurrent} placeholder="••••••••" />
        </div>
        <div>
          <FieldLabel>New password</FieldLabel>
          <FInput type="password" value={next} onChange={setNext} placeholder="At least 8 characters" />
        </div>
        <div>
          <FieldLabel>Confirm new password</FieldLabel>
          <FInput type="password" value={confirm} onChange={setConfirm} placeholder="Re-enter new password" />
        </div>

        {err && (
          <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
        )}
        {ok && (
          <div style={{ ...hfText.small, color: hf.good, background: hf.goodSoft, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>{ok}</div>
        )}

        <div>
          <Btn variant="primary" size="md" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Btn>
        </div>
      </div>
    </Card>
  );
}
