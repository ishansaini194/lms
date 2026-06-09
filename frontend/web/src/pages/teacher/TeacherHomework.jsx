import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TeacherChrome } from '@/components/teacher/TeacherChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Card, Pill, Btn, ModalShell, FInput, FTextarea, FSelect } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';

// ── helpers (module-level) ──────────────────────────────────────────────────

// The teacher's distinct classes (one per class_year, regardless of subjects).
function buildClasses(responsibilities) {
  const map = new Map();
  for (const r of responsibilities || []) {
    if (!map.has(r.class_year_id)) map.set(r.class_year_id, { class_year_id: r.class_year_id, class_label: r.class_label });
  }
  return Array.from(map.values());
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d < today;
}

function truncate(s, n = 80) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// ── presentational pieces ───────────────────────────────────────────────────

const ClassChip = ({ label }) => (
  <span style={{
    padding: '2px 9px', borderRadius: 6, background: hf.surface2, color: hf.inkSoft,
    border: `1px solid ${hf.borderS}`, fontFamily: hfFonts.ui, fontSize: 11, fontWeight: 650,
    letterSpacing: '-0.01em', whiteSpace: 'nowrap',
  }}>{label}</span>
);

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

const Overlay = ({ onClose, children }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>{children}</div>
  </div>
);

