import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TeacherChrome } from '@/components/teacher/TeacherChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Card, Pill, Btn, ModalShell, FInput, FTextarea } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';
import { useIsMobile } from '@/lib/useIsMobile';
import { useAuth } from '@/auth/AuthContext';

// ── helpers (module-level) ──────────────────────────────────────────────────

// The teacher's distinct classes (one per class_year), for the audience picker
// and for resolving a notice's class_year_ids → labels (notices carry ids, not
// labels). A teacher posts only to her own classes, so they're all in here.
function buildClasses(responsibilities) {
  const map = new Map();
  for (const r of responsibilities || []) {
    if (!map.has(r.class_year_id)) map.set(r.class_year_id, { class_year_id: r.class_year_id, class_label: r.class_label });
  }
  return Array.from(map.values());
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

// A small attribution chip for notices the teacher didn't post (they reach her
// because they're school-wide or target a class she's the class teacher of).
const FromChip = ({ name, schoolWide }) => (
  <span style={{
    padding: '2px 9px', borderRadius: 6, background: hf.primarySoft, color: hf.primary,
    border: `1px solid ${hf.primary}`, fontFamily: hfFonts.ui, fontSize: 11, fontWeight: 650,
    letterSpacing: '-0.01em', whiteSpace: 'nowrap',
  }}>{schoolWide ? 'School-wide' : 'From admin'}{name ? ` · ${name}` : ''}</span>
);

const NoticeRow = ({ n, mine, labelByCY, onEdit, onDelete }) => {
  const labels = (n.class_year_ids || []).map(id => labelByCY[id] || `Class ${id}`);
  return (
    <Card padding={0} style={{ borderLeft: `3px solid ${mine ? hf.accent : hf.primary}`, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {!mine && <FromChip name={n.posted_by_name} schoolWide={n.target_all_school} />}
              {labels.map((l, i) => <ClassChip key={i} label={l} />)}
            </div>
            <div style={{ ...hfText.h2, fontSize: 15, lineHeight: 1.3 }}>{n.title}</div>
          </div>
          {/* Edit/Delete only for notices this teacher authored — others are read-only. */}
          {mine && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <Btn variant="ghost" size="sm" onClick={onEdit}>Edit</Btn>
              <Btn variant="ghost" size="sm" onClick={onDelete}>Delete</Btn>
            </div>
          )}
        </div>
        <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.5, marginBottom: 8 }}>{truncate(n.body)}</div>
        <div style={{ ...hfText.small, fontSize: 11, color: hf.muted }}>{timeAgo(n.created_at)}</div>
      </div>
    </Card>
  );
};

const NoticeModal = ({ classes, initial, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [selectedIds, setSelectedIds] = useState(initial?.class_year_ids?.length ? initial.class_year_ids : []);
  const [title, setTitle] = useState(initial?.title || '');
  const [bodyText, setBodyText] = useState(initial?.body || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (id) => setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  const save = async () => {
    setErr('');
    if (selectedIds.length === 0) { setErr('Select at least one class.'); return; }
    if (!title.trim()) { setErr('Title is required.'); return; }
    if (!bodyText.trim()) { setErr('Body is required.'); return; }
    setSaving(true);
    try {
      // A teacher is always class-targeted, never whole-school. Always send both
      // fields so target changes apply unambiguously on edit.
      const body = {
        title: title.trim(),
        body: bodyText.trim(),
        target_all_school: false,
        class_year_ids: selectedIds,
      };
      if (isEdit) await apiFetch(`/api/notices/${initial.id}`, { method: 'PUT', body });
      else await apiFetch('/api/notices', { method: 'POST', body });
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
        title={isEdit ? 'Edit notice' : 'New notice'}
        subtitle="Post to one or more of your classes"
        width={540}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Post notice')}
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
            <FieldLabel>Title</FieldLabel>
            <FInput value={title} onChange={setTitle} placeholder="e.g. Bring your science textbook tomorrow" />
          </div>

          <div>
            <FieldLabel>Body</FieldLabel>
            <FTextarea value={bodyText} onChange={setBodyText} rows={5} placeholder="Write the notice your class will see…" />
          </div>

          <div style={{ ...hfText.small, color: hf.muted }}>Visible to students in the selected class(es).</div>

          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </ModalShell>
    </Overlay>
  );
};

const ConfirmDelete = ({ notice, onCancel, onConfirm, busy, error }) => (
  <Overlay onClose={onCancel}>
    <ModalShell
      title="Delete notice?"
      width={440}
      footer={<>
        <Btn variant="ghost" size="md" onClick={onCancel} disabled={busy}>Cancel</Btn>
        <Btn variant="accent" size="md" onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Btn>
      </>}
    >
      <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.6 }}>
        Delete "<b>{notice.title}</b>"? Students will no longer see it.
      </div>
      {error && <div style={{ marginTop: 12 }}><ErrorBox>{error}</ErrorBox></div>}
    </ModalShell>
  </Overlay>
);

const PageLoading = () => {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
      {[0, 1].map(i => <Card key={i} padding={16}><Skel w={120} h={14} /><Skel h={12} style={{ marginTop: 12 }} /><Skel w="70%" h={12} style={{ marginTop: 8 }} /></Card>)}
    </div>
  );
};

const PageError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load your notices</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function TeacherNotices() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState([]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [notices, dash] = await Promise.all([
        apiFetch('/api/notices'),
        apiFetch('/api/teacher/dashboard'),
      ]);
      setList(Array.isArray(notices) ? notices : []);
      setClasses(buildClasses(dash?.responsibilities));
    } catch (e) {
      setError(e.message || 'Failed to load notices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const labelByCY = useMemo(() => {
    const m = {};
    for (const c of classes) m[c.class_year_id] = c.class_label;
    return m;
  }, [classes]);

  const doDelete = async () => {
    setDelBusy(true);
    setDelErr('');
    try {
      await apiFetch(`/api/notices/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      loadAll();
    } catch (e) {
      setDelErr(e.message || 'Delete failed');
    } finally {
      setDelBusy(false);
    }
  };

  let body;
  if (loading) {
    body = <PageLoading />;
  } else if (error) {
    body = <PageError message={error} onRetry={loadAll} />;
  } else if (list.length === 0) {
    body = (
      <Card padding={20}>
        <div style={{ ...hfText.small, color: hf.muted }}>
          No notices posted yet. Tap 'New notice' to post to your class.
        </div>
      </Card>
    );
  } else {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        {list.map(n => (
          <NoticeRow
            key={n.id}
            n={n}
            mine={n.posted_by_id === user?.id}
            labelByCY={labelByCY}
            onEdit={() => setEditing(n)}
            onDelete={() => { setDelErr(''); setDeleting(n); }}
          />
        ))}
      </div>
    );
  }

  return (
    <TeacherChrome
      active="Notices"
      title="Notices"
      breadcrumb="Home"
      topRight={<Btn variant="primary" size="md" onClick={() => setCreating(true)}>+ New notice</Btn>}
    >
      {body}

      {creating && (
        <NoticeModal classes={classes} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); loadAll(); }} />
      )}
      {editing && (
        <NoticeModal classes={classes} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadAll(); }} />
      )}
      {deleting && (
        <ConfirmDelete notice={deleting} busy={delBusy} error={delErr} onCancel={() => setDeleting(null)} onConfirm={doDelete} />
      )}
    </TeacherChrome>
  );
}
