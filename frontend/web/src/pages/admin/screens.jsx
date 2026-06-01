
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import {
  Card, Btn, Pill, Chip, Avatar, SubjectIcon, SectionHead, Stat, Sparkbar,
  ModalShell, StateFrame, SearchInput, FilterSelect,
} from '@/components/ui/primitives';
import {
  AdminChrome, AdminTopBar, Tabs, Segmented,
  FieldLabel, TextInput, TextArea,
} from '@/components/admin/AdminChrome';
import { StudentFormModal, ClassFormModal, ConfirmModal, ClassYearSetupModal, AssignTeacherModal } from '@/pages/admin/extras.jsx';

// Admin hi-fi · A1 Dashboard · A2 Classes · A3 Students · A3 Student detail

// ── Module-level helpers ──
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m) => MONTHS[(Number(m) || 1) - 1] || '—';
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// Fee-status → pill. "" / missing means the student has no fees yet.
const feeStatusPill = (s) => {
  switch (s) {
    case 'paid':    return <Pill tone="good">Paid</Pill>;
    case 'partial': return <Pill tone="warn">Partial</Pill>;
    case 'unpaid':  return <Pill tone="accent" dot>Unpaid</Pill>;
    default:        return <Pill tone="neutral">No fees</Pill>;
  }
};

