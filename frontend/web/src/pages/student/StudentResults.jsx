import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StudentChrome } from '@/components/student/StudentChrome';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Card, Pill, Btn, FilterSelect } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';

// ── helpers (module-level — no nesting in render) ──────────────────────────

function formatExamDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Build enrollment_id → academic-year info from /api/me/enrollments. Results
// carry no academic year directly, so we resolve it as
// result.enrollment_id → enrollment → class_year.academic_year.
function buildYearByEnrollment(enrollments) {
  const map = new Map();
  for (const e of enrollments || []) {
    const ay = e.class_year?.academic_year;
    if (!ay) continue;
    map.set(e.id, {
      id: ay.id,
      label: ay.year_label || `Year ${ay.id}`,
      isCurrent: !!ay.is_current,
      start: ay.start_date || '',
    });
  }
  return map;
}

// Result marks as percent — display-only (bar width + label). The marks figure
// itself stays a decimal string; Number() here never touches what we render.
function pct(marks, maxMarks) {
  const max = Number(maxMarks);
  const got = Number(marks);
  if (!isFinite(max) || max <= 0 || !isFinite(got)) return null;
  return Math.max(0, Math.min(100, Math.round((got / max) * 100)));
}

// ── presentational pieces ──────────────────────────────────────────────────

const Skel = ({ w = '100%', h = 12, r = 6, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${hf.borderS}, ${hf.surface2} 50%, ${hf.borderS})`,
    backgroundSize: '200% 100%', animation: 'hf-skel 1.6s ease-in-out infinite', ...style,
  }} />
);

const ResultRow = ({ r }) => {
  const exam = r.exam || {};
  const percent = pct(r.marks, exam.max_marks);
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...hfText.h2, fontSize: 15, lineHeight: 1.3 }}>{exam.name || 'Exam'}</div>
            <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>
              {exam.subject || '—'}{exam.exam_date ? ` · ${formatExamDate(exam.exam_date)}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ ...hfText.num, fontSize: 18, fontWeight: 700, color: hf.ink, lineHeight: 1 }}>
              {r.marks}
              <span style={{ fontSize: 12, fontWeight: 500, color: hf.muted }}> / {exam.max_marks ?? '—'}</span>
            </div>
            {percent != null && (
              <div style={{ ...hfText.small, color: hf.muted, marginTop: 2, ...hfText.num }}>{percent}%</div>
            )}
          </div>
        </div>
        {percent != null && (
          <div style={{ height: 6, borderRadius: 999, background: hf.border, overflow: 'hidden' }}>
            <div style={{ width: `${percent}%`, height: '100%', background: hf.primary }} />
          </div>
        )}
      </div>
    </Card>
  );
};

const PageLoading = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
    {[0, 1, 2].map(i => (
      <Card key={i} padding={16}><Skel w={180} h={14} /><Skel w={120} h={12} style={{ marginTop: 10 }} /></Card>
    ))}
  </div>
);

const PageError = ({ message, onRetry }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, textAlign: 'center' }}>
    <div style={{ ...hfText.h2 }}>Couldn't load your results</div>
    <div style={{ ...hfText.small, color: hf.muted }}>{message}</div>
    <Btn variant="primary" size="md" onClick={onRetry}>Retry</Btn>
  </div>
);

// ── page ────────────────────────────────────────────────────────────────────

export default function StudentResults() {
  const [results, setResults] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [yearId, setYearId] = useState(''); // selected academic_year id (string)

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, enr] = await Promise.all([
        apiFetch('/api/me/results'),
        apiFetch('/api/me/enrollments'),
      ]);
      setResults(Array.isArray(res) ? res : []);
      setEnrollments(Array.isArray(enr) ? enr : []);
    } catch (e) {
      setError(e.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const yearByEnrollment = useMemo(() => buildYearByEnrollment(enrollments), [enrollments]);

  // Attach the resolved academic year to each result.
  const resultsWithYear = useMemo(() => {
    return (results || []).map((r) => ({ ...r, _year: yearByEnrollment.get(r.enrollment_id) || null }));
  }, [results, yearByEnrollment]);

  // Distinct academic years that actually have results, newest first.
  const years = useMemo(() => {
    const byId = new Map();
    for (const r of resultsWithYear) {
      if (r._year && !byId.has(r._year.id)) byId.set(r._year.id, r._year);
    }
    return Array.from(byId.values()).sort((a, b) => String(b.start).localeCompare(String(a.start)));
  }, [resultsWithYear]);

  // Default the dropdown to the current academic year if it has results, else
  // the most recent year that does.
  useEffect(() => {
    if (years.length === 0) { setYearId(''); return; }
    setYearId((prev) => {
      if (prev && years.some((y) => String(y.id) === prev)) return prev;
      const current = years.find((y) => y.isCurrent);
      return String((current || years[0]).id);
    });
  }, [years]);

  const shown = useMemo(() => {
    const list = resultsWithYear.filter((r) => String(r._year?.id) === yearId);
    return list.sort((a, b) => {
      const da = a.exam?.exam_date ? new Date(a.exam.exam_date).getTime() : 0;
      const db = b.exam?.exam_date ? new Date(b.exam.exam_date).getTime() : 0;
      if (da !== db) return db - da;
      return b.id - a.id;
    });
  }, [resultsWithYear, yearId]);

  const yearOptions = years.map((y) => ({
    value: String(y.id),
    label: y.isCurrent ? `${y.label} (current)` : y.label,
  }));

  let body;
  if (loading) {
    body = <PageLoading />;
  } else if (error) {
    body = <PageError message={error} onRetry={load} />;
  } else if ((results || []).length === 0) {
    body = (
      <Card padding={20}>
        <div style={{ ...hfText.small, color: hf.muted }}>
          No results published yet. Your exam results will appear here once teachers enter them.
        </div>
      </Card>
    );
  } else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
        {shown.length === 0 ? (
          <Card padding={20}>
            <div style={{ ...hfText.small, color: hf.muted }}>No results for the selected year.</div>
          </Card>
        ) : (
          shown.map((r) => <ResultRow key={r.id} r={r} />)
        )}
      </div>
    );
  }

  const topRight = !loading && !error && years.length > 0 ? (
    <FilterSelect label="Year" value={yearId} onChange={setYearId} options={yearOptions} width={200} />
  ) : null;

  return (
    <StudentChrome active="Results" title="Results" breadcrumb="Home" topRight={topRight}>
      {body}
    </StudentChrome>
  );
}
