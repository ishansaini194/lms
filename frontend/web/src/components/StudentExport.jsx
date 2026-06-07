// Student data export — CSV (download) and PDF (browser print-to-PDF). Shared by
// the admin Students page and the teacher Classes page: bulk (multi-class) and
// single-student exports. Pure client-side — it reads the student rows the page
// already has (admin: /api/students; teacher: /api/enrollments), no new backend.
// The data source is pluggable via ExportStudentsModal's `fetchStudents` prop and
// the field catalogue via `fields` (admin = full set; teacher = no fee status).
import React, { useState, useMemo } from 'react';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Btn, ModalShell } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';

// ── field catalogue (label + how to read it off an enriched student row) ──────
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// fee_status: "paid" | "partial" | "unpaid" | "" (no fees generated yet)
const FEE_STATUS_LABEL = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', '': 'No fees' };

export const STUDENT_EXPORT_FIELDS = [
  { key: 'name',           label: 'Name',            get: (s) => s.name },
  { key: 'admission_no',   label: 'Admission No.',   get: (s) => s.admission_no },
  { key: 'class_label',    label: 'Class',           get: (s) => s.class_label },
  { key: 'gender',         label: 'Gender',          get: (s) => s.gender },
  { key: 'dob',            label: 'Date of Birth',   get: (s) => fmtDate(s.dob) },
  { key: 'phone',          label: 'Phone',           get: (s) => s.phone },
  { key: 'email',          label: 'Email',           get: (s) => s.email },
  { key: 'father_name',    label: 'Father Name',     get: (s) => s.father_name },
  { key: 'father_contact', label: 'Father Contact',  get: (s) => s.father_contact },
  { key: 'mother_name',    label: 'Mother Name',     get: (s) => s.mother_name },
  { key: 'mother_contact', label: 'Mother Contact',  get: (s) => s.mother_contact },
  { key: 'caste',          label: 'Caste',           get: (s) => s.caste },
  { key: 'address',        label: 'Address',         get: (s) => s.address },
  { key: 'aadhar_no',      label: 'Aadhar No.',      get: (s) => s.aadhar_no },
  { key: 'epunjab_id',     label: 'ePunjab ID',      get: (s) => s.epunjab_id },
  { key: 'fee_status',     label: 'Fee Status',      get: (s) => FEE_STATUS_LABEL[s.fee_status] ?? FEE_STATUS_LABEL[''] },
  { key: 'status',         label: 'Status',          get: (s) => (s.is_active ? 'Active' : 'Inactive') },
];

// Teacher-facing field set: same minus Fee Status (fees are an admin concern and
// the teacher's enrollment data doesn't carry fee_status).
export const TEACHER_EXPORT_FIELDS = STUDENT_EXPORT_FIELDS.filter((f) => f.key !== 'fee_status');

// Sensible defaults so the form opens "ready to export".
const DEFAULT_KEYS = ['name', 'admission_no', 'class_label', 'gender', 'dob', 'phone', 'father_name', 'father_contact'];

