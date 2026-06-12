import React, { useState, useEffect, useCallback } from 'react';
import { TeacherChrome } from '@/components/teacher/TeacherChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Card, Btn, Avatar } from '@/components/ui/primitives';
import { useAuth } from '@/auth/AuthContext';
import { apiFetch } from '@/lib/api';
import { useIsMobile } from '@/lib/useIsMobile';
import { EnableNotifications } from '@/components/EnableNotifications';
import { ChangePasswordCard } from '@/components/ChangePasswordCard.jsx';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

// ── presentational pieces ───────────────────────────────────────────────────

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
      <ChangePasswordCard />
    </TeacherChrome>
  );
}
