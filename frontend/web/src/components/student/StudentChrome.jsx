// Student / parent chrome (sidebar + topbar). Mirrors TeacherChrome's structure
// and layout exactly; only the nav set and labels differ. Parents sign in with
// the student account, so there is one student-scoped portal here. No search,
// no messages, no notification bell — none of those backends exist.
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Avatar, ModalShell, Btn } from '@/components/ui/primitives';
import { useAuth } from '@/auth/AuthContext';
import { useIsMobile } from '@/lib/useIsMobile';
import { StudentTabBar, TAB_BAR_HEIGHT } from '@/components/student/StudentTabBar';

// First letter of up to two words of the school name → logo initials.
const schoolInitials = (name) => {
  if (!name) return 'S';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'S';
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const studentNav = [
  { id: 'Dashboard', icon: I.home,    to: '/student',          enabled: true },
  { id: 'Homework',  icon: I.book,    to: '/student/homework', enabled: true },
  { id: 'Library',   icon: I.library, to: '/student/library',  enabled: true },
  { id: 'Notices',   icon: I.bell,    to: '/student/notices',  enabled: true },
  { id: 'Results',   icon: I.chart,   to: '/student/results',  enabled: true },
  { id: 'Profile',   icon: I.user,    to: '/student/profile',  enabled: true },
];

const StudentSidebar = ({ active: activeProp }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, school, logout } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const doLogout = () => { logout(); navigate('/login', { replace: true }); };

  const active = activeProp || studentNav.find(n =>
    n.enabled && (n.to === '/student' ? location.pathname === '/student' : location.pathname.startsWith(n.to))
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
          <div style={{ fontFamily: hfFonts.ui, fontSize: 11, color: hf.muted, marginTop: -1 }}>Student portal</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {studentNav.map(item => {
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
        <Avatar name={user?.display_name || user?.username || 'Student'} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: hf.ink, lineHeight: 1.2 }}>
            {user?.display_name || user?.username || 'Student'}
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
                You'll need to sign in again to access the student portal.
              </div>
            </ModalShell>
          </div>
        </div>
      )}
    </aside>
  );
};

const StudentTopBar = ({ title, breadcrumb, right }) => (
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

// Compact top bar for the mobile layout: school mark + page title, plus a
// sign-out affordance (the desktop sidebar's account row has no place on mobile).
// Self-contained (own auth + confirm) so the desktop path is left untouched.
const StudentMobileTopBar = ({ title }) => {
  const navigate = useNavigate();
  const { user, school, logout } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const doLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 800,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px',
      borderBottom: `1px solid ${hf.border}`, background: hf.surface,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: `linear-gradient(135deg, ${hf.primary}, oklch(0.55 0.16 290))`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontFamily: hfFonts.ui, fontWeight: 700, fontSize: 13,
      }}>{schoolInitials(school?.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...hfText.h1, fontSize: 17, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ ...hfText.small, fontSize: 11, color: hf.muted, marginTop: -1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{school?.name || 'Student portal'}</div>
      </div>
      <button onClick={() => setConfirmOpen(true)} aria-label="Sign out" className="hf-btn" style={{
        width: 40, height: 40, borderRadius: 9, flexShrink: 0,
        border: `1px solid ${hf.border}`, background: hf.surface, color: hf.muted,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{I.more}</button>

      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => setConfirmOpen(false)}>
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
                Signed in as <b>{user?.display_name || user?.username || 'Student'}</b>. You'll need to sign in again to access the portal.
              </div>
            </ModalShell>
          </div>
        </div>
      )}
    </header>
  );
};

export function StudentChrome({ active, title, breadcrumb, topRight, children, contentPad = 24 }) {
  const isMobile = useIsMobile();
  const location = useLocation();
  // Pages pass `active` explicitly; fall back to the path for safety.
  const activeId = active || studentNav.find(n =>
    n.to === '/student' ? location.pathname === '/student' : location.pathname.startsWith(n.to)
  )?.id;

  // ── Mobile: normal document scroll + fixed bottom tab bar (no trapped flex) ──
  if (isMobile) {
    return (
      <div className="hf" style={{
        minHeight: '100dvh', background: hf.bg, fontFamily: hfFonts.ui, color: hf.ink,
        // Reserve space so the last content clears the fixed bottom bar.
        paddingBottom: `calc(${TAB_BAR_HEIGHT}px + 8px + env(safe-area-inset-bottom, 0px))`,
      }}>
        <StudentMobileTopBar title={title} />
        <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Page-level controls (e.g. Results year filter) go full-width on mobile. */}
          {topRight && <div style={{ width: '100%' }}>{topRight}</div>}
          {children}
        </main>
        <StudentTabBar items={studentNav} active={activeId} />
      </div>
    );
  }

  // ── Desktop: fixed sidebar + scrolling content (unchanged) ──
  return (
    <div className="hf" style={{
      width: '100%', height: '100dvh', display: 'flex',
      background: hf.bg, fontFamily: hfFonts.ui, color: hf.ink, overflow: 'hidden',
    }}>
      <StudentSidebar active={active} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <StudentTopBar title={title} breadcrumb={breadcrumb} right={topRight} />
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
