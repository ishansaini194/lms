import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StudentChrome } from '@/components/student/StudentChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Card, Pill, Btn } from '@/components/ui/primitives';
import { apiFetch, getToken } from '@/lib/api';
import { useIsMobile } from '@/lib/useIsMobile';

// ── category doors ──────────────────────────────────────────────────────────
// Notes are scoped to the student's own class; PYQs are open to every class.
const DOORS = {
  notes: { label: 'Notes', tone: 'good', hint: 'Study material for your class' },
  pyq:   { label: 'PYQ',   tone: 'warn', hint: "Previous years' papers — any class" },
};
const NO_SUBJECT = 'General';

// ── helpers (module-level) ──────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Group files by subject name (General last). Returns [{ subject, files }].
function groupBySubject(files) {
  const m = new Map();
  for (const f of files) {
    const key = f.subject_name || NO_SUBJECT;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(f);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] === NO_SUBJECT ? 1 : b[0] === NO_SUBJECT ? -1 : a[0].localeCompare(b[0])))
    .map(([subject, fs]) => ({ subject, files: fs }));
}

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

const PageError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load the library</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

const Empty = ({ children }) => (
  <Card padding={40} style={{ borderStyle: 'dashed', textAlign: 'center', ...hfText.small, color: hf.muted }}>{children}</Card>
);

