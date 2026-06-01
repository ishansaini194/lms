// PORTED FROM hi-fi mock — faithful reproduction, static presentational screens.
// Only transformation: import shared symbols instead of reading window globals,
// and `export` the screen components instead of Object.assign(window, ...).
import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import {
  Card, Btn, Pill, Chip, Avatar, SubjectIcon, SectionHead, Stat, Sparkbar,
  ModalShell, StateFrame, FInput, FSelect, FTextarea, SearchableSelect,
} from '@/components/ui/primitives';
import {
  AdminChrome, AdminTopBar, Tabs, Segmented, ClassChip,
  FieldLabel, TextInput, TextArea,
} from '@/components/admin/AdminChrome';
import {
  feeTypes, boards, paymentModes,
} from '@/mock/data';

const Row2 = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
);

// Top-level so it isn't recreated on every render (which would steal input focus).
const Group = ({ title, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ ...hfText.micro, fontSize: 10, marginBottom: 10 }}>{title}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
  </div>
);

const StudentFormModal = ({ onClose, onSaved, initial }) => {
  const isEdit = !!initial;
  const [f, setF] = useState({
    name: '', admission_no: '', epunjab_id: '', gender: '',
    dob: '', phone: '', email: '', aadhar_no: '',
    caste: '', address: '', class_year_id: '',
    father_name: '', father_contact: '', father_aadhar: '',
    mother_name: '', mother_contact: '', mother_aadhar: '',
    previous_school: '',
    ...(initial || {}),
  });
  const set = (k) => (v) => setF(prev => ({ ...prev, [k]: v }));

  const [classYears, setClassYears] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);

  // Load class-years for the enrollment dropdown.
  useEffect(() => {
    apiFetch('/api/class-years')
      .then((data) => setClassYears(Array.isArray(data) ? data : []))
      .catch(() => setClassYears([]));
  }, []);

  const cyLabel = (cy) => {
    const cls = cy.class ? `${cy.class.name}${cy.class.section ? '-' + cy.class.section : ''}` : `Class ${cy.class_id}`;
    const yr = cy.academic_year ? cy.academic_year.year_label : '';
    return `${cls}${yr ? ' · ' + yr : ''}`;
  };

  const handleSave = async () => {
    setErr('');
    if (isEdit) {
      // Edit: PUT mutable fields. admission_no and enrollment (class_year) are immutable here.
      if (!f.name || !f.phone) { setErr('Name and phone are required.'); return; }
      setSaving(true);
      try {
        const body = { name: f.name, phone: f.phone };
        if (f.gender) body.gender = f.gender;
        if (f.dob) body.dob = new Date(f.dob).toISOString();
        if (f.aadhar_no) body.aadhar_no = f.aadhar_no;
        if (f.father_name) body.father_name = f.father_name;
        if (f.father_contact) body.father_contact = f.father_contact;
        if (f.mother_name) body.mother_name = f.mother_name;
        if (f.mother_contact) body.mother_contact = f.mother_contact;
        if (f.caste) body.caste = f.caste;
        if (f.email) body.email = f.email;
        if (f.address) body.address = f.address;
        if (f.epunjab_id) body.epunjab_id = f.epunjab_id;
        await apiFetch(`/api/students/${initial.id}`, { method: 'PUT', body });
        onSaved?.();
      } catch (e) {
        setErr(e.message);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!f.name || !f.admission_no || !f.phone) {
      setErr('Name, admission no., and phone are required.'); return;
    }
    if (!f.class_year_id) {
      setErr('Please select a class to enroll the student in.'); return;
    }
    setSaving(true);
    try {
      // Map to the handler's exact JSON tags.
      const body = {
        name: f.name,
        admission_no: f.admission_no,
        phone: f.phone,
        class_year_id: Number(f.class_year_id),
      };
      if (f.epunjab_id) body.epunjab_id = f.epunjab_id;
      if (f.gender) body.gender = f.gender;
      if (f.dob) body.dob = new Date(f.dob).toISOString();
      if (f.aadhar_no) body.aadhar_no = f.aadhar_no;
      if (f.father_name) body.father_name = f.father_name;
      if (f.father_contact) body.father_contact = f.father_contact;
      if (f.mother_name) body.mother_name = f.mother_name;
      if (f.mother_contact) body.mother_contact = f.mother_contact;
      if (f.caste) body.caste = f.caste;
      if (f.email) body.email = f.email;
      if (f.address) body.address = f.address;

      const res = await apiFetch('/api/students', { method: 'POST', body });
      setCreated(res.login_info || { username: f.admission_no });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Success view: show login credentials once, then refresh list on close ──
  if (created) {
    return (
      <FormModal onClose={() => onSaved?.()}>
        <ModalShell title="Student created" subtitle="Share these login details"
          width={460}
          footer={<Btn variant="primary" size="md" onClick={() => onSaved?.()}>Done</Btn>}>
          <div style={{ padding: '16px 18px', borderRadius: 10, background: hf.primarySoft, border: `1px solid ${hf.primaryEdge}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ ...hfText.small, color: hf.muted }}>Username</span>
              <span style={{ ...hfText.small, fontWeight: 700, ...hfText.num }}>{created.username}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ ...hfText.small, color: hf.muted }}>Default password</span>
              <span style={{ ...hfText.small, fontWeight: 700, ...hfText.num }}>{created.password || '—'}</span>
            </div>
          </div>
          <div style={{ ...hfText.small, color: hf.muted, marginTop: 12 }}>The student changes this on first login.</div>
        </ModalShell>
      </FormModal>
    );
  }

  return (
    <FormModal onClose={onClose}>
      <ModalShell
        title={isEdit ? 'Edit student' : 'Add student'}
        subtitle={isEdit ? 'Update student record' : 'Creates a student record, login account, and enrollment'}
        width={620}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create student')}
          </Btn>
        </>}
      >
        <Group title="Basic info">
          <div>
            <FieldLabel required>Full name</FieldLabel>
            <FInput value={f.name} onChange={set('name')} placeholder="e.g. Arjun Verma" />
          </div>
          <Row2>
            <div>
              <FieldLabel required>Admission no.</FieldLabel>
              <FInput value={f.admission_no} onChange={set('admission_no')} placeholder="KRB-2025-…" disabled={isEdit} />
            </div>
            <div>
              <FieldLabel required>Phone</FieldLabel>
              <FInput value={f.phone} onChange={set('phone')} placeholder="+91 …" />
            </div>
          </Row2>
          <div>
            <FieldLabel required>{isEdit ? 'Enrolled class' : 'Enroll into class'}</FieldLabel>
            <FSelect value={f.class_year_id} onChange={set('class_year_id')}
              disabled={isEdit}
              options={[{ value: '', label: isEdit ? 'Enrollment is fixed' : 'Select class…' },
              ...classYears.map(cy => ({ value: String(cy.id), label: cyLabel(cy) }))]} />
          </div>
          <Row2>
            <div>
              <FieldLabel>Gender</FieldLabel>
              <FSelect value={f.gender} onChange={set('gender')} options={[
                { value: '', label: 'Select…' },
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Other', label: 'Other' },
              ]} />
            </div>
            <div>
              <FieldLabel>Date of birth</FieldLabel>
              <FInput type="date" value={f.dob} onChange={set('dob')} />
            </div>
          </Row2>
          <Row2>
            <div><FieldLabel>Email</FieldLabel><FInput type="email" value={f.email} onChange={set('email')} placeholder="optional" /></div>
            <div><FieldLabel>Caste</FieldLabel><FInput value={f.caste} onChange={set('caste')} placeholder="e.g. General" /></div>
          </Row2>
          <div><FieldLabel>Address</FieldLabel><FInput value={f.address} onChange={set('address')} placeholder="House, area, city, PIN" /></div>
        </Group>

        <Group title="ID details">
          <Row2>
            <div><FieldLabel>ePunjab ID</FieldLabel><FInput value={f.epunjab_id} onChange={set('epunjab_id')} placeholder="optional" /></div>
            <div><FieldLabel>Aadhar</FieldLabel><FInput value={f.aadhar_no} onChange={set('aadhar_no')} placeholder="12-digit" /></div>
          </Row2>
        </Group>

        <Group title="Father">
          <Row2>
            <div><FieldLabel>Name</FieldLabel><FInput value={f.father_name} onChange={set('father_name')} placeholder="optional" /></div>
            <div><FieldLabel>Contact</FieldLabel><FInput value={f.father_contact} onChange={set('father_contact')} placeholder="+91 …" /></div>
          </Row2>
        </Group>

        <Group title="Mother">
          <Row2>
            <div><FieldLabel>Name</FieldLabel><FInput value={f.mother_name} onChange={set('mother_name')} placeholder="optional" /></div>
            <div><FieldLabel>Contact</FieldLabel><FInput value={f.mother_contact} onChange={set('mother_contact')} placeholder="+91 …" /></div>
          </Row2>
        </Group>

        {err && (
          <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
        )}
      </ModalShell>
    </FormModal>
  );
};

// ─── Shared modal wrapper (backdrop + click-away) ─────────────────────────
const FormModal = ({ onClose, children }) => (
  <div onClick={onClose} style={{ position: 'absolute', inset: 0 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
      {children}
    </div>
  </div>
);

// ─── Reusable styled confirmation modal (used for deletes/deactivations) ──
const ConfirmModal = ({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel, busy, error }) => (
  <div onClick={onCancel} style={{ position: 'absolute', inset: 0 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
      <ModalShell
        title={title}
        width={440}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onCancel} disabled={busy}>Cancel</Btn>
          <Btn variant={danger ? 'accent' : 'primary'} size="md" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Btn>
        </>}
      >
        <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.6 }}>{message}</div>
        {error && (
          <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px', marginTop: 12 }}>{error}</div>
        )}
      </ModalShell>
    </div>
  </div>
);

// ─── A5 modal · Add / Edit teacher (real form) ────────────────────────────
const TeacherFormModal = ({ onClose, onSaved, initial }) => {
  const isEdit = !!initial;
  const [f, setF] = useState({
    name: '', phone: '', email: '', subject: '', employee_id: '',
    qualification: '', username: '', is_active: true, ...(initial || {}),
  });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));


  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null); // login_info after successful create

  const handleSave = async () => {
    setErr('');
    if (isEdit) {
      // Edit: PUT only the mutable fields; employee_id and username are immutable.
      if (!f.name) { setErr('Name is required.'); return; }
      setSaving(true);
      try {
        await apiFetch(`/api/teachers/${initial.id}`, {
          method: 'PUT',
          body: {
            name: f.name,
            phone: f.phone,
            email: f.email,
            subject: f.subject,
            qualification: f.qualification,
          },
        });
        onSaved?.();
      } catch (e) {
        setErr(e.message);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!f.name || !f.employee_id || !f.username) {
      setErr('Name, employee ID, and username are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/teachers', {
        method: 'POST',
        body: {
          name: f.name,
          employee_id: f.employee_id,
          username: f.username,
          phone: f.phone,
          email: f.email,
          subject: f.subject,
          qualification: f.qualification,
        },
      });
      setCreated(res.login_info || { username: f.username });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Success view: show login credentials once, then refresh list on close ──
  if (created) {
    return (
      <FormModal onClose={() => { onSaved?.(); }}>
        <ModalShell
          title="Teacher created"
          subtitle="Share these login details with the teacher"
          width={460}
          footer={<Btn variant="primary" size="md" onClick={() => { onSaved?.(); }}>Done</Btn>}
        >
          <div style={{
            padding: '16px 18px', borderRadius: 10,
            background: hf.primarySoft, border: `1px solid ${hf.primaryEdge}`,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ ...hfText.small, color: hf.muted }}>Username</span>
              <span style={{ ...hfText.small, fontWeight: 700, ...hfText.num }}>{created.username}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ ...hfText.small, color: hf.muted }}>Default password</span>
              <span style={{ ...hfText.small, fontWeight: 700, ...hfText.num }}>{created.password || '—'}</span>
            </div>
          </div>
          <div style={{ ...hfText.small, color: hf.muted, marginTop: 12, lineHeight: 1.5 }}>
            The teacher should change this password on first login.
          </div>
        </ModalShell>
      </FormModal>
    );
  }

  return (
    <FormModal onClose={onClose}>
      <ModalShell
        title={isEdit ? 'Edit teacher' : 'Add teacher'}
        subtitle={isEdit ? 'Update teacher record' : 'Creates a user account with the credentials below'}
        width={520}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create teacher')}
          </Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel required>Full name</FieldLabel>
            <FInput value={f.name} onChange={set('name')} placeholder="e.g. Asha Arora" />
          </div>
          <Row2>
            <div>
              <FieldLabel required>Phone</FieldLabel>
              <FInput value={f.phone} onChange={set('phone')} placeholder="+91 …" />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <FInput type="email" value={f.email} onChange={set('email')} placeholder="optional" />
            </div>
          </Row2>
          <Row2>
            <div>
              <FieldLabel required>Subject</FieldLabel>
              <FInput value={f.subject} onChange={set('subject')} placeholder="e.g. English" />
            </div>
            {isEdit ? (
              <div>
                <FieldLabel>Qualification</FieldLabel>
                <FInput value={f.qualification} onChange={set('qualification')} placeholder="e.g. M.A. English, B.Ed" />
              </div>
            ) : (
              <div>
                <FieldLabel required>Employee ID</FieldLabel>
                <FInput value={f.employee_id} onChange={set('employee_id')} placeholder="EMP-009" />
              </div>
            )}
          </Row2>
          {!isEdit && (
            <Row2>
              <div>
                <FieldLabel required>Username</FieldLabel>
                <FInput value={f.username} onChange={set('username')} placeholder="login username" />
              </div>
              <div>
                <FieldLabel>Qualification</FieldLabel>
                <FInput value={f.qualification} onChange={set('qualification')} placeholder="e.g. M.A. English, B.Ed" />
              </div>
            </Row2>
          )}

          {err && (
            <div style={{
              ...hfText.small, color: hf.accent,
              background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`,
              borderRadius: 9, padding: '9px 12px',
            }}>{err}</div>
          )}

          {!isEdit && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: hf.primarySoft, border: `1px solid ${hf.primaryEdge}`,
              ...hfText.small, color: hf.ink2, lineHeight: 1.55,
            }}>
              A login account is created automatically · default password is set on creation · the teacher changes it on first login.
            </div>
          )}
        </div>
      </ModalShell>
    </FormModal>
  );
};

