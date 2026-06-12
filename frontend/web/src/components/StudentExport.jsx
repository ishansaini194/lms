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

// ── file delivery (cross-device) ───────────────────────────────────────────────
// Phones can't reliably take an <a download> blob (iOS Safari opens it as a page
// instead of saving). The Web Share API (Level 2, with files) is the native way
// to save/share a file on mobile — it opens the system sheet (Save to Files,
// share to WhatsApp/Drive, etc.). Desktop browsers fall back to a normal download.
// Returns true on success, false if the user cancelled the share sheet.
async function deliverFile(filename, blob, title) {
  const file = new File([blob], filename, { type: blob.type });
  // Mobile: native share/save sheet. Guarded by canShare({files}) so we only try
  // it where file sharing is actually supported (and the context is secure).
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // user dismissed the sheet
      // Anything else (e.g. share not allowed) → fall through to download.
    }
  }
  // Desktop / unsupported: classic anchor download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

// ── generators ────────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCSV(filename, rows, fields, title) {
  const header = fields.map((f) => csvCell(f.label)).join(',');
  const body = rows.map((r) => fields.map((f) => csvCell(f.get(r))).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + header + '\r\n' + body], { type: 'text/csv;charset=utf-8' }); // BOM → Excel reads UTF-8
  return deliverFile(filename.endsWith('.csv') ? filename : `${filename}.csv`, blob, title);
}

// Real PDF (jsPDF + autotable) → a proper file that saves/shares on every device,
// unlike the old print-dialog approach which mobile browsers don't support.
async function exportPDF(filename, title, subtitle, rows, fields) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const landscape = fields.length > 5;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(subtitle, 40, 57);
  autoTable(doc, {
    startY: 72,
    head: [fields.map((f) => f.label)],
    body: rows.map((r) => fields.map((f) => { const v = f.get(r); return v == null ? '' : String(v); })),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [247, 247, 247] },
    margin: { left: 40, right: 40 },
  });
  const blob = doc.output('blob');
  return deliverFile(filename.endsWith('.pdf') ? filename : `${filename}.pdf`, blob, title);
}

// Single-student PDF as a vertical, black-and-white form (one label/value per
// row) rather than a wide table. Used by the profile export so a printed page
// reads like a registration sheet. No colours, no fills — plain B&W.
async function exportStudentFormPDF(filename, title, subtitle, student, fields) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const labelW = 150;              // left column for field labels
  const valueX = margin + labelW;
  const valueW = pageW - margin - valueX;
  let y = margin;

  doc.setTextColor(0);

  // Empty photo box, top-right — for a passport photo to be pasted/printed.
  const photoW = 96, photoH = 120;
  const photoX = pageW - margin - photoW;
  const photoY = margin;
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.rect(photoX, photoY, photoW, photoH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('Photo', photoX + photoW / 2, photoY + photoH / 2, { align: 'center' });
  doc.setTextColor(0);

  // Header (kept left of the photo box).
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, margin, y + 4);
  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(subtitle, margin, y);
  y += 16;
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.line(margin, y, photoX - 16, y);
  // Field rows start below the photo box so they don't run under it.
  y = Math.max(y + 18, photoY + photoH + 18);

  // One row per field: bold label, wrapped value, thin separator.
  for (const f of fields) {
    const raw = f.get(student);
    const value = raw == null || raw === '' ? '—' : String(raw);
    const valueLines = doc.splitTextToSize(value, valueW);
    const rowH = Math.max(20, valueLines.length * 13 + 7);

    // Page break before drawing a row that wouldn't fit.
    if (y + rowH > pageH - margin) {
      doc.addPage();
      y = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(f.label, margin, y + 11);
    doc.setFont('helvetica', 'normal');
    doc.text(valueLines, valueX, y + 11);

    y += rowH;
    doc.setDrawColor(210);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
  }

  const blob = doc.output('blob');
  return deliverFile(filename.endsWith('.pdf') ? filename : `${filename}.pdf`, blob, title);
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
    {[{ k: 'pdf', l: 'PDF (.pdf)' }, { k: 'csv', l: 'CSV (.csv)' }].map((o) => (
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
//   initialClassIds — pre-select only these class-years (e.g. the class the user
//     opened the export from). Omit/empty → defaults to every class selected.
export function ExportStudentsModal({
  classOptions = [], onClose,
  fetchStudents = fetchClassStudents,
  fields = STUDENT_EXPORT_FIELDS,
  showInactiveToggle = true,
  initialClassIds = null,
}) {
  const { school } = useAuth();
  const classes = classOptions.filter((o) => o.value !== '' && o.value != null);

  const [picked, setPicked] = useState(() => {
    const valid = new Set(classes.map((c) => String(c.value)));
    // Pre-select the opened class(es) when given (filtered to ones we actually
    // have); otherwise fall back to selecting every class.
    if (Array.isArray(initialClassIds) && initialClassIds.length > 0) {
      const wanted = initialClassIds.map(String).filter((id) => valid.has(id));
      if (wanted.length > 0) return new Set(wanted);
    }
    return valid;
  });
  const [includeInactive, setIncludeInactive] = useState(false);
  const [format, setFormat] = useState('pdf');
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
      const subtitle = `${rows.length} student(s) · Generated ${new Date().toLocaleString()}`;
      const ok = format === 'csv'
        ? await exportCSV(`students_${stamp}`, rows, selectedFields, title)
        : await exportPDF(`students_${stamp}`, title, subtitle, rows, selectedFields);
      if (ok) onClose?.();
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

// One-click print: the black-and-white student form PDF with ALL fields, no
// modal. Used by the profile "Print" button. `school` comes from useAuth().
export async function printStudentForm(student, school, fields = STUDENT_EXPORT_FIELDS) {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = (student?.name || 'student').replace(/[^\w-]+/g, '_');
  const title = `${student?.name || 'Student'}${student?.admission_no ? ` · ${student.admission_no}` : ''}`;
  const subtitle = `${school?.name || 'School'}`;
  return exportStudentFormPDF(`${safeName}_${stamp}`, title, subtitle, student, fields);
}

// ── Single-student export (profile) ───────────────────────────────────────────
// Deliberately plain/classic: a field checklist + format + Export. No frills.
export function ExportStudentModal({ student, onClose, fields = STUDENT_EXPORT_FIELDS }) {
  const { school } = useAuth();
  const { keys, toggle, setAll, selectedFields, allKeys } = useFieldSelection(fields);
  const [format, setFormat] = useState('pdf');
  const [err, setErr] = useState('');

  const [busy, setBusy] = useState(false);

  const run = async () => {
    setErr('');
    if (selectedFields.length === 0) { setErr('Pick at least one field to export.'); return; }
    setBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const safeName = (student.name || 'student').replace(/[^\w-]+/g, '_');
      const title = `${student.name || 'Student'}${student.admission_no ? ` · ${student.admission_no}` : ''}`;
      const subtitle = `${school?.name || 'School'}`;
      const ok = format === 'csv'
        ? await exportCSV(`${safeName}_${stamp}`, [student], selectedFields, title)
        : await exportStudentFormPDF(`${safeName}_${stamp}`, title, subtitle, student, selectedFields);
      if (ok) onClose?.();
    } catch (e) {
      setErr(e.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalShell
        title="Export student"
        subtitle={student?.name || ''}
        width={460}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={run} disabled={busy}>{busy ? 'Preparing…' : 'Export'}</Btn>
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
