// PORTED FROM hi-fi mock — faithful reproduction, static presentational screens.
// Only transformation: import shared symbols instead of reading window globals,
// and `export` the screen components instead of Object.assign(window, ...).
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import {
  Card, Btn, Pill, Chip, Avatar, SubjectIcon, SectionHead, Stat, Sparkbar,
  ModalShell, StateFrame, SearchInput, FInput, FSelect,
} from '@/components/ui/primitives';
import {
  Field, SetInput, SetTextArea, SetSelect, SetToggleRow, LogoSlot, PanelHead,
} from '@/components/ui/settings-fields';
import {
  AdminChrome, AdminTopBar, Tabs, Segmented, ClassChip, Dropdown,
  FieldLabel, TextInput, TextArea,
} from '@/components/admin/AdminChrome';
import { HA7Modal, AcademicYearFormModal, ConfirmModal, PromoteStudentsModal, ManageExamTermsModal } from '@/pages/admin/extras.jsx';
import { useAuth } from '@/auth/AuthContext';
import {
  reportTerms,
} from '@/mock/data';

// Admin hi-fi · A7 Exams · A7 Detail · A7 Report Card · A9 Settings

// ─── A7 · Exams (grouped) ─────────────────────────────────────────────────
const HA7 = () => {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [academicYear, setAcademicYear] = useState(null); // { id, year_label } | null
  const [terms, setTerms] = useState([]);
  const [termFilter, setTermFilter] = useState(''); // '' = all terms

  const loadExams = (termId = '') => {
    setLoading(true);
    apiFetch(`/api/exams${termId ? `?exam_term_id=${termId}` : ''}`)
      .then((data) => setExams(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadExams(termFilter); }, [termFilter]);

  // Term filter + the modal's term picker both need the current year's terms.
  const loadTerms = (ayId) => {
    if (!ayId) { setTerms([]); return; }
    apiFetch(`/api/exam-terms?academic_year_id=${ayId}`)
      .then((data) => setTerms(Array.isArray(data) ? data : []))
      .catch(() => setTerms([]));
  };
  useEffect(() => {
    apiFetch('/api/academic-years')
      .then((years) => {
        const cur = Array.isArray(years) ? years.find((y) => y.is_current) : null;
        setAcademicYear(cur ? { id: cur.id, year_label: cur.year_label } : null);
        loadTerms(cur ? cur.id : null);
      })
      .catch(() => { setAcademicYear(null); setTerms([]); });
  }, []);

  const q = search.trim().toLowerCase();
  const visibleExams = q
    ? exams.filter((e) => `${e.name || ''} ${e.subject || ''} ${e.class_label || ''}`.toLowerCase().includes(q))
    : exams;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelBusy(true);
    setDelErr('');
    try {
      await apiFetch(`/api/exams/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      loadExams(termFilter);
    } catch (e) {
      setDelErr(e.message);
    } finally {
      setDelBusy(false);
    }
  };

  return (
    <>
    <AdminChrome
      active="Exams"
      breadcrumb="Home · Exams"
      title="Exams & Results"
      topRight={<>
        <Btn variant="outline" size="sm" icon={I.receipt}>Report cards</Btn>
        <Btn variant="outline" size="sm" onClick={() => setShowTerms(true)}>Manage terms</Btn>
        <Btn variant="primary" size="sm" onClick={() => setShowCreate(true)}>+ Create exam</Btn>
      </>}
    >
      <Card padding={14} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search subject, class, or exam…" width={'100%'} />
        </div>
        <div style={{ width: 190 }}>
          <FSelect
            value={termFilter}
            onChange={setTermFilter}
            options={[{ value: '', label: 'All terms' }, ...terms.map((t) => ({ value: String(t.id), label: t.name }))]}
          />
        </div>
        <span style={{ ...hfText.small, color: hf.muted }}>{loading ? 'Loading…' : `${visibleExams.length} exam${visibleExams.length === 1 ? '' : 's'}`}</span>
      </Card>

      {loading && (
        <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading exams…</Card>
      )}
      {error && !loading && (
        <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load exams: {error}</Card>
      )}
      {!loading && !error && exams.length === 0 && (
        <Card padding={40} style={{ borderStyle: 'dashed', textAlign: 'center', ...hfText.small, color: hf.muted }}>
          No exams yet · <span onClick={() => setShowCreate(true)} style={{ color: hf.primary, fontWeight: 600, cursor: 'pointer' }}>create one →</span>
        </Card>
      )}
      {!loading && !error && exams.length > 0 && visibleExams.length === 0 && (
        <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.muted }}>No exams match "{search}".</Card>
      )}

      {!loading && !error && visibleExams.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {visibleExams.map((ex) => (
            <Card key={ex.id} padding={0}>
              <div style={{
                padding: '14px 16px',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                borderBottom: `1px solid ${hf.borderS}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SubjectIcon subject={ex.subject} size={28} />
                  <div>
                    <div style={{ ...hfText.h2, fontSize: 15, lineHeight: 1.2 }}>{ex.name}</div>
                    <div style={{ ...hfText.small, color: hf.muted, marginTop: 1 }}>{ex.subject} · {ex.class_label || '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {ex.exam_term_name
                    ? <Pill tone="primary">{ex.exam_term_name}</Pill>
                    : <Pill tone="neutral">No term</Pill>}
                  {!ex.is_active && <Pill tone="neutral">Inactive</Pill>}
                </div>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 18 }}>
                <div>
                  <div style={{ fontSize: 10, color: hf.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Max marks</div>
                  <div style={{ ...hfText.num, fontSize: 16, fontWeight: 700, marginTop: 2 }}>{ex.max_marks}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: hf.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</div>
                  <div style={{ ...hfText.num, fontSize: 13, fontWeight: 600, marginTop: 2 }}>{ex.exam_date ? fmtDate(ex.exam_date) : '—'}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: hf.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Teacher</div>
                  <div style={{ ...hfText.small, fontWeight: 600, marginTop: 3, color: ex.teacher_name ? hf.ink : hf.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.teacher_name || 'Unassigned'}</div>
                </div>
              </div>
              <div style={{ padding: '10px 16px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Btn variant="ghost" size="sm" style={{ padding: '4px 8px', height: 26, fontSize: 11.5 }} onClick={() => navigate(`/admin/exams/${ex.id}`)}>View results</Btn>
                <div style={{ flex: 1 }} />
                <button onClick={() => setEditing(ex)} className="hf-btn" title="Edit" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✎</button>
                {ex.is_active && (
                  <button onClick={() => { setDelErr(''); setDeleting(ex); }} className="hf-btn" title="Delete" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AdminChrome>
    {showCreate && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
        <HA7Modal
          academicYearId={academicYear?.id}
          onManageTerms={() => { setShowCreate(false); setShowTerms(true); }}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadExams(termFilter); }}
        />
      </div>
    )}
    {editing && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
        <HA7Modal
          initial={editing}
          academicYearId={academicYear?.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadExams(termFilter); }}
        />
      </div>
    )}
    {showTerms && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
        <ManageExamTermsModal
          academicYearId={academicYear?.id}
          yearLabel={academicYear?.year_label}
          onClose={() => { setShowTerms(false); loadTerms(academicYear?.id); loadExams(termFilter); }}
        />
      </div>
    )}
    {deleting && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
        <ConfirmModal
          title="Delete exam?"
          message={`This deactivates "${deleting.name}" (${deleting.subject}). Recorded results are kept.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          busy={delBusy}
          error={delErr}
        />
      </div>
    )}
    </>
  );
};

// ─── A7 · Exam detail (admin read-only) ───────────────────────────────────
// One row of the marks-entry grid (module-level to avoid focus loss).
const MarksEntryRow = ({ row, value, max, invalid, onChange, last }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '36px 1.6fr 120px 170px',
    padding: '9px 20px', alignItems: 'center',
    borderBottom: last ? 'none' : `1px solid ${hf.borderS}`,
  }}>
    <Avatar name={row.student_name} size={28} />
    <div style={{ ...hfText.small, fontWeight: 600 }}>{row.student_name}</div>
    <div style={{ ...hfText.num, fontSize: 11.5, color: hf.muted }}>{row.admission_no}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 84 }}>
        <FInput type="number" value={value} onChange={onChange} placeholder="—" />
      </div>
      <span style={{ ...hfText.small, color: hf.muted }}>/ {max}</span>
      {invalid && <span style={{ ...hfText.small, color: hf.accent, fontWeight: 700 }}>out of range</span>}
    </div>
  </div>
);

// ─── A7 · Exam detail — real marks-entry grid ─────────────────────────────
const HA7Detail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [rows, setRows] = useState([]);
  const [marks, setMarks] = useState({}); // enrollment_id -> marks string
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/exams/${id}/results`)
      .then((data) => {
        setExam(data.exam || null);
        const r = data.rows || [];
        setRows(r);
        const m = {};
        r.forEach((row) => { m[row.enrollment_id] = row.marks != null ? String(row.marks) : ''; });
        setMarks(m);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [id]);

  const max = exam?.max_marks || 0;
  const setMark = (eid) => (v) => { setMarks((p) => ({ ...p, [eid]: v })); setSavedMsg(''); };

  // Marks are kept as strings; Number() is only for the range check.
  const isInvalid = (v) => {
    if (v == null || v === '') return false;
    const n = Number(v);
    return Number.isNaN(n) || n < 0 || n > max;
  };
  const anyInvalid = rows.some((r) => isInvalid(marks[r.enrollment_id]));
  const enteredCount = rows.filter((r) => (marks[r.enrollment_id] ?? '') !== '' && !isInvalid(marks[r.enrollment_id])).length;

  // Non-authoritative UI stats.
  const nums = rows.map((r) => marks[r.enrollment_id]).filter((v) => v !== '' && v != null && !Number.isNaN(Number(v))).map(Number);
  const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  const high = nums.length ? Math.max(...nums) : null;

  const save = async () => {
    if (anyInvalid) return;
    // Absent has no schema field, so un-entered students are simply omitted.
    const payload = rows
      .filter((r) => String(marks[r.enrollment_id] ?? '').trim() !== '')
      .map((r) => ({ enrollment_id: r.enrollment_id, marks: String(marks[r.enrollment_id]).trim() }));
    if (payload.length === 0) { setError('Enter at least one mark before saving.'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/exams/${id}/results`, { method: 'POST', body: { results: payload } });
      setSavedMsg(`Results saved · ${payload.length} entered`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminChrome active="Exams" title="Results"><Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading…</Card></AdminChrome>;
  if (error && !exam) return <AdminChrome active="Exams" title="Results"><Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load results: {error}</Card></AdminChrome>;

  return (
    <AdminChrome
      active="Exams"
      breadcrumb={<>Exams <span style={{ color: hf.faint, padding: '0 6px' }}>/</span> <span style={{ color: hf.ink2 }}>{exam?.name}</span></>}
      title={`${exam?.class_label || ''} · ${exam?.subject || ''} · ${exam?.name || ''}`}
      topRight={<Btn variant="outline" size="sm" onClick={() => navigate('/admin/exams')}>← Back to exams</Btn>}
    >
      {/* Context bar */}
      <Card padding={0}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {[
            { label: 'Class', value: exam?.class_year_label || exam?.class_label || '—' },
            { label: 'Subject', value: exam?.subject || '—' },
            { label: 'Teacher', value: exam?.teacher_name || 'Unassigned' },
            { label: 'Max', value: String(max) },
            { label: 'Date', value: exam?.exam_date ? fmtDate(exam.exam_date) : '—' },
          ].map((f, i) => (
            <div key={i} style={{ padding: '14px 18px', borderRight: i < 4 ? `1px solid ${hf.borderS}` : 'none' }}>
              <div style={{ ...hfText.micro, fontSize: 9.5 }}>{f.label}</div>
              <div style={{ ...hfText.h2, fontSize: 15, marginTop: 4 }}>{f.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Marks entry */}
      <Card padding={0}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ ...hfText.h2 }}>Marks entry</div>
            <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>
              {enteredCount} of {rows.length} entered{avg != null ? ` · avg ${avg.toFixed(1)} · high ${high}` : ''}
            </div>
          </div>
          <Btn variant="primary" size="sm" onClick={save} disabled={saving || anyInvalid}>{saving ? 'Saving…' : 'Save results'}</Btn>
        </div>

        {savedMsg && (
          <div style={{ margin: '12px 20px 0', ...hfText.small, color: hf.good, background: hf.goodSoft, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>{savedMsg}</div>
        )}
        {error && exam && (
          <div style={{ margin: '12px 20px 0', ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{error}</div>
        )}
        {anyInvalid && (
          <div style={{ margin: '12px 20px 0', ...hfText.small, color: hf.accent }}>Some marks are outside 0–{max}. Fix the highlighted rows before saving.</div>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: '36px 1.6fr 120px 170px',
          padding: '11px 20px', background: hf.surface2, borderBottom: `1px solid ${hf.borderS}`,
          ...hfText.micro, fontSize: 10, marginTop: 12,
        }}>
          <div /><div>Student</div><div>Adm. no</div><div>Marks</div>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '30px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No active students in this class.</div>
        )}
        {rows.map((r, i) => (
          <MarksEntryRow
            key={r.enrollment_id}
            row={r}
            value={marks[r.enrollment_id] ?? ''}
            max={max}
            invalid={isInvalid(marks[r.enrollment_id])}
            onChange={setMark(r.enrollment_id)}
            last={i === rows.length - 1}
          />
        ))}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2, ...hfText.small, color: hf.muted }}>
          Leave a student blank if not yet marked · marks save as you click "Save results".
        </div>
      </Card>
    </AdminChrome>
  );
};

// ─── A7 · Report Card ─────────────────────────────────────────────────────
const HA7ReportCard = () => {

  const gradeOf = (pct) => pct >= 85 ? 'A' : pct >= 70 ? 'B' : pct >= 55 ? 'C' : 'D';

  return (
    <AdminChrome
      active="Exams"
      breadcrumb="Home · Exams · Report card"
      title="Report card"
      topRight={<>
        <Btn variant="outline" size="sm" icon={I.share}>Share with parent</Btn>
        <Btn variant="primary" size="sm" icon={I.download}>Generate PDF</Btn>
      </>}
    >
      {/* Picker bar */}
      <Card padding={14} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Dropdown label="Student" value="Arjun Verma · 5-A · Roll 12" width={320} />
        <Dropdown label="Year"    value="2025–26"                       width={150} />
        <div style={{ flex: 1 }}/>
        <span style={{ ...hfText.small, color: hf.muted }}>Aggregates from <span style={{ color: hf.ink2, fontWeight: 600 }}>Result × Exam</span></span>
      </Card>

      {/* Report card document */}
      <Card padding={0} style={{ borderRadius: 16, overflow: 'hidden' }}>
        {/* Letterhead */}
        <div style={{
          padding: '24px 32px',
          background: `linear-gradient(180deg, ${hf.surface2}, ${hf.surface})`,
          borderBottom: `1px solid ${hf.borderS}`,
          textAlign: 'center',
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: `linear-gradient(135deg, ${hf.primary}, oklch(0.55 0.16 290))`,
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: hfFonts.ui, fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em',
            }}>KR</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ ...hfText.h1, fontSize: 22 }}>Kendriya Riverside School</div>
              <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>Phagwara, Punjab · Recognised by Punjab School Education Board</div>
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderRadius: 999, background: hf.primarySoft, border: `1px solid ${hf.primaryEdge}` }}>
            <span style={{ ...hfText.micro, fontSize: 10, color: hf.primary }}>Annual Report Card</span>
            <span style={{ color: hf.primaryEdge }}>•</span>
            <span style={{ ...hfText.num, fontSize: 12, color: hf.primary, fontWeight: 650 }}>AY 2025–26</span>
          </div>
        </div>

        {/* Student strip */}
        <div style={{
          padding: '18px 32px', borderBottom: `1px solid ${hf.borderS}`,
          display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 20, alignItems: 'center',
        }}>
          <Avatar name="Arjun Verma" size={64} style={{ boxShadow: '0 2px 8px rgba(20,24,32,0.08)' }} />
          <div>
            <div style={{ ...hfText.micro, fontSize: 10 }}>Student</div>
            <div style={{ ...hfText.h2 }}>Arjun Verma</div>
            <div style={{ ...hfText.small, color: hf.muted }}>Roll no. 12 · Adm KRB-2021-0088</div>
          </div>
          <div>
            <div style={{ ...hfText.micro, fontSize: 10 }}>Class & section</div>
            <div style={{ ...hfText.h2, fontSize: 16 }}>Class 5-A</div>
            <div style={{ ...hfText.small, color: hf.muted }}>Mrs. Sharma · Class teacher</div>
          </div>
          <div>
            <div style={{ ...hfText.micro, fontSize: 10 }}>Father</div>
            <div style={{ ...hfText.h2, fontSize: 16 }}>Rakesh Verma</div>
            <div style={{ ...hfText.small, color: hf.muted }}>+91 98xx-1144</div>
          </div>
        </div>

        {/* Terms */}
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {reportTerms.map((t, i) => {
            const total = t.rows.reduce((s, r) => s + (r.m || 0), 0);
            const max   = t.rows.reduce((s, r) => s + r.max, 0);
            const pct   = t.pending ? null : Math.round((total / max) * 100);
            return (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                  <div style={{ ...hfText.h2 }}>{t.name}</div>
                  {t.pending
                    ? <Pill tone="warn" dot>Scheduled later</Pill>
                    : <Pill tone="primary">{pct}% · {gradeOf(pct)}</Pill>}
                </div>
                <div style={{
                  border: `1px solid ${hf.border}`, borderRadius: 10, overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '34px 1.4fr 100px 80px 110px 70px',
                    padding: '10px 16px', background: hf.surface2,
                    borderBottom: `1px solid ${hf.borderS}`,
                    ...hfText.micro, fontSize: 10,
                  }}>
                    <div/><div>Subject</div><div>Marks</div><div>Max</div><div>%</div><div>Grade</div>
                  </div>
                  {t.examResults.map((r, j) => {
                    const sp = r.m == null ? null : Math.round((r.m / r.max) * 100);
                    return (
                      <div key={j} style={{
                        display: 'grid', gridTemplateColumns: '34px 1.4fr 100px 80px 110px 70px',
                        padding: '11px 16px', alignItems: 'center',
                        borderBottom: j < t.examResults.length - 1 ? `1px solid ${hf.borderS}` : 'none',
                      }}>
                        <SubjectIcon subject={r.sub} size={24} />
                        <div style={{ ...hfText.small, fontWeight: 600 }}>{r.sub}</div>
                        <div style={{ ...hfText.num, fontSize: 12, fontWeight: 650 }}>{r.m == null ? '—' : r.m}</div>
                        <div style={{ ...hfText.num, fontSize: 12, color: hf.muted }}>{r.max}</div>
                        <div>
                          {sp == null ? <span style={{ color: hf.faint }}>—</span> : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 56, height: 5, background: hf.surface2, borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${sp}%`, height: '100%', background: sp >= 80 ? hf.good : sp >= 60 ? hf.primary : hf.accent }}/>
                              </div>
                              <span style={{ ...hfText.num, fontSize: 11.5, fontWeight: 600 }}>{sp}%</span>
                            </div>
                          )}
                        </div>
                        <div>{sp == null ? <span style={{ color: hf.faint }}>—</span> : <Pill tone={sp >= 80 ? 'good' : sp >= 60 ? 'primary' : 'warn'} style={{ fontSize: 11, fontWeight: 700 }}>{gradeOf(sp)}</Pill>}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Summary */}
          <div style={{
            marginTop: 6,
            padding: '20px 24px', borderRadius: 12,
            border: `2px solid ${hf.ink}`, background: hf.surface,
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
          }}>
            {[
              { label: 'Total marks', value: '180 / 225' },
              { label: 'Percentage',  value: '80%' },
              { label: 'Grade',        value: 'B+' },
              { label: 'Result',       value: 'Promoted ✓', color: hf.good },
            ].map((s, i) => (
              <div key={i} style={{
                padding: '0 14px',
                borderLeft: i > 0 ? `1px solid ${hf.borderS}` : 'none',
              }}>
                <div style={{ ...hfText.micro, fontSize: 10 }}>{s.label}</div>
                <div style={{ ...hfText.num, fontSize: 22, fontWeight: 700, marginTop: 4, color: s.color || hf.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Footer signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 8 }}>
            {['Class teacher', 'Principal', 'Parent / Guardian'].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ borderTop: `1px solid ${hf.faint}`, marginTop: 32, paddingTop: 6, fontSize: 11, color: hf.muted }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </AdminChrome>
  );
};

// ─── A9 · Settings → Academic Years tab ──────────────────────────────────
// Render an ISO/string date as a short readable date.
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

// First letter of up to two words → logo/brand initials.
const brandInitials = (name) => {
  if (!name) return 'S';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'S';
};

// Render a receipt-format template into a sample number. Year tokens are
// anchored to the real current academic year (year_label like "2026-27").
const renderReceiptSample = (fmt, code, startNum, yearLabel) => {
  let yy = '26', yyNext = '27';
  if (yearLabel && /^\d{4}-\d{2,4}$/.test(yearLabel)) {
    const [a, b] = yearLabel.split('-');
    yy = a.slice(-2);
    yyNext = b.slice(-2);
  }
  return String(fmt || '')
    .replace(/\$\{code\}/g, code || 'CODE')
    .replace(/\$\{yy_next\}/g, yyNext)
    .replace(/\$\{yy\}/g, yy)
    .replace(/\$\{seq:(0+)\}/g, (_, z) => String(startNum ?? 1).padStart(z.length, '0'))
    .replace(/\$\{seq\}/g, String(startNum ?? 1));
};

// School profile panel (ported from the Claude Design prototype). All data is
// the live school object; `set(key, value)` mutates the working copy in HA9.
const ProfilePanel = ({ school, set, currentYearLabel }) => {
  const sample = renderReceiptSample(school.receipt_format, school.code, school.receipt_starting_num, currentYearLabel);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, alignItems: 'start' }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Identity */}
        <Card padding={0}>
          <PanelHead title="School identity" subtitle="Appears across the dashboard, login screen and printed receipts" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <LogoSlot src={school.logo_url} initials={brandInitials(school.name)} onChange={(v) => set('logo_url', v)} />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
              <Field label="School name" required>
                <SetInput value={school.name} onChange={(v) => set('name', v)} placeholder="e.g. Kendriya Riverside" />
              </Field>
              <Field label="School code" required hint="Locked after setup">
                <SetInput value={school.code} mono readOnly />
              </Field>
            </div>
          </div>
        </Card>

        {/* Contact */}
        <Card padding={0}>
          <PanelHead title="Contact details" subtitle="Used on receipts and for parent communication" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Address">
              <SetTextArea value={school.address} onChange={(v) => set('address', v)} placeholder="Street, city, state, PIN" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
              <Field label="Phone">
                <SetInput value={school.phone} onChange={(v) => set('phone', v)} placeholder="+91 …" mono />
              </Field>
              <Field label="Email">
                <SetInput value={school.email} onChange={(v) => set('email', v)} type="email" placeholder="office@school.edu.in" />
              </Field>
            </div>
          </div>
        </Card>

        {/* Receipts */}
        <Card padding={0}>
          <PanelHead title="Receipt numbering" subtitle="Controls how fee receipt numbers are generated" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Receipt format" hint="Tokens: ${code} ${yy} ${yy_next} ${seq:0000}">
              <SetInput value={school.receipt_format} onChange={(v) => set('receipt_format', v)} mono />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Reset sequence">
                <SetSelect value={school.receipt_reset} onChange={(v) => set('receipt_reset', v)} options={[
                  { value: 'yearly', label: 'Every academic year' },
                  { value: 'monthly', label: 'Every month' },
                  { value: 'never', label: 'Never (continuous)' },
                ]} />
              </Field>
              <Field label="Starting number">
                <SetInput type="number" value={school.receipt_starting_num} onChange={(v) => set('receipt_starting_num', Number(v) || 0)} mono />
              </Field>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '13px 16px', borderRadius: 11,
              background: hf.surface2, border: `1px solid ${hf.borderS}`,
            }}>
              <span style={{ color: hf.muted, display: 'inline-flex' }}>{I.receipt}</span>
              <div style={{ flex: 1 }}>
                <div style={{ ...hfText.micro, fontSize: 9.5 }}>Receipt format preview</div>
                <div style={{ ...hfText.num, fontSize: 16, fontWeight: 700, color: hf.primary, marginTop: 2 }}>{sample || '—'}</div>
              </div>
              <Pill tone="neutral">Live preview</Pill>
            </div>
          </div>
        </Card>
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Brand preview */}
        <Card padding={0}>
          <PanelHead title="Preview" subtitle="How your brand appears" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: 14, borderRadius: 12,
              background: `linear-gradient(135deg, ${hf.primarySoft}, ${hf.surface} 75%)`,
              border: `1px solid ${hf.primaryEdge}`,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11, overflow: 'hidden', flexShrink: 0,
                background: school.logo_url ? '#fff' : `linear-gradient(135deg, ${hf.primary}, oklch(0.55 0.16 290))`,
                color: '#fff', fontWeight: 700, fontSize: 15,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: school.logo_url ? `1px solid ${hf.border}` : 'none',
              }}>
                {school.logo_url ? <img src={school.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : brandInitials(school.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: hf.ink, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{school.name || 'School name'}</div>
                <div style={{ fontSize: 11.5, color: hf.muted, fontFamily: hfFonts.mono }}>{school.code || 'CODE'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { icon: I.phone, v: school.phone || '—' },
                { icon: I.bell, v: school.email || '—' },
                { icon: I.home, v: (school.address || '—').split('\n')[0] },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, ...hfText.small, color: hf.ink2 }}>
                  <span style={{ color: hf.muted, display: 'inline-flex' }}>{r.icon}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card padding={0}>
          <PanelHead title="Notifications" />
          <div style={{ padding: 18 }}>
            <SetToggleRow
              icon={I.phone}
              title="SMS notifications"
              desc="Saves your preference. SMS delivery will activate once the gateway is connected."
              checked={school.sms_enabled}
              onChange={(v) => set('sms_enabled', v)}
            />
          </div>
        </Card>

        {/* Metadata */}
        <Card style={{ background: hf.surface2 }}>
          <div style={{ ...hfText.micro, fontSize: 9.5, marginBottom: 10 }}>Record</div>
          {[
            { k: 'School ID', v: `#${school.id}`, mono: true },
            { k: 'Created', v: fmtDateTime(school.created_at) },
            { k: 'Last updated', v: fmtDateTime(school.updated_at) },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 2 ? `1px solid ${hf.borderS}` : 'none' }}>
              <span style={{ ...hfText.small, color: hf.muted }}>{r.k}</span>
              <span style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, fontFamily: r.mono ? hfFonts.mono : hfFonts.ui }}>{r.v}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};

