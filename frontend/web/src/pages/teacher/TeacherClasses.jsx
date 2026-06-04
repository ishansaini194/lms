import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { TeacherChrome } from '@/components/teacher/TeacherChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Card, Pill, Btn, Avatar, ModalShell, FInput, FTextarea, FSelect } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';

// ── helpers (module-level) ──────────────────────────────────────────────────

// Collapse the dashboard's per-responsibility rows into ONE entry per distinct
// class_year (the roster is "who's in the room" — subject doesn't change that).
// Aggregates the subjects she teaches there and whether she's the class teacher.
function buildClasses(responsibilities) {
  const map = new Map();
  for (const r of responsibilities || []) {
    let e = map.get(r.class_year_id);
    if (!e) {
      e = { class_year_id: r.class_year_id, class_label: r.class_label, is_class_teacher: false, subjects: [], student_count: r.student_count };
      map.set(r.class_year_id, e);
    }
    if (r.is_class_teacher) e.is_class_teacher = true;
    if (r.subject) e.subjects.push(r.subject);
    e.student_count = r.student_count; // identical across a class_year's rows
  }
  return Array.from(map.values());
}

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

// ── presentational pieces ───────────────────────────────────────────────────

const ClassChip = ({ label, strong = false }) => (
  <span style={{
    padding: '2px 9px', borderRadius: 6,
    background: strong ? hf.primarySoft : hf.surface2,
    color: strong ? hf.primary : hf.inkSoft,
    border: `1px solid ${strong ? hf.primaryEdge : hf.borderS}`,
    fontFamily: hfFonts.ui, fontSize: 11, fontWeight: 650, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
  }}>{label}</span>
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

const FieldLabel = ({ children }) => (
  <div style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, marginBottom: 6 }}>{children}</div>
);

const ErrorBox = ({ children }) => (
  <div style={{
    ...hfText.small, color: hf.accent, background: hf.accentSoft,
    border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px',
  }}>{children}</div>
);

