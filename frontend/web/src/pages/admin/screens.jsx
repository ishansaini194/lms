
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { useIsMobile } from '@/lib/useIsMobile';
import {
  Card, Btn, Pill, Chip, Avatar, SubjectIcon, SectionHead, Stat, Sparkbar,
  ModalShell, StateFrame, SearchInput, FilterSelect, FInput, FSelect,
} from '@/components/ui/primitives';
import {
  AdminChrome, AdminTopBar, Tabs, Segmented,
  FieldLabel, TextInput, TextArea,
} from '@/components/admin/AdminChrome';
import { StudentFormModal, ClassFormModal, ConfirmModal, ClassYearSetupModal, AssignTeacherModal, HA6Modal } from '@/pages/admin/extras.jsx';
import { ExportStudentsModal, ExportStudentModal } from '@/components/StudentExport.jsx';

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
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    apiFetch('/api/dashboard/stats')
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const topRight = (
    <Btn variant="primary" size="sm" icon={I.card} onClick={() => navigate('/admin/fees')}>Collect fees</Btn>
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
          <Btn variant="outline" size="sm" onClick={() => setShowReminder(true)}>Send reminder</Btn>
          <Btn variant="accent" size="sm" onClick={() => navigate('/admin/fees?tab=pending')}>View pending →</Btn>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <div className="hf-clickable" onClick={() => navigate('/admin/students')}>
          <Stat label="Total students" value={stats.total_students} tone="good" icon={<span style={{ color: hf.muted }}>{I.user}</span>} />
        </div>
        <div className="hf-clickable" onClick={() => navigate('/admin/fees?tab=pending')}>
          <Stat label="Pending fees" value={`₹${stats.pending_fees.total}`} hint={`across ${stats.pending_fees.count} students`} tone="accent" icon={<span style={{ color: hf.accent }}>{I.card}</span>} />
        </div>
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
            <Btn variant="ghost" size="sm" onClick={() => navigate('/admin/fees?tab=recent')}>View all {I.chev}</Btn>
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
            <div key={i} className="hf-row hf-clickable"
              onClick={() => p.student_id && navigate(`/admin/fees?tab=history&student_id=${p.student_id}`)}
              style={{
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
                <Btn variant="outline" size="sm" style={{ padding: '4px 10px', height: 26, fontSize: 11.5 }} onClick={() => navigate(`/admin/fees?tab=collect&student_id=${d.student_id}`)}>Collect</Btn>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {showReminder && (
        <HA6Modal
          onClose={() => setShowReminder(false)}
          onSaved={() => setShowReminder(false)}
          prefill={{
            title: 'Fee payment reminder',
            target_all_school: true,
            body:
              'Dear Parents,\n\n' +
              'This is a gentle reminder that the school fees are still pending. ' +
              'We request you to kindly clear the outstanding amount on or before [due date] to avoid a late fee.\n\n' +
              'Payments can be made at the school office or through the school app.\n\n' +
              'Thank you for your cooperation.\n\n' +
              '— School Administration',
          }}
        />
      )}
    </AdminChrome>
  );
};

// ─── A2 · Classes (grid) ──────────────────────────────────────────────────
const HA2 = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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

  // Drag-to-reorder state. dragId = card being dragged, overId = drop target.
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

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

  // Reordering is only coherent over the full, unfiltered list (sort_order is
  // global), so it's disabled while searching.
  const canReorder = !q && classes.length > 1;

  // Persist a new order optimistically; roll back on failure. sort_order is
  // spaced by 10s so future single-card nudges have room without a full rewrite.
  const persistOrder = async (ordered) => {
    const prev = classes;
    setClasses(ordered);
    try {
      await apiFetch('/api/classes/reorder', {
        method: 'PATCH',
        body: { order: ordered.map((c, i) => ({ id: c.id, sort_order: (i + 1) * 10 })) },
      });
    } catch (e) {
      setClasses(prev);
      setError(e.message || 'Failed to save new order');
    }
  };

  const handleDrop = (targetId) => {
    setOverId(null);
    if (dragId == null || dragId === targetId) { setDragId(null); return; }
    const arr = [...classes];
    const from = arr.findIndex((c) => c.id === dragId);
    const to = arr.findIndex((c) => c.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    persistOrder(arr);
  };

  return (
    <>
      <AdminChrome
        active="Classes"
        breadcrumb="Home · Classes"
        title="Classes"
        topRight={<Btn variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Add class</Btn>}
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
          {visibleClasses.map((c) => {
            const title = `${c.name}${c.section ? '-' + c.section : ''}`;
            const isSetUp = c.class_year_id != null;
            const yearLabel = currentYear?.year_label || 'this year';
            return (
              <Card key={c.id} padding={0} className={isSetUp ? 'hf-clickable' : undefined}
                onClick={isSetUp ? () => navigate(`/admin/students?class_year_id=${c.class_year_id}`) : undefined}
                onDragOver={canReorder ? (e) => { e.preventDefault(); if (overId !== c.id) setOverId(c.id); } : undefined}
                onDrop={canReorder ? (e) => { e.preventDefault(); handleDrop(c.id); } : undefined}
                style={{
                  border: `1px solid ${overId === c.id && dragId !== c.id ? hf.primary : hf.border}`,
                  background: hf.surface,
                  opacity: dragId === c.id ? 0.4 : 1,
                  transition: 'opacity .12s ease, border-color .12s ease',
                }}>
                <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ ...hfText.display, fontSize: 28, lineHeight: 1 }}>{title}</div>
                    <div style={{ ...hfText.small, color: hf.muted, marginTop: 6 }}>
                      {isSetUp ? `${c.student_count} students enrolled` : `Not set up for ${yearLabel}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.board && <Pill tone="neutral">{String(c.board).toUpperCase()}</Pill>}
                    {canReorder && (
                      <span
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); setDragId(c.id); }}
                        onDragEnd={() => { setDragId(null); setOverId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        title="Drag to reorder"
                        className="hf-btn"
                        style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${hf.border}`, background: hf.surface, color: hf.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', fontSize: 14, lineHeight: 1, userSelect: 'none' }}
                      >⠿</span>
                    )}
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
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);

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

  // Reset-password flow (mirrors the Teachers page).
  const [resetting, setResetting] = useState(null);   // student being reset
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState('');
  const [resetResult, setResetResult] = useState(null); // { name, password? } after success

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

  const confirmReset = async () => {
    if (!resetting) return;
    if (!resetting.user_id) { setResetErr('No login account linked to this student.'); return; }
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

  // Build the edit-form prefill from a row's bare student fields.
  const editInitialFromRow = (r) => ({
    id: r.id,
    name: r.name, phone: r.phone || '', email: r.email || '',
    gender: r.gender || '', caste: r.caste || '', address: r.address || '',
    admission_no: r.admission_no, epunjab_id: r.epunjab_id || '',
    aadhar_no: r.aadhar_no || '',
    dob: r.dob ? r.dob.slice(0, 10) : '',
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

  // Per-row action buttons (edit / reset password / deactivate, or reactivate
  // when viewing the Inactive tab). `sz` lets mobile cards use larger tap targets
  // than the dense desktop table. Each button stops propagation so it doesn't
  // trigger the row's navigate-to-detail click.
  const renderRowActions = (r, sz = 26) => {
    const btn = (extra) => ({
      width: sz, height: sz, borderRadius: 7, border: `1px solid ${hf.border}`,
      background: hf.surface, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      ...extra,
    });
    if (statusFilter === 'inactive') {
      return (
        <button onClick={(e) => { e.stopPropagation(); reactivate(r.id); }} className="hf-btn" title="Reactivate" style={btn({ color: hf.good })}>{I.refresh}</button>
      );
    }
    return (
      <>
        <button onClick={(e) => { e.stopPropagation(); setEditing(editInitialFromRow(r)); }} className="hf-btn" title="Edit" style={btn({ color: hf.inkSoft, fontSize: 12 })}>✎</button>
        <button onClick={(e) => { e.stopPropagation(); setResetErr(''); setResetting(r); }} className="hf-btn" title="Reset password" style={btn({ color: hf.inkSoft })}>{I.lock}</button>
        <button onClick={(e) => { e.stopPropagation(); setDelErr(''); setDeleting(r); }} className="hf-btn" title="Deactivate" style={btn({ color: hf.accent })}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </>
    );
  };

  return (
    <>
      <AdminChrome
        active="Students"
        breadcrumb="Home · Students"
        title="Students"
        topRight={<>
          <Btn variant="outline" size="sm" icon={I.download} onClick={() => setShowExport(true)}>Export</Btn>
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

        {/* Shared loading / error / empty states */}
        {loading && (
          <Card padding={0}><div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading students…</div></Card>
        )}
        {error && !loading && (
          <Card padding={0}><div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load: {error}</div></Card>
        )}
        {!loading && !error && rows.length === 0 && (
          <Card padding={0}><div style={{ padding: '40px 20px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No students yet.</div></Card>
        )}

        {/* Mobile: stacked cards (the 8-col table doesn't fit a phone). */}
        {!loading && !error && rows.length > 0 && isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r) => (
              <Card key={r.id} padding={13} className="hf-clickable"
                onClick={() => navigate(`/admin/students/${r.id}`)}
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <Avatar name={r.name} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...hfText.body, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ ...hfText.small, color: hf.muted, ...hfText.num }}>
                      Adm. {r.admission_no} · {r.class_label || '—'}{r.section ? `-${r.section}` : ''}
                    </div>
                  </div>
                  {feeStatusPill(r.fee_status)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ ...hfText.num, fontSize: 12.5, color: hf.ink2 }}>{r.phone || 'No phone'}</span>
                  <div style={{ display: 'flex', gap: 8 }}>{renderRowActions(r, 36)}</div>
                </div>
              </Card>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px' }}>
              <span style={{ ...hfText.small, color: hf.muted }}>Page {page} of {totalPages}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</Btn>
                <Btn variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</Btn>
              </div>
            </div>
          </div>
        )}

        {/* Desktop: dense table */}
        {!loading && !error && rows.length > 0 && !isMobile && (
        <Card padding={0}>
          <div style={{
            display: 'grid', gridTemplateColumns: '60px 30px 1.6fr 70px 70px 130px 110px 84px',
            padding: '11px 20px', background: hf.surface2,
            borderBottom: `1px solid ${hf.borderS}`,
            ...hfText.micro, fontSize: 10,
          }}>
            <div>Adm. no</div>
            <div />
            <div>Name</div>
            <div>Class</div>
            <div>Sec</div>
            <div>Phone</div>
            <div>Fee status</div>
            <div />
          </div>
          {rows.map((r, i) => (
            <div key={r.id} className="hf-row hf-clickable"
              onClick={() => navigate(`/admin/students/${r.id}`)}
              style={{
                display: 'grid', gridTemplateColumns: '60px 30px 1.6fr 70px 70px 130px 110px 84px',
                padding: '11px 20px', alignItems: 'center',
                borderBottom: i < rows.length - 1 ? `1px solid ${hf.borderS}` : 'none',
              }}>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.muted }}>{r.admission_no}</div>
              <Avatar name={r.name} size={26} />
              <div style={{ ...hfText.small, fontWeight: 600 }}>{r.name}</div>
              <div style={{ ...hfText.small, color: hf.ink2 }}>{r.class_label || '—'}</div>
              <div style={{ ...hfText.small, color: hf.muted }}>{r.section || '—'}</div>
              <div style={{ ...hfText.num, fontSize: 11.5, color: hf.ink2 }}>{r.phone || '—'}</div>
              <div>{feeStatusPill(r.fee_status)}</div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {renderRowActions(r, 26)}
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
        )}
      </AdminChrome>
      {showExport && (
        <ExportStudentsModal classOptions={classOptions} initialClassIds={classFilter ? [classFilter] : null} onClose={() => setShowExport(false)} />
      )}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <StudentFormModal
            defaultClassYearId={classFilter}
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
                    <div style={{ ...hfText.small, color: hf.muted, marginTop: 6 }}>Share this with the student · they'll be asked to change it on first login.</div>
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

// Student-level fee ledger: that student's fees (paid + outstanding) with a
// paid/outstanding summary. Each fee row expands to show its payment(s).
const StudentFeeLedger = ({ studentId, reloadToken }) => {
  const [fees, setFees] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null); // fee id whose payments are shown

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch(`/api/fees?student_id=${studentId}&limit=100`),
      apiFetch(`/api/payments?student_id=${studentId}&limit=100`),
    ])
      .then(([feeRes, payRes]) => {
        if (cancelled) return;
        setFees(feeRes.data || []);
        setPayments(payRes.data || []);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId, reloadToken]);

  // Non-authoritative UI sums for the header (per-row figures stay exact strings).
  const totalPaid = payments
    .filter((p) => p.status !== 'reversed')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalOutstanding = fees.reduce((sum, f) => sum + (Number(f.balance) || 0), 0);
  const paymentsByFee = (feeId) => payments.filter((p) => p.fee_id === feeId);

  return (
    <Card padding={0}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ ...hfText.h2 }}>Fee history</div>
          <div style={{ ...hfText.small, color: hf.muted, marginTop: 2 }}>
            Paid <span style={{ ...hfText.num, fontWeight: 700, color: hf.good }}>₹{totalPaid.toLocaleString('en-IN')}</span>
            {' · '}Outstanding <span style={{ ...hfText.num, fontWeight: 700, color: totalOutstanding > 0 ? hf.accent : hf.muted }}>₹{totalOutstanding.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {loading && <div style={{ padding: '30px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>Loading…</div>}
      {error && !loading && <div style={{ padding: '30px 18px', textAlign: 'center', ...hfText.small, color: hf.accent }}>Couldn't load: {error}</div>}
      {!loading && !error && fees.length === 0 && (
        <div style={{ padding: '30px 18px', textAlign: 'center', ...hfText.small, color: hf.muted }}>No fees recorded for this student.</div>
      )}

      {!loading && !error && fees.map((f, i) => {
        const isOpen = expanded === f.id;
        const feePayments = paymentsByFee(f.id);
        return (
          <div key={f.id} style={{ borderBottom: i < fees.length - 1 ? `1px solid ${hf.borderS}` : 'none' }}>
            <div className="hf-row hf-clickable" onClick={() => setExpanded(isOpen ? null : f.id)} style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 22px', gap: 8,
              padding: '11px 18px', alignItems: 'center',
            }}>
              <div style={{ ...hfText.small, fontWeight: 600 }}>{cap(f.fee_type)} · {monthName(f.month)}</div>
              <div style={{ ...hfText.num, fontSize: 12 }}>₹{f.net_amount}</div>
              <div><Pill tone={f.status === 'paid' ? 'good' : f.status === 'partial' ? 'warn' : 'accent'} dot={f.status !== 'paid'}>{cap(f.status)}</Pill></div>
              <div style={{ ...hfText.num, fontSize: 12, fontWeight: 700, color: Number(f.balance) > 0 ? hf.accent : hf.muted, textAlign: 'right' }}>₹{f.balance}</div>
              <span style={{ color: hf.muted, display: 'inline-flex', justifyContent: 'center', transform: isOpen ? 'rotate(90deg)' : 'none' }}>{I.chev}</span>
            </div>
            {isOpen && (
              <div style={{ padding: '4px 18px 12px', background: hf.surface2 }}>
                {feePayments.length === 0 ? (
                  <div style={{ ...hfText.small, color: hf.muted, padding: '8px 0' }}>No payments against this fee yet.</div>
                ) : feePayments.map((p) => (
                  <div key={p.id} style={{ padding: '6px 0', opacity: p.status === 'reversed' ? 0.55 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ ...hfText.num, fontSize: 12, fontWeight: 700 }}>₹{p.amount}</span>
                      <Pill tone="neutral">{cap(p.payment_mode)}</Pill>
                      <span style={{ ...hfText.num, fontSize: 11, color: hf.muted }}>{p.receipt_no}{p.status === 'reversed' ? ' (reversed)' : ''}</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ ...hfText.small, color: hf.muted }}>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : ''}</span>
                    </div>
                    {p.notes && (
                      <div style={{ ...hfText.small, color: hf.muted, marginTop: 3, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                        <span style={{ color: hf.faint }}>Note: </span>{p.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
};

// Per-student fee generation for custom months. Amounts come from the class_year
// standard fee — this only controls WHICH months get generated. Months that
// already have a fee are marked and disabled so the admin only ticks open ones.
const GenerateStudentFeesModal = ({ studentId, studentName, onClose, onGenerated }) => {
  const [enrollment, setEnrollment] = useState(null);
  const [existingMonths, setExistingMonths] = useState(new Set());
  const [picked, setPicked] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null); // { created, skipped, zero }

  // Which months already have a fee (tuition or transport) for this student.
  const loadExisting = () =>
    apiFetch(`/api/fees?student_id=${studentId}&limit=100`)
      .then((feeRes) => setExistingMonths(new Set((feeRes.data || []).map((f) => Number(f.month)))));

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadErr('');
    // Active enrollment → enrollment id, class label, academic year (for ordering + id).
    Promise.all([
      apiFetch(`/api/enrollments?student_id=${studentId}&status=active&limit=1`),
      apiFetch(`/api/fees?student_id=${studentId}&limit=100`),
    ])
      .then(([enrRes, feeRes]) => {
        if (cancelled) return;
        setEnrollment((enrRes.data || [])[0] || null);
        setExistingMonths(new Set((feeRes.data || []).map((f) => Number(f.month))));
      })
      .catch((e) => { if (!cancelled) setLoadErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const ay = enrollment?.class_year?.academic_year;
  // Months ordered by the academic year (Apr→Mar for an April-start session).
  const startMonth = ay?.start_date ? new Date(ay.start_date).getMonth() + 1 : 4;
  const orderedMonths = Array.from({ length: 12 }, (_, i) => ((startMonth - 1 + i) % 12) + 1);

  const cls = enrollment?.class_year?.class;
  const classLabel = cls ? `${cls.name}-${cls.section}` : '—';

  const toggle = (m) => {
    if (existingMonths.has(m) || busy) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!enrollment || picked.size === 0 || busy) return;
    setErr(''); setResult(null); setBusy(true);
    try {
      const res = await apiFetch('/api/fees/generate', {
        method: 'POST',
        body: {
          enrollment_id: enrollment.id,
          academic_year_id: ay.id,
          months: Array.from(picked).sort((a, b) => a - b),
        },
      });
      setResult({ created: res.created || 0, skipped: res.skipped || 0, zero: res.zero || 0 });
      setPicked(new Set());
      await loadExisting();   // newly created months now show as "exists"
      onGenerated?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const noEnrollment = !loading && !loadErr && !enrollment;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <div onClick={busy ? undefined : onClose} style={{ position: 'absolute', inset: 0 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
          <ModalShell
            title="Generate fees"
            subtitle={enrollment ? `${studentName} · Class ${classLabel}${ay?.year_label ? ` · ${ay.year_label}` : ''}` : studentName}
            width={500}
            footer={<>
              <Btn variant="ghost" size="md" onClick={onClose} disabled={busy}>Close</Btn>
              <Btn variant="primary" size="md" onClick={handleGenerate} disabled={busy || !enrollment || picked.size === 0}>
                {busy ? 'Generating…' : `Generate${picked.size ? ` ${picked.size} month${picked.size === 1 ? '' : 's'}` : ''}`}
              </Btn>
            </>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {loading && <div style={{ ...hfText.small, color: hf.muted }}>Loading enrollment & fees…</div>}
              {loadErr && (
                <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>Couldn't load: {loadErr}</div>
              )}
              {noEnrollment && (
                <div style={{ ...hfText.small, color: hf.muted, background: hf.surface2, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>Enroll this student in a class first — fees attach to an active enrollment.</div>
              )}

              {enrollment && (<>
                <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.5 }}>
                  Tick the months to generate. Amounts come from the class's standard fee (set in <b>Fee Plans</b>). Months that already have a fee are marked and can't be re-ticked.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {orderedMonths.map((m) => {
                    const exists = existingMonths.has(m);
                    const on = picked.has(m);
                    return (
                      <button
                        key={m}
                        onClick={() => toggle(m)}
                        disabled={exists || busy}
                        className="hf-btn"
                        title={exists ? 'Already has a fee' : undefined}
                        style={{
                          padding: '10px 8px', borderRadius: 9, textAlign: 'left',
                          border: `1px solid ${on ? hf.primary : hf.border}`,
                          background: exists ? hf.surface2 : on ? hf.primarySoft : hf.surface,
                          color: exists ? hf.muted : hf.ink,
                          cursor: exists ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                          fontFamily: hfFonts.ui, fontSize: 12.5, fontWeight: 600,
                        }}
                      >
                        <span style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: `1.5px solid ${exists ? hf.faint : on ? hf.primary : hf.faint}`,
                          background: on ? hf.primary : 'transparent',
                          color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                        }}>{(on || exists) && I.check}</span>
                        <span>{monthName(m)}</span>
                        {exists && <span style={{ ...hfText.micro, fontSize: 9, marginLeft: 'auto' }}>EXISTS</span>}
                      </button>
                    );
                  })}
                </div>
              </>)}

              {err && (
                <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
              )}
              {result && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: hf.surface2, border: `1px solid ${hf.borderS}` }}>
                  <div style={{ ...hfText.small, fontWeight: 700, marginBottom: 6 }}>Done</div>
                  <div style={{ display: 'flex', gap: 16, ...hfText.small, color: hf.ink2 }}>
                    <span><b style={{ ...hfText.num, color: hf.good }}>{result.created}</b> created</span>
                    <span><b style={{ ...hfText.num }}>{result.skipped}</b> skipped (already existed)</span>
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

// Add a single ad-hoc fee with a custom amount for one student. Unlike
// "Generate fees" (which pulls fixed amounts from the class's standard fee),
// this lets the admin set any fee type, month, amount and discount by hand.
// Posts to POST /api/fees, which dedupes on (enrollment, fee_type, month).
const FEE_TYPE_OPTIONS = [
  { value: 'tuition',   label: 'Tuition' },
  { value: 'transport', label: 'Transport' },
  { value: 'admission', label: 'Admission' },
  { value: 'exam',      label: 'Exam' },
  { value: 'books',     label: 'Books' },
  { value: 'uniform',   label: 'Uniform' },
  { value: 'late_fee',  label: 'Late fee' },
];

const CustomFeeModal = ({ studentId, studentName, onClose, onAdded }) => {
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const [feeType, setFeeType] = useState('tuition');
  const [month, setMonth] = useState('');
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadErr('');
    apiFetch(`/api/enrollments?student_id=${studentId}&status=active&limit=1`)
      .then((enrRes) => { if (!cancelled) setEnrollment((enrRes.data || [])[0] || null); })
      .catch((e) => { if (!cancelled) setLoadErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const ay = enrollment?.class_year?.academic_year;
  const startMonth = ay?.start_date ? new Date(ay.start_date).getMonth() + 1 : 4;
  const orderedMonths = Array.from({ length: 12 }, (_, i) => ((startMonth - 1 + i) % 12) + 1);
  const cls = enrollment?.class_year?.class;
  const classLabel = cls ? `${cls.name}-${cls.section}` : '—';

  const amt = parseFloat(amount);
  const disc = discount.trim() === '' ? 0 : parseFloat(discount);
  const valid = enrollment && month !== '' && !Number.isNaN(amt) && amt >= 0
    && !Number.isNaN(disc) && disc >= 0 && disc <= amt;

  const handleAdd = async () => {
    if (!valid || busy) return;
    setErr(''); setBusy(true);
    try {
      await apiFetch('/api/fees', {
        method: 'POST',
        body: {
          enrollment_id: enrollment.id,
          fee_type: feeType,
          month: Number(month),
          amount: String(amount),
          discount: discount.trim() === '' ? '0' : String(discount),
          discount_reason: reason.trim() || undefined,
        },
      });
      setDone(true);
      onAdded?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const noEnrollment = !loading && !loadErr && !enrollment;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <div onClick={busy ? undefined : onClose} style={{ position: 'absolute', inset: 0 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
          <ModalShell
            title="Add custom fee"
            subtitle={enrollment ? `${studentName} · Class ${classLabel}${ay?.year_label ? ` · ${ay.year_label}` : ''}` : studentName}
            width={500}
            footer={<>
              <Btn variant="ghost" size="md" onClick={onClose} disabled={busy}>Close</Btn>
              {!done && (
                <Btn variant="primary" size="md" onClick={handleAdd} disabled={busy || !valid}>
                  {busy ? 'Adding…' : 'Add fee'}
                </Btn>
              )}
            </>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {loading && <div style={{ ...hfText.small, color: hf.muted }}>Loading enrollment…</div>}
              {loadErr && (
                <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>Couldn't load: {loadErr}</div>
              )}
              {noEnrollment && (
                <div style={{ ...hfText.small, color: hf.muted, background: hf.surface2, border: `1px solid ${hf.borderS}`, borderRadius: 9, padding: '9px 12px' }}>Enroll this student in a class first — fees attach to an active enrollment.</div>
              )}

              {enrollment && !done && (<>
                <div style={{ ...hfText.small, color: hf.ink2, lineHeight: 1.5 }}>
                  Set any amount by hand. A fee of the same type and month can only exist once per student.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FieldLabel required>Fee type</FieldLabel>
                    <FSelect value={feeType} onChange={setFeeType} options={FEE_TYPE_OPTIONS} disabled={busy} />
                  </div>
                  <div>
                    <FieldLabel required>Month</FieldLabel>
                    <FSelect
                      value={month}
                      onChange={setMonth}
                      disabled={busy}
                      options={[{ value: '', label: 'Select…' }, ...orderedMonths.map((m) => ({ value: String(m), label: monthName(m) }))]}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FieldLabel required>Amount (₹)</FieldLabel>
                    <FInput type="number" value={amount} onChange={setAmount} placeholder="e.g. 500" disabled={busy} />
                  </div>
                  <div>
                    <FieldLabel hint="optional">Discount (₹)</FieldLabel>
                    <FInput type="number" value={discount} onChange={setDiscount} placeholder="0" disabled={busy} />
                  </div>
                </div>
                {discount.trim() !== '' && (
                  <div>
                    <FieldLabel hint="optional">Discount reason</FieldLabel>
                    <FInput value={reason} onChange={setReason} placeholder="e.g. Sibling concession" disabled={busy} />
                  </div>
                )}
                {!Number.isNaN(amt) && !Number.isNaN(disc) && disc > amt && (
                  <div style={{ ...hfText.small, color: hf.accent }}>Discount can't exceed the amount.</div>
                )}
              </>)}

              {err && (
                <div style={{ ...hfText.small, color: hf.accent, background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`, borderRadius: 9, padding: '9px 12px' }}>{err}</div>
              )}
              {done && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: hf.surface2, border: `1px solid ${hf.borderS}` }}>
                  <div style={{ ...hfText.small, fontWeight: 700, marginBottom: 4, color: hf.good }}>Fee added</div>
                  <div style={{ ...hfText.small, color: hf.ink2 }}>{cap(feeType)} · {monthName(Number(month))} · ₹{amount}</div>
                </div>
              )}
            </div>
          </ModalShell>
        </div>
      </div>
    </div>
  );
};

// ─── A3 · Student detail ──────────────────────────────────────────────────
const HA3Detail = () => {
  const { id } = useParams();              // student id from the URL
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showEdit, setShowEdit] = useState(false);
  const [showGenFees, setShowGenFees] = useState(false);
  const [showCustomFee, setShowCustomFee] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [feeReload, setFeeReload] = useState(0); // bump to reload the ledger
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

  const confirmDelete = async () => {
    setDelBusy(true);
    setDelErr('');
    try {
      await apiFetch(`/api/students/${id}`, { method: 'DELETE' });
      navigate('/admin/students');
    } catch (e) {
      setDelErr(e.message);
      setDelBusy(false);
    }
  };

  // Edit-mode prefill now comes from the real student.
  const editInitial = s ? {
    id: s.id,
    name: s.name, phone: s.phone || '', email: s.email || '',
    gender: s.gender || '', caste: s.caste || '', address: s.address || '',
    admission_no: s.admission_no, epunjab_id: s.epunjab_id || '',
    aadhar_no: s.aadhar_no || '',
    dob: s.dob ? s.dob.slice(0, 10) : '',
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
          <Btn variant="outline" size="sm" icon={I.download} onClick={() => setShowExport(true)}>Export</Btn>
          <Btn variant="outline" size="sm" icon={I.arrUp} disabled title="Coming soon">Promote</Btn>
          <Btn variant="outline" size="sm" style={{ color: hf.accent, borderColor: hf.accentEdge }} onClick={() => { setDelErr(''); setShowDelete(true); }}>Delete</Btn>
          <Btn variant="outline" size="sm" icon={I.card} onClick={() => setShowGenFees(true)}>Generate fees</Btn>
          <Btn variant="outline" size="sm" icon={I.card} onClick={() => setShowCustomFee(true)}>Custom fee</Btn>
          <Btn variant="primary" size="sm" icon={I.card} onClick={() => navigate(`/admin/fees?tab=collect&student_id=${s.id}`)}>Collect fees</Btn>
        </>}
      >
        {/* Hero */}
        <Card style={{ background: `linear-gradient(135deg, ${hf.surface} 0%, ${hf.primarySoft} 100%)` }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Avatar name={s.name} size={isMobile ? 56 : 80} style={{ boxShadow: '0 4px 14px rgba(20,24,32,0.10)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...hfText.display, fontSize: isMobile ? 20 : 26 }}>{s.name}</div>
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

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: 14, alignItems: 'start' }}>
          {/* LEFT: details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card padding={0}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}` }}>
                <div style={{ ...hfText.h2 }}>Basic info</div>
              </div>
              <InfoRow label="Phone" value={s.phone} />
              <InfoRow label="Email" value={s.email} />
              <InfoRow label="Gender" value={s.gender} />
              <InfoRow label="DOB" value={s.dob ? new Date(s.dob).toLocaleDateString() : '—'} />
              <InfoRow label="Caste" value={s.caste} />
              <InfoRow label="Address" value={s.address} />
            </Card>

            <Card padding={0}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${hf.borderS}` }}>
                <div style={{ ...hfText.h2 }}>ID details</div>
              </div>
              <InfoRow label="Admission no." value={s.admission_no} />
              <InfoRow label="Aadhar" value={s.aadhar_no} />
              <InfoRow label="ePunjab ID" value={s.epunjab_id} />
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
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
            <StudentFeeLedger studentId={s.id} reloadToken={feeReload} />
          </div>
        </div>
      </AdminChrome>
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <StudentFormModal initial={editInitial} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); loadStudent(); }} />
        </div>
      )}
      {showGenFees && (
        <GenerateStudentFeesModal
          studentId={s.id}
          studentName={s.name}
          onClose={() => setShowGenFees(false)}
          onGenerated={() => setFeeReload((n) => n + 1)}
        />
      )}
      {showCustomFee && (
        <CustomFeeModal
          studentId={s.id}
          studentName={s.name}
          onClose={() => setShowCustomFee(false)}
          onAdded={() => setFeeReload((n) => n + 1)}
        />
      )}
      {showExport && (
        <ExportStudentModal student={s} onClose={() => setShowExport(false)} />
      )}
      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <ConfirmModal
            title="Delete student?"
            message={`This hides ${s.name} from active lists but keeps their records. You can reactivate them later from the Students list.`}
            confirmLabel="Delete"
            busy={delBusy}
            error={delErr}
            onConfirm={confirmDelete}
            onCancel={() => setShowDelete(false)}
          />
        </div>
      )}
    </>
  );
};

export { HA1, HA2, HA3, HA3Detail };