// ─── A2 modal · Add / Edit class (real form) ──────────────────────────────
const ClassFormModal = ({ onClose, onSaved, initial }) => {
  const isEdit = !!initial;
  const [f, setF] = useState({
    name: '', section: '', board: '', ...(initial || {}),
  });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setErr('');
    if (!f.name) { setErr('Class name is required.'); return; }
    setSaving(true);
    try {
      // ClassRequest only accepts name, section, board.
      const body = { name: f.name };
      if (f.section) body.section = f.section;
      if (f.board) body.board = f.board;
      if (isEdit) {
        await apiFetch(`/api/classes/${initial.id}`, { method: 'PUT', body });
      } else {
        await apiFetch('/api/classes', { method: 'POST', body });
      }
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal onClose={onClose}>
      <ModalShell
        title={isEdit ? 'Edit class' : 'Add class'}
        subtitle={isEdit ? 'Update class details' : 'Creates a class; fees and teacher are assigned per academic year'}
        width={520}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create class')}
          </Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row2>
            <div>
              <FieldLabel required>Class name</FieldLabel>
              <FInput value={f.name} onChange={set('name')} placeholder="e.g. 5 or Nursery" />
            </div>
            <div>
              <FieldLabel>Section</FieldLabel>
              <FInput value={f.section} onChange={set('section')} placeholder="e.g. A" />
            </div>
          </Row2>
          <div>
            <FieldLabel>Board</FieldLabel>
            <FSelect value={f.board} onChange={set('board')} options={boards} />
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: hf.surface2, border: `1px solid ${hf.borderS}`,
            ...hfText.small, color: hf.muted, lineHeight: 1.5,
          }}>
            Tuition, transport fees, and the class teacher are set per academic year on the class-year record, not here.
          </div>
          {err && (
            <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
          )}
        </div>
      </ModalShell>
    </FormModal>
  );
};

