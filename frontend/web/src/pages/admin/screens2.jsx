import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import {
  Card, Btn, Pill, Chip, Avatar, SubjectIcon, SectionHead, Stat, Sparkbar,
  ModalShell, StateFrame,
} from '@/components/ui/primitives';
import {
  AdminChrome, AdminTopBar, Tabs, Segmented, ClassChip, Searchbox, Dropdown,
  FieldLabel, TextInput, TextArea,
} from '@/components/admin/AdminChrome';
import { TeacherFormModal, HA6Modal, ConfirmModal } from '@/pages/admin/extras.jsx';
// Admin hi-fi · A4 Fees (Collect flow) · A5 Teachers · A6 Notices

// ── Module-level helpers (kept out of the component to avoid focus loss) ──
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m) => MONTHS[(Number(m) || 1) - 1] || '—';
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const PAY_MODES = [
  { label: 'Cash', value: 'cash' },
  { label: 'UPI', value: 'upi' },
  { label: 'Card', value: 'card' },
  { label: 'Cheque', value: 'cheque' },
];

// Circle-numbered step header used by each panel in the collect flow.
const StepHead = ({ n, title, right }) => (
  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', gap: 10 }}>
    <span style={{
      width: 26, height: 26, borderRadius: '50%', background: hf.primary, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: hfFonts.ui, fontSize: 12, fontWeight: 700,
    }}>{n}</span>
    <div style={{ ...hfText.h2 }}>{title}</div>
    {right && <><div style={{ flex: 1 }} />{right}</>}
  </div>
);