// Notice composer pre-targeted to ONE class (the card's class). Teachers post
// class-targeted notices only (never whole-school), mirroring TeacherNotices.
const NoticeComposer = ({ classLabel, classYearId, onClose, onPosted }) => {
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    if (!title.trim()) { setErr('Title is required.'); return; }
    if (!bodyText.trim()) { setErr('Body is required.'); return; }
    setSaving(true);
    try {
      await apiFetch('/api/notices', {
        method: 'POST',
        body: { title: title.trim(), body: bodyText.trim(), target_all_school: false, class_year_ids: [classYearId] },
      });
      onPosted?.();
    } catch (e) {
      setErr(e.message || 'Failed to post notice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalShell
        title="New notice"
        subtitle={`Posted to ${classLabel} · visible to that class`}
        width={520}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={save} disabled={saving}>{saving ? 'Posting…' : 'Post notice'}</Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel>Title</FieldLabel>
            <FInput value={title} onChange={setTitle} placeholder="e.g. Bring your science textbook tomorrow" />
          </div>
          <div>
            <FieldLabel>Body</FieldLabel>
            <FTextarea value={bodyText} onChange={setBodyText} rows={5} placeholder="Write the notice your class will see…" />
          </div>
          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </ModalShell>
    </Overlay>
  );
};

const cyLabel = (cy) => {
  const cls = cy.class ? `${cy.class.name}${cy.class.section ? '-' + cy.class.section : ''}` : `Class ${cy.class_id}`;
  const yr = cy.academic_year ? cy.academic_year.year_label : '';
  return `${cls}${yr ? ' · ' + yr : ''}`;
};

// Class-teacher promote: the source is THIS Lead class (fixed); the teacher
// picks any valid destination class-year. Mirrors the admin promote flow
// (select → confirm → done). Backend gates the source to the class-teacher.
const PromoteModal = ({ sourceId, sourceLabel, onClose, onPromoted }) => {
  const [classYears, setClassYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [toId, setToId] = useState('');
  const [step, setStep] = useState('select'); // 'select' | 'confirm' | 'done'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // scope=all → every active class-year in the school (destinations the teacher
    // doesn't lead are still valid targets).
    apiFetch('/api/class-years?scope=all')
      .then((data) => { if (!cancelled) setClassYears(Array.isArray(data) ? data : []); })
      .catch((e) => { if (!cancelled) setLoadErr(e.message || 'Failed to load class-years'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Destinations = all active class-years except the source.
  const options = classYears
    .filter((cy) => cy.id !== sourceId)
    .map((cy) => ({ value: String(cy.id), label: cyLabel(cy) }));
  const destLabel = options.find((o) => o.value === toId)?.label || '—';

  const goConfirm = () => {
    setErr('');
    if (!toId) { setErr('Pick a destination class-year.'); return; }
    setStep('confirm');
  };

  const doPromote = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await apiFetch('/api/enrollments/promote', {
        method: 'POST',
        body: { from_class_year_id: sourceId, to_class_year_id: Number(toId) },
      });
      setResult(res);
      setStep('done');
      onPromoted?.(); // refresh the roster behind the modal
    } catch (e) {
      setErr(e.message || 'Promotion failed');
    } finally {
      setBusy(false);
    }
  };

  let inner;
  if (step === 'done') {
    const promoted = result?.promoted_count ?? 0;
    const skipped = result?.skipped_count ?? 0;
    inner = (
      <ModalShell
        title="Promotion complete"
        width={460}
        footer={<Btn variant="primary" size="md" onClick={onClose}>Done</Btn>}
      >
        <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.7 }}>
          Promoted <b>{promoted}</b> student{promoted === 1 ? '' : 's'} from <b>{sourceLabel}</b> to <b>{destLabel}</b>.
          {skipped > 0 && <> {' '}<b>{skipped}</b> student{skipped === 1 ? ' was' : 's were'} already enrolled in the target and skipped.</>}
        </div>
      </ModalShell>
    );
  } else if (step === 'confirm') {
    inner = (
      <ModalShell
        title="Promote all active students?"
        width={460}
        footer={<>
          <Btn variant="ghost" size="md" onClick={() => { setErr(''); setStep('select'); }} disabled={busy}>Back</Btn>
          <Btn variant="primary" size="md" onClick={doPromote} disabled={busy}>{busy ? 'Promoting…' : 'Yes, promote'}</Btn>
        </>}
      >
        <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.6 }}>
          Promote all active students from <b>{sourceLabel}</b> to <b>{destLabel}</b>? This moves their
          enrollments — each is marked <b>promoted</b> in the source and re-created as active in the target.
          Students already in the target are skipped.
        </div>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
      </ModalShell>
    );
  } else {
    inner = (
      <ModalShell
        title="Promote class"
        subtitle={`Move all active students out of ${sourceLabel}`}
        width={460}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={goConfirm} disabled={loading || !!loadErr}>Continue</Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel>From</FieldLabel>
            <FInput value={sourceLabel} disabled />
          </div>
          <div>
            <FieldLabel>Promote to</FieldLabel>
            {loading ? (
              <div style={{ ...hfText.small, color: hf.muted, padding: '6px 2px' }}>Loading class-years…</div>
            ) : (
              <FSelect
                value={toId}
                onChange={setToId}
                options={[{ value: '', label: 'Select destination class-year…' }, ...options]}
              />
            )}
          </div>
          {loadErr && <ErrorBox>{loadErr}</ErrorBox>}
          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </ModalShell>
    );
  }

  return <Overlay onClose={onClose}>{inner}</Overlay>;
};

const ClassCard = ({ cls, selected, onRoster, onAddHw, onAddNotice, onPromote }) => (
  <Card padding={16} style={{
    display: 'flex', flexDirection: 'column', gap: 12,
    border: `1px solid ${selected ? hf.primaryEdge : hf.border}`,
    background: selected ? hf.primarySoft : hf.surface,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <ClassChip label={cls.class_label} strong={cls.is_class_teacher} />
      {cls.is_class_teacher
        ? <Pill tone="primary">Lead</Pill>
        : <Pill tone="neutral">Subject teacher</Pill>}
    </div>

    <div style={{ ...hfText.small, color: hf.inkSoft }}>
      {cls.subjects.length > 0
        ? <>Subjects: <span style={{ color: hf.ink, fontWeight: 600 }}>{cls.subjects.join(', ')}</span></>
        : <span style={{ color: hf.muted }}>Class teacher (no subjects assigned)</span>}
    </div>

    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ ...hfText.num, fontSize: 22, fontWeight: 700, color: hf.ink, lineHeight: 1 }}>{cls.student_count}</span>
      <span style={{ ...hfText.small, color: hf.muted }}>students</span>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
      <Btn variant="primary" size="sm" onClick={() => onRoster(cls.class_year_id)}>Select</Btn>
      <Btn variant="outline" size="sm" onClick={() => onAddHw(cls.class_year_id)}>+ Homework</Btn>
      {/* Class notices + promote come from the class teacher (Lead) only. */}
      {cls.is_class_teacher && (
        <Btn variant="outline" size="sm" onClick={() => onAddNotice(cls.class_year_id, cls.class_label)}>+ Notice</Btn>
      )}
      {cls.is_class_teacher && (
        <Btn variant="outline" size="sm" onClick={() => onPromote(cls.class_year_id, cls.class_label)}>Promote</Btn>
      )}
    </div>
  </Card>
);

