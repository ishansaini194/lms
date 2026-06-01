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
  ModalShell, StateFrame, SearchInput, FInput,
} from '@/components/ui/primitives';
import {
  AdminChrome, AdminTopBar, Tabs, Segmented, ClassChip, Searchbox, Dropdown,
  FieldLabel, TextInput, TextArea,
} from '@/components/admin/AdminChrome';
import { HA7Modal, AcademicYearFormModal, ConfirmModal } from '@/pages/admin/extras.jsx';
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

  const loadExams = () => {
    setLoading(true);
    apiFetch('/api/exams')
      .then((data) => setExams(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadExams(); }, []);

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
      loadExams();
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
        <Btn variant="primary" size="sm" onClick={() => setShowCreate(true)}>+ Create exam</Btn>
      </>}
    >
      <Card padding={14} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search subject, class, or exam…" width={'100%'} />
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
                {!ex.is_active && <Pill tone="neutral">Inactive</Pill>}
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
        <HA7Modal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadExams(); }} />
      </div>
    )}
    {editing && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
        <HA7Modal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadExams(); }} />
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

const HA9 = () => {
  const [tab, setTab] = useState('years');
  const [yearModal, setYearModal] = useState(null); // null | 'create' | initial-object
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadYears = () => {
    setLoading(true);
    apiFetch('/api/academic-years')
      .then((data) => setYears(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadYears(); }, []);

  const current = years.find((y) => y.is_current) || null;

  return (
    <>
    <AdminChrome
      active="Settings"
      breadcrumb="Home · Settings"
      title="Settings"
      topRight={<>
        <Btn variant="outline" size="sm">Cancel</Btn>
        <Btn variant="primary" size="sm">Save changes</Btn>
      </>}
    >
      <Tabs items={[
        { label: 'School profile',  id: 'profile' },
        { label: 'Academic years',  id: 'years' },
        { label: 'Users & roles',   id: 'users', count: 12 },
        { label: 'Fee plans',       id: 'fees' },
        { label: 'Audit log',       id: 'audit' },
      ]} active={tab} onChange={setTab} />

      {tab !== 'years' && (
        <Card padding={48} style={{ textAlign: 'center' }}>
          <div style={{ ...hfText.h2, color: hf.ink2, marginBottom: 6 }}>Coming soon</div>
          <div style={{ ...hfText.small, color: hf.muted }}>This settings section isn't built yet.</div>
        </Card>
      )}

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
            <Btn variant="primary" size="md" icon={I.arrUp}>Promote students</Btn>
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
              <div style={{ ...hfText.h2, fontSize: 15 }}>Promoting students is destructive</div>
              <div style={{ ...hfText.small, color: hf.ink2, marginTop: 6, lineHeight: 1.55 }}>
                It moves <b>all 482 active enrollments</b> up one class, marks the current year archived, and locks marks entry. <b>Class 8 students</b> are marked passed-out.
              </div>
              <div style={{ marginTop: 10 }}>
                <Btn variant="outline" size="sm">See impact preview</Btn>
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
    </>
  );
};

export { HA7, HA7Detail, HA7ReportCard, HA9 };
