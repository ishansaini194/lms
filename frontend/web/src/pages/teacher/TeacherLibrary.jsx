import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TeacherChrome } from '@/components/teacher/TeacherChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Card, Pill, Btn, ModalShell, FInput, FTextarea, FSelect } from '@/components/ui/primitives';
import { useAuth } from '@/auth/AuthContext';
import { apiFetch, apiUpload, getToken } from '@/lib/api';

// ── category system (must match the backend whitelist) ──────────────────────

const CATEGORIES = ['syllabus', 'notes', 'pyq', 'datesheet', 'circular', 'other'];
const CAT_LABEL = { syllabus: 'Syllabus', notes: 'Notes', pyq: 'PYQ', datesheet: 'Datesheet', circular: 'Circular', other: 'Other' };
const CAT_TONE = { syllabus: 'primary', notes: 'good', pyq: 'warn', datesheet: 'accent', circular: 'neutral', other: 'neutral' };
const MAX_SIZE = 25 * 1024 * 1024;

const CLASS_OPTIONS = [{ value: '', label: 'All classes / none' }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Class ${i + 1}` }))];

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
    const res = await fetch(`/api/library/${id}/download`, { headers: { Authorization: `Bearer ${getToken()}` } });
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

const ErrorBox = ({ children }) => (
  <div style={{
    ...hfText.small, color: hf.accent, background: hf.accentSoft,
    border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px',
  }}>{children}</div>
);

const FieldLabel = ({ children }) => (
  <div style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, marginBottom: 6 }}>{children}</div>
);

const Overlay = ({ onClose, children }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>{children}</div>
  </div>
);

const FileIcon = () => (
  <span style={{
    width: 30, height: 30, borderRadius: 7, flexShrink: 0,
    background: hf.primarySoft, color: hf.primary, border: `1px solid ${hf.primaryEdge}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }}>{I.book}</span>
);

// ── Upload modal ────────────────────────────────────────────────────────────

