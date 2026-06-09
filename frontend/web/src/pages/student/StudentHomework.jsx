import React, { useState, useEffect, useCallback } from 'react';
import { StudentChrome } from '@/components/student/StudentChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Card, Pill, Btn, ModalShell } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';
import { useIsMobile } from '@/lib/useIsMobile';

// ── helpers (module-level — no nesting in render) ──────────────────────────

function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function dateFromISO(iso) {
  if (!iso) return null;
  const parts = String(iso).slice(0, 10).split('-').map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDateLong(iso) {
  const d = dateFromISO(iso);
  if (!d) return 'No due date';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

// Due-date state relative to today → { label, tone, group }.
function dueInfo(iso) {
  const due = dateFromISO(iso);
  if (!due) return { label: 'No due date', tone: 'neutral', group: 'none' };
  const days = Math.round((due - startOfToday()) / 86400000);
  if (days < 0) return { label: days === -1 ? 'Overdue by 1 day' : `Overdue by ${-days} days`, tone: 'accent', group: 'overdue' };
  if (days === 0) return { label: 'Due today', tone: 'warn', group: 'today' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'primary', group: 'upcoming' };
  return { label: `Due in ${days} days`, tone: 'primary', group: 'upcoming' };
}

// Sort soonest-first (overdue → today → upcoming → no date).
function byDueSoonest(a, b) {
  const da = dateFromISO(a.due_date);
  const db = dateFromISO(b.due_date);
  if (da && db) return da - db;
  if (da) return -1;
  if (db) return 1;
  return 0;
}

function truncate(s, n = 140) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// ── presentational pieces ──────────────────────────────────────────────────

const Skel = ({ w = '100%', h = 12, r = 6, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${hf.borderS}, ${hf.surface2} 50%, ${hf.borderS})`,
    backgroundSize: '200% 100%', animation: 'hf-skel 1.6s ease-in-out infinite', ...style,
  }} />
);

const Overlay = ({ onClose, children }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>{children}</div>
  </div>
);

const HomeworkCard = ({ h, onOpen }) => {
  const due = dueInfo(h.due_date);
  const edge = due.tone === 'accent' ? hf.accent : due.tone === 'warn' ? hf.warn : hf.primary;
  return (
    <Card
      padding={0}
      onClick={onOpen}
      className="hf-clickable"
      style={{ cursor: 'pointer', borderLeft: `3px solid ${edge}`, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}
    >
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...hfText.h2, fontSize: 15, lineHeight: 1.3 }}>{h.subject_name || 'Homework'}</div>
          </div>
          <Pill tone={due.tone} style={{ flexShrink: 0 }}>{due.label}</Pill>
        </div>
        <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.5, marginBottom: 8 }}>{truncate(h.content)}</div>
        <div style={{ ...hfText.small, fontSize: 11, color: hf.muted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-flex' }}>{I.cal}</span>{formatDateLong(h.due_date)}
        </div>
      </div>
    </Card>
  );
};

const HomeworkDetail = ({ h, onClose }) => {
  const due = dueInfo(h.due_date);
  return (
    <Overlay onClose={onClose}>
      <ModalShell
        title={h.subject_name || 'Homework'}
        subtitle={formatDateLong(h.due_date)}
        width={560}
        footer={<Btn variant="ghost" size="md" onClick={onClose}>Close</Btn>}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill tone={due.tone}>{due.label}</Pill>
        </div>
        <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{h.content}</div>
      </ModalShell>
    </Overlay>
  );
};

const PageLoading = () => {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
      {[0, 1, 2, 3].map(i => (
        <Card key={i} padding={16}><Skel w={120} h={14} /><Skel h={12} style={{ marginTop: 12 }} /><Skel w="70%" h={12} style={{ marginTop: 8 }} /></Card>
      ))}
    </div>
  );
};

const PageError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load your homework</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function StudentHomework() {
  const isMobile = useIsMobile();
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const hw = await apiFetch('/api/me/homework');
      setList(Array.isArray(hw) ? [...hw].sort(byDueSoonest) : []);
    } catch (e) {
      setError(e.message || 'Failed to load homework');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  let body;
  if (loading) {
    body = <PageLoading />;
  } else if (error) {
    body = <PageError message={error} onRetry={load} />;
  } else if (list.length === 0) {
    body = (
      <Card padding={20}>
        <div style={{ ...hfText.small, color: hf.muted }}>
          No homework assigned right now. New homework from your teachers will show up here.
        </div>
      </Card>
    );
  } else {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        {list.map(h => <HomeworkCard key={h.id} h={h} onOpen={() => setOpen(h)} />)}
      </div>
    );
  }

  return (
    <StudentChrome active="Homework" title="Homework" breadcrumb="Home">
      {body}
      {open && <HomeworkDetail h={open} onClose={() => setOpen(null)} />}
    </StudentChrome>
  );
}
