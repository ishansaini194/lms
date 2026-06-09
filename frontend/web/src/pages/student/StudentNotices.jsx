import React, { useState, useEffect, useCallback } from 'react';
import { StudentChrome } from '@/components/student/StudentChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Card, Pill, Btn, ModalShell } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';
import { AttachmentDownload } from '@/lib/notices';

// ── helpers (module-level — no nesting in render) ──────────────────────────

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function truncate(s, n = 180) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// The endpoint exposes only target_all_school (no author name — just posted_by_id),
// so the audience label is the one honest piece of provenance we can show.
const audienceLabel = (n) => (n.target_all_school ? 'Whole school' : 'Your class');

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

const NoticeRow = ({ n, onOpen }) => (
  <Card
    padding={0}
    onClick={onOpen}
    className="hf-clickable"
    style={{ cursor: 'pointer', borderLeft: `3px solid ${hf.accent}`, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}
  >
    <div style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Pill tone={n.target_all_school ? 'primary' : 'neutral'}>{audienceLabel(n)}</Pill>
        {n.attachment_url && <Pill tone="neutral">📎 Attachment</Pill>}
        <div style={{ flex: 1 }} />
        <span style={{ ...hfText.small, fontSize: 11, color: hf.muted, ...hfText.num, whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</span>
      </div>
      <div style={{ ...hfText.h2, fontSize: 15, lineHeight: 1.3, marginBottom: 6 }}>{n.title}</div>
      <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.5 }}>{truncate(n.body)}</div>
    </div>
  </Card>
);

const NoticeDetail = ({ n, onClose }) => (
  <Overlay onClose={onClose}>
    <ModalShell
      title={n.title}
      subtitle={formatDateLong(n.created_at)}
      width={580}
      accent
      footer={<Btn variant="ghost" size="md" onClick={onClose}>Close</Btn>}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Pill tone={n.target_all_school ? 'primary' : 'neutral'}>{audienceLabel(n)}</Pill>
        <span style={{ ...hfText.small, color: hf.muted }}>{timeAgo(n.created_at)}</span>
      </div>
      <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{n.body}</div>
      {n.attachment_url && <div style={{ marginTop: 6 }}><AttachmentDownload notice={n} /></div>}
    </ModalShell>
  </Overlay>
);

const PageLoading = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    {[0, 1, 2].map(i => (
      <Card key={i} padding={16}><Skel w={90} h={12} /><Skel w={200} h={14} style={{ marginTop: 12 }} /><Skel h={12} style={{ marginTop: 10 }} /></Card>
    ))}
  </div>
);

const PageError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load notices</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function StudentNotices() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nt = await apiFetch('/api/me/notices');
      setList(Array.isArray(nt) ? nt : []); // endpoint already returns newest-first
    } catch (e) {
      setError(e.message || 'Failed to load notices');
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
          No notices yet. Announcements from your school and class will appear here.
        </div>
      </Card>
    );
  } else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
        {list.map(n => <NoticeRow key={n.id} n={n} onOpen={() => setOpen(n)} />)}
      </div>
    );
  }

  return (
    <StudentChrome active="Notices" title="Notices" breadcrumb="Home">
      {body}
      {open && <NoticeDetail n={open} onClose={() => setOpen(null)} />}
    </StudentChrome>
  );
}