const UploadModal = ({ currentAY, onClose, onSaved }) => {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('notes');
  const [subject, setSubject] = useState('');
  const [classNumber, setClassNumber] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onPick = (e) => {
    const f = e.target.files?.[0] || null;
    setErr('');
    if (f) {
      if (!f.name.toLowerCase().endsWith('.pdf')) { setErr('Only PDF files are allowed.'); setFile(null); return; }
      if (f.size > MAX_SIZE) { setErr('File exceeds the 25MB limit.'); setFile(null); return; }
    }
    setFile(f);
  };

  const submit = async () => {
    setErr('');
    if (!file) { setErr('Choose a PDF file.'); return; }
    if (!title.trim()) { setErr('Title is required.'); return; }
    if (!category) { setErr('Pick a category.'); return; }
    if (!currentAY?.id) { setErr('No current academic year set — contact your admin.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      fd.append('category', category);
      fd.append('academic_year_id', String(currentAY.id));
      if (subject.trim()) fd.append('subject', subject.trim());
      if (classNumber) fd.append('class_number', classNumber);
      if (description.trim()) fd.append('description', description.trim());
      await apiUpload('/api/library', fd);
      onSaved?.();
    } catch (e) {
      setErr(e.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalShell
        title="Upload file"
        subtitle="Add a PDF to the school library"
        width={540}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={submit} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel>PDF file</FieldLabel>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              padding: '14px 16px', borderRadius: 10, border: `1.5px dashed ${hf.border}`,
              background: hf.surface2,
            }}>
              <input type="file" accept="application/pdf" onChange={onPick} style={{ display: 'none' }} />
              <FileIcon />
              <div style={{ minWidth: 0 }}>
                {file
                  ? <><div style={{ ...hfText.body, fontWeight: 600, color: hf.ink }}>{file.name}</div>
                    <div style={{ ...hfText.small, color: hf.muted }}>{fmtSize(file.size)}</div></>
                  : <div style={{ ...hfText.small, color: hf.muted }}>Click to choose a PDF (max 25MB)</div>}
              </div>
            </label>
          </div>

          <div>
            <FieldLabel>Title</FieldLabel>
            <FInput value={title} onChange={setTitle} placeholder="e.g. Class 5 Maths — Term 1 syllabus" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <FieldLabel>Category</FieldLabel>
              <FSelect value={category} onChange={setCategory} options={CATEGORIES.map(c => ({ value: c, label: CAT_LABEL[c] }))} />
            </div>
            <div>
              <FieldLabel>Class <span style={{ color: hf.muted, fontWeight: 400 }}>(optional)</span></FieldLabel>
              <FSelect value={classNumber} onChange={setClassNumber} options={CLASS_OPTIONS} />
            </div>
          </div>

          <div>
            <FieldLabel>Subject <span style={{ color: hf.muted, fontWeight: 400 }}>(optional)</span></FieldLabel>
            <FInput value={subject} onChange={setSubject} placeholder="e.g. Mathematics" />
          </div>

          <div>
            <FieldLabel>Description <span style={{ color: hf.muted, fontWeight: 400 }}>(optional)</span></FieldLabel>
            <FTextarea value={description} onChange={setDescription} rows={3} placeholder="A short note about this file…" />
          </div>

          <div style={{ ...hfText.small, color: hf.muted }}>
            Academic year: <b style={{ color: hf.ink2 }}>{currentAY?.year_label || '—'}</b>
          </div>

          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </ModalShell>
    </Overlay>
  );
};

const ConfirmDelete = ({ file, onCancel, onConfirm, busy, error }) => (
  <Overlay onClose={onCancel}>
    <ModalShell
      title="Delete file?"
      width={440}
      footer={<>
        <Btn variant="ghost" size="md" onClick={onCancel} disabled={busy}>Cancel</Btn>
        <Btn variant="accent" size="md" onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Btn>
      </>}
    >
      <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.6 }}>
        Delete "<b>{file.title}</b>"? This permanently removes the file for everyone. This can't be undone.
      </div>
      {error && <div style={{ marginTop: 12 }}><ErrorBox>{error}</ErrorBox></div>}
    </ModalShell>
  </Overlay>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function TeacherLibrary() {
  const { user } = useAuth();
  const myId = user?.id;

  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentAY, setCurrentAY] = useState(null);
  const [actionErr, setActionErr] = useState('');

  const [filterCat, setFilterCat] = useState(null); // null = All
  const [searchSubject, setSearchSubject] = useState('');
  const [filterClass, setFilterClass] = useState('');

  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [files, years] = await Promise.all([
        apiFetch('/api/library'),
        apiFetch('/api/academic-years').catch(() => []),
      ]);
      setList(Array.isArray(files) ? files : []);
      const cur = Array.isArray(years) && years.find(y => y.is_current);
      setCurrentAY(cur ? { id: cur.id, year_label: cur.year_label } : null);
    } catch (e) {
      setError(e.message || 'Failed to load the library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const doDelete = async () => {
    setDelBusy(true);
    setDelErr('');
    try {
      await apiFetch(`/api/library/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      loadAll();
    } catch (e) {
      setDelErr(e.message || 'Delete failed');
    } finally {
      setDelBusy(false);
    }
  };

  const files = list || [];
  const catCounts = useMemo(() => {
    const m = {};
    for (const f of files) m[f.category] = (m[f.category] || 0) + 1;
    return m;
  }, [files]);

  const totalSize = useMemo(() => files.reduce((a, f) => a + (f.file_size || 0), 0), [files]);

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
      <>
        <Skel w={300} h={16} />
        <Card padding={16}>{[0, 1, 2].map(i => <Skel key={i} h={18} style={{ marginTop: i ? 12 : 0 }} />)}</Card>
      </>
    );
  } else if (error) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
        <div style={{ ...hfText.h2 }}>Couldn't load the library</div>
        <div style={{ ...hfText.small, color: hf.muted }}>{error}</div>
        <Btn variant="primary" size="md" onClick={loadAll}>Retry</Btn>
      </div>
    );
  } else {
    body = (
      <>
        {actionErr && <ErrorBox>{actionErr}</ErrorBox>}

        {/* Stat strip */}
        <Card padding={0}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div style={{ padding: '14px 18px', borderRight: `1px solid ${hf.borderS}` }}>
              <div style={{ ...hfText.micro, fontSize: 10 }}>Files in library</div>
              <div style={{ ...hfText.num, fontSize: 22, fontWeight: 700, marginTop: 2 }}>{files.length}</div>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <div style={{ ...hfText.micro, fontSize: 10 }}>Total size</div>
              <div style={{ ...hfText.num, fontSize: 22, fontWeight: 700, marginTop: 2 }}>{fmtSize(totalSize)}</div>
            </div>
          </div>
        </Card>

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
            style={{ flex: 1, minWidth: 180, padding: '8px 12px', background: hf.surface, border: `1px solid ${hf.border}`, borderRadius: 9, fontSize: 13, color: hf.ink, fontFamily: hfFonts.ui, outline: 'none' }}
          />
          <div style={{ width: 180 }}>
            <FSelect value={filterClass} onChange={setFilterClass} options={CLASS_OPTIONS.map(o => o.value === '' ? { value: '', label: 'All classes' } : o)} />
          </div>
        </div>

        {/* File table */}
        {visible.length === 0 ? (
          <Card padding={40} style={{ borderStyle: 'dashed', textAlign: 'center', ...hfText.small, color: hf.muted }}>
            {files.length === 0 ? 'No files in the library yet. Upload the first one.' : 'No files match these filters.'}
          </Card>
        ) : (
          <Card padding={0}>
            <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 0.8fr 1.2fr 0.8fr 1fr 130px', padding: '11px 16px', background: hf.surface2, borderBottom: `1px solid ${hf.borderS}`, ...hfText.micro, fontSize: 10 }}>
              <div>Title</div><div>Category</div><div>Subject</div><div>Class</div><div>Uploaded by</div><div>Size</div><div>Added</div><div></div>
            </div>
            {visible.map((f, i) => {
              const mine = f.uploaded_by_id === myId;
              return (
                <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 0.8fr 1.2fr 0.8fr 1fr 130px', padding: '10px 16px', alignItems: 'center', borderBottom: i === visible.length - 1 ? 'none' : `1px solid ${hf.borderS}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <FileIcon />
                    <span style={{ ...hfText.body, fontWeight: 600, color: hf.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</span>
                  </div>
                  <div><Pill tone={CAT_TONE[f.category] || 'neutral'}>{CAT_LABEL[f.category] || f.category}</Pill></div>
                  <div style={{ ...hfText.small, color: f.subject ? hf.ink2 : hf.faint }}>{f.subject || '—'}</div>
                  <div style={{ ...hfText.small, color: f.class_number ? hf.ink2 : hf.faint }}>{f.class_number ? `Class ${f.class_number}` : 'All'}</div>
                  <div style={{ ...hfText.small, color: hf.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mine ? <span style={{ fontWeight: 600 }}>You</span> : (f.uploaded_by_name || 'Staff')}
                  </div>
                  <div style={{ ...hfText.small, ...hfText.num, color: hf.muted }}>{fmtSize(f.file_size)}</div>
                  <div style={{ ...hfText.small, ...hfText.num, color: hf.muted }}>{fmtDate(f.created_at)}</div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Btn variant="ghost" size="sm" onClick={() => downloadFile(f.id, f.title, setActionErr)}>Download</Btn>
                    {mine && <Btn variant="ghost" size="sm" onClick={() => { setDelErr(''); setDeleting(f); }}>Delete</Btn>}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </>
    );
  }

  return (
    <TeacherChrome
      active="Library"
      title="Library"
      breadcrumb="Home"
      topRight={<Btn variant="primary" size="md" onClick={() => setUploading(true)}>+ Upload</Btn>}
    >
      {body}

      {uploading && (
        <UploadModal currentAY={currentAY} onClose={() => setUploading(false)} onSaved={() => { setUploading(false); loadAll(); }} />
      )}
      {deleting && (
        <ConfirmDelete file={deleting} busy={delBusy} error={delErr} onCancel={() => setDeleting(null)} onConfirm={doDelete} />
      )}
    </TeacherChrome>
  );
}