const ClassSelector = ({ classes, selected, onSelect }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {classes.map((c) => {
      const active = c.class_year_id === selected;
      return (
        <button key={c.class_year_id} onClick={() => onSelect(c.class_year_id)} className="hf-btn" style={{
          padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
          background: active ? hf.primarySoft : hf.surface,
          color: active ? hf.primary : hf.inkSoft,
          border: `1px solid ${active ? hf.primaryEdge : hf.border}`,
          fontFamily: hfFonts.ui, fontSize: 12.5, fontWeight: 600,
        }}>{c.class_label}</button>
      );
    })}
  </div>
);

const COLS = [
  { key: 'avatar', label: '', w: 40 },
  { key: 'name', label: 'Name' },
  { key: 'admission_no', label: 'Admission no' },
  { key: 'father_name', label: 'Father name' },
  { key: 'father_contact', label: 'Father phone' },
  { key: 'epunjab_id', label: 'ePunjab' },
];

const RosterTable = ({ rows, loading }) => {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 2px' }}>
        {[0, 1, 2, 3].map(i => <Skel key={i} h={16} />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return <div style={{ ...hfText.small, color: hf.muted, padding: '10px 2px' }}>No active students in this class yet.</div>;
  }
  // No internal vertical scroll: the list flows and the page's single scroll
  // container (TeacherChrome's <main>) reveals every row, matching the other
  // teacher pages (Homework/Marks). overflowX stays for wide tables on narrow
  // screens — that's horizontal only, not a competing vertical scroll.
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: hfFonts.ui }}>
        <thead>
          <tr>
            {COLS.map(c => (
              <th key={c.key} style={{
                textAlign: 'left', padding: '8px 10px', width: c.w,
                ...hfText.micro, color: hf.muted, borderBottom: `1px solid ${hf.border}`,
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const s = e.student || {};
            return (
              <tr key={e.id} style={{ borderBottom: `1px solid ${hf.borderS}` }}>
                <td style={{ padding: '8px 10px' }}><Avatar name={s.name || '?'} size={28} /></td>
                <td style={{ padding: '8px 10px', ...hfText.body, fontWeight: 600, color: hf.ink }}>{dash(s.name)}</td>
                <td style={{ padding: '8px 10px', ...hfText.small, ...hfText.num, color: hf.inkSoft }}>{dash(s.admission_no)}</td>
                <td style={{ padding: '8px 10px', ...hfText.small, color: hf.inkSoft }}>{dash(s.father_name)}</td>
                <td style={{ padding: '8px 10px', ...hfText.small, ...hfText.num, color: hf.inkSoft }}>{dash(s.father_contact)}</td>
                <td style={{ padding: '8px 10px', ...hfText.small, ...hfText.num, color: hf.inkSoft }}>{dash(s.epunjab_id)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const PageLoading = () => (
  <>
    <Skel w={260} h={14} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {[0, 1, 2].map(i => <Card key={i} padding={16}><Skel w={60} h={18} /><Skel h={12} style={{ marginTop: 14 }} /><Skel w="50%" h={12} style={{ marginTop: 10 }} /></Card>)}
    </div>
    <Card padding={16}><Skel w={160} h={14} /><Skel h={16} style={{ marginTop: 16 }} /><Skel h={16} style={{ marginTop: 10 }} /></Card>
  </>
);

const PageError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load your classes</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function TeacherClasses() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectId = Number(searchParams.get('class_year_id')) || null;

  const [responsibilities, setResponsibilities] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState(null);
  const [roster, setRoster] = useState([]);
  const [rosterMeta, setRosterMeta] = useState({ total: 0, totalPages: 1 });
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [noticeTarget, setNoticeTarget] = useState(null); // { id, label } | null
  const [promoteTarget, setPromoteTarget] = useState(null); // { id, label } | null
  const [rosterRefresh, setRosterRefresh] = useState(0);
  const [toast, setToast] = useState('');
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/teacher/dashboard');
      setResponsibilities(res?.responsibilities || []);
    } catch (e) {
      setError(e.message || 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const classes = useMemo(() => buildClasses(responsibilities), [responsibilities]);

  // Pick the default class once classes are known: URL param → class-teacher → first.
  useEffect(() => {
    if (!classes.length || selected) return;
    const ids = new Set(classes.map(c => c.class_year_id));
    let def = preselectId && ids.has(preselectId) ? preselectId : null;
    if (!def) def = (classes.find(c => c.is_class_teacher) || classes[0]).class_year_id;
    setSelected(def);
  }, [classes, selected, preselectId]);

  // Load roster whenever the selected class or page changes.
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setRosterLoading(true);
    setRosterError('');
    apiFetch(`/api/enrollments?class_year_id=${selected}&status=active&limit=100&page=${page}`)
      .then((res) => {
        if (!alive) return;
        setRoster(res?.data || []);
        setRosterMeta({ total: res?.total || 0, totalPages: res?.total_pages || 1 });
      })
      .catch((e) => { if (alive) setRosterError(e.message || 'Failed to load roster'); })
      .finally(() => { if (alive) setRosterLoading(false); });
    return () => { alive = false; };
  }, [selected, page, rosterRefresh]);

  const onSelectClass = (id) => { setSelected(id); setPage(1); setSearch(''); };

  const selectedClass = classes.find(c => c.class_year_id === selected);
  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(e => (e.student?.name || '').toLowerCase().includes(q));
  }, [roster, search]);

  let body;
  if (loading) {
    body = <PageLoading />;
  } else if (error) {
    body = <PageError message={error} onRetry={loadClasses} />;
  } else {
    const ctCount = classes.filter(c => c.is_class_teacher).length;
    const stCount = classes.filter(c => c.subjects.length > 0).length;

    body = (
      <>
        {/* Header line */}
        <div style={{ ...hfText.body, color: hf.inkSoft }}>
          <b style={{ color: hf.ink }}>{classes.length}</b> {classes.length === 1 ? 'class' : 'classes'}
          {' · '}<b style={{ color: hf.ink }}>{ctCount}</b> as class teacher
          {' · '}<b style={{ color: hf.ink }}>{stCount}</b> as subject teacher
        </div>

        {/* Class cards */}
        {classes.length === 0 ? (
          <Card padding={20}>
            <div style={{ ...hfText.small, color: hf.muted }}>
              No classes assigned yet. Ask your admin to assign you as a class teacher or to a subject.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {classes.map(c => (
              <ClassCard
                key={c.class_year_id}
                cls={c}
                selected={c.class_year_id === selected}
                onRoster={onSelectClass}
                onAddHw={(id) => navigate(`/teacher/homework?class_year_id=${id}`)}
                onAddNotice={(id, label) => setNoticeTarget({ id, label })}
                onPromote={(id, label) => setPromoteTarget({ id, label })}
              />
            ))}
          </div>
        )}

        {/* Roster */}
        {selectedClass && (
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ ...hfText.h2 }}>Students · {selectedClass.class_label}</div>
                <div style={{ ...hfText.small, color: hf.muted, marginTop: 1 }}>{rosterMeta.total} active students</div>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name…"
                style={{
                  width: 220, padding: '8px 12px', background: hf.surface,
                  border: `1px solid ${hf.border}`, borderRadius: 9,
                  fontSize: 13, color: hf.ink, fontFamily: hfFonts.ui, outline: 'none',
                }}
              />
            </div>

            <div style={{ padding: '8px 16px 14px' }}>
              <div style={{ marginBottom: 12 }}>
                <ClassSelector classes={classes} selected={selected} onSelect={onSelectClass} />
              </div>

              {rosterError
                ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px' }}>
                    <span style={{ ...hfText.small, color: hf.accent }}>{rosterError}</span>
                    <Btn variant="ghost" size="sm" onClick={() => setPage(p => p)}>Retry</Btn>
                  </div>
                )
                : <RosterTable rows={filteredRoster} loading={rosterLoading} />}

              {/* Pagination — wired; limit 100 fits most classes on one page. */}
              {rosterMeta.totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Btn>
                  <span style={{ ...hfText.small, color: hf.muted }}>Page {page} of {rosterMeta.totalPages}</span>
                  <Btn variant="ghost" size="sm" disabled={page >= rosterMeta.totalPages} onClick={() => setPage(p => Math.min(rosterMeta.totalPages, p + 1))}>Next</Btn>
                </div>
              )}
            </div>
          </Card>
        )}
      </>
    );
  }

  return (
    <TeacherChrome active="My Classes" title="My Classes" breadcrumb="Home">
      {body}

      {noticeTarget && (
        <NoticeComposer
          classLabel={noticeTarget.label}
          classYearId={noticeTarget.id}
          onClose={() => setNoticeTarget(null)}
          onPosted={() => { const l = noticeTarget.label; setNoticeTarget(null); showToast(`Notice posted to ${l}`); }}
        />
      )}

      {promoteTarget && (
        <PromoteModal
          sourceId={promoteTarget.id}
          sourceLabel={promoteTarget.label}
          onClose={() => setPromoteTarget(null)}
          onPromoted={() => setRosterRefresh((n) => n + 1)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1100,
          background: hf.ink, color: '#fff', padding: '10px 18px', borderRadius: 10,
          ...hfText.small, fontWeight: 600, boxShadow: hf.shadowLg,
        }}>{toast}</div>
      )}
    </TeacherChrome>
  );
}