// ─── A2 modal · Set up a class for the current academic year ──────────────
// Creates a class_year (fees + optional teacher) for a class that has none yet.
const ClassYearSetupModal = ({ onClose, onSaved, classItem, academicYearId, yearLabel }) => {
  const [f, setF] = useState({ tuition_fee: '', transport_fee: '', class_teacher_id: null });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  const [teachers, setTeachers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/api/teachers')
      .then((data) => setTeachers(Array.isArray(data) ? data : []))
      .catch(() => setTeachers([]));
  }, []);

  const teacherOptions = teachers.map(t => ({ value: t.id, label: t.name, sublabel: t.subject }));
  const title = `${classItem.name}${classItem.section ? '-' + classItem.section : ''}`;

  const handleSave = async () => {
    setErr('');
    if (f.tuition_fee.trim() === '' || isNaN(Number(f.tuition_fee))) { setErr('Enter a valid tuition fee.'); return; }
    if (f.transport_fee.trim() === '' || isNaN(Number(f.transport_fee))) { setErr('Enter a valid transport fee.'); return; }
    if (!academicYearId) { setErr('No current academic year is set. Set one in Settings first.'); return; }
    setSaving(true);
    try {
      const body = {
        class_id: classItem.id,
        academic_year_id: academicYearId,
        tuition_fee: String(f.tuition_fee).trim(),
        transport_fee: String(f.transport_fee).trim(),
      };
      if (f.class_teacher_id) body.class_teacher_id = f.class_teacher_id;
      await apiFetch('/api/class-years', { method: 'POST', body });
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal onClose={onClose}>
      <ModalShell
        title={`Set up ${title}`}
        subtitle={`Fees and class teacher for ${yearLabel || 'the current year'}`}
        width={480}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Set up class'}
          </Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row2>
            <div>
              <FieldLabel required>Tuition / mo</FieldLabel>
              <FInput value={f.tuition_fee} onChange={set('tuition_fee')} placeholder="e.g. 2500" />
            </div>
            <div>
              <FieldLabel required>Transport / mo</FieldLabel>
              <FInput value={f.transport_fee} onChange={set('transport_fee')} placeholder="e.g. 500" />
            </div>
          </Row2>
          <div>
            <FieldLabel>Class teacher</FieldLabel>
            <SearchableSelect
              value={f.class_teacher_id}
              onChange={(v) => set('class_teacher_id')(v)}
              options={teacherOptions}
              placeholder="Select class teacher (optional)…"
            />
          </div>
          {err && (
            <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
          )}
        </div>
      </ModalShell>
    </FormModal>
  );
};

