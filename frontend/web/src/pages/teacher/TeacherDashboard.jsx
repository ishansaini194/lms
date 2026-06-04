import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TeacherChrome } from '@/components/teacher/TeacherChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Card, Pill, Btn, Stat } from '@/components/ui/primitives';
import { useAuth } from '@/auth/AuthContext';
import { apiFetch } from '@/lib/api';
import { useIsMobile } from '@/lib/useIsMobile';

// ── helpers (module-level — no nesting in render) ──────────────────────────

function greetingWord(h) {
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// "12 May" or "no date" for a null/invalid exam_date.
function formatExamDate(iso) {
  if (!iso) return 'no date';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return 'no date';
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Short relative time: "just now", "5m", "3h", "2d", "4mo", "1y".
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

function truncate(s, n = 80) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// ── small presentational pieces ────────────────────────────────────────────

// Local class chip (no ClassBadge exists; ClassChip lives in AdminChrome which
// we don't import cross-portal). Primary-tinted when it's a class-teacher row.
const ClassChip = ({ label, strong = false }) => (
  <span style={{
    padding: '2px 9px', borderRadius: 6,
    background: strong ? hf.primarySoft : hf.surface2,
    color: strong ? hf.primary : hf.inkSoft,
    border: `1px solid ${strong ? hf.primaryEdge : hf.borderS}`,
    fontFamily: hfFonts.ui, fontSize: 11, fontWeight: 650, letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
  }}>{label}</span>
);

const Skel = ({ w = '100%', h = 12, r = 6, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${hf.borderS}, ${hf.surface2} 50%, ${hf.borderS})`,
    backgroundSize: '200% 100%',
    animation: 'hf-skel 1.6s ease-in-out infinite',
    ...style,
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
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
    </div>
  </Card>
);

const EmptyLine = ({ children }) => (
  <div style={{ ...hfText.small, color: hf.muted, padding: '6px 2px' }}>{children}</div>
);

const ResponsibilityRow = ({ r, onRoster }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '9px 10px', borderRadius: 9,
    background: hf.surface2, border: `1px solid ${hf.borderS}`,
  }}>
    <ClassChip label={r.class_label} strong={r.is_class_teacher} />
    <div style={{ flex: 1, minWidth: 0 }}>
      {r.is_class_teacher ? (
        <span style={{ ...hfText.body, fontWeight: 600, color: hf.ink, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: hf.primary }}>★</span> Class teacher
        </span>
      ) : (
        <span style={{ ...hfText.body, fontWeight: 600, color: hf.ink }}>{r.subject}</span>
      )}
    </div>
    <span style={{ ...hfText.small, color: hf.muted, ...hfText.num }}>
      {r.student_count} students
    </span>
    <Btn variant="ghost" size="sm" onClick={onRoster}>Roster</Btn>
  </div>
);

const ExamRow = ({ e, onEnterMarks }) => {
  const roster = e.roster_size || 0;
  const entered = e.marks_entered || 0;
  const pct = roster > 0 ? Math.min(100, Math.round((Number(entered) / Number(roster)) * 100)) : 0;
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 9,
      background: hf.surface2, border: `1px solid ${hf.borderS}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClassChip label={e.class_label} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...hfText.body, fontWeight: 600, color: hf.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.name}
          </div>
          <div style={{ ...hfText.small, color: hf.muted, marginTop: -1 }}>
            {e.subject} · {formatExamDate(e.exam_date)}
          </div>
        </div>
        {e.needs_marks
          ? <Pill tone="accent">Needs marks</Pill>
          : <Pill tone="neutral">Upcoming</Pill>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 999, background: hf.border, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: e.needs_marks ? hf.accent : hf.primary }} />
        </div>
        <span style={{ ...hfText.small, color: hf.muted, ...hfText.num }}>
          {entered} of {roster} entered
        </span>
        <Btn variant="ghost" size="sm" onClick={onEnterMarks}>Enter marks</Btn>
      </div>
    </div>
  );
};