// Big category door on the landing screen.
const DoorCard = ({ door, count, onOpen }) => (
  <Card padding={0} className="hf-clickable" onClick={onOpen} style={{ cursor: 'pointer' }}>
    <div style={{ padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{
        width: 46, height: 46, borderRadius: 12, flexShrink: 0,
        background: hf.primarySoft, color: hf.primary, border: `1px solid ${hf.primaryEdge}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{I.book}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...hfText.h2, fontSize: 17 }}>{DOORS[door].label}</div>
        <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>{DOORS[door].hint}</div>
      </div>
      <Pill tone={DOORS[door].tone}>{count} file{count === 1 ? '' : 's'}</Pill>
    </div>
  </Card>
);

// Subject card — name only (tap to open its files).
const SubjectCard = ({ subject, count, onOpen }) => (
  <Card padding={0} className="hf-clickable" onClick={onOpen} style={{ cursor: 'pointer' }}>
    <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ ...hfText.h2, fontSize: 15, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subject}</span>
      <span style={{ ...hfText.small, color: hf.muted }}>{count}</span>
      <span style={{ color: hf.faint, display: 'inline-flex' }}>{I.chevronRight || '›'}</span>
    </div>
  </Card>
);

// Leaf file row.
const FileRow = ({ f, onDownload }) => (
  <Card padding={0}>
    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...hfText.body, fontWeight: 600, color: hf.ink, overflowWrap: 'anywhere' }}>{f.title}</div>
        <div style={{ ...hfText.small, fontSize: 11, color: hf.muted, ...hfText.num, marginTop: 2 }}>{fmtDate(f.created_at)}</div>
      </div>
      <Btn variant="soft" size="sm" icon={I.download} onClick={() => onDownload(f)}>Download</Btn>
    </div>
  </Card>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function StudentLibrary() {
  const isMobile = useIsMobile();

  const [door, setDoor] = useState(null);          // null | 'notes' | 'pyq'
  const [selSubject, setSelSubject] = useState(null);
  const [pyqClassId, setPyqClassId] = useState(null);

  const [notes, setNotes] = useState([]);
  const [pyqs, setPyqs] = useState([]);
  const [myClass, setMyClass] = useState(null);    // {id, label}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionErr, setActionErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [notesRes, pyqRes, enrollments] = await Promise.all([
        apiFetch('/api/me/library?category=notes'),
        apiFetch('/api/me/library?category=pyq'),
        apiFetch('/api/me/enrollments').catch(() => []),
      ]);
      setNotes(Array.isArray(notesRes) ? notesRes : []);
      setPyqs(Array.isArray(pyqRes) ? pyqRes : []);
      const active = (Array.isArray(enrollments) ? enrollments : []).find(e => e.status === 'active');
      if (active) {
        const c = active.class_year?.class || {};
        setMyClass({ id: active.class_year_id, label: c.section ? `${c.name}-${c.section}` : (c.name || 'My class') });
      }
    } catch (e) {
      setError(e.message || 'Failed to load the library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dl = (f) => downloadFile(f.id, f.title, setActionErr);

  // Notes are server-scoped to the student's own class already.
  const notesSubjects = useMemo(() => groupBySubject(notes), [notes]);

  // PYQ class buckets = classes that actually have PYQs, plus the student's own
  // class (so it's always pickable), deduped. Default selection = own class.
  const pyqClasses = useMemo(() => {
    const m = new Map();
    if (myClass) m.set(myClass.id, myClass.label);
    for (const f of pyqs) {
      (f.class_year_ids || []).forEach((id, i) => { if (!m.has(id)) m.set(id, (f.class_labels || [])[i] || `Class ${id}`); });
    }
    return [...m.entries()].map(([id, label]) => ({ id, label }));
  }, [pyqs, myClass]);

  const activePyqClassId = pyqClassId ?? myClass?.id ?? pyqClasses[0]?.id ?? null;
  const pyqSubjects = useMemo(
    () => groupBySubject(pyqs.filter(f => (f.class_year_ids || []).includes(activePyqClassId))),
    [pyqs, activePyqClassId],
  );

  const openDoor = (d) => { setDoor(d); setSelSubject(null); };
  const back = () => { if (selSubject) setSelSubject(null); else setDoor(null); };

  // Resolve the subject group currently being viewed (leaf level).
  const currentGroups = door === 'pyq' ? pyqSubjects : notesSubjects;
  const selGroup = selSubject ? currentGroups.find(g => g.subject === selSubject) : null;

  let body;
  if (loading) {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        {[0, 1, 2, 3].map(i => <Card key={i} padding={16}><Skel w={140} h={14} /><Skel w="60%" h={12} style={{ marginTop: 10 }} /></Card>)}
      </div>
    );
  } else if (error) {
    body = <PageError message={error} onRetry={load} />;
  } else if (door === null) {
    // Landing — two doors.
    body = (
      <>
        {actionErr && <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{actionErr}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <DoorCard door="notes" count={notes.length} onOpen={() => openDoor('notes')} />
          <DoorCard door="pyq" count={pyqs.length} onOpen={() => openDoor('pyq')} />
        </div>
      </>
    );
  } else {
    // Inside a door.
    const crumb = selSubject ? `${DOORS[door].label} · ${selSubject}` : DOORS[door].label;
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn variant="outline" size="sm" onClick={back}>← Back</Btn>
          <span style={{ ...hfText.small, color: hf.muted }}>{crumb}</span>
        </div>
        {actionErr && <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{actionErr}</div>}

        {/* PYQ class picker */}
        {door === 'pyq' && !selSubject && (
          pyqClasses.length === 0 ? null : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pyqClasses.map(c => {
                const active = c.id === activePyqClassId;
                return (
                  <button key={c.id} onClick={() => { setPyqClassId(c.id); setSelSubject(null); }} className="hf-btn" style={{
                    padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                    background: active ? hf.primarySoft : hf.surface,
                    color: active ? hf.primary : hf.inkSoft,
                    border: `1px solid ${active ? hf.primaryEdge : hf.border}`,
                    fontFamily: hfFonts.ui, fontSize: 12.5, fontWeight: 600,
                  }}>{c.label}{c.id === myClass?.id ? ' · mine' : ''}</button>
                );
              })}
            </div>
          )
        )}

        {/* Leaf: a subject's files */}
        {selSubject ? (
          !selGroup || selGroup.files.length === 0 ? (
            <Empty>No files here anymore.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selGroup.files.map(f => <FileRow key={f.id} f={f} onDownload={dl} />)}
            </div>
          )
        ) : (
          // Subject grid
          currentGroups.length === 0 ? (
            <Empty>
              {door === 'notes'
                ? 'No notes for your class yet.'
                : 'No PYQs for this class yet.'}
            </Empty>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              {currentGroups.map(g => (
                <SubjectCard key={g.subject} subject={g.subject} count={g.files.length} onOpen={() => setSelSubject(g.subject)} />
              ))}
            </div>
          )
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