// ─── A2 modal · Assign / change a class teacher for an existing class_year ─
const AssignTeacherModal = ({ onClose, onSaved, classItem }) => {
  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState(classItem.class_teacher_id ?? null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/api/teachers')
      .then((data) => setTeachers(Array.isArray(data) ? data : []))
      .catch(() => setTeachers([]));
  }, []);

  const teacherOptions = teachers.map(t => ({ value: t.id, label: t.name, sublabel: t.subject }));
  const title = `${classItem.name}${classItem.section ? '-' + classItem.section : ''}`;

  const handleSave = async () => {
    setErr('');
    setSaving(true);
    try {
      // PUT class-year: send the teacher id, or 0 to clear (per UpdateClassYearRequest).
      await apiFetch(`/api/class-years/${classItem.class_year_id}`, {
        method: 'PUT',
        body: { class_teacher_id: teacherId || 0 },
      });
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal onClose={onClose}>
      <ModalShell
        title={`Class teacher · ${title}`}
        subtitle="Assign or change the class teacher for this year"
        width={460}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel>Class teacher</FieldLabel>
            <SearchableSelect
              value={teacherId}
              onChange={(v) => setTeacherId(v)}
              options={teacherOptions}
              placeholder="Select a teacher…"
              allowClear
            />
          </div>
          {err && (
            <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
          )}
        </div>
      </ModalShell>
    </FormModal>
  );
};

// ─── A9 modal · Create / Edit academic year (real form) ───────────────────
const AcademicYearFormModal = ({ onClose, onSaved, initial }) => {
  const isEdit = !!initial;
  const [f, setF] = useState({
    year_label: '', start_date: '', end_date: '', is_current: false,
    ...(initial || {}),
    // Normalise incoming ISO timestamps to yyyy-mm-dd for the date inputs.
    ...(initial ? {
      start_date: initial.start_date ? String(initial.start_date).slice(0, 10) : '',
      end_date: initial.end_date ? String(initial.end_date).slice(0, 10) : '',
    } : {}),
  });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setErr('');
    if (!f.year_label) { setErr('Year label is required.'); return; }
    if (!f.start_date || !f.end_date) { setErr('Start and end dates are required.'); return; }
    setSaving(true);
    try {
      const body = {
        year_label: f.year_label,
        start_date: new Date(f.start_date).toISOString(),
        end_date: new Date(f.end_date).toISOString(),
        is_current: !!f.is_current,
      };
      if (isEdit) {
        await apiFetch(`/api/academic-years/${initial.id}`, { method: 'PUT', body });
      } else {
        await apiFetch('/api/academic-years', { method: 'POST', body });
      }
      onSaved?.();
    } catch (e) {
      setErr(e.message);   // e.g. "end_date must be after start_date"
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal onClose={onClose}>
      <ModalShell
        title={isEdit ? 'Edit academic year' : 'Create academic year'}
        subtitle={isEdit ? 'Update year dates' : 'Add a new academic session'}
        width={460}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create year')}
          </Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel required hint="e.g. 2026–27">Year label</FieldLabel>
            <FInput value={f.year_label} onChange={set('year_label')} placeholder="2026–27" />
          </div>
          <Row2>
            <div>
              <FieldLabel required>Start date</FieldLabel>
              <FInput type="date" value={f.start_date} onChange={set('start_date')} />
            </div>
            <div>
              <FieldLabel required>End date</FieldLabel>
              <FInput type="date" value={f.end_date} onChange={set('end_date')} />
            </div>
          </Row2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 2px' }}>
            <span onClick={() => set('is_current')(!f.is_current)} style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
              background: f.is_current ? hf.primary : hf.surface,
              border: `1.5px solid ${f.is_current ? hf.primary : hf.faint}`,
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{f.is_current && I.check}</span>
            <span onClick={() => set('is_current')(!f.is_current)} style={{ ...hfText.small, color: hf.ink2 }}>
              Set as the current academic year
            </span>
          </label>
          {err && (
            <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
          )}
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: hf.surface2, border: `1px solid ${hf.borderS}`,
            ...hfText.small, color: hf.muted, lineHeight: 1.5,
          }}>
            Setting this as current unsets the others. Academic years are never deleted — only edited.
          </div>
        </div>
      </ModalShell>
    </FormModal>
  );
};

