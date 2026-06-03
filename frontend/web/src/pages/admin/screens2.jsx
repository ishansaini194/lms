import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import {
  Card, Btn, Pill, Chip, Avatar, SubjectIcon, SectionHead, Stat, Sparkbar,
  ModalShell, StateFrame, SearchInput, FilterSelect, FInput, FSelect,
} from '@/components/ui/primitives';
import {
  AdminChrome, AdminTopBar, Tabs, Segmented, ClassChip,
  FieldLabel, TextInput, TextArea,
} from '@/components/admin/AdminChrome';
import { TeacherFormModal, HA6Modal, ConfirmModal, ManageSubjectsModal } from '@/pages/admin/extras.jsx';
import { useAuth } from '@/auth/AuthContext';
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

// Maps lowercase URL ?tab= values to the capitalized Tab ids.
const FEE_TAB_IDS = { collect: 'Collect', pending: 'Pending', recent: 'Recent', history: 'History' };

// Month dropdown options — Jan=1 … Dec=12, matching monthName() used elsewhere.
const MONTH_OPTS = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

// ─── Generate Fees modal ──────────────────────────────────────────────────
// Triggers POST /api/fees/generate for the current academic year. Safe to
// re-run — the backend skips fees that already exist (unique on
// enrollment_id + fee_type + month). Response shape: { created, skipped, zero }.
const GenerateFeesModal = ({ onClose }) => {
  const [year, setYear] = useState(null);          // current academic year object
  const [yearLoading, setYearLoading] = useState(true);
  const [yearErr, setYearErr] = useState('');
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);      // { scope, created, skipped, zero }

  // Source the current year the same way the Fee Plans tab does.
  useEffect(() => {
    apiFetch('/api/academic-years')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setYear(list.find((y) => y.is_current) || null);
      })
      .catch((e) => setYearErr(e.message))
      .finally(() => setYearLoading(false));
  }, []);

  const generateMonth = (m) => apiFetch('/api/fees/generate', {
    method: 'POST',
    body: { month: m, academic_year_id: year.id },
  });

  const handleMonth = async () => {
    if (!year || busy) return;
    setErr(''); setResult(null); setBusy(true);
    try {
      const res = await generateMonth(Number(month));
      setResult({ scope: monthName(month), created: res.created || 0, skipped: res.skipped || 0, zero: res.zero || 0 });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const noYear = !yearLoading && !year && !yearErr;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <div onClick={busy ? undefined : onClose} style={{ position: 'absolute', inset: 0 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
          <ModalShell
            title="Generate fees"
            subtitle={year ? `Current academic year · ${year.year_label}` : 'Create monthly fee rows for all active students'}
            width={460}
            footer={<>
              <Btn variant="ghost" size="md" onClick={onClose} disabled={busy}>Close</Btn>
              <Btn variant="primary" size="md" onClick={handleMonth} disabled={busy || !year}>
                {busy ? 'Generating…' : 'Generate for this month'}
              </Btn>
            </>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {yearLoading && (
                <div style={{ ...hfText.small, color: hf.muted }}>Loading academic year…</div>
              )}
              {yearErr && (
                <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>Couldn't load academic year: {yearErr}</div>
              )}
              {noYear && (
                <div style={{ ...hfText.small, color: hf.muted, background: hf.surface2, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>Set a current academic year first — fees are generated per year.</div>
              )}

              {year && (<>
                <div>
                  <FieldLabel required>Month</FieldLabel>
                  <FSelect value={month} onChange={setMonth} options={MONTH_OPTS} disabled={busy} />
                </div>
                <div style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: hf.surface2, border: `1px solid ${hf.borderS}`,
                  ...hfText.small, color: hf.muted, lineHeight: 1.5,
                }}>
                  Generates tuition + transport fees for every active enrollment in the selected month. Safe to re-run — fees that already exist are skipped, not duplicated.
                </div>
              </>)}

              {err && (
                <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
              )}

              {result && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: hf.surface2, border: `1px solid ${hf.borderS}` }}>
                  <div style={{ ...hfText.small, fontWeight: 700, marginBottom: 6 }}>Done · {result.scope}</div>
                  <div style={{ display: 'flex', gap: 16, ...hfText.small, color: hf.ink2 }}>
                    <span><b style={{ ...hfText.num, color: hf.good }}>{result.created}</b> created</span>
                    <span><b style={{ ...hfText.num }}>{result.skipped}</b> skipped</span>
                    <span><b style={{ ...hfText.num }}>{result.zero}</b> zero-fee</span>
                  </div>
                </div>
              )}
            </div>
          </ModalShell>
        </div>
      </div>
    </div>
  );
};

