import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TeacherChrome } from '@/components/teacher/TeacherChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Card, Btn, Pill, Avatar, FInput, FSelect, ModalShell, SubjectIcon } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';
import { useIsMobile } from '@/lib/useIsMobile';

// ── helpers (module-level) ──────────────────────────────────────────────────

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// Same grade bands as the admin report card.
const gradeOf = (pct) => (pct >= 85 ? 'A' : pct >= 70 ? 'B' : pct >= 55 ? 'C' : 'D');

const Skel = ({ w = '100%', h = 12, r = 6, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${hf.borderS}, ${hf.surface2} 50%, ${hf.borderS})`,
    backgroundSize: '200% 100%', animation: 'hf-skel 1.6s ease-in-out infinite', ...style,
  }} />
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

const Overlay = ({ onClose, children }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>{children}</div>
  </div>
);

// The teacher's (class + subject) teaching-assignment pairs, derived from the
// dashboard responsibilities. Only rows with a subject are real teaching
// assignments (class-teacher-only rows have an empty subject and are NOT
// valid exam targets under the assignment-scoped rule). The composite value
// `<class_year_id>::<subject>` fixes both fields when the teacher picks a pair,
// and the subject is taken verbatim so it matches the assignment string exactly.
function buildAssignmentPairs(responsibilities) {
  const out = [];
  const seen = new Set();
  for (const r of responsibilities || []) {
    if (!r.subject) continue;
    const value = `${r.class_year_id}::${r.subject}`;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, class_year_id: r.class_year_id, subject: r.subject, label: `${r.class_label} · ${r.subject}` });
  }
  return out;
}

// ── Create-exam modal (teacher) ─────────────────────────────────────────────
// Scoped to the teacher's own (class + subject) assignments + admin-defined
// terms. Subject is never free-typed — it comes from the chosen assignment.
// teacher_id is NOT sent — the backend forces it to the creating teacher.
const TeacherExamCreateModal = ({ onClose, onSaved }) => {
  const [assignments, setAssignments] = useState([]);
  const [terms, setTerms] = useState([]);
  const [academicYearId, setAcademicYearId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [pair, setPair] = useState(''); // "<class_year_id>::<subject>"
  const [examTermId, setExamTermId] = useState('');
  const [name, setName] = useState('');
  const [maxMarks, setMaxMarks] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dash, years] = await Promise.all([
          apiFetch('/api/teacher/dashboard'),
          apiFetch('/api/academic-years'),
        ]);
        if (cancelled) return;
        setAssignments(buildAssignmentPairs(dash?.responsibilities));
        const cur = Array.isArray(years) ? years.find((y) => y.is_current) : null;
        const ayId = cur ? cur.id : null;
        setAcademicYearId(ayId);
        if (ayId) {
          const t = await apiFetch(`/api/exam-terms?academic_year_id=${ayId}`);
          if (!cancelled) setTerms(Array.isArray(t) ? t : []);
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e.message || 'Failed to load form');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const noAssignments = !loading && !loadErr && assignments.length === 0;
  // Teachers can't create terms — if none exist, block create and tell them to ask admin.
  const noTerms = !loading && !loadErr && !!academicYearId && terms.length === 0;
  const noYear = !loading && !loadErr && !academicYearId;
  const blocked = noAssignments || noTerms || noYear;

  const save = async () => {
    setErr('');
    const selected = assignments.find((a) => a.value === pair);
    if (!selected) { setErr('Select a class & subject.'); return; }
    if (!examTermId) { setErr('Select a term.'); return; }
    if (!name.trim()) { setErr('Exam name is required.'); return; }
    if (!maxMarks || Number(maxMarks) <= 0) { setErr('Max marks must be greater than zero.'); return; }
    setSaving(true);
    try {
      const body = {
        class_year_id: selected.class_year_id,
        subject: selected.subject,
        exam_term_id: Number(examTermId),
        name: name.trim(),
        max_marks: Number(maxMarks),
      };
      if (date) body.exam_date = new Date(date).toISOString();
      await apiFetch('/api/exams', { method: 'POST', body });
      onSaved?.();
    } catch (e) {
      setErr(e.message || 'Failed to create exam');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalShell
        title="Create exam"
        subtitle="For a class & subject you teach, under an exam term"
        width={500}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={save} disabled={saving || loading || blocked}>
            {saving ? 'Saving…' : 'Create exam'}
          </Btn>
        </>}
      >
        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading…</div>
        ) : loadErr ? (
          <ErrorBox>{loadErr}</ErrorBox>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <FieldLabel>Class &amp; subject</FieldLabel>
              {noAssignments ? (
                <div style={{ ...hfText.small, color: hf.muted, background: hf.surface2, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>
                  You have no assigned class+subjects — ask admin to assign you.
                </div>
              ) : (
                <FSelect
                  value={pair}
                  onChange={setPair}
                  options={[{ value: '', label: 'Select a class & subject…' },
                  ...assignments.map((a) => ({ value: a.value, label: a.label }))]}
                />
              )}
            </div>

            <div>
              <FieldLabel>Term</FieldLabel>
              {noYear ? (
                <div style={{ ...hfText.small, color: hf.muted, background: hf.surface2, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>
                  No current academic year is set — ask your admin.
                </div>
              ) : noTerms ? (
                <div style={{ ...hfText.small, color: hf.muted, background: hf.surface2, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>
                  No exam terms yet — ask your admin to create one.
                </div>
              ) : (
                <FSelect
                  value={examTermId}
                  onChange={setExamTermId}
                  options={[{ value: '', label: 'Select a term…' },
                  ...terms.map((t) => ({ value: String(t.id), label: t.name }))]}
                />
              )}
            </div>

            <div>
              <FieldLabel>Exam name</FieldLabel>
              <FInput value={name} onChange={setName} placeholder="e.g. Mid-Term" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
              <div>
                <FieldLabel>Max marks</FieldLabel>
                <FInput type="number" value={maxMarks} onChange={setMaxMarks} placeholder="50" />
              </div>
              <div>
                <FieldLabel>Date</FieldLabel>
                <FInput type="date" value={date} onChange={setDate} />
              </div>
            </div>

            {err && <ErrorBox>{err}</ErrorBox>}
          </div>
        )}
      </ModalShell>
    </Overlay>
  );
};

// ── Screen 1 · Exams list (/teacher/marks) ──────────────────────────────────

export function TeacherMarksList() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [exams, setExams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    apiFetch('/api/exams')
      .then((data) => setExams(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message || 'Failed to load exams'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const q = search.trim().toLowerCase();
  const visible = !exams ? [] : (q
    ? exams.filter((e) => `${e.name || ''} ${e.subject || ''} ${e.class_label || ''}`.toLowerCase().includes(q))
    : exams);

  let body;
  if (loading) {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        {[0, 1, 2].map(i => <Card key={i} padding={16}><Skel w={120} h={15} /><Skel h={12} style={{ marginTop: 12 }} /></Card>)}
      </div>
    );
  } else if (error) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
        <div style={{ ...hfText.h2 }}>Couldn't load your exams</div>
        <div style={{ ...hfText.small, color: hf.muted }}>{error}</div>
        <Btn variant="primary" size="md" onClick={load}>Retry</Btn>
      </div>
    );
  } else if (exams.length === 0) {
    body = <Card padding={40} style={{ borderStyle: 'dashed', textAlign: 'center', ...hfText.small, color: hf.muted }}>No exams assigned to you yet.</Card>;
  } else {
    body = (
      <>
        <Card padding={14} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, class, or exam…"
            style={{ flex: 1, padding: '8px 12px', background: hf.surface, border: `1px solid ${hf.border}`, borderRadius: 9, fontSize: 13, color: hf.ink, fontFamily: hfFonts.ui, outline: 'none' }}
          />
          <span style={{ ...hfText.small, color: hf.muted }}>{visible.length} exam{visible.length === 1 ? '' : 's'}</span>
        </Card>

        {visible.length === 0 ? (
          <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.muted }}>No exams match "{search}".</Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
            {visible.map((ex) => (
              <Card key={ex.id} padding={0} hoverable style={{ cursor: 'pointer' }}>
                <div onClick={() => navigate(`/teacher/marks/${ex.id}`)}>
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: `1px solid ${hf.borderS}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SubjectIcon subject={ex.subject} size={28} />
                      <div>
                        <div style={{ ...hfText.h2, fontSize: 15, lineHeight: 1.2 }}>{ex.name}</div>
                        <div style={{ ...hfText.small, color: hf.muted, marginTop: 1 }}>{ex.subject} · {ex.class_label || '—'}</div>
                      </div>
                    </div>
                    {!ex.is_active && <Pill tone="neutral">Inactive</Pill>}
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div>
                      <div style={{ ...hfText.micro, fontSize: 10 }}>Max marks</div>
                      <div style={{ ...hfText.num, fontSize: 16, fontWeight: 700, marginTop: 2 }}>{ex.max_marks}</div>
                    </div>
                    <div>
                      <div style={{ ...hfText.micro, fontSize: 10 }}>Date</div>
                      <div style={{ ...hfText.num, fontSize: 13, fontWeight: 600, marginTop: 2 }}>{ex.exam_date ? fmtDate(ex.exam_date) : '—'}</div>
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2, ...hfText.small, color: hf.primary, fontWeight: 600 }}>
                    Enter marks →
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <TeacherChrome
        active="Marks Entry"
        title="Marks Entry"
        breadcrumb="Home"
        topRight={<Btn variant="primary" size="sm" onClick={() => setShowCreate(true)}>+ Create exam</Btn>}
      >
        {body}
      </TeacherChrome>
      {showCreate && (
        <TeacherExamCreateModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}
    </>
  );
}

