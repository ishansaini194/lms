import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { StudentChrome } from '@/components/student/StudentChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Card, Pill, Btn } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';
import { loadFeesWithBalances, money } from '@/lib/studentFees';
import { useIsMobile } from '@/lib/useIsMobile';

// ── helpers (module-level — no nesting in render) ──────────────────────────

function greetingWord(h) {
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// First name only, for a warmer greeting.
const firstName = (name) => (name ? name.trim().split(/\s+/)[0] : 'there');

function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

// Date-only parse from a backend date string ("2026-06-10T00:00:00Z"), built in
// local time so day-difference math doesn't drift across the UTC boundary.
function dateFromISO(iso) {
  if (!iso) return null;
  const parts = String(iso).slice(0, 10).split('-').map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDate(iso) {
  const d = dateFromISO(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Due-date state for a homework item, relative to today.
function dueInfo(iso) {
  const due = dateFromISO(iso);
  if (!due) return { label: 'No due date', tone: 'neutral', days: null };
  const days = Math.round((due - startOfToday()) / 86400000);
  if (days < 0) return { label: days === -1 ? 'Overdue by 1 day' : `Overdue by ${-days} days`, tone: 'accent', days };
  if (days === 0) return { label: 'Due today', tone: 'warn', days };
  if (days === 1) return { label: 'Due tomorrow', tone: 'primary', days };
  return { label: `Due in ${days} days`, tone: 'primary', days };
}

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

function truncate(s, n = 90) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Soonest-first homework ordering (overdue → today → upcoming → no date).
function byDueSoonest(a, b) {
  const da = dateFromISO(a.due_date);
  const db = dateFromISO(b.due_date);
  if (da && db) return da - db;
  if (da) return -1;
  if (db) return 1;
  return 0;
}

// ── presentational pieces ──────────────────────────────────────────────────

const Skel = ({ w = '100%', h = 12, r = 6, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${hf.borderS}, ${hf.surface2} 50%, ${hf.borderS})`,
    backgroundSize: '200% 100%', animation: 'hf-skel 1.6s ease-in-out infinite', ...style,
  }} />
);

// A clickable summary card: header (icon + title + chevron), then children, and
// a footer "View all" affordance. The whole card navigates on click.
const SummaryCard = ({ icon, title, accent, onOpen, footer, children }) => (
  <Card
    padding={0}
    onClick={onOpen}
    className="hf-clickable"
    style={{ overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
  >
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '13px 16px', borderBottom: `1px solid ${hf.borderS}`,
    }}>
      <span style={{ color: accent || hf.primary, display: 'inline-flex' }}>{icon}</span>
      <div style={{ ...hfText.h2, flex: 1 }}>{title}</div>
      <span style={{ color: hf.faint, display: 'inline-flex' }}>{I.chev}</span>
    </div>
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
      {children}
    </div>
    {footer && (
      <div style={{
        padding: '10px 16px', borderTop: `1px solid ${hf.borderS}`,
        background: hf.surface2, ...hfText.small, color: hf.muted,
      }}>{footer}</div>
    )}
  </Card>
);

const EmptyLine = ({ children }) => (
  <div style={{ ...hfText.small, color: hf.muted, padding: '6px 2px' }}>{children}</div>
);

const HomeworkLine = ({ h }) => {
  const due = dueInfo(h.due_date);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '3px 2px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...hfText.body, fontWeight: 700, color: hf.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {h.subject}
        </div>
        <div style={{ ...hfText.small, color: hf.inkSoft, marginTop: 1 }}>{truncate(h.content, 60)}</div>
      </div>
      <Pill tone={due.tone} style={{ flexShrink: 0 }}>{due.label}</Pill>
    </div>
  );
};

const NoticeLine = ({ n }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '3px 2px' }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...hfText.body, fontWeight: 600, color: hf.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {n.title}
      </div>
      <div style={{ ...hfText.small, color: hf.inkSoft, marginTop: 1 }}>{truncate(n.body, 60)}</div>
    </div>
    <span style={{ ...hfText.small, color: hf.muted, ...hfText.num, whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(n.created_at)}</span>
  </div>
);

const DashLoading = () => {
  const isMobile = useIsMobile();
  return (
  <>
    <Card padding={20}><Skel w={220} h={20} /><Skel w={300} h={12} style={{ marginTop: 10 }} /></Card>
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, alignItems: 'start' }}>
      {[0, 1, 2].map(i => (
        <Card key={i} padding={16}>
          <Skel w={120} h={14} />
          <Skel h={12} style={{ marginTop: 14 }} />
          <Skel w="80%" h={12} style={{ marginTop: 10 }} />
        </Card>
      ))}
    </div>
  </>
  );
};

const DashError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load your dashboard</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function StudentDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState(null);
  const [homework, setHomework] = useState([]);
  const [notices, setNotices] = useState([]);
  const [feeSummary, setFeeSummary] = useState(null); // { fees, totalBalance, ... }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [prof, hw, nt, feeData] = await Promise.all([
        apiFetch('/api/me/profile'),
        apiFetch('/api/me/homework'),
        apiFetch('/api/me/notices'),
        loadFeesWithBalances(),
      ]);
      setProfile(prof || null);
      setHomework(Array.isArray(hw) ? hw : []);
      setNotices(Array.isArray(nt) ? nt : []);
      setFeeSummary(feeData);
    } catch (e) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const title = loading || error
    ? 'Dashboard'
    : `${greetingWord(new Date().getHours())}, ${firstName(profile?.name)}`;

  let body;
  if (loading) {
    body = <DashLoading />;
  } else if (error) {
    body = <DashError message={error} onRetry={load} />;
  } else {
    const upcomingHw = [...homework].sort(byDueSoonest).slice(0, 4);
    const recentNotices = notices.slice(0, 4);
    const outstanding = feeSummary?.totalBalance ?? '0.00';
    const owes = (feeSummary?.fees || []).filter(f => f.status !== 'paid').length;

    body = (
      <>
        {/* Greeting */}
        <Card padding={20}>
          <div style={{ ...hfText.h1, fontSize: 22 }}>{title}</div>
          <div style={{ ...hfText.small, color: hf.muted, marginTop: 4 }}>
            Here's your homework, school notices, and fees at a glance.
          </div>
        </Card>

        {/* Three clickable summary cards — stacked full-width on mobile. */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, alignItems: 'start' }}>
          <SummaryCard
            icon={I.book}
            title="Homework"
            onOpen={() => navigate('/student/homework')}
            footer={`View all homework${homework.length ? ` (${homework.length})` : ''}`}
          >
            {upcomingHw.length === 0
              ? <EmptyLine>No homework right now. You're all caught up.</EmptyLine>
              : upcomingHw.map(h => <HomeworkLine key={h.id} h={h} />)}
          </SummaryCard>

          <SummaryCard
            icon={I.bell}
            title="Notices"
            accent={hf.accent}
            onOpen={() => navigate('/student/notices')}
            footer={`View all notices${notices.length ? ` (${notices.length})` : ''}`}
          >
            {recentNotices.length === 0
              ? <EmptyLine>No notices posted yet.</EmptyLine>
              : recentNotices.map(n => <NoticeLine key={n.id} n={n} />)}
          </SummaryCard>

          <SummaryCard
            icon={I.card}
            title="Fees"
            accent={owes > 0 ? hf.accent : hf.good}
            onOpen={() => navigate('/student/profile')}
            footer="View fees in Profile"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 2px' }}>
              <span style={{ ...hfText.small, color: hf.muted, fontWeight: 550 }}>Outstanding balance</span>
              <span style={{
                ...hfText.num, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1,
                color: owes > 0 ? hf.accent : hf.good,
              }}>{money(outstanding)}</span>
            </div>
            {owes > 0
              ? <Pill tone="accent" style={{ alignSelf: 'flex-start' }}>{owes} unpaid {owes === 1 ? 'fee' : 'fees'}</Pill>
              : <Pill tone="good" dot style={{ alignSelf: 'flex-start' }}>All fees cleared</Pill>}
          </SummaryCard>
        </div>
      </>
    );
  }

  return (
    <StudentChrome active="Dashboard" title={title} breadcrumb="Home">
      {body}
    </StudentChrome>
  );
}