const HomeworkRow = ({ hw, onEdit, onDelete }) => {
  const overdue = isOverdue(hw.due_date);
  const dateLabel = fmtDate(hw.due_date);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 14px', borderRadius: 10,
      background: hf.surface, border: `1px solid ${hf.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...hfText.body, fontWeight: 700, color: hw.subject_name ? hf.ink : hf.muted }}>{hw.subject_name || 'Homework'}</span>
          {(hw.class_labels || []).map((l, i) => <ClassChip key={i} label={l} />)}
        </div>
        <div style={{ ...hfText.small, color: hf.inkSoft, marginTop: 3 }}>{truncate(hw.content)}</div>
      </div>
      <div style={{ minWidth: 120, textAlign: 'right' }}>
        {dateLabel
          ? (overdue
            ? <Pill tone="accent">Overdue · {dateLabel}</Pill>
            : <span style={{ ...hfText.small, color: hf.muted }}>Due {dateLabel}</span>)
          : <span style={{ ...hfText.small, color: hf.faint }}>no due date</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn variant="ghost" size="sm" onClick={onEdit}>Edit</Btn>
        <Btn variant="ghost" size="sm" onClick={onDelete}>Delete</Btn>
      </div>
    </div>
  );
};

const HomeworkModal = ({ classes, subjects, initial, preselectClassId, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [selectedIds, setSelectedIds] = useState(
    initial?.class_year_ids?.length ? initial.class_year_ids
      : (preselectClassId ? [preselectClassId] : [])
  );
  const [subjectId, setSubjectId] = useState(initial?.subject_id ? String(initial.subject_id) : '');
  const [content, setContent] = useState(initial?.content || '');
  const [due, setDue] = useState(initial?.due_date ? String(initial.due_date).slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (id) => setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  const save = async () => {
    setErr('');
    if (selectedIds.length === 0) { setErr('Select at least one class.'); return; }
    if (!content.trim()) { setErr('Content is required.'); return; }
    setSaving(true);
    try {
      // Always send class_year_ids + subject_id so target/subject changes apply on
      // edit. subject_id is optional (null = none). Don't send teacher_id — the
      // backend forces it from the JWT for teachers.
      const body = { subject_id: subjectId ? Number(subjectId) : null, content: content.trim(), class_year_ids: selectedIds };
      if (due) body.due_date = new Date(due).toISOString();
      if (isEdit) await apiFetch(`/api/homeworks/${initial.id}`, { method: 'PUT', body });
      else await apiFetch('/api/homeworks', { method: 'POST', body });
      onSaved?.();
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalShell
        title={isEdit ? 'Edit homework' : 'New homework'}
        subtitle="Assign to one or more of your classes"
        width={540}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Assign homework')}
          </Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel>Class(es) · {selectedIds.length} selected</FieldLabel>
            {classes.length === 0 ? (
              <div style={{ ...hfText.small, color: hf.muted }}>You have no classes assigned.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {classes.map((c) => {
                  const sel = selectedIds.includes(c.class_year_id);
                  return (
                    <div key={c.class_year_id} onClick={() => toggle(c.class_year_id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                      padding: '9px 12px', borderRadius: 9,
                      border: `1px solid ${sel ? hf.primary : hf.border}`,
                      background: sel ? hf.primarySoft : hf.surface,
                    }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        background: sel ? hf.primary : hf.surface,
                        border: `1.5px solid ${sel ? hf.primary : hf.faint}`,
                        color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                      }}>{sel && '✓'}</span>
                      <span style={{ ...hfText.body, color: hf.ink2, fontWeight: 600 }}>{c.class_label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Subject <span style={{ color: hf.muted, fontWeight: 400 }}>(optional)</span></FieldLabel>
            <FSelect value={subjectId} onChange={setSubjectId} options={[{ value: '', label: 'No subject' }, ...subjects.map(s => ({ value: String(s.id), label: s.name }))]} />
          </div>

          <div>
            <FieldLabel>Content</FieldLabel>
            <FTextarea value={content} onChange={setContent} rows={5} placeholder="What should students do…" />
          </div>

          <div>
            <FieldLabel>Due date <span style={{ color: hf.muted, fontWeight: 400 }}>(optional)</span></FieldLabel>
            <FInput type="date" value={due} onChange={setDue} />
          </div>

          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </ModalShell>
    </Overlay>
  );
};

const ConfirmDelete = ({ hw, onCancel, onConfirm, busy, error }) => (
  <Overlay onClose={onCancel}>
    <ModalShell
      title="Delete homework?"
      width={440}
      footer={<>
        <Btn variant="ghost" size="md" onClick={onCancel} disabled={busy}>Cancel</Btn>
        <Btn variant="accent" size="md" onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Btn>
      </>}
    >
      <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.6 }}>
        Delete the <b>{hw.subject_name || 'selected'}</b> homework? Students will no longer see it.
      </div>
      {error && <div style={{ marginTop: 12 }}><ErrorBox>{error}</ErrorBox></div>}
    </ModalShell>
  </Overlay>
);

const PageLoading = () => (
  <>
    <Skel w={220} h={14} />
    {[0, 1, 2].map(i => <Card key={i} padding={14}><Skel w={160} h={14} /><Skel h={12} style={{ marginTop: 10 }} /></Card>)}
  </>
);

const PageError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load your homework</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function TeacherHomework() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectClassId = Number(searchParams.get('class_year_id')) || null;

  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]); // [{id, name}] active subjects
  const [filterId, setFilterId] = useState(null); // null = All

  const [creating, setCreating] = useState(false);
  const [createSeed, setCreateSeed] = useState(null); // class_year_id to preselect
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const autoOpened = useRef(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [hw, dash, subs] = await Promise.all([
        apiFetch('/api/homeworks'),
        apiFetch('/api/teacher/dashboard'),
        apiFetch('/api/subjects').catch(() => []),
      ]);
      setList(Array.isArray(hw) ? hw : []);
      setClasses(buildClasses(dash?.responsibilities));
      setSubjects(Array.isArray(subs) ? subs : []);
    } catch (e) {
      setError(e.message || 'Failed to load homework');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Arriving from an HT2 "+ HW" button opens the create modal with that class
  // preselected (once). Clear the param so a later "New homework" starts blank.
  useEffect(() => {
    if (autoOpened.current || loading) return;
    if (preselectClassId && classes.some(c => c.class_year_id === preselectClassId)) {
      autoOpened.current = true;
      setCreateSeed(preselectClassId);
      setCreating(true);
    }
  }, [preselectClassId, loading, classes]);

  const closeCreate = () => {
    setCreating(false);
    setCreateSeed(null);
    if (searchParams.get('class_year_id')) setSearchParams({}, { replace: true });
  };

  const doDelete = async () => {
    setDelBusy(true);
    setDelErr('');
    try {
      await apiFetch(`/api/homeworks/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      loadAll();
    } catch (e) {
      setDelErr(e.message || 'Delete failed');
    } finally {
      setDelBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const l = list || [];
    if (!filterId) return l;
    return l.filter(hw => (hw.class_year_ids || []).includes(filterId));
  }, [list, filterId]);

  let body;
  if (loading) {
    body = <PageLoading />;
  } else if (error) {
    body = <PageError message={error} onRetry={loadAll} />;
  } else {
    body = (
      <>
        {/* Filter chips */}
        {classes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[{ class_year_id: null, class_label: 'All' }, ...classes].map((c) => {
              const active = c.class_year_id === filterId;
              return (
                <button key={c.class_year_id ?? 'all'} onClick={() => setFilterId(c.class_year_id)} className="hf-btn" style={{
                  padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                  background: active ? hf.primarySoft : hf.surface,
                  color: active ? hf.primary : hf.inkSoft,
                  border: `1px solid ${active ? hf.primaryEdge : hf.border}`,
                  fontFamily: hfFonts.ui, fontSize: 12.5, fontWeight: 600,
                }}>{c.class_label}</button>
              );
            })}
          </div>
        )}

        {filtered.length === 0 ? (
          <Card padding={20}>
            <div style={{ ...hfText.small, color: hf.muted }}>
              {list.length === 0
                ? "No homework assigned yet. Tap 'New homework' to assign one."
                : 'No homework for this class.'}
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(hw => (
              <HomeworkRow
                key={hw.id}
                hw={hw}
                onEdit={() => setEditing(hw)}
                onDelete={() => { setDelErr(''); setDeleting(hw); }}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <TeacherChrome
      active="Homework"
      title="Homework"
      breadcrumb="Home"
      topRight={
        <Btn variant="primary" size="md" onClick={() => { setCreateSeed(null); setCreating(true); }}>+ New homework</Btn>
      }
    >
      {body}

      {creating && (
        <HomeworkModal
          classes={classes}
          subjects={subjects}
          preselectClassId={createSeed}
          onClose={closeCreate}
          onSaved={() => { closeCreate(); loadAll(); }}
        />
      )}
      {editing && (
        <HomeworkModal
          classes={classes}
          subjects={subjects}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadAll(); }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          hw={deleting}
          busy={delBusy}
          error={delErr}
          onCancel={() => setDeleting(null)}
          onConfirm={doDelete}
        />
      )}
    </TeacherChrome>
  );
}