// ─── Audit log (Settings · audit tab) ─────────────────────────────────────
// Wires only what's actually logged today: mutations on fee / payment /
// enrolment / school. Plain list, newest-first, real data only.
const fmtAuditTime = (d) => (d
  ? new Date(d).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    })
  : '—');

const capWord = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "Updated fee #42", "Recorded payment #17", "Updated school" (no id for school).
const auditLine = (log) => {
  const action = capWord(log.action || '');
  const type = log.entity_type || '';
  if (type === 'school') return `${action} ${type}`.trim();
  return `${action} ${type} #${log.entity_id}`.trim();
};

const AuditPager = ({ page, totalPages, onPage }) => (
  <div style={{
    padding: '12px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }}>
    <span style={{ ...hfText.small, color: hf.muted }}>Page {page} of {totalPages || 1}</span>
    <div style={{ display: 'flex', gap: 6 }}>
      <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>‹ Prev</Btn>
      <Btn variant="outline" size="sm" disabled={page >= (totalPages || 1)} onClick={() => onPage(page + 1)}>Next ›</Btn>
    </div>
  </div>
);

const AuditPanel = () => {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/audit-logs?page=${page}&limit=50`)
      .then((res) => {
        setLogs(Array.isArray(res.data) ? res.data : []);
        setTotalPages(res.total_pages || 1);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <Card padding={0}>
      <PanelHead title="Audit log" subtitle="Recent changes to fees, payments, enrolments and school settings" />
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: 48, textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load audit log: {error}</div>
      ) : logs.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', ...hfText.small, color: hf.muted }}>No activity recorded yet.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {logs.map((log) => (
              <div key={log.id} style={{
                display: 'grid', gridTemplateColumns: '170px 1fr', gap: 16,
                padding: '13px 18px', borderTop: `1px solid ${hf.borderS}`, alignItems: 'center',
              }}>
                <div style={{ ...hfText.small, color: hf.muted, ...hfText.num }}>{fmtAuditTime(log.created_at)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ ...hfText.body, color: hf.ink }}>{auditLine(log)}</span>
                  <span style={{
                    ...hfText.micro, color: hf.muted, background: hf.surface2,
                    border: `1px solid ${hf.borderS}`, borderRadius: 6, padding: '1px 7px',
                  }}>{log.entity_type}</span>
                  <span style={{ ...hfText.small, color: hf.ink2, marginLeft: 'auto' }}>{log.user_name}</span>
                </div>
              </div>
            ))}
          </div>
          <AuditPager page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </Card>
  );
};

// ─── Users & roles (Settings · users tab) ─────────────────────────────────
// Admins + teachers only — students are managed on the Students page, and
// there are no parent accounts. Teacher deactivate/reactivate routes through
// the teacher endpoints (which sync both rows); admin users use the user
// endpoints. Reset reuses the shared reset-password flow.
const fmtLastLogin = (d) => (d
  ? new Date(d).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    })
  : null);

const USERS_GRID = '1.7fr 110px 1.4fr 160px 110px 96px';

const AdminUsersPanel = () => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters (client-side — the admin+teacher set is small).
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState(''); // '' | 'admin' | 'teacher'
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive'

  // Reset-password flow (mirrors the Teachers page).
  const [resetting, setResetting] = useState(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState('');
  const [resetResult, setResetResult] = useState(null);

  // Deactivate flow.
  const [deactivating, setDeactivating] = useState(null);
  const [deBusy, setDeBusy] = useState(false);
  const [deErr, setDeErr] = useState('');

  // Load the full set (active + inactive) once for honest counts.
  const loadUsers = () => {
    setLoading(true);
    apiFetch('/api/users?include_inactive=true')
      .then((data) => { setUsers(Array.isArray(data) ? data : []); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadUsers(); }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const labelOf = (u) => u.display_name || u.username;

  const confirmReset = async () => {
    if (!resetting) return;
    setResetBusy(true);
    setResetErr('');
    try {
      // Empty body → backend resets to the default password and echoes it.
      const res = await apiFetch(`/api/auth/reset-password/${resetting.id}`, { method: 'POST', body: {} });
      setResetResult({ name: labelOf(resetting), password: res.password || null });
      setResetting(null);
    } catch (e) {
      setResetErr(e.message);
    } finally {
      setResetBusy(false);
    }
  };

  // Teacher users route through the teacher endpoints (which sync teacher +
  // user rows); admin users use the dedicated user endpoints.
  const confirmDeactivate = async () => {
    if (!deactivating) return;
    setDeBusy(true);
    setDeErr('');
    try {
      const path = deactivating.teacher_id
        ? `/api/teachers/${deactivating.teacher_id}`
        : `/api/users/${deactivating.id}/deactivate`;
      const method = deactivating.teacher_id ? 'DELETE' : 'POST';
      await apiFetch(path, { method });
      setDeactivating(null);
      loadUsers();
    } catch (e) {
      setDeErr(e.message);
    } finally {
      setDeBusy(false);
    }
  };

  const reactivate = async (u) => {
    setError(null);
    try {
      const path = u.teacher_id
        ? `/api/teachers/${u.teacher_id}/reactivate`
        : `/api/users/${u.id}/reactivate`;
      await apiFetch(path, { method: 'POST' });
      loadUsers();
    } catch (e) {
      setError(e.message);
    }
  };

  const total = users.length;
  const q = debounced.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (statusFilter === 'active' && !u.is_active) return false;
    if (statusFilter === 'inactive' && u.is_active) return false;
    if (roleFilter && u.role !== roleFilter) return false;
    if (q) {
      const hay = `${u.display_name || ''} ${u.username || ''} ${u.linked || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const roleItems = ['All', 'Admins', 'Teachers'];
  const roleActive = roleFilter === 'admin' ? 'Admins' : roleFilter === 'teacher' ? 'Teachers' : 'All';
  const onRole = (v) => setRoleFilter(v === 'Admins' ? 'admin' : v === 'Teachers' ? 'teacher' : '');

  return (
    <>
      <Card padding={0}>
        <PanelHead title="Users & roles" subtitle="Admin and teacher login accounts for your school" />

        <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: `1px solid ${hf.borderS}` }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, username, linked…" width="100%" />
          </div>
          <Segmented items={roleItems} active={roleActive} onChange={onRole} />
          <Segmented items={['Active', 'Inactive']} active={statusFilter === 'inactive' ? 'Inactive' : 'Active'} onChange={(v) => setStatusFilter(v.toLowerCase())} />
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: USERS_GRID,
          padding: '11px 20px', background: hf.surface2, borderBottom: `1px solid ${hf.borderS}`,
          ...hfText.micro, fontSize: 10,
        }}>
          <div>User</div><div>Role</div><div>Linked to</div><div>Last login</div><div>Status</div><div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        {loading && <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading users…</div>}
        {error && !loading && <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load users: {error}</div>}
        {!loading && !error && users.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No admin or teacher accounts yet.</div>}
        {!loading && !error && users.length > 0 && filtered.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No {statusFilter} users match your filters.</div>}

        {!loading && !error && filtered.map((u, i) => {
          const isMe = me && u.id === me.id;
          const lastLogin = fmtLastLogin(u.last_login_at);
          return (
            <div key={u.id} className="hf-row" style={{
              display: 'grid', gridTemplateColumns: USERS_GRID,
              padding: '11px 20px', alignItems: 'center',
              borderBottom: i < filtered.length - 1 ? `1px solid ${hf.borderS}` : 'none',
              opacity: u.is_active ? 1 : 0.62,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={labelOf(u)} size={28} />
                <div>
                  <div style={{ ...hfText.small, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {labelOf(u)}
                    {isMe && <Pill tone="primary">You</Pill>}
                  </div>
                  <div style={{ ...hfText.num, fontSize: 11, color: hf.muted }}>@{u.username}</div>
                </div>
              </div>
              <div>{u.role === 'admin' ? <Pill tone="warn">Admin</Pill> : <Pill tone="neutral">Teacher</Pill>}</div>
              <div style={{ ...hfText.small, color: hf.ink2 }}>{u.linked || <span style={{ color: hf.faint }}>—</span>}</div>
              <div style={{ ...hfText.small }}>
                {lastLogin
                  ? <span style={{ ...hfText.num, fontSize: 11.5, color: hf.ink2 }}>{lastLogin}</span>
                  : <span style={{ color: hf.faint }}>Never</span>}
              </div>
              <div>{u.is_active ? <Pill tone="good" dot>Active</Pill> : <Pill tone="neutral">Deactivated</Pill>}</div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { if (isMe) return; setResetErr(''); setResetting(u); }}
                  className="hf-btn" title={isMe ? 'You can\'t reset your own password here' : 'Reset password'}
                  disabled={isMe}
                  style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: isMe ? 0.35 : 1, cursor: isMe ? 'not-allowed' : 'pointer' }}
                >{I.lock}</button>
                {u.is_active ? (
                  <button
                    onClick={() => { if (isMe) return; setDeErr(''); setDeactivating(u); }}
                    className="hf-btn" title={isMe ? 'You can\'t deactivate your own account' : 'Deactivate'}
                    disabled={isMe}
                    style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: isMe ? 0.35 : 1, cursor: isMe ? 'not-allowed' : 'pointer' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                ) : (
                  <button onClick={() => reactivate(u)} className="hf-btn" title="Reactivate" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.good, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{I.refresh}</button>
                )}
              </div>
            </div>
          );
        })}

        <div style={{ padding: '12px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2, ...hfText.small, color: hf.muted }}>
          Showing {filtered.length} of {total} account{total === 1 ? '' : 's'} · only admins can manage users. Teachers are added on the Teachers page; students on the Students page.
        </div>
      </Card>

      {resetting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ConfirmModal
            title="Reset password?"
            message={`Reset the password for ${labelOf(resetting)}? They'll get the default password and must change it on first login.`}
            confirmLabel="Reset password"
            danger={false}
            onConfirm={confirmReset}
            onCancel={() => setResetting(null)}
            busy={resetBusy}
            error={resetErr}
          />
        </div>
      )}
      {deactivating && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ConfirmModal
            title="Deactivate user?"
            message={`This blocks ${labelOf(deactivating)} from signing in but keeps their records. You can reactivate them later.`}
            confirmLabel="Deactivate"
            onConfirm={confirmDeactivate}
            onCancel={() => setDeactivating(null)}
            busy={deBusy}
            error={deErr}
          />
        </div>
      )}
      {resetResult && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <div onClick={() => setResetResult(null)} style={{ position: 'absolute', inset: 0 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
              <ModalShell
                title="Password reset"
                width={420}
                footer={<Btn variant="primary" size="md" onClick={() => setResetResult(null)}>Done</Btn>}
              >
                <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.6 }}>
                  {resetResult.name}'s password has been reset.
                </div>
                {resetResult.password && (
                  <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: hf.surface2, border: `1px solid ${hf.borderS}` }}>
                    <div style={{ ...hfText.micro, fontSize: 10 }}>New password</div>
                    <div style={{ ...hfText.num, fontSize: 20, fontWeight: 700, marginTop: 4 }}>{resetResult.password}</div>
                    <div style={{ ...hfText.small, color: hf.muted, marginTop: 6 }}>Share this with the user · they'll be asked to change it on first login.</div>
                  </div>
                )}
              </ModalShell>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Fee plans (Settings → Fee plans) ────────────────────────────────────
// Per-class monthly tuition + transport fees for the current academic year.
// Reads GET /api/class-years; edits via PUT /api/class-years/:id.

const FEES_GRID = '130px 1fr 1fr 90px';

// Money rule: fees travel as decimal strings, never floats. We validate the
// raw string (non-negative, up to 2 decimals) and send it through untouched.
const isValidFee = (v) => /^\d+(\.\d{1,2})?$/.test(String(v).trim());

const FeePlanModal = ({ initial, onClose, onSaved }) => {
  const [tuition, setTuition] = useState(String(initial.tuition_fee ?? ''));
  const [transport, setTransport] = useState(String(initial.transport_fee ?? ''));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const classLabel = `${initial.class?.name ?? '—'}-${initial.class?.section ?? ''}`;

  const handleSave = async () => {
    setErr('');
    if (!isValidFee(tuition)) { setErr('Tuition fee must be a non-negative number (up to 2 decimals).'); return; }
    if (!isValidFee(transport)) { setErr('Transport fee must be a non-negative number (up to 2 decimals).'); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/class-years/${initial.id}`, {
        method: 'PUT',
        body: { tuition_fee: tuition.trim(), transport_fee: transport.trim() },
      });
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
          <ModalShell
            title={`Edit fee plan · Class ${classLabel}`}
            subtitle="Monthly tuition and transport fees for this class"
            width={440}
            footer={<>
              <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" size="md" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Btn>
            </>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <FieldLabel required>Tuition fee (₹)</FieldLabel>
                <FInput value={tuition} onChange={setTuition} placeholder="800.00" />
              </div>
              <div>
                <FieldLabel required>Transport fee (₹)</FieldLabel>
                <FInput value={transport} onChange={setTransport} placeholder="0.00" />
              </div>
              {err && (
                <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
              )}
            </div>
          </ModalShell>
        </div>
      </div>
    </div>
  );
};

const FeePlansPanel = ({ academicYearId, yearLabel }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => {
    if (!academicYearId) { setRows([]); setError(null); setLoading(false); return; }
    setLoading(true);
    apiFetch(`/api/class-years?academic_year_id=${academicYearId}`)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        // Sorted by class sort order (e.g. 1-A before 2-B).
        list.sort((a, b) => (a.class?.sort_order ?? 0) - (b.class?.sort_order ?? 0));
        setRows(list);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [academicYearId]);

  return (
    <>
      <Card padding={0}>
        <PanelHead
          title="Fee plans"
          subtitle={yearLabel ? `Monthly tuition & transport fees per class · ${yearLabel}` : 'Monthly tuition & transport fees per class'}
        />

        <div style={{
          display: 'grid', gridTemplateColumns: FEES_GRID,
          padding: '11px 20px', background: hf.surface2, borderBottom: `1px solid ${hf.borderS}`,
          ...hfText.micro, fontSize: 10,
        }}>
          <div>Class</div><div>Tuition fee</div><div>Transport fee</div><div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        {!academicYearId && (
          <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Set a current academic year first — fee plans are per year.</div>
        )}
        {academicYearId && loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading fee plans…</div>
        )}
        {academicYearId && error && !loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load fee plans: {error}</div>
        )}
        {academicYearId && !loading && !error && rows.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No classes configured for this year yet.</div>
        )}

        {academicYearId && !loading && !error && rows.map((cy, i) => (
          <div key={cy.id} className="hf-row" style={{
            display: 'grid', gridTemplateColumns: FEES_GRID,
            padding: '12px 20px', alignItems: 'center',
            borderBottom: i < rows.length - 1 ? `1px solid ${hf.borderS}` : 'none',
          }}>
            <div style={{ ...hfText.num, fontSize: 13, fontWeight: 700 }}>{cy.class?.name}-{cy.class?.section}</div>
            <div style={{ ...hfText.num, fontSize: 13, color: hf.ink2 }}>₹{cy.tuition_fee}</div>
            <div style={{ ...hfText.num, fontSize: 13, color: hf.ink2 }}>₹{cy.transport_fee}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(cy)} className="hf-btn" title="Edit fees" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✎</button>
            </div>
          </div>
        ))}

        {academicYearId && !loading && !error && rows.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2, ...hfText.small, color: hf.muted }}>
            {rows.length} class{rows.length === 1 ? '' : 'es'} · fees are charged monthly per enrolled student.
          </div>
        )}
      </Card>

      {editing && (
        <FeePlanModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
};

const HA9 = () => {
  const [tab, setTab] = useState('years');
  const [yearModal, setYearModal] = useState(null); // null | 'create' | initial-object
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // School profile state (working copy + saved snapshot for dirty tracking).
  const [school, setSchool] = useState(null);
  const [savedSchool, setSavedSchool] = useState(null);
  const [schoolErr, setSchoolErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const loadYears = () => {
    setLoading(true);
    apiFetch('/api/academic-years')
      .then((data) => setYears(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadYears(); }, []);

  useEffect(() => {
    apiFetch('/api/school')
      .then((d) => { setSchool(d); setSavedSchool(d); })
      .catch((e) => setSchoolErr(e.message));
  }, []);

  const current = years.find((y) => y.is_current) || null;

  const setField = (k, v) => setSchool((s) => ({ ...s, [k]: v }));
  const dirty = school && savedSchool && JSON.stringify(school) !== JSON.stringify(savedSchool);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };

  const saveProfile = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const updated = await apiFetch('/api/school', {
        method: 'PUT',
        body: {
          name: school.name,
          address: school.address,
          phone: school.phone,
          email: school.email,
          logo_url: school.logo_url,
          receipt_format: school.receipt_format,
          receipt_reset: school.receipt_reset,
          receipt_starting_num: school.receipt_starting_num,
          sms_enabled: school.sms_enabled,
        },
      });
      setSchool(updated);
      setSavedSchool(updated);
      showToast('School profile saved');
    } catch (e) {
      showToast(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };
  const cancelProfile = () => setSchool(savedSchool);

  return (
    <>
    <AdminChrome
      active="Settings"
      breadcrumb="Home · Settings"
      title="Settings"
      topRight={tab === 'profile' ? (
        <>
          {dirty && <span style={{ ...hfText.small, color: hf.muted }}>Unsaved changes</span>}
          <Btn variant="outline" size="sm" onClick={cancelProfile} disabled={!dirty || saving}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={saveProfile} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Btn>
        </>
      ) : undefined}
    >
      <Tabs items={[
        { label: 'School profile',  id: 'profile' },
        { label: 'Academic years',  id: 'years' },
        { label: 'Users & roles',   id: 'users' },
        { label: 'Fee plans',       id: 'fees' },
        { label: 'Audit log',       id: 'audit' },
      ]} active={tab} onChange={setTab} />

      {tab === 'profile' && (
        school
          ? <ProfilePanel school={school} set={setField} currentYearLabel={current?.year_label} />
          : <Card padding={48} style={{ textAlign: 'center', ...hfText.small, color: schoolErr ? hf.accent : hf.muted }}>
              {schoolErr ? `Couldn't load school profile: ${schoolErr}` : 'Loading…'}
            </Card>
      )}

      {tab === 'fees' && <FeePlansPanel academicYearId={current?.id} yearLabel={current?.year_label} />}

      {tab === 'users' && <AdminUsersPanel />}

      {tab === 'audit' && <AuditPanel />}

      {tab === 'years' && (<>

      {/* Current year hero */}
      <Card style={{ background: `linear-gradient(135deg, ${hf.primarySoft}, ${hf.surface} 70%)`, borderColor: hf.primaryEdge }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 14,
            background: hf.primary, color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{I.cal}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ ...hfText.micro, fontSize: 10, color: hf.primary }}>CURRENT ACADEMIC YEAR</div>
              {current && <Pill tone="primary" dot>Live</Pill>}
            </div>
            <div style={{ ...hfText.display, fontSize: 30, color: hf.primary, ...hfText.num, lineHeight: 1.05 }}>{current ? current.year_label : '—'}</div>
            <div style={{ ...hfText.small, color: hf.ink2, marginTop: 6 }}>
              {current ? `${fmtDate(current.start_date)} → ${fmtDate(current.end_date)}` : 'No current year set'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {current && <Btn variant="outline" size="md" onClick={() => setYearModal(current)}>Edit dates</Btn>}
            <Btn variant="primary" size="md" icon={I.arrUp} onClick={() => setPromoteOpen(true)}>Promote students</Btn>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* Years table */}
        <Card padding={0}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ ...hfText.h2 }}>All academic years</div>
              <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>{loading ? 'Loading…' : `${years.length} year${years.length === 1 ? '' : 's'} on record`}</div>
            </div>
            <Btn variant="outline" size="sm" onClick={() => setYearModal('create')}>+ Create new year</Btn>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '110px 150px 150px 120px 1fr',
            padding: '10px 18px', background: hf.surface2,
            borderBottom: `1px solid ${hf.borderS}`,
            ...hfText.micro, fontSize: 10,
          }}>
            <div>Year</div><div>Start</div><div>End</div><div>Status</div><div style={{ textAlign: 'right' }}>Actions</div>
          </div>
          {loading && (
            <div style={{ padding: '30px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading academic years…</div>
          )}
          {error && !loading && (
            <div style={{ padding: '30px 18px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load: {error}</div>
          )}
          {!loading && !error && years.length === 0 && (
            <div style={{ padding: '30px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No academic years yet.</div>
          )}
          {!loading && !error && years.map((y, i) => (
            <div key={y.id} className="hf-row" style={{
              display: 'grid', gridTemplateColumns: '110px 150px 150px 120px 1fr',
              padding: '13px 18px', alignItems: 'center',
              borderBottom: i < years.length - 1 ? `1px solid ${hf.borderS}` : 'none',
            }}>
              <div style={{ ...hfText.num, fontSize: 13, fontWeight: 700 }}>{y.year_label}</div>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.ink2 }}>{fmtDate(y.start_date)}</div>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.ink2 }}>{fmtDate(y.end_date)}</div>
              <div>
                {y.is_current
                  ? <Pill tone="primary" dot>Current</Pill>
                  : <Pill tone="neutral">Archived</Pill>}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => setYearModal(y)} className="hf-btn" title="Edit" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✎</button>
              </div>
            </div>
          ))}
        </Card>

        {/* Promote callout */}
        <Card style={{ background: hf.accentSoft, borderColor: hf.accentEdge }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: hf.surface, border: `1px solid ${hf.accentEdge}`,
              color: hf.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{I.alert}</div>
            <div>
              <div style={{ ...hfText.h2, fontSize: 15 }}>Promoting students is significant</div>
              <div style={{ ...hfText.small, color: hf.ink2, marginTop: 6, lineHeight: 1.55 }}>
                It moves <b>all active students</b> from one class-year into another in bulk — each source
                enrollment is marked <b>promoted</b> and a new active enrollment is created in the target.
                The destination class-year must already exist.
              </div>
              <div style={{ marginTop: 10 }}>
                <Btn variant="outline" size="sm" onClick={() => setPromoteOpen(true)}>Promote students</Btn>
              </div>
            </div>
          </div>
        </Card>

        {/* Year shortcuts */}
        <Card padding={0} style={{ gridColumn: '1 / -1' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}` }}>
            <div style={{ ...hfText.h2 }}>Year shortcuts</div>
            <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>Bulk actions on the current year</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {[
              { label: 'Roll out fee plan',     hint: 'Apply tuition + transport rates to all classes', icon: I.card },
              { label: 'Generate report cards', hint: '482 PDFs · estimated 6 minutes',                  icon: I.receipt },
              { label: 'Archive last year',     hint: 'Read-only · keeps audit history',                 icon: I.shield },
              { label: 'Reset all teacher passwords', hint: 'Forces change on next login',                icon: I.lock },
            ].map((a, i) => (
              <div key={i} className="hf-row" style={{
                padding: '16px 18px',
                borderLeft: i > 0 ? `1px solid ${hf.borderS}` : 'none',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 6, minHeight: 92,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: hf.primarySoft, color: hf.primary,
                  border: `1px solid ${hf.primaryEdge}`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{a.icon}</div>
                <div style={{ ...hfText.small, fontWeight: 650 }}>{a.label}</div>
                <div style={{ fontSize: 11.5, color: hf.muted, lineHeight: 1.4 }}>{a.hint}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      </>)}
    </AdminChrome>
    {yearModal && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
        <AcademicYearFormModal
          initial={yearModal === 'create' ? null : yearModal}
          onClose={() => setYearModal(null)}
          onSaved={() => { setYearModal(null); loadYears(); }}
        />
      </div>
    )}
    {promoteOpen && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
        <PromoteStudentsModal
          onClose={() => setPromoteOpen(false)}
          onSaved={() => { loadYears(); showToast('Students promoted'); }}
        />
      </div>
    )}
    {toast && (
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1100,
        background: hf.ink, color: '#fff', padding: '10px 18px', borderRadius: 10,
        ...hfText.small, fontWeight: 600, boxShadow: hf.shadowLg,
      }}>{toast}</div>
    )}
    </>
  );
};

export { HA7, HA7Detail, HA7ReportCard, HA9 };