const NoticeRow = ({ n }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '4px 2px' }}>
    <span style={{ color: hf.muted, display: 'inline-flex', position: 'relative', top: 2 }}>{I.bell}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...hfText.body, fontWeight: 600, color: hf.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {n.title}
      </div>
    </div>
    <span style={{ ...hfText.small, color: hf.muted, ...hfText.num, whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</span>
  </div>
);

const HomeworkRow = ({ h }) => (
  <div style={{ padding: '4px 2px' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ ...hfText.body, fontWeight: 700, color: hf.ink }}>{h.subject}</span>
      <span style={{ ...hfText.small, color: hf.muted, whiteSpace: 'nowrap' }}>
        {h.due_date ? `Due ${formatExamDate(h.due_date)}` : 'no due date'}
      </span>
    </div>
    <div style={{ ...hfText.small, color: hf.inkSoft, marginTop: 2 }}>{truncate(h.content)}</div>
  </div>
);

// ── loading / error frames (inside the chrome so it doesn't flash empty) ────

const DashLoading = () => (
  <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {[0, 1, 2, 3].map(i => <Card key={i} padding={16}><Skel w={70} h={11} /><Skel w={50} h={26} style={{ marginTop: 12 }} /></Card>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
      {[0, 1].map(col => (
        <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[0, 1].map(i => (
            <Card key={i} padding={16}>
              <Skel w={140} h={14} />
              <Skel h={12} style={{ marginTop: 14 }} />
              <Skel w="80%" h={12} style={{ marginTop: 10 }} />
            </Card>
          ))}
        </div>
      ))}
    </div>
  </>
);

const DashError = ({ message, onRetry }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: 48, textAlign: 'center',
  }}>
    <div style={{ ...hfText.h2, color: hf.ink }}>Couldn't load your dashboard</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/teacher/dashboard');
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const name = user?.display_name || 'there';
  const title = `${greetingWord(new Date().getHours())}, ${name}`;

  let body;
  if (loading) {
    body = <DashLoading />;
  } else if (error) {
    body = <DashError message={error} onRetry={load} />;
  } else {
    const responsibilities = data?.responsibilities || [];
    const exams = data?.exams_to_action || [];
    const notices = data?.recent_notices || [];
    const homework = data?.recent_homework || [];
    const distinctClasses = new Set(responsibilities.map(r => r.class_label)).size;

    body = (
      <>
        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14 }}>
          <Stat label="Classes I teach" value={responsibilities.length} icon={I.grid}
            hint={`across ${distinctClasses} ${distinctClasses === 1 ? 'class' : 'classes'}`} />
          <Stat label="Students" value={data?.total_students ?? 0} icon={I.user} hint="total load" />
          <Stat label="Exams to action" value={exams.length} icon={I.chart}
            tone={exams.length > 0 ? 'accent' : undefined} hint="needs marks or upcoming" />
          <Stat label="Homework posted" value={homework.length} icon={I.book} hint="recent" />
        </div>

        {/* Two-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 14, alignItems: 'start' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionCard title="My classes & subjects">
              {responsibilities.length === 0 ? (
                <EmptyLine>No classes assigned yet. Ask your admin to assign you as a class teacher or to a subject.</EmptyLine>
              ) : (
                responsibilities.map((r, i) => (
                  <ResponsibilityRow
                    key={`${r.class_year_id}-${r.is_class_teacher ? 'ct' : r.subject}-${i}`}
                    r={r}
                    onRoster={() => navigate(`/teacher/classes?class_year_id=${r.class_year_id}`)}
                  />
                ))
              )}
            </SectionCard>

            <SectionCard title="Exams to action">
              {exams.length === 0 ? (
                <EmptyLine>Nothing to action right now.</EmptyLine>
              ) : (
                exams.map(e => <ExamRow key={e.id} e={e} onEnterMarks={() => navigate(`/teacher/marks/${e.id}`)} />)
              )}
            </SectionCard>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionCard
              title="Recent notices"
              right={<Btn variant="ghost" size="sm" onClick={() => navigate('/teacher/notices')}>View all</Btn>}
            >
              {notices.length === 0 ? (
                <EmptyLine>No notices yet.</EmptyLine>
              ) : (
                notices.map(n => <NoticeRow key={n.id} n={n} />)
              )}
            </SectionCard>

            <SectionCard
              title="Recent homework"
              right={<Btn variant="ghost" size="sm" onClick={() => navigate('/teacher/homework')}>View all</Btn>}
            >
              {homework.length === 0 ? (
                <EmptyLine>No homework posted yet.</EmptyLine>
              ) : (
                homework.map(h => <HomeworkRow key={h.id} h={h} />)
              )}
            </SectionCard>
          </div>
        </div>
      </>
    );
  }

  return (
    <TeacherChrome active="Dashboard" title={title} breadcrumb="Home">
      {body}
    </TeacherChrome>
  );
}
