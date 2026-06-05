import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StudentChrome } from '@/components/student/StudentChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Card, Pill, Btn, Avatar } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';
import { loadFeesWithBalances, money, feeLabel } from '@/lib/studentFees';
import { useIsMobile } from '@/lib/useIsMobile';
import { EnableNotifications } from '@/components/student/EnableNotifications';

// ── helpers (module-level — no nesting in render) ──────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

const classLabel = (cy) => {
  if (!cy?.class) return '';
  const c = cy.class;
  return `${c.name}${c.section ? '-' + c.section : ''}`;
};

// Pick the enrollment that represents the student's *current* class: prefer the
// one in the current academic year, then any active one, then the most recent.
function currentEnrollment(enrollments) {
  const list = enrollments || [];
  return (
    list.find((e) => e.class_year?.academic_year?.is_current) ||
    list.find((e) => e.status === 'active') ||
    list[0] ||
    null
  );
}

const feeStatusTone = (s) => (s === 'paid' ? 'good' : s === 'partial' ? 'warn' : 'accent');
const feeStatusLabel = (s) => (s === 'paid' ? 'Paid' : s === 'partial' ? 'Partly paid' : 'Unpaid');

// ── presentational pieces ──────────────────────────────────────────────────

const Skel = ({ w = '100%', h = 12, r = 6, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${hf.borderS}, ${hf.surface2} 50%, ${hf.borderS})`,
    backgroundSize: '200% 100%', animation: 'hf-skel 1.6s ease-in-out infinite', ...style,
  }} />
);

const SectionCard = ({ title, right, children }) => (
  <Card padding={0} style={{ overflow: 'hidden' }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 16px', borderBottom: `1px solid ${hf.borderS}`,
    }}>
      <div style={{ ...hfText.h2 }}>{title}</div>
      {right}
    </div>
    <div style={{ padding: 16 }}>{children}</div>
  </Card>
);

// One label/value row. Renders nothing when there's no value (no blank fields).
const InfoRow = ({ label, value }) => {
  if (value == null || value === '') return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: `1px solid ${hf.divider}` }}>
      <div style={{ ...hfText.small, color: hf.muted, width: 130, flexShrink: 0 }}>{label}</div>
      <div style={{ ...hfText.body, color: hf.ink, fontWeight: 550, minWidth: 0, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
};

const FeeRow = ({ f }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 12px', borderRadius: 10,
    background: hf.surface2, border: `1px solid ${hf.borderS}`,
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...hfText.body, fontWeight: 650, color: hf.ink }}>{feeLabel(f)}</div>
      <div style={{ ...hfText.small, color: hf.muted, marginTop: 1 }}>
        {money(f.paid)} paid of {money(f.net)}
      </div>
    </div>
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <div style={{
        ...hfText.num, fontSize: 14, fontWeight: 700,
        color: f.balance == null ? hf.muted : f.status === 'paid' ? hf.good : hf.accent,
      }}>
        {f.balance == null ? '—' : money(f.balance)}
      </div>
      <div style={{ ...hfText.small, color: hf.muted, fontSize: 10.5 }}>balance</div>
    </div>
    <Pill tone={feeStatusTone(f.status)} style={{ flexShrink: 0 }}>{feeStatusLabel(f.status)}</Pill>
  </div>
);

const PageLoading = () => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
    {[0, 1].map(i => (
      <Card key={i} padding={16}><Skel w={140} h={14} /><Skel h={12} style={{ marginTop: 14 }} /><Skel w="70%" h={12} style={{ marginTop: 10 }} /></Card>
    ))}
  </div>
);

const PageError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load your profile</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function StudentProfile() {
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [feeData, setFeeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [prof, enr, fees] = await Promise.all([
        apiFetch('/api/me/profile'),
        apiFetch('/api/me/enrollments'),
        loadFeesWithBalances(),
      ]);
      setProfile(prof || null);
      setEnrollments(Array.isArray(enr) ? enr : []);
      setFeeData(fees);
    } catch (e) {
      setError(e.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enr = useMemo(() => currentEnrollment(enrollments), [enrollments]);
  const cy = enr?.class_year;
  const klass = classLabel(cy);
  const yearLabel = cy?.academic_year?.year_label || '';

  let body;
  if (loading) {
    body = <PageLoading />;
  } else if (error) {
    body = <PageError message={error} onRetry={load} />;
  } else {
    const p = profile || {};
    const fees = feeData?.fees || [];
    const hasGuardian = p.father_name || p.father_contact || p.mother_name || p.mother_contact;

    body = (
      <>
        {/* Identity header */}
        <Card padding={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name={p.name || 'Student'} size={52} />
            <div style={{ minWidth: 0 }}>
              <div style={{ ...hfText.h1, fontSize: 20 }}>{p.name || '—'}</div>
              <div style={{ ...hfText.small, color: hf.muted, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {klass && <span>{klass}{yearLabel ? ` · ${yearLabel}` : ''}</span>}
                {p.admission_no && <span>· Adm. no. <span style={hfText.num}>{p.admission_no}</span></span>}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <Pill tone={p.is_active ? 'good' : 'neutral'} dot>{p.is_active ? 'Active' : 'Inactive'}</Pill>
          </div>
        </Card>

        {/* Notifications toggle (always shows current state here; on/off control). */}
        <EnableNotifications variant="row" />

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, alignItems: 'start' }}>
          {/* Student details */}
          <SectionCard title="Student details">
            <InfoRow label="Full name" value={p.name} />
            <InfoRow label="Admission no." value={p.admission_no} />
            <InfoRow label="Class" value={klass ? `${klass}${yearLabel ? ` · ${yearLabel}` : ''}` : ''} />
            <InfoRow label="Gender" value={p.gender} />
            <InfoRow label="Date of birth" value={formatDate(p.dob)} />
            <InfoRow label="Phone" value={p.phone} />
            <InfoRow label="Email" value={p.email} />
            <InfoRow label="Address" value={p.address} />
          </SectionCard>

          {/* Parent / guardian */}
          <SectionCard title="Parent / guardian">
            {hasGuardian ? (
              <>
                <InfoRow label="Father's name" value={p.father_name} />
                <InfoRow label="Father's contact" value={p.father_contact} />
                <InfoRow label="Mother's name" value={p.mother_name} />
                <InfoRow label="Mother's contact" value={p.mother_contact} />
              </>
            ) : (
              <div style={{ ...hfText.small, color: hf.muted }}>No guardian details on record.</div>
            )}
          </SectionCard>
        </div>

        {/* Fees */}
        <SectionCard
          title="Fees"
          right={
            <div style={{ ...hfText.small, color: hf.muted }}>
              Outstanding{' '}
              <span style={{
                ...hfText.num, fontWeight: 700,
                color: feeData && money(feeData.totalBalance) !== '₹0.00' ? hf.accent : hf.good,
              }}>{money(feeData?.totalBalance ?? '0.00')}</span>
            </div>
          }
        >
          {fees.length === 0 ? (
            <div style={{ ...hfText.small, color: hf.muted }}>No fees on record.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ ...hfText.small, color: hf.muted }}>Billed</div>
                  <div style={{ ...hfText.num, fontSize: 16, fontWeight: 700 }}>{money(feeData.totalNet)}</div>
                </div>
                <div>
                  <div style={{ ...hfText.small, color: hf.muted }}>Paid</div>
                  <div style={{ ...hfText.num, fontSize: 16, fontWeight: 700, color: hf.good }}>{money(feeData.totalPaid)}</div>
                </div>
                <div>
                  <div style={{ ...hfText.small, color: hf.muted }}>Outstanding</div>
                  <div style={{ ...hfText.num, fontSize: 16, fontWeight: 700, color: money(feeData.totalBalance) !== '₹0.00' ? hf.accent : hf.good }}>
                    {money(feeData.totalBalance)}
                  </div>
                </div>
              </div>

              <div className="hf-scroll" style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                // Desktop: contained scroll so a long list doesn't bloat the card.
                // Mobile: flow with the page (no nested scroll-trap on touch).
                maxHeight: isMobile ? 'none' : 340,
                overflowY: isMobile ? 'visible' : 'auto',
              }}>
                {fees.map((f) => <FeeRow key={f.id} f={f} />)}
              </div>

              {/* Online payment isn't wired to a backend yet — shown disabled with an
                  honest reason rather than hidden, per convention. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                <Btn
                  variant="primary"
                  size="md"
                  icon={I.card}
                  disabled
                  title="Online payment coming soon — please pay at the school office"
                  style={{ opacity: 0.55, cursor: 'not-allowed' }}
                >
                  Pay online
                </Btn>
                <span style={{ ...hfText.small, color: hf.muted }}>
                  Online payment coming soon — please pay at the school office.
                </span>
              </div>
            </>
          )}
        </SectionCard>
      </>
    );
  }

  return (
    <StudentChrome active="Profile" title="Profile" breadcrumb="Home">
      {body}
    </StudentChrome>
  );
}