// ─── A5 modal · Add teacher ───────────────────────────────────────────────
const HA5Modal = ({ onClose }) => (
  <div onClick={onClose} style={{ position: 'absolute', inset: 0 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
      <ModalShell
        title="Add teacher"
        subtitle="Creates a user account with auto-generated credentials"
        width={520}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={onClose}>Create teacher</Btn>
        </>}
      >
        <div>
          <FieldLabel required>Full name</FieldLabel>
          <TextInput value="Asha Arora" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <FieldLabel required>Phone</FieldLabel>
            <TextInput value="+91 97xx-7700" />
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <TextInput value="" placeholder="asha.arora@gmail.com" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <FieldLabel required>Subject</FieldLabel>
            <div style={{
              padding: '9px 12px', background: hf.surface,
              border: `1px solid ${hf.border}`, borderRadius: 9,
              fontSize: 13, color: hf.ink, fontFamily: hfFonts.ui,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>English</span>
              <span style={{ color: hf.muted, display: 'inline-flex' }}>{I.arrDown}</span>
            </div>
          </div>
          <div>
            <FieldLabel required hint="unique">Employee ID</FieldLabel>
            <TextInput value="EMP-007" />
          </div>
        </div>

        <div>
          <FieldLabel>Qualification</FieldLabel>
          <TextInput value="M.A. English, B.Ed" />
        </div>

        {/* Toggle */}
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: hf.surface2, border: `1px solid ${hf.borderS}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 38, height: 22, borderRadius: 999,
            background: hf.primary, padding: 2,
            display: 'flex', alignItems: 'center',
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              marginLeft: 'auto',
              boxShadow: '0 1px 2px rgba(20,24,32,0.15)',
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...hfText.small, fontWeight: 650 }}>Active</div>
            <div style={{ fontSize: 11.5, color: hf.muted }}>Show this teacher in lists and assignments</div>
          </div>
        </div>

        {/* Auto-account callout */}
        <div style={{
          padding: '14px 16px', borderRadius: 11,
          background: hf.primarySoft, border: `1px solid ${hf.primaryEdge}`,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: hf.surface, border: `1px solid ${hf.primaryEdge}`,
            color: hf.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{I.sparkle}</div>
          <div>
            <div style={{ ...hfText.small, fontWeight: 650, color: hf.primary }}>An account will be created automatically</div>
            <div style={{ ...hfText.small, color: hf.ink2, marginTop: 6, lineHeight: 1.55 }}>
              Role <b>teacher</b> · username = phone or employee ID · default password = phone number.
              You'll see the one-time credentials once they're set.
            </div>
          </div>
        </div>
      </ModalShell>
    </div>
  </div>
);

// ─── A6 modal · Compose notice ────────────────────────────────────────────
const HA6Modal = ({ onClose, onSaved, initial }) => {
  const isEdit = !!initial;
  const [f, setF] = useState({ title: initial?.title || '', body: initial?.body || '' });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  const [wholeSchool, setWholeSchool] = useState(initial ? !!initial.target_all_school : true);
  const [selectedIds, setSelectedIds] = useState(initial?.class_year_ids || []);
  const [classYears, setClassYears] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/api/class-years')
      .then((data) => setClassYears(Array.isArray(data) ? data : []))
      .catch(() => setClassYears([]));
  }, []);

  const cyLabel = (cy) => {
    const cls = cy.class ? `${cy.class.name}${cy.class.section ? '-' + cy.class.section : ''}` : `Class ${cy.class_id}`;
    const yr = cy.academic_year ? cy.academic_year.year_label : '';
    return `${cls}${yr ? ' · ' + yr : ''}`;
  };

  const toggleId = (id) => setSelectedIds(ids =>
    ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  const handleSave = async () => {
    setErr('');
    if (!f.title.trim()) { setErr('Title is required.'); return; }
    if (!f.body.trim()) { setErr('Body is required.'); return; }
    if (!wholeSchool && selectedIds.length === 0) {
      setErr('Select at least one class or post to whole school.'); return;
    }
    setSaving(true);
    try {
      // Always send target_all_school + class_year_ids so edits to targeting
      // (whole-school ↔ class-specific, in either direction) apply correctly.
      const body = {
        title: f.title.trim(),
        body: f.body.trim(),
        target_all_school: wholeSchool,
        class_year_ids: wholeSchool ? [] : selectedIds,
      };
      if (isEdit) {
        await apiFetch(`/api/notices/${initial.id}`, { method: 'PUT', body });
      } else {
        await apiFetch('/api/notices', { method: 'POST', body });
      }
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal onClose={onClose}>
      <ModalShell
        title={isEdit ? 'Edit notice' : 'New notice'}
        subtitle="Post to the whole school or specific classes"
        width={540}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Post notice')}
          </Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel required>Title</FieldLabel>
            <FInput value={f.title} onChange={set('title')} placeholder="e.g. Parent-teacher meeting on Saturday" />
          </div>

          <div>
            <FieldLabel required>Body</FieldLabel>
            <FTextarea value={f.body} onChange={set('body')} rows={5}
              placeholder="Write the notice details parents and students will see…" />
          </div>

          <div>
            <FieldLabel required>Audience</FieldLabel>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 2px' }}>
              <span onClick={() => setWholeSchool(v => !v)} style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                background: wholeSchool ? hf.primary : hf.surface,
                border: `1.5px solid ${wholeSchool ? hf.primary : hf.faint}`,
                color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{wholeSchool && I.check}</span>
              <span onClick={() => setWholeSchool(v => !v)} style={{ ...hfText.small, color: hf.ink2 }}>
                Post to whole school
              </span>
            </label>

            {!wholeSchool && (
              <div style={{ marginTop: 8 }}>
                <div style={{ ...hfText.micro, fontSize: 10, marginBottom: 6 }}>Select classes ({selectedIds.length} selected)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {classYears.length === 0 && (
                    <div style={{ ...hfText.small, color: hf.muted, padding: '8px 0' }}>No class-years found.</div>
                  )}
                  {classYears.map((cy) => {
                    const sel = selectedIds.includes(cy.id);
                    return (
                      <div key={cy.id} onClick={() => toggleId(cy.id)} className="hf-row" style={{
                        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                        padding: '9px 12px', borderRadius: 9,
                        border: `1px solid ${sel ? hf.primary : hf.border}`,
                        background: sel ? hf.primarySoft : hf.surface,
                      }}>
                        <span style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          background: sel ? hf.primary : hf.surface,
                          border: `1.5px solid ${sel ? hf.primary : hf.faint}`,
                          color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}>{sel && I.check}</span>
                        <span style={{ ...hfText.small, fontWeight: sel ? 650 : 550 }}>{cyLabel(cy)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {err && (
            <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
          )}
        </div>
      </ModalShell>
    </FormModal>
  );
};

// ─── A7 modal · Create / Edit exam ────────────────────────────────────────
const HA7Modal = ({ onClose, onSaved, initial }) => {
  const isEdit = !!initial;
  const [f, setF] = useState({
    class_year_id: '', name: '', subject: '', max_marks: '', exam_date: '', teacher_id: null,
    ...(initial || {}),
    ...(initial ? {
      class_year_id: initial.class_year_id != null ? String(initial.class_year_id) : '',
      max_marks: initial.max_marks != null ? String(initial.max_marks) : '',
      exam_date: initial.exam_date ? String(initial.exam_date).slice(0, 10) : '',
      teacher_id: initial.teacher_id ?? null,
    } : {}),
  });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));

  const [classYears, setClassYears] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Class-year dropdown is only needed when creating (immutable on edit).
  useEffect(() => {
    if (isEdit) return;
    apiFetch('/api/class-years')
      .then((data) => setClassYears(Array.isArray(data) ? data : []))
      .catch(() => setClassYears([]));
  }, [isEdit]);

  // Teachers feed the searchable assignment dropdown (create + edit).
  useEffect(() => {
    apiFetch('/api/teachers')
      .then((data) => setTeachers(Array.isArray(data) ? data : []))
      .catch(() => setTeachers([]));
  }, []);
  const teacherOptions = teachers.map((t) => ({ value: t.id, label: t.name, sublabel: t.subject }));

  const cyLabel = (cy) => {
    const cls = cy.class ? `${cy.class.name}${cy.class.section ? '-' + cy.class.section : ''}` : `Class ${cy.class_id}`;
    const yr = cy.academic_year ? cy.academic_year.year_label : '';
    return `${cls}${yr ? ' · ' + yr : ''}`;
  };

  const handleSave = async () => {
    setErr('');
    if (!isEdit && !f.class_year_id) { setErr('Please select a class-year.'); return; }
    if (!f.name) { setErr('Exam name is required.'); return; }
    if (!f.subject) { setErr('Subject is required.'); return; }
    if (!f.max_marks || Number(f.max_marks) <= 0) { setErr('Max marks must be greater than zero.'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        // class_year_id is immutable on update. Send teacher_id (0 clears it).
        const body = {
          name: f.name,
          subject: f.subject,
          max_marks: Number(f.max_marks),
          teacher_id: f.teacher_id ? Number(f.teacher_id) : 0,
        };
        if (f.exam_date) body.exam_date = new Date(f.exam_date).toISOString();
        await apiFetch(`/api/exams/${initial.id}`, { method: 'PUT', body });
      } else {
        const body = {
          class_year_id: Number(f.class_year_id),
          name: f.name,
          subject: f.subject,
          max_marks: Number(f.max_marks),
        };
        if (f.teacher_id) body.teacher_id = Number(f.teacher_id);
        if (f.exam_date) body.exam_date = new Date(f.exam_date).toISOString();
        await apiFetch('/api/exams', { method: 'POST', body });
      }
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal onClose={onClose}>
      <ModalShell
        title={isEdit ? 'Edit exam' : 'Create exam'}
        subtitle={isEdit ? 'Update exam details' : 'Class teachers will see this in their marks-entry queue'}
        width={500}
        footer={<>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create exam')}
          </Btn>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel required>Class-year</FieldLabel>
            {isEdit ? (
              <FInput value={initial.class_year_label || initial.class_label || '—'} disabled />
            ) : (
              <FSelect value={f.class_year_id} onChange={set('class_year_id')}
                options={[{ value: '', label: 'Select class-year…' },
                ...classYears.map(cy => ({ value: String(cy.id), label: cyLabel(cy) }))]} />
            )}
          </div>

          <div>
            <FieldLabel>Teacher</FieldLabel>
            <SearchableSelect
              value={f.teacher_id}
              onChange={(v) => set('teacher_id')(v)}
              options={teacherOptions}
              placeholder="Assign a teacher (optional)…"
              allowClear
            />
          </div>

          <div>
            <FieldLabel required>Exam name</FieldLabel>
            <FInput value={f.name} onChange={set('name')} placeholder="e.g. Mid-Term" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.2fr', gap: 12 }}>
            <div>
              <FieldLabel required>Subject</FieldLabel>
              <FInput value={f.subject} onChange={set('subject')} placeholder="e.g. Maths" />
            </div>
            <div>
              <FieldLabel required>Max marks</FieldLabel>
              <FInput type="number" value={f.max_marks} onChange={set('max_marks')} placeholder="50" />
            </div>
            <div>
              <FieldLabel>Date</FieldLabel>
              <FInput type="date" value={f.exam_date} onChange={set('exam_date')} />
            </div>
          </div>

          {err && (
            <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
          )}

          <div style={{
            padding: '10px 12px', background: hf.surface2, borderRadius: 9,
            border: `1px solid ${hf.borderS}`,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ color: hf.muted, display: 'inline-flex', marginTop: 1 }}>{I.lock}</span>
            <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.55 }}>
              Marks entry happens on the teacher portal. As admin you'll see results read-only — every edit is audited.
            </div>
          </div>
        </div>
      </ModalShell>
    </FormModal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// UI States
// ═══════════════════════════════════════════════════════════════════════════

const ASkel = ({ w = '100%', h = 12, r = 6, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${hf.borderS}, ${hf.surface2} 50%, ${hf.borderS})`,
    backgroundSize: '200% 100%',
    animation: 'hf-skel 1.6s ease-in-out infinite',
    ...style,
  }} />
);

// State 1 · Loading skeleton (students table)
const AStLoading = () => (
  <StateFrame title="Students table · loading">
    <Card padding={0} style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <ASkel w={120} h={14} />
        <div style={{ flex: 1 }} />
        <ASkel w={80} h={28} r={9} />
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '36px 26px 1.4fr 70px 110px 90px',
        padding: '10px 18px', gap: 12, background: hf.surface2,
        borderBottom: `1px solid ${hf.borderS}`,
      }}>
        <ASkel w={14} h={8} /><div /><ASkel w={50} h={8} /><ASkel w={30} h={8} /><ASkel w={50} h={8} /><ASkel w={50} h={8} />
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '36px 26px 1.4fr 70px 110px 90px',
          padding: '12px 18px', alignItems: 'center', gap: 12,
          borderBottom: `1px solid ${hf.borderS}`,
        }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: hf.borderS }} />
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: hf.borderS }} />
          <ASkel w={`${55 + (i * 7) % 30}%`} h={11} />
          <ASkel w={30} h={11} />
          <ASkel w={90} h={11} />
          <ASkel w={60} h={18} r={9} />
        </div>
      ))}
    </Card>
  </StateFrame>
);