// ── Screen 2 · Marks grid (/teacher/marks/:examId) ──────────────────────────

// One grid row (module-level to avoid focus loss on re-render).
const MarksRow = ({ row, value, max, invalid, onChange, last }) => {
  const n = value === '' || value == null ? null : Number(value);
  const pct = n != null && !Number.isNaN(n) && max > 0 ? (n / max) * 100 : null;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '36px 1.5fr 110px 150px 70px 60px',
      padding: '9px 20px', alignItems: 'center',
      borderBottom: last ? 'none' : `1px solid ${hf.borderS}`,
    }}>
      <Avatar name={row.student_name} size={28} />
      <div style={{ ...hfText.small, fontWeight: 600 }}>{row.student_name}</div>
      <div style={{ ...hfText.num, fontSize: 11.5, color: hf.muted }}>{row.admission_no || '—'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 84 }}>
          <FInput type="number" value={value} onChange={onChange} placeholder="—" />
        </div>
        <span style={{ ...hfText.small, color: hf.muted }}>/ {max}</span>
        {invalid && <span style={{ ...hfText.small, color: hf.accent, fontWeight: 700 }}>out of range</span>}
      </div>
      <div style={{ ...hfText.num, ...hfText.small, color: pct != null ? hf.ink2 : hf.faint }}>
        {pct != null && !invalid ? `${pct.toFixed(0)}%` : '—'}
      </div>
      <div style={{ ...hfText.small, fontWeight: 700, color: pct != null && !invalid ? hf.ink : hf.faint }}>
        {pct != null && !invalid ? gradeOf(pct) : '—'}
      </div>
    </div>
  );
};