// ─── A1 · Dashboard ───────────────────────────────────────────────────────
const HA1 = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/dashboard/stats')
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const topRight = (
    <>
      <Btn variant="outline" size="sm" icon={I.download}>Export</Btn>
      <Btn variant="primary" size="sm" icon={I.card} onClick={() => navigate('/admin/fees')}>Collect fees</Btn>
    </>
  );

  if (loading) {
    return (
      <AdminChrome active="Dashboard" breadcrumb="Home" title="Dashboard" topRight={topRight}>
        <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading dashboard…</Card>
      </AdminChrome>
    );
  }
  if (error || !stats) {
    return (
      <AdminChrome active="Dashboard" breadcrumb="Home" title="Dashboard" topRight={topRight}>
        <Card padding={40} style={{ textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load dashboard: {error || 'no data'}</Card>
      </AdminChrome>
    );
  }

  // Progress-bar math (temporary metric — real monthly targets added later).
  // Number() here is only for the bar width; money is still shown as raw ₹ strings.
  const collected = Number(stats.collected_this_month) || 0;
  const pending = Number(stats.pending_fees.total) || 0;
  const billable = collected + pending;
  const percent = billable > 0 ? Math.round((collected / billable) * 100) : 0;
  const recent = stats.recent_payments || [];
  const defaulters = stats.top_defaulters || [];

  return (
    <AdminChrome
      active="Dashboard"
      breadcrumb="Home"
      title="Dashboard"
      topRight={topRight}
    >
      {/* Pending-fees banner */}
      {stats.pending_fees.count > 0 && (
        <div style={{
          padding: '14px 18px', borderRadius: 12,
          background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: hf.surface, border: `1px solid ${hf.accentEdge}`,
            color: hf.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{I.alert}</div>
          <div style={{ flex: 1 }}>
            <div style={{ ...hfText.small, fontWeight: 700, color: hf.accent }}>{stats.pending_fees.count} students have pending fees</div>
            <div style={{ ...hfText.small, color: hf.ink2, marginTop: 2 }}>
              Combined balance <span style={{ ...hfText.num, fontWeight: 700 }}>₹{stats.pending_fees.total}</span>
            </div>
          </div>
          <Btn variant="outline" size="sm">Send reminder</Btn>
          <Btn variant="accent" size="sm" onClick={() => navigate('/admin/fees')}>Collect fees →</Btn>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Stat label="Total students" value={stats.total_students} tone="good" icon={<span style={{ color: hf.muted }}>{I.user}</span>} />
        <Stat label="Pending fees" value={`₹${stats.pending_fees.total}`} hint={`across ${stats.pending_fees.count} students`} tone="accent" icon={<span style={{ color: hf.accent }}>{I.card}</span>} />
        <Stat label="Collected this month" value={`₹${stats.collected_this_month}`} tone="good" icon={<span style={{ color: hf.good }}>{I.receipt}</span>} />
        <Stat label="Active classes" value={stats.active_classes} hint={stats.current_academic_year ? `AY ${stats.current_academic_year}` : undefined} icon={<span style={{ color: hf.muted }}>{I.grid}</span>} />
      </div>

      {/* Collection progress */}
      <Card>
        <SectionHead
          title="Collection this month"
          subtitle={`AY ${stats.current_academic_year || '—'}`}
          right={
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ ...hfText.num, fontSize: 22, fontWeight: 700, color: hf.good }}>{percent}%</span>
              <span style={{ ...hfText.small, color: hf.muted }}>₹{stats.collected_this_month} of ₹{billable.toLocaleString('en-IN')} billed</span>
            </div>
          }
        />
        <div style={{ position: 'relative', height: 12, background: hf.surface2, border: `1px solid ${hf.borderS}`, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${percent}%`, height: '100%',
            background: `linear-gradient(90deg, ${hf.primary}, ${hf.good})`,
            borderRadius: 999,
          }} />
        </div>
        <div style={{ ...hfText.small, color: hf.muted, marginTop: 10 }}>
          {percent}% · ₹{stats.collected_this_month} collected of ₹{billable.toLocaleString('en-IN')} billed this month
        </div>
      </Card>

      {/* Two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* Recent payments */}
        <Card padding={0}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ ...hfText.h2 }}>Recent payments</div>
              <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>Last {recent.length} entries</div>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => navigate('/admin/fees')}>View all {I.chev}</Btn>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '34px 1fr 120px 90px 70px 70px',
            padding: '10px 18px', background: hf.surface2, borderBottom: `1px solid ${hf.borderS}`,
            ...hfText.micro, fontSize: 10,
          }}>
            <div /><div>Student</div><div>Receipt</div><div>Amount</div><div>Mode</div><div style={{ textAlign: 'right' }}>Time</div>
          </div>
          {recent.length === 0 && (
            <div style={{ padding: '24px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No payments yet.</div>
          )}
          {recent.map((p, i) => (
            <div key={i} className="hf-row" style={{
              display: 'grid', gridTemplateColumns: '34px 1fr 120px 90px 70px 70px',
              padding: '11px 18px', alignItems: 'center',
              borderBottom: i < recent.length - 1 ? `1px solid ${hf.borderS}` : 'none',
            }}>
              <Avatar name={p.student_name} size={26} />
              <div>
                <div style={{ ...hfText.small, fontWeight: 600 }}>{p.student_name}</div>
                <div style={{ fontSize: 11, color: hf.muted }}>{cap(p.fee_type)} · {monthName(p.month)}</div>
              </div>
              <div style={{ ...hfText.num, fontSize: 11, color: hf.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.receipt_no}</div>
              <div style={{ ...hfText.num, fontSize: 13, fontWeight: 650, color: hf.good }}>₹{p.amount}</div>
              <div>
                <Pill tone={p.payment_mode === 'cash' ? 'good' : p.payment_mode === 'upi' ? 'primary' : 'neutral'} style={{ fontSize: 10.5 }}>{p.payment_mode}</Pill>
              </div>
              <div style={{ ...hfText.num, fontSize: 11, color: hf.muted, textAlign: 'right' }}>{p.paid_at ? new Date(p.paid_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
            </div>
          ))}
        </Card>

        {/* Defaulters */}
        <Card padding={0}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ ...hfText.h2 }}>Top defaulters</div>
              <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>By outstanding amount</div>
            </div>
            {defaulters.length > 0 && <Pill tone="accent" dot>{defaulters.length}</Pill>}
          </div>
          {defaulters.length === 0 && (
            <div style={{ padding: '24px 18px', textAlign: 'center', ...hfText.small, color: hf.good }}>No outstanding dues 🎉</div>
          )}
          {defaulters.map((d, i) => (
            <div key={d.student_id} className="hf-row" style={{
              padding: '12px 18px',
              borderBottom: i < defaulters.length - 1 ? `1px solid ${hf.borderS}` : 'none',
              display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12, alignItems: 'center',
            }}>
              <Avatar name={d.student_name} size={28} />
              <div>
                <div style={{ ...hfText.small, fontWeight: 600 }}>{d.student_name}</div>
                <div style={{ fontSize: 11, color: hf.muted, marginTop: 2 }}>{d.class_label || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ ...hfText.num, fontSize: 13, fontWeight: 700, color: hf.accent }}>₹{d.outstanding}</span>
                <Btn variant="outline" size="sm" style={{ padding: '4px 10px', height: 26, fontSize: 11.5 }} onClick={() => navigate('/admin/fees')}>Collect</Btn>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </AdminChrome>
  );
};

// ─── A2 · Classes (grid) ──────────────────────────────────────────────────
const HA2 = () => {
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Current academic year — needed to set up a class_year and to label the UI.
  const [currentYear, setCurrentYear] = useState(null); // { id, year_label } | null
  const [settingUp, setSettingUp] = useState(null);     // class being set up
  const [assigning, setAssigning] = useState(null);     // class whose teacher is being assigned

  const loadClasses = () => {
    setLoading(true);
    apiFetch('/api/classes')
      .then((data) => setClasses(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadClasses(); }, []);

  useEffect(() => {
    apiFetch('/api/academic-years')
      .then((years) => {
        const cur = Array.isArray(years) && years.find((y) => y.is_current === true);
        if (cur) setCurrentYear({ id: cur.id, year_label: cur.year_label });
      })
      .catch(() => {});
  }, []);

  const q = search.trim().toLowerCase();
  const visibleClasses = q
    ? classes.filter((c) => `${c.name}${c.section ? '-' + c.section : ''}`.toLowerCase().includes(q))
    : classes;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelBusy(true);
    setDelErr('');
    try {
      await apiFetch(`/api/classes/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      loadClasses();
    } catch (e) {
      setDelErr(e.message);   // e.g. 409 "class has history; cannot delete"
    } finally {
      setDelBusy(false);
    }
  };

  const activeCount = classes.filter(c => c.is_active).length;

  return (
    <>
      <AdminChrome
        active="Classes"
        breadcrumb="Home · Classes"
        title="Classes"
        topRight={<>
          <Btn variant="outline" size="sm" icon={I.download}>Export</Btn>
          <Btn variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Add class</Btn>
        </>}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...hfText.small, color: hf.muted }}>{activeCount} active classes</span>
          <div style={{ flex: 1 }} />
          <SearchInput value={search} onChange={setSearch} placeholder="Search by class…" width={260} />
        </div>

        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading classes…</div>
        )}
        {error && !loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load: {error}</div>
        )}
        {!loading && !error && classes.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No classes yet.</div>
        )}
        {!loading && !error && classes.length > 0 && visibleClasses.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No classes match "{search}".</div>
        )}

        {!loading && !error && visibleClasses.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {visibleClasses.map((c) => {
            const title = `${c.name}${c.section ? '-' + c.section : ''}`;
            const isSetUp = c.class_year_id != null;
            const yearLabel = currentYear?.year_label || 'this year';
            return (
              <Card key={c.id} padding={0} className={isSetUp ? 'hf-clickable' : undefined}
                onClick={isSetUp ? () => navigate(`/admin/students?class_year_id=${c.class_year_id}`) : undefined}
                style={{ border: `1px solid ${hf.border}`, background: hf.surface }}>
                <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ ...hfText.display, fontSize: 28, lineHeight: 1 }}>{title}</div>
                    <div style={{ ...hfText.small, color: hf.muted, marginTop: 6 }}>
                      {isSetUp ? `${c.student_count} students enrolled` : `Not set up for ${yearLabel}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.board && <Pill tone="neutral">{String(c.board).toUpperCase()}</Pill>}
                    <button onClick={(e) => { e.stopPropagation(); setEditing(c); }} className="hf-btn" title="Edit" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✎</button>
                    <button onClick={(e) => { e.stopPropagation(); setDelErr(''); setDeleting(c); }} className="hf-btn" title="Delete" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                </div>

                {isSetUp ? (
                  <>
                    {/* Teacher strip */}
                    <div style={{
                      borderTop: `1px solid ${hf.borderS}`,
                      padding: '12px 18px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: hf.surface2,
                    }}>
                      <Avatar name={c.class_teacher || '?'} size={28} />
                      <span style={{ ...hfText.small, color: c.class_teacher ? hf.ink2 : hf.muted, fontWeight: c.class_teacher ? 600 : 400, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.class_teacher || 'No class teacher'}
                      </span>
                      <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setAssigning(c); }}>
                        {c.class_teacher ? 'Change' : 'Assign'}
                      </Btn>
                    </div>

                    <div style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: `1px solid ${hf.borderS}` }}>
                      <div>
                        <div style={{ fontSize: 10, color: hf.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tuition / mo</div>
                        <div style={{ ...hfText.num, fontSize: 16, fontWeight: 700, marginTop: 3, color: hf.ink }}>₹{c.tuition_fee}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: hf.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Transport / mo</div>
                        <div style={{ ...hfText.num, fontSize: 16, fontWeight: 700, marginTop: 3, color: hf.ink }}>₹{c.transport_fee}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{
                    borderTop: `1px solid ${hf.borderS}`,
                    padding: '16px 18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    background: hf.surface2,
                  }}>
                    <span style={{ ...hfText.small, color: hf.muted }}>No fees or teacher yet</span>
                    <Btn variant="soft" size="sm" onClick={(e) => { e.stopPropagation(); setSettingUp(c); }}>
                      Set up for {yearLabel}
                    </Btn>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        )}
      </AdminChrome>
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ClassFormModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); loadClasses(); }} />
        </div>
      )}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ClassFormModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadClasses(); }} />
        </div>
      )}
      {deleting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ConfirmModal
            title="Delete class?"
            message={`This removes ${deleting.name}${deleting.section ? '-' + deleting.section : ''}. Classes that already have academic-year history can't be deleted.`}
            confirmLabel="Delete"
            onConfirm={confirmDelete}
            onCancel={() => setDeleting(null)}
            busy={delBusy}
            error={delErr}
          />
        </div>
      )}
      {settingUp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ClassYearSetupModal
            classItem={settingUp}
            academicYearId={currentYear?.id}
            yearLabel={currentYear?.year_label}
            onClose={() => setSettingUp(null)}
            onSaved={() => { setSettingUp(null); loadClasses(); }}
          />
        </div>
      )}
      {assigning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <AssignTeacherModal
            classItem={assigning}
            onClose={() => setAssigning(null)}
            onSaved={() => { setAssigning(null); loadClasses(); }}
          />
        </div>
      )}
    </>
  );
};