// ─── A4 · Fees — Collect flow + Pending / Recent / History tabs ───────────
const HA4 = () => {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => FEE_TAB_IDS[(searchParams.get('tab') || '').toLowerCase()] || 'Collect');
  const [historyStudentId, setHistoryStudentId] = useState(null); // preload for History tab
  const [genOpen, setGenOpen] = useState(false); // Generate Fees modal

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

  // Preload a student into the Collect flow (used by ?student_id= and the
  // Pending tab's "Collect" action), then switch to the Collect tab.
  const preloadStudent = (studentId) => {
    apiFetch(`/api/students/${studentId}`)
      .then((s) => {
        setReceipt(null);
        setSelectedStudent({ id: s.id, name: s.name });
        setSelectedFee(null);
        setFees([]);
        loadFees(s.id);
        setTab('Collect');
      })
      .catch(() => {});
  };

  // Open the History tab focused on a given student (Recent row → History).
  const viewHistory = (studentId) => {
    setHistoryStudentId(studentId);
    setTab('History');
  };

  // On mount, honour ?student_id= — into History if ?tab=history, else Collect.
  useEffect(() => {
    const sid = searchParams.get('student_id');
    if (!sid) return;
    if ((searchParams.get('tab') || '').toLowerCase() === 'history') {
      setHistoryStudentId(Number(sid));
    } else {
      preloadStudent(Number(sid));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminChrome
      active="Fees"
      breadcrumb="Home · Fees"
      title="Fees"
      topRight={<Btn variant="outline" size="sm" icon={I.card} onClick={() => setGenOpen(true)}>Generate fees</Btn>}
    >
      {genOpen && <GenerateFeesModal onClose={() => setGenOpen(false)} />}

      <Tabs items={[
        { label: 'Collect', id: 'Collect' },
        { label: 'Pending', id: 'Pending' },
        { label: 'Recent', id: 'Recent' },
        { label: 'History', id: 'History' },
      ]} active={tab} onChange={setTab} />

      {tab === 'Pending' && <PendingFeesTab onCollect={preloadStudent} />}
      {tab === 'Recent' && <RecentPaymentsTab onViewHistory={viewHistory} />}
      {tab === 'History' && <PaymentHistoryTab studentId={historyStudentId} />}

      {tab === 'Collect' && (
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
                  <FInput value={notes} onChange={setNotes} placeholder="Optional — e.g. partial payment, cheque no." />
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
      )}
    </AdminChrome>
  );
};

// ── Shared pager for the Fees tabs ──
const TabPager = ({ page, totalPages, onPage }) => (
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

// Payment mode → pill tone.
const modePill = (m) => <Pill tone="neutral">{cap(m || '')}</Pill>;
const feeStatusTone = (s) => (s === 'paid' ? 'good' : s === 'partial' ? 'warn' : 'accent');

// ─── A4 · Pending tab — fee-level worklist (status=pending = unpaid+partial) ──
const PendingFeesTab = ({ onCollect }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [classFilter, setClassFilter] = useState('');
  const [classOptions, setClassOptions] = useState([{ value: '', label: 'All classes' }]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ status: 'pending', page: String(page), limit: '20' });
    if (classFilter) params.set('class_year_id', String(classFilter));
    apiFetch(`/api/fees?${params.toString()}`)
      .then((res) => {
        setRows(res.data || []);
        setTotal(res.total || 0);
        setTotalPages(res.total_pages || 1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, classFilter]);

  useEffect(() => {
    apiFetch('/api/class-years')
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        const cur = arr.filter((cy) => cy.academic_year?.is_current);
        const list = cur.length ? cur : arr;
        setClassOptions([{ value: '', label: 'All classes' },
          ...list.map((cy) => ({ value: cy.id, label: cy.class ? `${cy.class.name}${cy.class.section ? '-' + cy.class.section : ''}` : `Class ${cy.class_id}` }))]);
      })
      .catch(() => {});
  }, []);

  return (
    <Card padding={0}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ ...hfText.h2 }}>Pending fees</div>
          <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>{loading ? 'Loading…' : `${total} unpaid or partial`}</div>
        </div>
        <div style={{ flex: 1 }} />
        <FilterSelect label="Class" value={classFilter} onChange={(v) => { setClassFilter(v); setPage(1); }} options={classOptions} width={200} />
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1.4fr 80px 1fr 70px 100px 90px 90px',
        padding: '10px 18px', background: hf.surface2, borderBottom: `1px solid ${hf.borderS}`,
        ...hfText.micro, fontSize: 10,
      }}>
        <div>Student</div><div>Class</div><div>Fee type</div><div>Month</div><div>Net</div><div>Status</div><div style={{ textAlign: 'right' }} />
      </div>
      {loading && <div style={{ padding: '40px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading…</div>}
      {error && !loading && <div style={{ padding: '40px 18px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load: {error}</div>}
      {!loading && !error && rows.length === 0 && <div style={{ padding: '40px 18px', textAlign: 'center', ...hfText.small, color: hf.good }}>No pending fees.</div>}
      {!loading && !error && rows.map((r, i) => (
        <div key={r.id} style={{
          display: 'grid', gridTemplateColumns: '1.4fr 80px 1fr 70px 100px 90px 90px',
          padding: '11px 18px', alignItems: 'center',
          borderBottom: i < rows.length - 1 ? `1px solid ${hf.borderS}` : 'none',
        }}>
          <div style={{ ...hfText.small, fontWeight: 600 }}>{r.student_name || '—'}</div>
          <div style={{ ...hfText.small, color: hf.muted }}>{r.class_label || '—'}</div>
          <div style={{ ...hfText.small }}>{cap(r.fee_type)}</div>
          <div style={{ ...hfText.small, color: hf.muted }}>{monthName(r.month)}</div>
          <div style={{ ...hfText.num, fontSize: 12, fontWeight: 600 }}>₹{r.net_amount}</div>
          <div><Pill tone={feeStatusTone(r.status)} dot={r.status !== 'paid'}>{cap(r.status)}</Pill></div>
          <div style={{ textAlign: 'right' }}>
            <Btn variant="soft" size="sm" onClick={() => onCollect?.(r.student_id)}>Collect</Btn>
          </div>
        </div>
      ))}
      {!loading && !error && rows.length > 0 && <TabPager page={page} totalPages={totalPages} onPage={setPage} />}
    </Card>
  );
};

// ─── A4 · Recent tab — newest payments across the school ──────────────────
const RecentPaymentsTab = ({ onViewHistory }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { printReceipt, printNode } = useReceiptPrinter();

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/payments?page=${page}&limit=20`)
      .then((res) => {
        setRows(res.data || []);
        setTotal(res.total || 0);
        setTotalPages(res.total_pages || 1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <Card padding={0}>
      {printNode}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}` }}>
        <div style={{ ...hfText.h2 }}>Recent payments</div>
        <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>{loading ? 'Loading…' : `${total} payments`}</div>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 90px 80px 1fr 110px 34px',
        padding: '10px 18px', background: hf.surface2, borderBottom: `1px solid ${hf.borderS}`,
        ...hfText.micro, fontSize: 10,
      }}>
        <div>Student</div><div>For</div><div>Amount</div><div>Mode</div><div>Receipt</div><div style={{ textAlign: 'right' }}>Paid at</div><div />
      </div>
      {loading && <div style={{ padding: '40px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading…</div>}
      {error && !loading && <div style={{ padding: '40px 18px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load: {error}</div>}
      {!loading && !error && rows.length === 0 && <div style={{ padding: '40px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No payments yet.</div>}
      {!loading && !error && rows.map((r, i) => (
        <div key={r.id} className="hf-row hf-clickable" onClick={() => onViewHistory?.(r.student_id)} style={{
          display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 90px 80px 1fr 110px 34px',
          padding: '11px 18px', alignItems: 'center',
          borderBottom: i < rows.length - 1 ? `1px solid ${hf.borderS}` : 'none',
          opacity: r.status === 'reversed' ? 0.55 : 1,
        }}>
          <div style={{ ...hfText.small, fontWeight: 600 }}>{r.student_name || '—'}</div>
          <div style={{ ...hfText.small, color: hf.ink2 }}>{cap(r.fee_type)} · {monthName(r.month)}</div>
          <div style={{ ...hfText.num, fontSize: 12, fontWeight: 700 }}>₹{r.amount}</div>
          <div>{modePill(r.payment_mode)}</div>
          <div style={{ ...hfText.num, fontSize: 11, color: hf.muted }}>{r.receipt_no}{r.status === 'reversed' ? ' (reversed)' : ''}</div>
          <div style={{ textAlign: 'right', ...hfText.small, color: hf.muted }}>{r.paid_at ? new Date(r.paid_at).toLocaleString() : '—'}</div>
          <div style={{ textAlign: 'right' }}>
            <button onClick={(e) => { e.stopPropagation(); printReceipt(r); }} className="hf-btn" title="Print receipt" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{I.receipt}</button>
          </div>
        </div>
      ))}
      {!loading && !error && rows.length > 0 && <TabPager page={page} totalPages={totalPages} onPage={setPage} />}
    </Card>
  );
};

// ─── A4 · History tab — a single student's full payment ledger ────────────
const PaymentHistoryTab = ({ studentId }) => {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { printReceipt, printNode } = useReceiptPrinter();

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

  // Preload a student passed in from a Recent row / dashboard.
  useEffect(() => {
    if (!studentId) return;
    apiFetch(`/api/students/${studentId}`).then((s) => setStudent(s)).catch(() => {});
  }, [studentId]);

  // Load the selected student's payments.
  useEffect(() => {
    if (!student) { setRows([]); return; }
    setLoading(true);
    apiFetch(`/api/payments?student_id=${student.id}&page=${page}&limit=20`)
      .then((res) => { setRows(res.data || []); setTotalPages(res.total_pages || 1); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [student, page]);

  const selectStudent = (s) => { setStudent(s); setPage(1); setQuery(''); setMatches([]); };

  return (
    <Card padding={0}>
      {printNode}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}` }}>
        <div style={{ ...hfText.h2, marginBottom: 10 }}>Payment history</div>
        <SearchInput value={query} onChange={setQuery} placeholder="Find a student by name, admission no.…" width="100%" />
        {searching && <div style={{ ...hfText.small, color: hf.muted, marginTop: 8 }}>Searching…</div>}
        {matches.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {matches.map((m) => (
              <div key={m.id} onClick={() => selectStudent(m)} className="hf-row hf-clickable" style={{
                padding: '9px 12px', borderRadius: 9, border: `1px solid ${hf.border}`, background: hf.surface,
                display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'center', cursor: 'pointer',
              }}>
                <Avatar name={m.name} size={26} />
                <div>
                  <div style={{ ...hfText.small, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: hf.muted, ...hfText.num }}>{m.admission_no}{m.class_label ? ` · ${m.class_label}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {student && (
        <>
          <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, background: hf.surface2, borderBottom: `1px solid ${hf.borderS}` }}>
            <Avatar name={student.name} size={32} />
            <div>
              <div style={{ ...hfText.small, fontWeight: 700 }}>{student.name}</div>
              <div style={{ fontSize: 11, color: hf.muted }}>{student.admission_no}{student.class_label ? ` · ${student.class_label}` : ''}</div>
            </div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.2fr 90px 80px 1fr 110px 34px',
            padding: '10px 18px', background: hf.surface2, borderBottom: `1px solid ${hf.borderS}`,
            ...hfText.micro, fontSize: 10,
          }}>
            <div>For</div><div>Amount</div><div>Mode</div><div>Receipt</div><div style={{ textAlign: 'right' }}>Paid at</div><div />
          </div>
          {loading && <div style={{ padding: '30px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading…</div>}
          {!loading && rows.length === 0 && <div style={{ padding: '30px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No payments recorded for this student.</div>}
          {!loading && rows.map((r, i) => (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: '1.2fr 90px 80px 1fr 110px 34px',
              padding: '11px 18px', alignItems: 'center',
              borderBottom: i < rows.length - 1 ? `1px solid ${hf.borderS}` : 'none',
              opacity: r.status === 'reversed' ? 0.55 : 1,
            }}>
              <div style={{ ...hfText.small, color: hf.ink2 }}>{cap(r.fee_type)} · {monthName(r.month)}</div>
              <div style={{ ...hfText.num, fontSize: 12, fontWeight: 700 }}>₹{r.amount}</div>
              <div>{modePill(r.payment_mode)}</div>
              <div style={{ ...hfText.num, fontSize: 11, color: hf.muted }}>{r.receipt_no}{r.status === 'reversed' ? ' (reversed)' : ''}</div>
              <div style={{ textAlign: 'right', ...hfText.small, color: hf.muted }}>{r.paid_at ? new Date(r.paid_at).toLocaleString() : '—'}</div>
              <div style={{ textAlign: 'right' }}>
                <button onClick={(e) => { e.stopPropagation(); printReceipt({ ...r, student_id: student?.id, student_name: student?.name }); }} className="hf-btn" title="Print receipt" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{I.receipt}</button>
              </div>
            </div>
          ))}
          {!loading && rows.length > 0 && <TabPager page={page} totalPages={totalPages} onPage={setPage} />}
        </>
      )}
    </Card>
  );
};

// ── 80mm thermal fee receipt (print-only) ──
// label-left / value-right line, monospace value.
const RLine = ({ label, value, strong }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
    <span>{label}</span>
    <span style={{ fontWeight: strong ? 700 : 400, fontFamily: hfFonts.mono, textAlign: 'right' }}>{value}</span>
  </div>
);

// Renders the thermal receipt. Hidden on screen; the @media print block in
// tokens.css makes it the only visible element when printing. All money is
// shown as the exact decimal strings; Number() is used only for >0 comparisons.
const ThermalReceipt = ({ school, payment, student, fee }) => {
  if (!payment) return null;
  const paidAt = payment.paid_at ? new Date(payment.paid_at).toLocaleString('en-IN') : '';
  const hasDiscount = fee && Number(fee.discount) > 0;
  const balanceDue = fee && Number(fee.balance) > 0;
  return (
    <div className="thermal-receipt">
      {/* Letterhead (no logo on thermal) */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{school?.name || 'School'}</div>
        {school?.address && <div style={{ fontSize: 10 }}>{school.address}</div>}
        {school?.phone && <div style={{ fontSize: 10 }}>Ph: {school.phone}</div>}
      </div>
      <div className="rule" />
      <div style={{ textAlign: 'center', fontWeight: 700, letterSpacing: '0.08em' }}>FEE RECEIPT</div>
      <div style={{ marginTop: 4 }}>
        <RLine label="Receipt" value={payment.receipt_no} />
        <RLine label="Date" value={paidAt} />
      </div>
      <div className="rule" />
      {/* Student */}
      <div>
        <RLine label="Student" value={student?.name || '—'} />
        {student?.class_label && <RLine label="Class" value={student.class_label} />}
        {student?.admission_no && <RLine label="Adm. No" value={student.admission_no} />}
      </div>
      <div className="rule" />
      {/* Fee detail */}
      <div>
        <RLine label={`${cap(fee?.fee_type || '')} · ${monthName(fee?.month)}`} value={`₹${fee?.amount ?? '—'}`} />
        {hasDiscount && <RLine label="Discount" value={`-₹${fee.discount}`} />}
        {hasDiscount && <RLine label="Net" value={`₹${fee.net_amount}`} />}
      </div>
      <div className="rule" />
      {/* Payment */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontWeight: 700 }}>
        <span style={{ fontSize: 12 }}>AMOUNT PAID</span>
        <span style={{ fontFamily: hfFonts.mono, fontSize: 15 }}>₹{payment.amount}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        <RLine label="Mode" value={cap(payment.payment_mode)} />
        {payment.txn_ref && <RLine label="Txn Ref" value={payment.txn_ref} />}
        {fee && <RLine label={balanceDue ? 'Balance due' : 'Balance'} value={`₹${fee.balance}`} strong={balanceDue} />}
      </div>
      <div className="rule" />
      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 10 }}>
        <div>Thank you</div>
        <div>This is a computer-generated receipt.</div>
      </div>
      <div style={{ marginTop: 24 }}>
        <div style={{ borderTop: '1px solid #000', width: '60%', marginLeft: 'auto' }} />
        <div style={{ textAlign: 'right', fontSize: 10, marginTop: 2 }}>Authorized signature</div>
      </div>
    </div>
  );
};

// Shared reprint helper for the Recent/History tabs. Fetches the fee (for
// net/discount/balance) and student (for class/adm-no) the row doesn't carry,
// renders a single hidden receipt node, and triggers the print dialog.
function useReceiptPrinter() {
  const { school } = useAuth();
  const [data, setData] = useState(null); // { payment, student, fee }

  const printReceipt = async (payment) => {
    let fee = null, student = { name: payment.student_name };
    try {
      const [f, s] = await Promise.all([
        apiFetch(`/api/fees/${payment.fee_id}`),
        apiFetch(`/api/students/${payment.student_id}`),
      ]);
      fee = f; student = s;
    } catch { /* fall back to row data */ }
    // New object each call so a repeat print of the same row re-triggers.
    setData({ payment, student, fee });
  };

  // Print once the hidden node has rendered.
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 60);
    return () => clearTimeout(t);
  }, [data]);

  const printNode = data ? (
    <div className="print-only">
      <ThermalReceipt school={school} payment={data.payment} student={data.student} fee={data.fee} />
    </div>
  ) : null;

  return { printReceipt, printNode };
}

// ── Receipt success panel (shown after a payment is recorded) ──
const ReceiptPanel = ({ receipt, student, fee, onAnother }) => {
  const { school } = useAuth();
  // Per-fee balance AFTER this payment. The create response returns only the
  // payment (no updated balance), so compute it from the pre-payment fee:
  // new balance = pre-payment balance − this payment. Display-only string math.
  const receiptFee = fee
    ? { ...fee, balance: (Number(fee.balance) - Number(receipt.amount)).toFixed(2) }
    : null;
  const RowLine = ({ label, value, strong }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: `1px solid ${hf.borderS}` }}>
      <span style={{ ...hfText.small, color: hf.muted }}>{label}</span>
      <span style={{ ...hfText.small, fontWeight: strong ? 700 : 600, ...(strong ? hfText.num : {}) }}>{value}</span>
    </div>
  );
  return (
    <>
      {/* Print-only thermal receipt (hidden on screen). */}
      <div className="print-only">
        <ThermalReceipt school={school} payment={receipt} student={student} fee={receiptFee} />
      </div>

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
  const [managing, setManaging] = useState(null); // teacher whose subjects we're managing
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters (all client-side — the list is small and unpaginated).
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive'

  // Reset-password flow.
  const [resetting, setResetting] = useState(null);  // teacher being reset
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState('');
  const [resetResult, setResetResult] = useState(null); // { name, password? } after success

  // Fetch the full set once (active + inactive) so counts are honest and
  // switching tabs needs no refetch.
  const loadTeachers = () => {
    setLoading(true);
    apiFetch('/api/teachers?include_inactive=true')
      .then((data) => setTeachers(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadTeachers(); }, []);

  // Debounce the search box (client-side filter, just for smooth typing).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

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

  const reactivate = async (id) => {
    setError(null);
    try {
      await apiFetch(`/api/teachers/${id}/reactivate`, { method: 'POST' });
      loadTeachers();
    } catch (e) {
      setError(e.message);
    }
  };

  const confirmReset = async () => {
    if (!resetting) return;
    if (!resetting.user_id) { setResetErr('No login account linked to this teacher.'); return; }
    setResetBusy(true);
    setResetErr('');
    try {
      // Empty body → backend resets to the default password and echoes it.
      const res = await apiFetch(`/api/auth/reset-password/${resetting.user_id}`, { method: 'POST', body: {} });
      setResetResult({ name: resetting.name, password: res.password || null });
      setResetting(null);
    } catch (e) {
      setResetErr(e.message);
    } finally {
      setResetBusy(false);
    }
  };

  const total = teachers.length;
  const activeCount = teachers.filter((t) => t.is_active).length;
  const inactiveCount = total - activeCount;

  // Distinct subjects present, for the Subject filter.
  const subjectOptions = [
    { value: '', label: 'All' },
    ...Array.from(new Set(teachers.map((t) => t.subject).filter(Boolean)))
      .sort()
      .map((s) => ({ value: s, label: s })),
  ];

  const q = debouncedSearch.trim().toLowerCase();
  const filtered = teachers.filter((t) => {
    if (statusFilter === 'active' && !t.is_active) return false;
    if (statusFilter === 'inactive' && t.is_active) return false;
    if (subjectFilter && t.subject !== subjectFilter) return false;
    if (q) {
      const hay = `${t.name || ''} ${t.subject || ''} ${t.employee_id || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <AdminChrome
        active="Teachers"
        breadcrumb="Home · Teachers"
        title="Teachers"
        topRight={<Btn variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Add teacher</Btn>}
      >
        <div style={{ ...hfText.small, color: hf.muted }}>
          {loading ? 'Loading…' : `${total} teachers · ${activeCount} active · ${inactiveCount} inactive`}
        </div>

        <Card padding={14} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, subject, emp. ID…" width={'100%'} />
          </div>
          <FilterSelect label="Subject" value={subjectFilter} onChange={setSubjectFilter} options={subjectOptions} width={170} />
          <Segmented
            items={['Active', 'Inactive']}
            active={statusFilter === 'inactive' ? 'Inactive' : 'Active'}
            onChange={(v) => setStatusFilter(v.toLowerCase())}
          />
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
          {!loading && !error && teachers.length > 0 && filtered.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No {statusFilter} teachers match your filters.</div>
          )}

          {!loading && !error && filtered.map((t, i) => (
            <div key={t.id ?? i} className="hf-row" style={{
              display: 'grid', gridTemplateColumns: '36px 1.4fr 130px 130px 110px 130px 100px 130px',
              padding: '11px 20px', alignItems: 'center',
              borderBottom: i < filtered.length - 1 ? `1px solid ${hf.borderS}` : 'none',
              opacity: t.is_active ? 1 : 0.62,
            }}>
              <Avatar name={t.name} size={28} />
              <div>
                <div style={{ ...hfText.small, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: hf.muted }}>{t.qualification || '—'}</div>
              </div>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.ink2 }}>{t.phone}</div>
              <div>{t.subject ? <Pill tone="neutral">{t.subject}</Pill> : <span style={{ ...hfText.small, color: hf.faint }}>—</span>}</div>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.muted }}>{t.employee_id}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {t.class_teacher_of && t.class_teacher_of.length > 0
                  ? t.class_teacher_of.map((label) => <Pill key={label} tone="primary">{label}</Pill>)
                  : <span style={{ ...hfText.small, color: hf.faint }}>—</span>}
              </div>
              <div>
                {t.is_active
                  ? <Pill tone="good" dot>Active</Pill>
                  : <Pill tone="neutral">Inactive</Pill>}
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditing(t)} className="hf-btn" title="Edit" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✎</button>
                {t.is_active && (
                  <button onClick={() => setManaging(t)} className="hf-btn" title="Manage subjects" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{I.book}</button>
                )}
                <button onClick={() => { setResetErr(''); setResetting(t); }} className="hf-btn" title="Reset password" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{I.lock}</button>
                {t.is_active ? (
                  <button onClick={() => { setDelErr(''); setDeleting(t); }} className="hf-btn" title="Deactivate" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                ) : (
                  <button onClick={() => reactivate(t.id)} className="hf-btn" title="Reactivate" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.good, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{I.refresh}</button>
                )}
              </div>
            </div>
          ))}

          <div style={{ padding: '12px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2, ...hfText.small, color: hf.muted }}>
            Adding a teacher auto-creates a User account · default password is 123456 · they'll change it on first login.
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
      {resetting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ConfirmModal
            title="Reset password?"
            message={`Reset the password for ${resetting.name}? They'll get the default password and must change it on first login.`}
            confirmLabel="Reset password"
            danger={false}
            onConfirm={confirmReset}
            onCancel={() => setResetting(null)}
            busy={resetBusy}
            error={resetErr}
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
                    <div style={{ ...hfText.small, color: hf.muted, marginTop: 6 }}>Share this with the teacher · they'll be asked to change it on first login.</div>
                  </div>
                )}
              </ModalShell>
            </div>
          </div>
        </div>
      )}
      {managing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ManageSubjectsModal teacher={managing} onClose={() => setManaging(null)} />
        </div>
      )}
    </>
  );
};

// ─── A6 · Notices ─────────────────────────────────────────────────────────
const HA6 = () => {
  const [showCompose, setShowCompose] = useState(false);
  const [editing, setEditing] = useState(null); // notice being edited
  const [chip, setChip] = useState('All');
  const [search, setSearch] = useState('');
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

  const q = search.trim().toLowerCase();
  const shown = notices.filter((n) => {
    if (chip === 'School-wide' && !n.target_all_school) return false;
    if (chip === 'Class-specific' && n.target_all_school) return false;
    if (q && !`${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q)) return false;
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
          <SearchInput value={search} onChange={setSearch} placeholder="Search notices…" width={260} />
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
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <div style={{ ...hfText.h2, fontSize: 15, lineHeight: 1.35, flex: 1 }}>{n.title}</div>
                    <Pill tone={all ? 'primary' : 'accent'} style={{ fontSize: 10.5, flexShrink: 0 }}>{all ? 'All school' : 'Class-specific'}</Pill>
                    <button onClick={() => setEditing(n)} className="hf-btn" title="Edit notice" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>✎</button>
                  </div>
                  <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.5, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {n.posted_by_name && <span style={{ ...hfText.small, fontSize: 11, color: hf.muted }}>Posted by {n.posted_by_name}</span>}
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
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <HA6Modal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadNotices(); }} />
        </div>
      )}
    </>
  );
};

export { HA4, HA5, HA6 };
