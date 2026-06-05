import React, { useState, useEffect, useCallback } from 'react';
import { TeacherChrome } from '@/components/teacher/TeacherChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Card, Btn, Avatar, FInput } from '@/components/ui/primitives';
import { useAuth } from '@/auth/AuthContext';
import { apiFetch } from '@/lib/api';
import { useIsMobile } from '@/lib/useIsMobile';
import { EnableNotifications } from '@/components/EnableNotifications';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

// ── presentational pieces ───────────────────────────────────────────────────

const FieldLabel = ({ children }) => (
  <div style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, marginBottom: 6 }}>{children}</div>
);

const ErrorBox = ({ children }) => (
  <div style={{
    ...hfText.small, color: hf.accent, background: hf.accentSoft,
    border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px',
  }}>{children}</div>
);

const Skel = ({ w = '100%', h = 12, r = 6, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${hf.borderS}, ${hf.surface2} 50%, ${hf.borderS})`,
    backgroundSize: '200% 100%', animation: 'hf-skel 1.6s ease-in-out infinite', ...style,
  }} />
);

const ReadField = ({ label, value }) => (
  <div>
    <div style={{ ...hfText.micro, fontSize: 10 }}>{label}</div>
    <div style={{ ...hfText.body, color: hf.ink, fontWeight: 600, marginTop: 3 }}>{dash(value)}</div>
  </div>
);

// ── Card 1 · Profile details (read-only) ────────────────────────────────────

const ProfileDetails = ({ teacher, loading, error, onRetry, user, school }) => {
  const isMobile = useIsMobile();
  if (loading) {
    return (
      <Card padding={20}>
        <Skel w={180} h={18} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginTop: 20 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i}><Skel w={70} h={10} /><Skel w={120} h={14} style={{ marginTop: 6 }} /></div>)}
        </div>
      </Card>
    );
  }
  if (error) {
    return (
      <Card padding={28} style={{ textAlign: 'center' }}>
        <div style={{ ...hfText.small, color: hf.muted, marginBottom: 12 }}>{error}</div>
        <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
      </Card>
    );
  }

  return (
    <Card padding={0}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 22px', borderBottom: `1px solid ${hf.borderS}` }}>
        <Avatar name={teacher?.name || user?.display_name || 'Teacher'} size={52} />
        <div>
          <div style={{ ...hfText.h2, fontSize: 18 }}>{teacher?.name || user?.display_name || 'Teacher'}</div>
          <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>
            {cap(user?.role) || 'Teacher'}{school?.name ? ` · ${school.name}` : ''}
          </div>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18, padding: 22 }}>
        <ReadField label="Name" value={teacher?.name} />
        <ReadField label="Employee ID" value={teacher?.employee_id} />
        <ReadField label="Subject" value={teacher?.subject} />
        <ReadField label="Qualification" value={teacher?.qualification} />
        <ReadField label="Phone" value={teacher?.phone} />
        <ReadField label="Email" value={teacher?.email} />
        <ReadField label="Username" value={user?.username} />
      </div>

      <div style={{ padding: '12px 22px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2, ...hfText.small, color: hf.muted }}>
        To update your details, contact your school admin.
      </div>
    </Card>
  );
};

// ── Card 2 · Change password ────────────────────────────────────────────────

const ChangePasswordForm = () => {
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
      // Don't send confirm — the backend only takes old + new.
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

        {err && <ErrorBox>{err}</ErrorBox>}
        {ok && (
          <div style={{ ...hfText.small, color: hf.good, background: hf.goodSoft, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>{ok}</div>
        )}

        <div>
          <Btn variant="primary" size="md" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Btn>
        </div>
      </div>
    </Card>
  );
};

// ── page ────────────────────────────────────────────────────────────────────

export default function TeacherProfile() {
  const { user, school } = useAuth();
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/teacher/profile');
      setTeacher(res);
    } catch (e) {
      setError(e.message || 'Failed to load your profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <TeacherChrome active="Profile" title="Profile" breadcrumb="Home">
      <ProfileDetails teacher={teacher} loading={loading} error={error} onRetry={load} user={user} school={school} />
      {/* Notifications toggle (always shows current state here; on/off control). */}
      <EnableNotifications variant="row" />
      <ChangePasswordForm />
    </TeacherChrome>
  );
}