// ─── A3 · Students (table + filters) ──────────────────────────────────────
const HA3 = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showAdd, setShowAdd] = useState(false);

  // Filters / pagination driving the list fetch.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Pre-select the class filter when arriving from a class card (?class_year_id=).
  const [classFilter, setClassFilter] = useState(() => searchParams.get('class_year_id') || '');
  const [statusFilter, setStatusFilter] = useState('active');   // 'active' | 'inactive'
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [classOptions, setClassOptions] = useState([{ value: '', label: 'All classes' }]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');

  const loadStudents = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (classFilter) params.set('class_year_id', String(classFilter));
    if (statusFilter === 'inactive') params.set('include_inactive', 'true');
    apiFetch(`/api/students?${params.toString()}`)
      .then((res) => {
        const data = res.data || [];
        // include_inactive returns active + inactive; the Inactive tab shows only
        // deactivated rows (backend has no inactive-only filter — client-filter here).
        setRows(statusFilter === 'inactive' ? data.filter((r) => r.is_active === false) : data);
        setTotal(res.total || 0);
        setTotalPages(res.total_pages || 1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  // Debounce search keystrokes (300ms) before they hit the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Refetch on any settled filter / page change. Page resets happen in the
  // change handlers so this never fires with a stale page.
  useEffect(() => { loadStudents(); }, [debouncedSearch, classFilter, statusFilter, page]);

  // Class filter options — current-AY class-years (fall back to all if none current).
  useEffect(() => {
    apiFetch('/api/class-years')
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        const currentOnly = arr.filter((cy) => cy.academic_year?.is_current);
        const list = currentOnly.length ? currentOnly : arr;
        const opts = list.map((cy) => ({
          value: cy.id,
          label: cy.class ? `${cy.class.name}${cy.class.section ? '-' + cy.class.section : ''}` : `Class ${cy.class_id}`,
        }));
        setClassOptions([{ value: '', label: 'All classes' }, ...opts]);
      })
      .catch(() => {});
  }, []);

  const reactivate = async (id) => {
    setError(null);
    try {
      await apiFetch(`/api/students/${id}/reactivate`, { method: 'POST' });
      loadStudents();
    } catch (e) {
      setError(e.message);
    }
  };

  // Build the edit-form prefill from a row's bare student fields.
  const editInitialFromRow = (r) => ({
    id: r.id,
    name: r.name, phone: r.phone || '', email: r.email || '',
    gender: r.gender || '', caste: r.caste || '', address: r.address || '',
    admission_no: r.admission_no, epunjab_id: r.epunjab_id || '',
    aadhar_no: r.aadhar_number || '',
    dob: r.date_of_birth ? r.date_of_birth.slice(0, 10) : '',
    father_name: r.father_name || '', father_contact: r.father_contact || '',
    mother_name: r.mother_name || '', mother_contact: r.mother_contact || '',
  });

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelBusy(true);
    setDelErr('');
    try {
      await apiFetch(`/api/students/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      loadStudents();
    } catch (e) {
      setDelErr(e.message);
    } finally {
      setDelBusy(false);
    }
  };

  const toggleRow = (i) => setRows(rs => rs.map((r, j) => j === i ? { ...r, _sel: !r._sel } : r));
  const allSel = rows.length > 0 && rows.every(r => r._sel);
  const toggleAll = () => setRows(rs => rs.map(r => ({ ...r, _sel: !allSel })));
  const selectedCount = rows.filter(r => r._sel).length;

  return (
    <>
      <AdminChrome
        active="Students"
        breadcrumb="Home · Students"
        title="Students"
        topRight={<>
          <Btn variant="outline" size="sm">⚙ Columns</Btn>
          <Btn variant="outline" size="sm" icon={I.download}>Import CSV</Btn>
          <Btn variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Add student</Btn>
        </>}
      >
        <div style={{ ...hfText.small, color: hf.muted }}>{total} {statusFilter === 'inactive' ? 'inactive' : 'active'} students</div>

        {/* Filter row */}
        <Card padding={14} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FilterSelect
            label="Class"
            value={classFilter}
            onChange={(v) => { setClassFilter(v); setPage(1); }}
            options={classOptions}
            width={200}
          />
          <div style={{ flex: 1, minWidth: 200 }}>
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="Name, phone, Aadhar…"
              width={'100%'}
            />
          </div>
          <Btn variant="ghost" size="sm" icon={I.filter}>More filters</Btn>
        </Card>

        {/* Status segmented */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...hfText.small, color: hf.muted, fontWeight: 550 }}>Status</span>
          <Segmented
            items={['Active', 'Inactive']}
            active={statusFilter === 'inactive' ? 'Inactive' : 'Active'}
            onChange={(v) => { setStatusFilter(v.toLowerCase()); setPage(1); }}
          />
          <div style={{ flex: 1 }} />
          <span style={{ ...hfText.small, color: hf.muted }}>Showing {rows.length} of {total}</span>
        </div>

        {/* Selection action bar */}
        {selectedCount > 0 && (
          <div style={{
            padding: '10px 16px', borderRadius: 11,
            background: hf.ink, color: '#fff',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6, background: hf.primary, color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
            }}>{selectedCount}</div>
            <span style={{ ...hfText.small, fontWeight: 600 }}>{selectedCount} students selected</span>
            <div style={{ flex: 1 }} />
            <button className="hf-btn" style={{ padding: '5px 10px', fontSize: 12, color: '#fff', background: 'rgba(255,255,255,0.08)', border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 7 }}>Export CSV</button>
            <button className="hf-btn" style={{ padding: '5px 10px', fontSize: 12, color: '#fff', background: 'rgba(255,255,255,0.08)', border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 7 }}>Export PDF</button>
            <button className="hf-btn" style={{ padding: '5px 10px', fontSize: 12, color: '#fff', background: 'rgba(255,255,255,0.08)', border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 7 }}>Promote</button>
            <button className="hf-btn" style={{ padding: '5px 10px', fontSize: 12, color: hf.accent, background: 'rgba(255,255,255,0.05)', border: `1px solid ${hf.accent}`, borderRadius: 7 }}>Deactivate</button>
          </div>
        )}

        {/* Table */}
        <Card padding={0}>
          <div style={{
            display: 'grid', gridTemplateColumns: '38px 60px 30px 1.6fr 70px 70px 130px 110px 84px',
            padding: '11px 20px', background: hf.surface2,
            borderBottom: `1px solid ${hf.borderS}`,
            ...hfText.micro, fontSize: 10,
          }}>
            <div onClick={toggleAll} className="hf-clickable"><span style={{ width: 16, height: 16, display: 'inline-flex', borderRadius: 4, background: allSel ? hf.primary : hf.surface, border: `1.5px solid ${allSel ? hf.primary : hf.faint}`, color: '#fff', alignItems: 'center', justifyContent: 'center' }}>{allSel && I.check}</span></div>
            <div>Adm. no</div>
            <div />
            <div>Name</div>
            <div>Class</div>
            <div>Sec</div>
            <div>Phone</div>
            <div>Fee status</div>
            <div />
          </div>
          {loading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading students…</div>
          )}
          {error && !loading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load: {error}</div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No students yet.</div>
          )}
          {!loading && !error && rows.map((r, i) => (
            <div key={r.id} className="hf-row hf-clickable"
              onClick={() => navigate(`/admin/students/${r.id}`)}
              style={{
                display: 'grid', gridTemplateColumns: '38px 60px 30px 1.6fr 70px 70px 130px 110px 84px',
                padding: '11px 20px', alignItems: 'center',
                borderBottom: i < rows.length - 1 ? `1px solid ${hf.borderS}` : 'none',
                background: r._sel ? hf.primarySoft : 'transparent',
              }}>
              <div onClick={(e) => { e.stopPropagation(); toggleRow(i); }}>
                <span style={{
                  width: 16, height: 16, display: 'inline-flex', borderRadius: 4,
                  background: r._sel ? hf.primary : hf.surface,
                  border: `1.5px solid ${r._sel ? hf.primary : hf.faint}`,
                  color: '#fff', alignItems: 'center', justifyContent: 'center',
                }}>{r._sel && I.check}</span>
              </div>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.muted }}>{r.admission_no}</div>
              <Avatar name={r.name} size={26} />
              <div style={{ ...hfText.small, fontWeight: 600 }}>{r.name}</div>
              <div style={{ ...hfText.small, color: hf.ink2 }}>{r.class_label || '—'}</div>
              <div style={{ ...hfText.small, color: hf.muted }}>{r.section || '—'}</div>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.ink2 }}>{r.phone || '—'}</div>
              <div>{feeStatusPill(r.fee_status)}</div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {statusFilter === 'inactive' ? (
                  <button onClick={(e) => { e.stopPropagation(); reactivate(r.id); }} className="hf-btn" title="Reactivate" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.good, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{I.refresh}</button>
                ) : (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); setEditing(editInitialFromRow(r)); }} className="hf-btn" title="Edit" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✎</button>
                    <button onClick={(e) => { e.stopPropagation(); setDelErr(''); setDeleting(r); }} className="hf-btn" title="Deactivate" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          <div style={{
            padding: '12px 20px', borderTop: `1px solid ${hf.borderS}`, background: hf.surface2,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ ...hfText.small, color: hf.muted }}>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</Btn>
              <Btn variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</Btn>
            </div>
          </div>
        </Card>
      </AdminChrome>
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <StudentFormModal
            onClose={() => setShowAdd(false)}
            onSaved={() => { setShowAdd(false); loadStudents(); }}
          />
        </div>
      )}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <StudentFormModal
            initial={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); loadStudents(); }}
          />
        </div>
      )}
      {deleting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ConfirmModal
            title="Deactivate student?"
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

// ─── A3 · Student detail ──────────────────────────────────────────────────
const HA3Detail = () => {
  const { id } = useParams();              // student id from the URL
  const navigate = useNavigate();
  const [showEdit, setShowEdit] = useState(false);
  const [s, setS] = useState(null);        // the real student
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStudent = () => {
    setLoading(true);
    apiFetch(`/api/students/${id}`)
      .then((data) => setS(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadStudent(); }, [id]);

  // Edit-mode prefill now comes from the real student.
  const editInitial = s ? {
    id: s.id,
    name: s.name, phone: s.phone || '', email: s.email || '',
    gender: s.gender || '', caste: s.caste || '', address: s.address || '',
    admission_no: s.admission_no, epunjab_id: s.epunjab_id || '',
    aadhar_no: s.aadhar_number || '',
    dob: s.date_of_birth ? s.date_of_birth.slice(0, 10) : '',
    father_name: s.father_name || '', father_contact: s.father_contact || '',
    mother_name: s.mother_name || '', mother_contact: s.mother_contact || '',
  } : null;

  const InfoRow = ({ label, value }) => (
    <div style={{
      display: 'grid', gridTemplateColumns: '130px 1fr',
      padding: '10px 18px', alignItems: 'center',
      borderBottom: `1px solid ${hf.borderS}`,
    }}>
      <div style={{ ...hfText.small, color: hf.muted, fontWeight: 550 }}>{label}</div>
      <div style={{ ...hfText.body, color: hf.ink2 }}>{value || '—'}</div>
    </div>
  );

  if (loading) return <AdminChrome active="Students" title="Student"><div style={{ padding: 40, ...hfText.small, color: hf.muted }}>Loading…</div></AdminChrome>;
  if (error || !s) return <AdminChrome active="Students" title="Student"><div style={{ padding: 40, ...hfText.small, color: hf.accent }}>Couldn't load student: {error || 'not found'}</div></AdminChrome>;

  return (
    <>
      <AdminChrome
        active="Students"
        breadcrumb={<>Students <span style={{ color: hf.faint, padding: '0 6px' }}>/</span> <span style={{ color: hf.ink2 }}>{s.name}</span></>}
        title={s.name}
        topRight={<>
          <Btn variant="outline" size="sm" onClick={() => setShowEdit(true)}>✎ Edit</Btn>
          <Btn variant="outline" size="sm" icon={I.arrUp}>Promote</Btn>
          <Btn variant="outline" size="sm" style={{ color: hf.accent, borderColor: hf.accentEdge }}>Delete</Btn>
          <Btn variant="primary" size="sm" icon={I.card}>Collect fees</Btn>
        </>}
      >
        {/* Hero */}
        <Card style={{ background: `linear-gradient(135deg, ${hf.surface} 0%, ${hf.primarySoft} 100%)` }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Avatar name={s.name} size={80} style={{ boxShadow: '0 4px 14px rgba(20,24,32,0.10)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ ...hfText.display, fontSize: 26 }}>{s.name}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {s.is_active
                  ? <Pill tone="good" dot>Active</Pill>
                  : <Pill tone="neutral">Inactive</Pill>}
                {s.class_label && <Pill tone="primary">Class {s.class_label}</Pill>}
                {s.gender && <Pill tone="neutral">{s.gender}</Pill>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...hfText.micro, fontSize: 10 }}>Outstanding</div>
              <div style={{ ...hfText.num, fontSize: 28, fontWeight: 700, color: hf.muted, letterSpacing: '-0.02em', lineHeight: 1, marginTop: 4 }}>—</div>
              <div style={{ ...hfText.small, color: hf.muted, marginTop: 4 }}>fees coming soon</div>
            </div>
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, alignItems: 'start' }}>
          {/* LEFT: details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card padding={0}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}` }}>
                <div style={{ ...hfText.h2 }}>Basic info</div>
              </div>
              <InfoRow label="Phone" value={s.phone} />
              <InfoRow label="Email" value={s.email} />
              <InfoRow label="Gender" value={s.gender} />
              <InfoRow label="DOB" value={s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString() : '—'} />
              <InfoRow label="Caste" value={s.caste} />
              <InfoRow label="Address" value={s.address} />
            </Card>

            <Card padding={0}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}` }}>
                <div style={{ ...hfText.h2 }}>ID details</div>
              </div>
              <InfoRow label="Admission no." value={s.admission_no} />
              <InfoRow label="Aadhar" value={s.aadhar_number} />
              <InfoRow label="ePunjab ID" value={s.epunjab_id} />
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { role: 'Father', name: s.father_name, phone: s.father_contact },
                { role: 'Mother', name: s.mother_name, phone: s.mother_contact },
              ].map((p, i) => (
                <Card key={i} padding={0}>
                  <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={p.name || p.role} size={32} />
                    <div>
                      <div style={{ ...hfText.h2, fontSize: 14 }}>{p.name || '—'}</div>
                      <div style={{ ...hfText.small, color: hf.muted }}>{p.role}</div>
                    </div>
                  </div>
                  <InfoRow label="Contact" value={p.phone} />
                </Card>
              ))}
            </div>
          </div>

          {/* RIGHT: fee history */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Fee history deferred to Fees phase — will use real balance calc */}
            <Card padding={0}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}` }}>
                <div style={{ ...hfText.h2 }}>Fee history</div>
              </div>
              <div style={{ padding: '40px 18px', textAlign: 'center' }}>
                <div style={{ ...hfText.small, color: hf.muted }}>Fee history will appear here.</div>
              </div>
            </Card>

            <Card>
              <SectionHead title="Activity" subtitle="Last 30 days" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { icon: I.receipt, who: 'Mr. Singh (admin)', what: 'recorded payment ₹1,200 · Mar tuition', when: '5 Mar 10:14' },
                  { icon: I.chart, who: 'Mrs. Kaur', what: 'published Mid-term results', when: '22 Apr 14:42' },
                  { icon: I.book, who: 'Mrs. Arora', what: 'added homework · EVS · Mon 28 Apr', when: '23 Apr 09:10' },
                  { icon: I.bell, who: 'Principal', what: 'posted school-wide notice', when: '25 Apr 11:42' },
                ].map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: hf.surface2, border: `1px solid ${hf.borderS}`,
                      color: hf.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{a.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.4 }}>
                        <b>{a.who}</b> {a.what}
                      </div>
                      <div style={{ fontSize: 11, color: hf.muted, marginTop: 2 }}>{a.when}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </AdminChrome>
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <StudentFormModal initial={editInitial} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); loadStudent(); }} />
        </div>
      )}
    </>
  );
};

export { HA1, HA2, HA3, HA3Detail };