// ─── A4 · Fees — Collect flow ─────────────────────────────────────────────
const HA4 = () => {
  const [tab, setTab] = useState('Collect');

  // Step 1 — find student
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null); // { id, name }

  // Step 2 — outstanding fees
  const [fees, setFees] = useState([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState(null);
  const [selectedFee, setSelectedFee] = useState(null);

  // Step 3 — payment
  const [amount, setAmount] = useState('');     // string — never parse to float
  const [payMode, setPayMode] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [receipt, setReceipt] = useState(null); // payment object after success

  // Debounced student search.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setMatches([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/api/students?search=${encodeURIComponent(q)}`)
        .then((res) => setMatches(res.data || []))
        .catch(() => setMatches([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadFees = (studentId) => {
    setFeesLoading(true);
    setFeesError(null);
    apiFetch(`/api/fees?student_id=${studentId}`)
      .then((res) => setFees((res.data || []).filter(f => f.status !== 'paid')))
      .catch((e) => setFeesError(e.message))
      .finally(() => setFeesLoading(false));
  };

  const pickStudent = (s) => {
    setSelectedStudent({ id: s.id, name: s.name });
    setSelectedFee(null);
    setFees([]);
    loadFees(s.id);
  };

  const pickFee = (fee) => {
    setSelectedFee(fee);
    setAmount(String(fee.balance));  // default to remaining balance, keep as string
    setErr('');
  };

  const handleSubmit = async () => {
    setErr('');
    if (!selectedFee) { setErr('Select a fee to collect.'); return; }
    if (!amount || Number(amount) <= 0) { setErr('Enter a valid amount.'); return; }
    setSaving(true);
    try {
      const body = {
        fee_id: selectedFee.id,
        amount: String(amount),
        payment_mode: payMode,
      };
      if (notes.trim()) body.notes = notes.trim();
      const payment = await apiFetch('/api/payments', { method: 'POST', body });
      setReceipt(payment);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const collectAnother = () => {
    setReceipt(null);
    setSelectedFee(null);
    setAmount('');
    setPayMode('cash');
    setNotes('');
    setErr('');
    if (selectedStudent) loadFees(selectedStudent.id);
  };

  return (
    <AdminChrome
      active="Fees"
      breadcrumb="Home · Fees"
      title="Fees"
      topRight={<>
        <Btn variant="outline" size="sm" icon={I.download}>Export ledger</Btn>
      </>}
    >
      <Tabs items={[
        { label: 'Collect', id: 'Collect' },
        { label: 'Pending', id: 'Pending' },
        { label: 'Recent', id: 'Recent' },
        { label: 'History', id: 'History' },
      ]} active={tab} onChange={setTab} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.05fr', gap: 14, alignItems: 'start' }}>
        {/* LEFT — find student + outstanding fees */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Step 1 */}
          <Card padding={0}>
            <StepHead n={1} title="Find student"
              right={<span style={{ fontSize: 11, color: hf.muted }}>{searching ? 'Searching…' : matches.length ? `${matches.length} matches` : ''}</span>} />
            <div style={{ padding: 18 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: hf.surface, border: `1.5px solid ${hf.primary}`, borderRadius: 10,
                boxShadow: `0 0 0 3px ${hf.primarySoft}`,
              }}>
                <span style={{ color: hf.primary, display: 'inline-flex' }}>{I.search}</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, admission no., phone…"
                  style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent',
                    ...hfText.body, color: hf.ink, fontFamily: hfFonts.ui,
                  }}
                />
              </div>

              {matches.length > 0 && (
                <>
                  <div style={{ ...hfText.micro, marginTop: 14, marginBottom: 6 }}>Matches</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {matches.map((m) => {
                      const sel = selectedStudent?.id === m.id;
                      return (
                        <div key={m.id} onClick={() => pickStudent(m)} className="hf-row" style={{
                          padding: '10px 12px', borderRadius: 9,
                          border: `1px solid ${sel ? hf.primary : hf.border}`,
                          background: sel ? hf.primarySoft : hf.surface,
                          display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 12,
                          alignItems: 'center', cursor: 'pointer',
                        }}>
                          <Avatar name={m.name} size={28} />
                          <div>
                            <div style={{ ...hfText.small, fontWeight: sel ? 700 : 600 }}>{m.name}</div>
                            <div style={{ fontSize: 11, color: hf.muted, ...hfText.num }}>{m.admission_no}{m.phone ? ` · ${m.phone}` : ''}</div>
                          </div>
                          {sel && <span style={{ color: hf.primary, display: 'inline-flex' }}>{I.check}</span>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Step 2 */}
          <Card padding={0}>
            <StepHead n={2} title="Outstanding fees"
              right={selectedStudent && <span style={{ ...hfText.small, color: hf.muted }}>{fees.length} unpaid</span>} />
            <div style={{ padding: 18 }}>
              {!selectedStudent && (
                <div style={{ ...hfText.small, color: hf.muted, textAlign: 'center', padding: '20px 0' }}>Find and select a student first.</div>
              )}
              {selectedStudent && feesLoading && (
                <div style={{ ...hfText.small, color: hf.muted, textAlign: 'center', padding: '20px 0' }}>Loading fees…</div>
              )}
              {selectedStudent && feesError && !feesLoading && (
                <div style={{ ...hfText.small, color: hf.accent, textAlign: 'center', padding: '20px 0' }}>Couldn't load fees: {feesError}</div>
              )}
              {selectedStudent && !feesLoading && !feesError && fees.length === 0 && (
                <div style={{ ...hfText.small, color: hf.good, textAlign: 'center', padding: '20px 0' }}>No outstanding fees — all paid.</div>
              )}
              {selectedStudent && !feesLoading && fees.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fees.map((fee) => {
                    const sel = selectedFee?.id === fee.id;
                    return (
                      <div key={fee.id} onClick={() => pickFee(fee)} className="hf-row" style={{
                        padding: '11px 12px', borderRadius: 9,
                        border: `1px solid ${sel ? hf.primary : hf.border}`,
                        background: sel ? hf.primarySoft : hf.surface,
                        display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12,
                        alignItems: 'center', cursor: 'pointer',
                      }}>
                        <div>
                          <div style={{ ...hfText.small, fontWeight: sel ? 700 : 600 }}>{cap(fee.fee_type)} · {monthName(fee.month)}</div>
                          <div style={{ fontSize: 11, color: hf.muted }}>
                            {fee.status === 'partial'
                              ? `₹${fee.amount_paid} of ₹${fee.net_amount} paid`
                              : (fee.due_date ? `Due ${new Date(fee.due_date).toLocaleDateString()}` : '')}
                          </div>
                        </div>
                        <Pill tone={fee.status === 'partial' ? 'accent' : 'neutral'} dot={fee.status === 'partial'}>{fee.status}</Pill>
                        <span style={{ ...hfText.num, fontWeight: 700 }}>₹{fee.balance} <span style={{ fontSize: 11, fontWeight: 500, color: hf.muted }}>left</span></span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT — payment / receipt */}
        <Card padding={0}>
          {receipt ? (
            <ReceiptPanel
              receipt={receipt}
              student={selectedStudent}
              fee={selectedFee}
              onAnother={collectAnother}
            />
          ) : (
            <>
              <StepHead n={3} title="Record payment" right={<Pill tone="primary" dot>Draft</Pill>} />

              {/* Header */}
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, background: hf.surface2, borderBottom: `1px solid ${hf.borderS}` }}>
                <Avatar name={selectedStudent?.name || 'Select'} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...hfText.small, fontWeight: 700 }}>{selectedStudent?.name || 'No student selected'}</div>
                  <div style={{ fontSize: 11.5, color: hf.muted }}>
                    {selectedFee ? `${cap(selectedFee.fee_type)} · ${monthName(selectedFee.month)}` : 'Select a fee on the left'}
                  </div>
                </div>
                {selectedFee && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...hfText.micro, fontSize: 10 }}>Outstanding</div>
                    <div style={{ ...hfText.num, fontSize: 18, fontWeight: 700 }}>₹{selectedFee.balance}</div>
                  </div>
                )}
              </div>

              {/* Form */}
              <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <FieldLabel required>Amount</FieldLabel>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${hf.border}`, borderRadius: 9, padding: '0 10px', background: selectedFee ? hf.surface : hf.surface2 }}>
                    <span style={{ ...hfText.num, color: hf.muted }}>₹</span>
                    <input
                      type="text" inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={!selectedFee}
                      placeholder="0"
                      style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '9px 0', fontFamily: hfFonts.mono, fontSize: 15, fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: hf.muted, marginTop: 4 }}>Edit for a partial payment.</div>
                </div>
                <div>
                  <FieldLabel required>Payment mode</FieldLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {PAY_MODES.map((pm) => {
                      const active = payMode === pm.value;
                      return (
                        <button key={pm.value} onClick={() => setPayMode(pm.value)} className="hf-btn" style={{
                          flex: '1 0 40%', padding: '8px 0', borderRadius: 8,
                          border: `1px solid ${active ? hf.ink : hf.border}`,
                          background: active ? hf.ink : hf.surface,
                          color: active ? '#fff' : hf.ink2,
                          fontFamily: hfFonts.ui, fontSize: 12, fontWeight: 600,
                        }}>{pm.label}</button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldLabel>Notes</FieldLabel>
                  <TextInput value={notes} onChange={setNotes} placeholder="Optional — e.g. partial payment, cheque no." />
                </div>
              </div>

              {err && (
                <div style={{ margin: '0 20px 14px', ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
              )}

              {/* Footer */}
              <div style={{
                padding: '14px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ ...hfText.small, color: hf.muted }}>One fee per receipt</span>
                <div style={{ flex: 1 }} />
                <Btn variant="primary" size="md" icon={I.receipt} onClick={handleSubmit} disabled={saving || !selectedFee}>
                  {saving ? 'Recording…' : `Record payment${amount ? ` ₹${amount}` : ''}`}
                </Btn>
              </div>
            </>
          )}
        </Card>
      </div>
    </AdminChrome>
  );
};

// ── Receipt success panel (shown after a payment is recorded) ──
const ReceiptPanel = ({ receipt, student, fee, onAnother }) => {
  const RowLine = ({ label, value, strong }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: `1px solid ${hf.borderS}` }}>
      <span style={{ ...hfText.small, color: hf.muted }}>{label}</span>
      <span style={{ ...hfText.small, fontWeight: strong ? 700 : 600, ...(strong ? hfText.num : {}) }}>{value}</span>
    </div>
  );
  return (
    <>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 26, height: 26, borderRadius: '50%', background: hf.good, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{I.check}</span>
        <div style={{ ...hfText.h2 }}>Payment recorded</div>
        <div style={{ flex: 1 }} />
        <Pill tone="good" dot>Completed</Pill>
      </div>

      <div style={{ padding: '20px 20px 8px', textAlign: 'center' }}>
        <div style={{ ...hfText.micro, fontSize: 10 }}>Amount paid</div>
        <div style={{ ...hfText.num, fontSize: 34, fontWeight: 700, color: hf.good, letterSpacing: '-0.02em', marginTop: 4 }}>₹{receipt.amount}</div>
        <div style={{ ...hfText.num, fontSize: 12, color: hf.muted, marginTop: 4 }}>Receipt {receipt.receipt_no}</div>
      </div>

      <div style={{ padding: '8px 20px 4px' }}>
        <RowLine label="Student" value={student?.name || '—'} />
        <RowLine label="For" value={fee ? `${cap(fee.fee_type)} · ${monthName(fee.month)}` : '—'} />
        <RowLine label="Payment mode" value={cap(receipt.payment_mode)} />
        <RowLine label="Date" value={receipt.paid_at ? new Date(receipt.paid_at).toLocaleString() : '—'} />
        {receipt.notes && <RowLine label="Notes" value={receipt.notes} />}
      </div>

      <div style={{
        padding: '14px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Btn variant="outline" size="md" icon={I.receipt} onClick={() => window.print()}>Print receipt</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" size="md" onClick={onAnother}>Collect another</Btn>
      </div>
    </>
  );
};

// ─── A5 · Teachers ────────────────────────────────────────────────────────
const HA5 = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTeachers = () => {
    setLoading(true);
    apiFetch('/api/teachers')
      .then((data) => setTeachers(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadTeachers(); }, []);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelBusy(true);
    setDelErr('');
    try {
      await apiFetch(`/api/teachers/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      loadTeachers();
    } catch (e) {
      setDelErr(e.message);
    } finally {
      setDelBusy(false);
    }
  };

  const total = teachers.length;
  const activeCount = teachers.filter((t) => t.is_active).length;
  const inactiveCount = total - activeCount;

  return (
    <>
      <AdminChrome
        active="Teachers"
        breadcrumb="Home · Teachers"
        title="Teachers"
        topRight={<>
          <Btn variant="outline" size="sm" icon={I.download}>Export</Btn>
          <Btn variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Add teacher</Btn>
        </>}
      >
        <div style={{ ...hfText.small, color: hf.muted }}>
          {loading ? 'Loading…' : `${total} teachers · ${activeCount} active · ${inactiveCount} inactive`}
        </div>

        <Card padding={14} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 240 }}><Searchbox placeholder="Search name, subject, emp. ID…" width={'100%'} /></div>
          <Dropdown label="Subject" value="All" width={150} />
          <Dropdown label="Status" value="All" width={130} />
          <Btn variant="ghost" size="sm" icon={I.filter}>More filters</Btn>
        </Card>

        <Card padding={0}>
          <div style={{
            display: 'grid', gridTemplateColumns: '36px 1.4fr 130px 130px 110px 130px 100px 130px',
            padding: '11px 20px', background: hf.surface2,
            borderBottom: `1px solid ${hf.borderS}`,
            ...hfText.micro, fontSize: 10,
          }}>
            <div /><div>Name</div><div>Phone</div><div>Subject</div><div>Emp. ID</div><div>Class teacher of</div><div>Status</div><div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {loading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading teachers…</div>
          )}
          {error && !loading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load teachers: {error}</div>
          )}
          {!loading && !error && teachers.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No teachers yet.</div>
          )}

          {!loading && !error && teachers.map((t, i) => (
            <div key={t.id ?? i} className="hf-row" style={{
              display: 'grid', gridTemplateColumns: '36px 1.4fr 130px 130px 110px 130px 100px 130px',
              padding: '11px 20px', alignItems: 'center',
              borderBottom: i < teachers.length - 1 ? `1px solid ${hf.borderS}` : 'none',
              opacity: t.is_active ? 1 : 0.62,
            }}>
              <Avatar name={t.name} size={28} />
              <div>
                <div style={{ ...hfText.small, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: hf.muted }}>{t.qualification || '—'}</div>
              </div>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.ink2 }}>{t.phone}</div>
              <div><Pill tone="neutral">{t.subject}</Pill></div>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.muted }}>{t.employee_id}</div>
              <div><span style={{ ...hfText.small, color: hf.faint }}>—</span></div>
              <div>
                {t.is_active
                  ? <Pill tone="good" dot>Active</Pill>
                  : <Pill tone="neutral">Inactive</Pill>}
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditing(t)} className="hf-btn" title="Edit" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✎</button>
                <button className="hf-btn" title="Reset password" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{I.lock}</button>
                {t.is_active && (
                  <button onClick={() => { setDelErr(''); setDeleting(t); }} className="hf-btn" title="Deactivate" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                )}
              </div>
            </div>
          ))}

          <div style={{ padding: '12px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2, ...hfText.small, color: hf.muted }}>
            Adding a teacher auto-creates a User account · default password is their phone number · they'll change it on first login.
          </div>
        </Card>
      </AdminChrome>
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <TeacherFormModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); loadTeachers(); }} />
        </div>
      )}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <TeacherFormModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadTeachers(); }} />
        </div>
      )}
      {deleting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ConfirmModal
            title="Deactivate teacher?"
            message={`This hides ${deleting.name} from active lists but keeps their records. You can't undo this from the UI.`}
            confirmLabel="Deactivate"
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

// ─── A6 · Notices ─────────────────────────────────────────────────────────
const HA6 = () => {
  const [showCompose, setShowCompose] = useState(false);
  const [chip, setChip] = useState('All');
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadNotices = () => {
    setLoading(true);
    apiFetch('/api/notices')
      .then((data) => setNotices(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadNotices(); }, []);

  const shown = notices.filter((n) => {
    if (chip === 'School-wide') return n.target_all_school;
    if (chip === 'Class-specific') return !n.target_all_school;
    return true;
  });

  return (
    <>
      <AdminChrome
        active="Notices"
        breadcrumb="Home · Notices"
        title="Notices"
        topRight={<>
          <Btn variant="primary" size="sm" onClick={() => setShowCompose(true)}>+ New notice</Btn>
        </>}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Chip active={chip === 'All'} onClick={() => setChip('All')}>All · {notices.length}</Chip>
          <Chip active={chip === 'School-wide'} onClick={() => setChip('School-wide')}>School-wide · {notices.filter(n => n.target_all_school).length}</Chip>
          <Chip active={chip === 'Class-specific'} onClick={() => setChip('Class-specific')}>Class-specific · {notices.filter(n => !n.target_all_school).length}</Chip>
          <div style={{ flex: 1 }} />
          <Searchbox placeholder="Search notices…" width={260} />
        </div>

        {loading && (
          <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading notices…</Card>
        )}
        {error && !loading && (
          <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load notices: {error}</Card>
        )}
        {!loading && !error && shown.length === 0 && (
          <Card padding={40} style={{ borderStyle: 'dashed', textAlign: 'center', ...hfText.small, color: hf.muted }}>
            No notices yet · <span onClick={() => setShowCompose(true)} style={{ color: hf.primary, fontWeight: 600, cursor: 'pointer' }}>post one →</span>
          </Card>
        )}

        {!loading && !error && shown.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {shown.map((n) => {
            const all = n.target_all_school;
            return (
              <Card key={n.id} padding={0} style={{
                borderLeft: `3px solid ${all ? hf.primary : hf.accent}`,
                borderTopLeftRadius: 12, borderBottomLeftRadius: 12,
              }}>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div style={{ ...hfText.h2, fontSize: 15, lineHeight: 1.35, flex: 1 }}>{n.title}</div>
                    <Pill tone={all ? 'primary' : 'accent'} style={{ fontSize: 10.5, flexShrink: 0 }}>{all ? 'All school' : 'Class-specific'}</Pill>
                  </div>
                  <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.5, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }} />
                    <span style={{ ...hfText.num, fontSize: 11, color: hf.muted }}>{n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        )}
      </AdminChrome>
      {showCompose && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <HA6Modal onClose={() => setShowCompose(false)} onSaved={() => { setShowCompose(false); loadNotices(); }} />
        </div>
      )}
    </>
  );
};

export { HA4, HA5, HA6 };
