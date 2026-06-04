// Teacher chrome (sidebar + topbar). Mirrors AdminChrome's structure; the teacher
// hi-fi kit was never ported as a file, so this is built directly against the real
// primitives/icons. Nav items for pages that don't exist yet render visibly
// disabled and are enabled (flag → true, with a real `to`) as each step lands.
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Avatar, ModalShell, Btn } from '@/components/ui/primitives';
import { useAuth } from '@/auth/AuthContext';
import { apiFetch } from '@/lib/api';

// First letter of up to two words of the school name → logo initials.
const schoolInitials = (name) => {
  if (!name) return 'S';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'S';
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// `enabled: false` items render greyed and non-clickable. Flip to true + keep
// `to` as each page ships.
const teacherNav = [
  { id: 'Dashboard',   icon: I.home,      to: '/teacher',          enabled: true },
  { id: 'My Classes',  icon: I.grid,      to: '/teacher/classes',  enabled: true },
  { id: 'Homework',    icon: I.book,      to: '/teacher/homework', enabled: true },
  { id: 'Marks Entry', icon: I.chart,     to: '/teacher/marks',    enabled: true },
  { id: 'Notices',     icon: I.bell,      to: '/teacher/notices',  enabled: true },
  { id: 'Library',     icon: I.library,   to: '/teacher/library',  enabled: true },
  { id: 'Profile',     icon: I.user,      to: '/teacher/profile',  enabled: true },
];

const classLabel = (cy) =>
  cy?.class ? `${cy.class.name}${cy.class.section ? '-' + cy.class.section : ''}` : `Class ${cy?.class_id ?? '—'}`;

// 1c: this list shows only class-teacher classes (the /class-years endpoint
// self-scopes to class_teacher_id for teachers). Teaching-assignment classes
// (subjects taught) are added when the teacher dashboard endpoint lands.
const MyClassesMiniList = () => {
  const [classes, setClasses] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/class-years')
      .then((rows) => { if (!cancelled) setClasses(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setClasses([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ margin: '4px 4px 14px' }}>
      <div style={{ ...hfText.micro, padding: '0 4px 8px' }}>My classes</div>
      {classes === null ? null : classes.length === 0 ? (
        <div style={{ ...hfText.small, color: hf.muted, padding: '2px 4px' }}>No classes assigned yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {classes.map((cy) => (
            <div key={cy.id} style={{
              padding: '8px 10px', borderRadius: 9,
              background: hf.surface2, border: `1px solid ${hf.borderS}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: hf.ink, ...hfText.num }}>{classLabel(cy)}</div>
              <div style={{ fontSize: 11, color: hf.muted, marginTop: -1 }}>Class teacher</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TeacherSidebar = ({ active: activeProp }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, school, logout } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const doLogout = () => { logout(); navigate('/login', { replace: true }); };

  const active = activeProp || teacherNav.find(n =>
    n.enabled && (n.to === '/teacher' ? location.pathname === '/teacher' : location.pathname.startsWith(n.to))
  )?.id;

  return (
    <aside style={{
      width: 232, height: '100%', flexShrink: 0,
      background: hf.surface, borderRight: `1px solid ${hf.border}`,
      display: 'flex', flexDirection: 'column',
      padding: '18px 14px',
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 18px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `linear-gradient(135deg, ${hf.primary}, oklch(0.55 0.16 290))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontFamily: hfFonts.ui, fontWeight: 700, fontSize: 14,
          letterSpacing: '-0.02em',
        }}>{schoolInitials(school?.name)}</div>
        <div>
          <div style={{ fontFamily: hfFonts.ui, fontSize: 14, fontWeight: 650, color: hf.ink, letterSpacing: '-0.01em' }}>{school?.name || 'School'}</div>
          <div style={{ fontFamily: hfFonts.ui, fontSize: 11, color: hf.muted, marginTop: -1 }}>Teacher portal</div>
        </div>
      </div>

      <MyClassesMiniList />

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {teacherNav.map(item => {
          if (!item.enabled) {
            return (
              <div key={item.id} title="Coming soon" style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '8px 10px', borderRadius: 8,
                fontFamily: hfFonts.ui, fontSize: 13, fontWeight: 550,
                color: hf.faint, cursor: 'not-allowed',
                border: '1px solid transparent',
              }}>
                <span style={{ display: 'inline-flex', color: hf.faint }}>{item.icon}</span>
                <span>{item.id}</span>
              </div>
            );
          }
          const isActive = item.id === active;
          return (
            <Link key={item.id} to={item.to} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '8px 10px', borderRadius: 8,
                fontFamily: hfFonts.ui, fontSize: 13, fontWeight: 550,
                color: isActive ? hf.primary : hf.ink2,
                background: isActive ? hf.primarySoft : 'transparent',
                border: `1px solid ${isActive ? hf.primaryEdge : 'transparent'}`,
                cursor: 'pointer',
              }}>
                <span style={{ display: 'inline-flex', color: isActive ? hf.primary : hf.muted }}>{item.icon}</span>
                <span>{item.id}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Account */}
      <div onClick={() => setConfirmOpen(true)} title="Sign out" className="hf-clickable" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 8px 6px', borderTop: `1px solid ${hf.borderS}`,
      }}>
        <Avatar name={user?.display_name || user?.username || 'User'} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: hf.ink, lineHeight: 1.2 }}>
            {user?.display_name || user?.username || 'User'}
          </div>
          <div style={{ fontSize: 11, color: hf.muted, lineHeight: 1.2 }}>
            {user?.role ? cap(user.role) : ''} · sign out
          </div>
        </div>
        <span style={{ color: hf.muted, display: 'inline-flex' }}>{I.more}</span>
      </div>

      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
             onClick={() => setConfirmOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
            <ModalShell
              title="Sign out of StudyMe?"
              width={400}
              footer={<>
                <Btn variant="ghost" size="md" onClick={() => setConfirmOpen(false)}>Cancel</Btn>
                <Btn variant="accent" size="md" onClick={() => { setConfirmOpen(false); doLogout(); }}>Sign out</Btn>
              </>}
            >
              <div style={{ ...hfText.body, color: hf.ink2, lineHeight: 1.6 }}>
                You'll need to sign in again to access the teacher portal.
              </div>
            </ModalShell>
          </div>
        </div>
      )}
    </aside>
  );
};

const TeacherTopBar = ({ title, breadcrumb, right }) => (
  <header style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 24px', borderBottom: `1px solid ${hf.border}`,
    background: hf.surface, flexShrink: 0,
  }}>
    <div style={{ minWidth: 0 }}>
      {breadcrumb && <div style={{ ...hfText.small, color: hf.muted, marginBottom: 2 }}>{breadcrumb}</div>}
      <div style={{ ...hfText.h1 }}>{title}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {right}
    </div>
  </header>
);

export function TeacherChrome({ active, title, breadcrumb, topRight, children, contentPad = 24 }) {
  return (
    <div className="hf" style={{
      width: '100%', height: '100%', display: 'flex',
      background: hf.bg, fontFamily: hfFonts.ui, color: hf.ink, overflow: 'hidden',
    }}>
      <TeacherSidebar active={active} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <TeacherTopBar title={title} breadcrumb={breadcrumb} right={topRight} />
        <main className="hf-scroll" style={{
          flex: 1, minHeight: 0, overflow: 'auto', padding: contentPad,
          display: 'flex', flexDirection: 'column', gap: 18,
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}