// State 2 · Empty teachers
const AStEmpty = () => (
  <StateFrame title="Teachers · empty state">
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', borderStyle: 'dashed' }}>
      {/* iconographic placeholder */}
      <div style={{
        width: 92, height: 92, borderRadius: 24,
        background: `linear-gradient(135deg, ${hf.primarySoft}, oklch(0.94 0.05 290))`,
        border: `1px solid ${hf.primaryEdge}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <Avatar name="Asha Arora" size={42} style={{ position: 'absolute', left: 18, top: 18, transform: 'rotate(-5deg)' }} />
        <Avatar name="Tarun Dhillon" size={42} style={{ position: 'absolute', right: 18, bottom: 18, transform: 'rotate(7deg)' }} />
      </div>
      <div>
        <div style={{ ...hfText.h1, fontSize: 22 }}>No teachers yet</div>
        <div style={{ ...hfText.body, color: hf.muted, marginTop: 6, maxWidth: 380 }}>
          Add your first teacher to get started. They'll get an in-app login automatically — username from their phone or employee ID.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn variant="outline" size="md" icon={I.download}>Import CSV</Btn>
        <Btn variant="primary" size="md">+ Add teacher</Btn>
      </div>
      <div style={{ ...hfText.small, color: hf.muted, marginTop: 8 }}>
        Same pattern for first-time empty: notices · exams · fee plans.
      </div>
    </Card>
  </StateFrame>
);

// State 3 · Error (inline)
const AStError = () => (
  <StateFrame title="Fee data · error state">
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: hf.accentSoft, borderColor: hf.accentEdge }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: hf.surface, border: `1px solid ${hf.accentEdge}`,
        color: hf.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l10 18H2z" /><line x1="12" y1="10" x2="12" y2="14" /><circle cx="12" cy="17.5" r="0.7" fill="currentColor" /></svg>
      </div>
      <div>
        <div style={{ ...hfText.h1, fontSize: 22 }}>Couldn't load fee data</div>
        <div style={{ ...hfText.body, color: hf.inkSoft, marginTop: 6, maxWidth: 400, lineHeight: 1.55 }}>
          Network error — your last actions are safe. Check your connection and try again. The page chrome stays usable so you can switch sections.
        </div>
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 6,
        background: hf.surface, border: `1px solid ${hf.accentEdge}`,
        ...hfText.num, fontSize: 10.5, color: hf.accent,
      }}>GET /fees · timed out after 10s</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="ghost" size="md">Cancel</Btn>
        <Btn variant="primary" size="md" icon={I.refresh}>Retry</Btn>
      </div>
    </Card>
  </StateFrame>
);

// State 4 · Destructive confirm — Promote 482 students
// (Rendered as a modal-style artboard)
const AStConfirm = () => (
  <ModalShell
    title="Promote all students?"
    subtitle="This action cannot be undone"
    width={540}
    accent
    footer={<>
      <Btn variant="ghost" size="md">Cancel</Btn>
      <Btn variant="accent" size="md">Yes, promote 482 students</Btn>
    </>}
  >
    {/* Headline numbers */}
    <div style={{
      padding: 16, borderRadius: 12,
      background: hf.surface, border: `1px solid ${hf.border}`,
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
    }}>
      {[
        { label: 'Students affected', value: '482' },
        { label: 'Class 8 → passed out', value: '29', color: hf.accent },
        { label: 'Becomes year', value: '2026–27' },
      ].map((s, i) => (
        <div key={i} style={{ padding: '0 14px', borderLeft: i > 0 ? `1px solid ${hf.borderS}` : 'none' }}>
          <div style={{ ...hfText.micro, fontSize: 9.5 }}>{s.label}</div>
          <div style={{ ...hfText.num, fontSize: 22, fontWeight: 700, marginTop: 4, color: s.color || hf.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</div>
        </div>
      ))}
    </div>

    {/* What happens */}
    <div>
      <div style={{ ...hfText.micro, fontSize: 10, marginBottom: 6 }}>What happens</div>
      <div style={{
        border: `1px solid ${hf.border}`, borderRadius: 11, overflow: 'hidden', background: hf.surface,
      }}>
        {[
          ['Active enrollments move up one class', 'good'],
          ['Current year enrollments stamped status = promoted', 'neutral'],
          ['Class 8 students marked passed out', 'accent'],
          ['Marks entry for AY 2025–26 is locked', 'accent'],
        ].map(([t, tone], i) => (
          <div key={i} style={{
            padding: '11px 14px',
            borderBottom: i < 3 ? `1px solid ${hf.borderS}` : 'none',
            display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: 6,
              background: tone === 'good' ? hf.goodSoft : tone === 'accent' ? hf.accentSoft : hf.surface2,
              color: tone === 'good' ? hf.good : tone === 'accent' ? hf.accent : hf.muted,
              border: `1px solid ${tone === 'good' ? 'oklch(0.86 0.04 155)' : tone === 'accent' ? hf.accentEdge : hf.borderS}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{tone === 'accent' ? I.alert : I.check}</span>
            <span style={{ ...hfText.small, color: hf.ink2 }}>{t}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Type to confirm */}
    <div>
      <FieldLabel required>Type <span style={{ ...hfText.num, fontWeight: 700, color: hf.accent, background: hf.accentSoft, padding: '1px 7px', borderRadius: 5, marginLeft: 3 }}>PROMOTE</span> to confirm</FieldLabel>
      <div style={{
        padding: '11px 14px', borderRadius: 10,
        border: `1.5px solid ${hf.accent}`, background: hf.surface,
        boxShadow: `0 0 0 3px ${hf.accentSoft}`,
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: hfFonts.mono, fontSize: 14, fontWeight: 700, color: hf.ink, letterSpacing: '0.04em',
      }}>
        PROMOTE
        <span style={{ width: 2, height: 18, background: hf.accent, animation: 'hf-caret 1s steps(2) infinite' }} />
      </div>
    </div>
  </ModalShell>
);

// State 5 · Toast + permission denied
const AStToastDenied = () => (
  <StateFrame title="Toasts + permission denied">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Success toast */}
      <div style={{
        background: hf.ink, color: '#fff',
        borderRadius: 12, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: hf.shadowLg,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: hf.good, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{I.check}</div>
        <div style={{ flex: 1 }}>
          <div style={{ ...hfText.small, fontWeight: 600, color: '#fff' }}>Payment recorded</div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', ...hfText.num }}>RCP-2026-00413 · ₹3,200 · Arjun Verma</div>
        </div>
        <button className="hf-btn" style={{
          background: 'transparent', border: 'none',
          color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 10px',
          borderRadius: 7,
        }}>Print receipt</button>
      </div>

      {/* Promote-success toast */}
      <div style={{
        background: hf.surface, border: `1px solid ${hf.border}`,
        borderRadius: 12, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: hf.shadowMd,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: hf.primarySoft, color: hf.primary,
          border: `1px solid ${hf.primaryEdge}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{I.arrUp}</div>
        <div style={{ flex: 1 }}>
          <div style={{ ...hfText.small, fontWeight: 600 }}>Promoted 482 students to AY 2026–27</div>
          <div style={{ fontSize: 11.5, color: hf.muted }}>29 passed out of Class 8 · marks entry locked for 2025–26</div>
        </div>
        <Btn variant="soft" size="sm">View year</Btn>
      </div>

      {/* Permission denied — design rule, not a 403 page */}
      <Card style={{ background: hf.surface2, borderStyle: 'dashed', marginTop: 6 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: hf.surface, border: `1px solid ${hf.border}`,
            color: hf.muted,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{I.shield}</div>
          <div>
            <div style={{ ...hfText.h3, fontSize: 14 }}>Permission · hidden, not denied</div>
            <div style={{ ...hfText.small, color: hf.inkSoft, marginTop: 4, lineHeight: 1.55 }}>
              When a teacher signs in, admin-only options simply <b>don't appear</b> in their sidebar — no 403 page, no greyed-out item to click.
            </div>
          </div>
        </div>

        {/* two columns: teacher sees vs hidden */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: hf.surface, border: `1px solid ${hf.borderS}` }}>
            <div style={{ ...hfText.micro, fontSize: 9.5, color: hf.good }}>TEACHER SEES</div>
            {['Dashboard', 'My Classes', 'Homework', 'Notices', 'Marks Entry', 'Messages'].map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', ...hfText.small, color: hf.ink2 }}>
                <span style={{ color: hf.good, display: 'inline-flex' }}>{I.check}</span>{x}
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: hf.surface, border: `1px solid ${hf.borderS}` }}>
            <div style={{ ...hfText.micro, fontSize: 9.5, color: hf.accent }}>HIDDEN</div>
            {['Teachers (admin only)', 'Settings', 'Promote students', 'Reset password', 'Fee plans'].map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', ...hfText.small, color: hf.muted, textDecoration: 'line-through' }}>
                <span style={{ color: hf.faint, display: 'inline-flex' }}>{I.lock}</span>{x}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  </StateFrame>
);

export {
  StudentFormModal, TeacherFormModal, ClassFormModal, AcademicYearFormModal,
  ClassYearSetupModal, AssignTeacherModal,
  HA5Modal, HA6Modal, HA7Modal, ConfirmModal,
  AStLoading, AStEmpty, AStError, AStConfirm, AStToastDenied,
};
