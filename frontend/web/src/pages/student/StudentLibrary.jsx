import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StudentChrome } from '@/components/student/StudentChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Card, Pill, Btn, FSelect } from '@/components/ui/primitives';
import { apiFetch, getToken } from '@/lib/api';
import { useIsMobile } from '@/lib/useIsMobile';

// ── category system (must match the backend whitelist) ──────────────────────

const CATEGORIES = ['syllabus', 'notes', 'pyq', 'datesheet', 'circular', 'other'];
const CAT_LABEL = { syllabus: 'Syllabus', notes: 'Notes', pyq: 'PYQ', datesheet: 'Datesheet', circular: 'Circular', other: 'Other' };
const CAT_TONE = { syllabus: 'primary', notes: 'good', pyq: 'warn', datesheet: 'accent', circular: 'neutral', other: 'neutral' };

const CLASS_OPTIONS = [{ value: '', label: 'All classes' }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Class ${i + 1}` }))];

// ── helpers (module-level) ──────────────────────────────────────────────────

function fmtSize(b) {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Authenticated download: the endpoint needs the Bearer token, so a bare <a> 401s.
// Fetch as a blob, then trigger a browser download.
async function downloadFile(id, title, onError) {
  try {
    const res = await fetch(`/api/me/library/${id}/download`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'file'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    onError?.('Could not download the file.');
  }
}

// ── presentational pieces ───────────────────────────────────────────────────

const Skel = ({ w = '100%', h = 12, r = 6, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${hf.borderS}, ${hf.surface2} 50%, ${hf.borderS})`,
    backgroundSize: '200% 100%', animation: 'hf-skel 1.6s ease-in-out infinite', ...style,
  }} />
);

const FileIcon = () => (
  <span style={{
    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
    background: hf.primarySoft, color: hf.primary, border: `1px solid ${hf.primaryEdge}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }}>{I.book}</span>
);

const PageError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load the library</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

const FileCard = ({ f, onDownload }) => (
  <Card padding={0}>
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <FileIcon />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...hfText.h2, fontSize: 15, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{f.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <Pill tone={CAT_TONE[f.category] || 'neutral'}>{CAT_LABEL[f.category] || f.category}</Pill>
            {f.subject && <Pill tone="neutral">{f.subject}</Pill>}
            {f.class_number && <Pill tone="neutral">Class {f.class_number}</Pill>}
          </div>
        </div>
      </div>

      {f.description && (
        <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{f.description}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ ...hfText.small, fontSize: 11, color: hf.muted, ...hfText.num }}>
          {fmtSize(f.file_size)} · {fmtDate(f.created_at)}
        </div>
        <Btn variant="soft" size="sm" icon={I.download} onClick={() => onDownload(f)}>Download</Btn>
      </div>
    </div>
  </Card>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function StudentLibrary() {
  const isMobile = useIsMobile();

  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionErr, setActionErr] = useState('');

  const [filterCat, setFilterCat] = useState(null); // null = All
  const [searchSubject, setSearchSubject] = useState('');
  const [filterClass, setFilterClass] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const files = await apiFetch('/api/me/library');
      setList(Array.isArray(files) ? files : []);
    } catch (e) {
      setError(e.message || 'Failed to load the library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const files = list || [];
  const catCounts = useMemo(() => {
    const m = {};
    for (const f of files) m[f.category] = (m[f.category] || 0) + 1;
    return m;
  }, [files]);

  const visible = useMemo(() => {
    const sub = searchSubject.trim().toLowerCase();
    return files.filter(f => {
      if (filterCat && f.category !== filterCat) return false;
      if (sub && !(f.subject || '').toLowerCase().includes(sub)) return false;
      if (filterClass && String(f.class_number || '') !== filterClass) return false;
      return true;
    });
  }, [files, filterCat, searchSubject, filterClass]);

  let body;
  if (loading) {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        {[0, 1, 2, 3].map(i => (
          <Card key={i} padding={16}><Skel w={140} h={14} /><Skel h={12} style={{ marginTop: 12 }} /><Skel w="60%" h={12} style={{ marginTop: 8 }} /></Card>
        ))}
      </div>
    );
  } else if (error) {
    body = <PageError message={error} onRetry={load} />;
  } else {
    body = (
      <>
        {actionErr && (
          <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{actionErr}</div>
        )}

        {/* Category chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[{ key: null, label: 'All' }, ...CATEGORIES.map(c => ({ key: c, label: CAT_LABEL[c] }))].map(c => {
            const active = c.key === filterCat;
            const count = c.key === null ? files.length : (catCounts[c.key] || 0);
            return (
              <button key={c.key ?? 'all'} onClick={() => setFilterCat(c.key)} className="hf-btn" style={{
                padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                background: active ? hf.primarySoft : hf.surface,
                color: active ? hf.primary : hf.inkSoft,
                border: `1px solid ${active ? hf.primaryEdge : hf.border}`,
                fontFamily: hfFonts.ui, fontSize: 12.5, fontWeight: 600,
              }}>{c.label} · {count}</button>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={searchSubject}
            onChange={(e) => setSearchSubject(e.target.value)}
            placeholder="Filter by subject…"
            style={{ flex: 1, minWidth: 160, padding: '8px 12px', background: hf.surface, border: `1px solid ${hf.border}`, borderRadius: 9, fontSize: 13, color: hf.ink, fontFamily: hfFonts.ui, outline: 'none' }}
          />
          <div style={{ width: isMobile ? '100%' : 180 }}>
            <FSelect value={filterClass} onChange={setFilterClass} options={CLASS_OPTIONS} />
          </div>
        </div>

        {/* File list */}
        {visible.length === 0 ? (
          <Card padding={40} style={{ borderStyle: 'dashed', textAlign: 'center', ...hfText.small, color: hf.muted }}>
            {files.length === 0 ? 'No files in the library yet. Materials shared by your school will show up here.' : 'No files match these filters.'}
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            {visible.map(f => <FileCard key={f.id} f={f} onDownload={(file) => downloadFile(file.id, file.title, setActionErr)} />)}
          </div>
        )}
      </>
    );
  }

  return (
    <StudentChrome active="Library" title="Library" breadcrumb="Home">
      {body}
    </StudentChrome>
  );
}