export function TeacherMarksGrid() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [exam, setExam] = useState(null);
  const [rows, setRows] = useState([]);
  const [marks, setMarks] = useState({}); // enrollment_id -> marks string
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    apiFetch(`/api/exams/${examId}/results`)
      .then((data) => {
        setExam(data.exam || null);
        const r = data.rows || [];
        setRows(r);
        const m = {};
        r.forEach((row) => { m[row.enrollment_id] = row.marks != null ? String(row.marks) : ''; });
        setMarks(m);
      })
      .catch((e) => setError(e.message || 'Failed to load results'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [examId]);

  const max = exam?.max_marks || 0;
  const setMark = (eid) => (v) => { setMarks((p) => ({ ...p, [eid]: v })); setSavedMsg(''); };

  // Marks stay strings; Number() only for the range check + UI %/grade.
  const isInvalid = (v) => {
    if (v == null || v === '') return false;
    const num = Number(v);
    return Number.isNaN(num) || num < 0 || num > max;
  };
  const anyInvalid = rows.some((r) => isInvalid(marks[r.enrollment_id]));
  const enteredCount = rows.filter((r) => (marks[r.enrollment_id] ?? '') !== '' && !isInvalid(marks[r.enrollment_id])).length;
  const pctEntered = rows.length > 0 ? Math.round((enteredCount / rows.length) * 100) : 0;

  const save = async () => {
    if (anyInvalid) return;
    // Blank = un-entered → OMIT from payload (never send 0; there's no absent).
    const payload = rows
      .filter((r) => String(marks[r.enrollment_id] ?? '').trim() !== '')
      .map((r) => ({ enrollment_id: r.enrollment_id, marks: String(marks[r.enrollment_id]).trim() }));
    if (payload.length === 0) { setError('Enter at least one mark before saving.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/exams/${examId}/results`, { method: 'POST', body: { results: payload } });
      setSavedMsg(`Saved · ${payload.length} entered`);
      load();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // 404 / not-owned → graceful message (backend returns 404 for others' exams).
  if (!loading && !exam) {
    return (
      <TeacherChrome active="Marks Entry" title="Marks Entry" breadcrumb="Home"
        topRight={<Btn variant="outline" size="sm" onClick={() => navigate('/teacher/marks')}>← Back to exams</Btn>}>
        <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.muted }}>
          {error || 'Exam not found or not assigned to you.'}
        </Card>
      </TeacherChrome>
    );
  }

  return (
    <TeacherChrome
      active="Marks Entry"
      title={loading ? 'Marks Entry' : `${exam?.class_label || ''} · ${exam?.subject || ''} · ${exam?.name || ''}`}
      breadcrumb="Home · Marks Entry"
      topRight={<Btn variant="outline" size="sm" onClick={() => navigate('/teacher/marks')}>← Back to exams</Btn>}
    >
      {loading ? (
        <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading…</Card>
      ) : (
        <>
          {/* Context bar */}
          <Card padding={0}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
              {[
                { label: 'Class', value: exam?.class_year_label || exam?.class_label || '—' },
                { label: 'Subject', value: exam?.subject || '—' },
                { label: 'Max', value: String(max) },
                { label: 'Date', value: exam?.exam_date ? fmtDate(exam.exam_date) : '—' },
              ].map((f, i) => (
                <div key={i} style={{ padding: '14px 18px', borderRight: i < 3 ? `1px solid ${hf.borderS}` : 'none' }}>
                  <div style={{ ...hfText.micro, fontSize: 9.5 }}>{f.label}</div>
                  <div style={{ ...hfText.h2, fontSize: 15, marginTop: 4 }}>{f.value}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Marks entry */}
          <Card padding={0}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...hfText.h2 }}>Marks entry</div>
                <div style={{ ...hfText.small, color: hf.muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>{enteredCount} of {rows.length} entered</span>
                  <span style={{ flex: 1, maxWidth: 160, height: 6, borderRadius: 999, background: hf.border, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${pctEntered}%`, height: '100%', background: hf.primary }} />
                  </span>
                </div>
              </div>
              <Btn variant="primary" size="sm" onClick={save} disabled={saving || anyInvalid}>{saving ? 'Saving…' : 'Save marks'}</Btn>
            </div>

            {savedMsg && (
              <div style={{ margin: '12px 20px 0', ...hfText.small, color: hf.good, background: hf.goodSoft, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>{savedMsg}</div>
            )}
            {error && (
              <div style={{ margin: '12px 20px 0', ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{error}</div>
            )}
            {anyInvalid && (
              <div style={{ margin: '12px 20px 0', ...hfText.small, color: hf.accent }}>Some marks are outside 0–{max}. Fix the highlighted rows before saving.</div>
            )}

            {/* Dense entry grid stays a table; scrolls sideways on phones
                (minWidth) so inputs stay aligned and accurate. */}
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <div style={{ minWidth: 560 }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '36px 1.5fr 110px 150px 70px 60px',
                  padding: '11px 20px', background: hf.surface2, borderBottom: `1px solid ${hf.borderS}`,
                  ...hfText.micro, fontSize: 10,
                }}>
                  <div /><div>Student</div><div>Adm. no</div><div>Marks</div><div>%</div><div>Grade</div>
                </div>
                {rows.length === 0 && (
                  <div style={{ padding: '30px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No active students in this class.</div>
                )}
                {rows.map((r, i) => (
                  <MarksRow
                    key={r.enrollment_id}
                    row={r}
                    value={marks[r.enrollment_id] ?? ''}
                    max={max}
                    invalid={isInvalid(marks[r.enrollment_id])}
                    onChange={setMark(r.enrollment_id)}
                    last={i === rows.length - 1}
                  />
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2, ...hfText.small, color: hf.muted }}>
              Leave a student blank if not yet marked · saved marks are visible to students.
            </div>
          </Card>
        </>
      )}
    </TeacherChrome>
  );
}