// ── generators ────────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCSV(filename, rows, fields) {
  const header = fields.map((f) => csvCell(f.label)).join(',');
  const body = rows.map((r) => fields.map((f) => csvCell(f.get(r))).join(',')).join('\r\n');
  const csv = `${header}\r\n${body}`;
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM → Excel reads UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const htmlEsc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Renders the rows into a hidden iframe and triggers the browser's print dialog,
// where the user picks "Save as PDF". An iframe (not window.open) so there's no
// popup-blocker issue — this can run after an async fetch — and it doesn't touch
// the app's own print styles.
function exportPDF(title, subtitle, rows, fields) {
  const thead = fields.map((f) => `<th>${htmlEsc(f.label)}</th>`).join('');
  const tbody = rows.map((r) =>
    `<tr>${fields.map((f) => `<td>${htmlEsc(f.get(r))}</td>`).join('')}</tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEsc(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    th, td { border: 1px solid #999; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #eee; }
    tr:nth-child(even) td { background: #f7f7f7; }
    @media print { @page { size: landscape; margin: 12mm; } }
  </style></head><body>
    <h1>${htmlEsc(title)}</h1>
    <div class="meta">${htmlEsc(subtitle)}</div>
    <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
  </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const cw = iframe.contentWindow;
  cw.document.open();
  cw.document.write(html);
  cw.document.close();
  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  cw.onafterprint = cleanup;
  setTimeout(() => { cw.focus(); cw.print(); cleanup(); }, 300);
}

// Pull every active (and optionally inactive) student for a class-year, across
// pages (list endpoint caps at limit=100).
async function fetchClassStudents(classYearId, includeInactive) {
  let page = 1, totalPages = 1;
  const out = [];
  do {
    const params = new URLSearchParams({ class_year_id: String(classYearId), page: String(page), limit: '100' });
    if (includeInactive) params.set('include_inactive', 'true');
    const res = await apiFetch(`/api/students?${params.toString()}`);
    out.push(...(res.data || []));
    totalPages = res.total_pages || 1;
    page += 1;
  } while (page <= totalPages);
  return out;
}

// ── shared UI bits ────────────────────────────────────────────────────────────
const Overlay = ({ onClose, children }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>{children}</div>
  </div>
);

const ErrBox = ({ children }) => (
  <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{children}</div>
);

const SectionLabel = ({ children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
    <div style={{ ...hfText.micro, fontSize: 10, letterSpacing: '0.04em' }}>{children}</div>
    {right}
  </div>
);

// Plain native checkbox row — used by both modals (classic, no custom controls).
const CheckRow = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', ...hfText.small, color: hf.ink2 }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 15, height: 15, accentColor: hf.primary, cursor: 'pointer' }} />
    {label}
  </label>
);

const FormatPicker = ({ format, setFormat }) => (
  <div style={{ display: 'flex', gap: 16 }}>
    {[{ k: 'csv', l: 'CSV (.csv)' }, { k: 'pdf', l: 'PDF (print)' }].map((o) => (
      <label key={o.k} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', ...hfText.small, color: hf.ink2 }}>
        <input type="radio" name="export-format" checked={format === o.k} onChange={() => setFormat(o.k)} style={{ width: 15, height: 15, accentColor: hf.primary, cursor: 'pointer' }} />
        {o.l}
      </label>
    ))}
  </div>
);

// Reusable selectable field checklist with Select all / none. `fields` is the
// catalogue to choose from (admin = full set, teacher = no fee status).
function useFieldSelection(fields) {
  const [keys, setKeys] = useState(() => new Set(DEFAULT_KEYS.filter((k) => fields.some((f) => f.key === k))));
  const toggle = (key, on) => setKeys((prev) => {
    const next = new Set(prev);
    if (on) next.add(key); else next.delete(key);
    return next;
  });
  const setAll = (on) => setKeys(on ? new Set(fields.map((f) => f.key)) : new Set());
  const selectedFields = useMemo(() => fields.filter((f) => keys.has(f.key)), [fields, keys]);
  const allKeys = fields.length;
  return { keys, toggle, setAll, selectedFields, allKeys };
}

const FieldChecklist = ({ fields, keys, toggle, columns = 2 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '8px 16px' }}>
    {fields.map((f) => (
      <CheckRow key={f.key} label={f.label} checked={keys.has(f.key)} onChange={(on) => toggle(f.key, on)} />
    ))}
  </div>
);

// ── Bulk export (Students list) ───────────────────────────────────────────────
// `classOptions` is the page's class list: [{ value: class_year_id, label }] —
// the leading "All classes" ('' value) entry is ignored here.
//   fetchStudents(classYearId, includeInactive) → student rows. Defaults to the
//     admin /api/students fetcher; the teacher portal passes an enrollment-based one.
//   fields — catalogue to offer (admin = full set; teacher = no fee status).
//   showInactiveToggle — admin can include soft-deleted students; teachers can't.
export function ExportStudentsModal({
  classOptions = [], onClose,
  fetchStudents = fetchClassStudents,
  fields = STUDENT_EXPORT_FIELDS,
  showInactiveToggle = true,
}) {
  const { school } = useAuth();
  const classes = classOptions.filter((o) => o.value !== '' && o.value != null);

  const [picked, setPicked] = useState(() => new Set(classes.map((c) => String(c.value))));
  const [includeInactive, setIncludeInactive] = useState(false);
  const [format, setFormat] = useState('csv');
  const { keys, toggle, setAll, selectedFields, allKeys } = useFieldSelection(fields);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const allPicked = picked.size === classes.length && classes.length > 0;
  const toggleClass = (val, on) => setPicked((prev) => {
    const next = new Set(prev);
    if (on) next.add(String(val)); else next.delete(String(val));
    return next;
  });
  const pickAllClasses = (on) => setPicked(on ? new Set(classes.map((c) => String(c.value))) : new Set());

  const run = async () => {
    setErr('');
    if (picked.size === 0) { setErr('Pick at least one class.'); return; }
    if (selectedFields.length === 0) { setErr('Pick at least one field to export.'); return; }
    setBusy(true);
    try {
      const ids = Array.from(picked);
      const lists = await Promise.all(ids.map((id) => fetchStudents(id, includeInactive)));
      // Flatten + de-dupe (a student could appear once per class-year) + stable sort.
      const seen = new Set();
      const rows = [];
      for (const list of lists) {
        for (const s of list) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          rows.push(s);
        }
      }
      rows.sort((a, b) => (a.class_label || '').localeCompare(b.class_label || '') || (a.name || '').localeCompare(b.name || ''));
      if (rows.length === 0) { setErr('No students found for the selected classes.'); setBusy(false); return; }

      const stamp = new Date().toISOString().slice(0, 10);
      const title = `${school?.name || 'School'} — Students`;
      if (format === 'csv') {
        downloadCSV(`students_${stamp}`, rows, selectedFields);
      } else {
        exportPDF(title, `${rows.length} student(s) · Generated ${new Date().toLocaleString()}`, rows, selectedFields);
      }
      onClose?.();
    } catch (e) {
      setErr(e.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalShell
        title="Export students"
        subtitle="Choose classes, fields and a format"
        width={560}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={run} disabled={busy}>{busy ? 'Preparing…' : 'Export'}</Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Classes */}
          <div>
            <SectionLabel right={
              <button onClick={() => pickAllClasses(!allPicked)} className="hf-btn" style={{ ...hfText.small, fontSize: 12, color: hf.primary, background: 'none', border: 'none', cursor: 'pointer', fontFamily: hfFonts.ui }}>
                {allPicked ? 'Clear all' : 'Select all'}
              </button>
            }>CLASSES ({picked.size} selected)</SectionLabel>
            {classes.length === 0 ? (
              <div style={{ ...hfText.small, color: hf.muted }}>No classes available.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', maxHeight: 170, overflowY: 'auto' }}>
                {classes.map((c) => (
                  <CheckRow key={c.value} label={c.label} checked={picked.has(String(c.value))} onChange={(on) => toggleClass(c.value, on)} />
                ))}
              </div>
            )}
            {showInactiveToggle && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', ...hfText.small, color: hf.muted, marginTop: 10 }}>
                <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} style={{ width: 15, height: 15, accentColor: hf.primary, cursor: 'pointer' }} />
                Include inactive students
              </label>
            )}
          </div>

          {/* Fields */}
          <div style={{ borderTop: `1px solid ${hf.borderS}`, paddingTop: 14 }}>
            <SectionLabel right={
              <button onClick={() => setAll(selectedFields.length !== allKeys)} className="hf-btn" style={{ ...hfText.small, fontSize: 12, color: hf.primary, background: 'none', border: 'none', cursor: 'pointer', fontFamily: hfFonts.ui }}>
                {selectedFields.length === allKeys ? 'Clear all' : 'Select all'}
              </button>
            }>FIELDS ({selectedFields.length} selected)</SectionLabel>
            <FieldChecklist fields={fields} keys={keys} toggle={toggle} columns={2} />
          </div>

          {/* Format */}
          <div style={{ borderTop: `1px solid ${hf.borderS}`, paddingTop: 14 }}>
            <SectionLabel>FORMAT</SectionLabel>
            <FormatPicker format={format} setFormat={setFormat} />
          </div>

          {err && <ErrBox>{err}</ErrBox>}
        </div>
      </ModalShell>
    </Overlay>
  );
}

// ── Single-student export (profile) ───────────────────────────────────────────
// Deliberately plain/classic: a field checklist + format + Export. No frills.
export function ExportStudentModal({ student, onClose, fields = STUDENT_EXPORT_FIELDS }) {
  const { school } = useAuth();
  const { keys, toggle, setAll, selectedFields, allKeys } = useFieldSelection(fields);
  const [format, setFormat] = useState('csv');
  const [err, setErr] = useState('');

  const run = () => {
    setErr('');
    if (selectedFields.length === 0) { setErr('Pick at least one field to export.'); return; }
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const safeName = (student.name || 'student').replace(/[^\w-]+/g, '_');
      if (format === 'csv') {
        downloadCSV(`${safeName}_${stamp}`, [student], selectedFields);
      } else {
        const title = `${student.name || 'Student'}${student.admission_no ? ` · ${student.admission_no}` : ''}`;
        exportPDF(title, `${school?.name || 'School'} · Generated ${new Date().toLocaleString()}`, [student], selectedFields);
      }
      onClose?.();
    } catch (e) {
      setErr(e.message || 'Export failed.');
    }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalShell
        title="Export student"
        subtitle={student?.name || ''}
        width={460}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={run}>Export</Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <SectionLabel right={
              <button onClick={() => setAll(selectedFields.length !== allKeys)} className="hf-btn" style={{ ...hfText.small, fontSize: 12, color: hf.primary, background: 'none', border: 'none', cursor: 'pointer', fontFamily: hfFonts.ui }}>
                {selectedFields.length === allKeys ? 'Clear all' : 'Select all'}
              </button>
            }>FIELDS</SectionLabel>
            <FieldChecklist fields={fields} keys={keys} toggle={toggle} columns={1} />
          </div>
          <div style={{ borderTop: `1px solid ${hf.borderS}`, paddingTop: 12 }}>
            <SectionLabel>FORMAT</SectionLabel>
            <FormatPicker format={format} setFormat={setFormat} />
          </div>
          {err && <ErrBox>{err}</ErrBox>}
        </div>
      </ModalShell>
    </Overlay>
  );
}
