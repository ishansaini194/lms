// Admin chrome + admin-only components — ported from admin-hifi-kit.jsx.
// Sidebar/TopBar nav wired to React Router instead of static `active` prop.
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Avatar } from '@/components/ui/primitives';
import { useAuth } from '@/auth/AuthContext';

const adminNav = [
  { id: 'Dashboard', icon: I.home,   to: '/admin' },
  { id: 'Classes',   icon: I.grid,   to: '/admin/classes' },
  { id: 'Students',  icon: I.user,   to: '/admin/students' },
  { id: 'Fees',      icon: I.card,   to: '/admin/fees' },
  { id: 'Teachers',  icon: I.user,   to: '/admin/teachers' },
  { id: 'Notices',   icon: I.bell,   to: '/admin/notices' },
  { id: 'Exams',     icon: I.chart,  to: '/admin/exams' },
  { id: 'Settings',  icon: I.shield, to: '/admin/settings' },
];

const AdminSidebar = ({ active: activeProp }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const doLogout = () => { logout(); navigate('/login', { replace: true }); };
  const active = activeProp || (adminNav.find(n =>
    n.to === '/admin' ? location.pathname === '/admin'
      : location.pathname.startsWith(n.to)
  )?.id);
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
      }}>KR</div>
      <div>
        <div style={{ fontFamily: hfFonts.ui, fontSize: 14, fontWeight: 650, color: hf.ink, letterSpacing: '-0.01em' }}>Kendriya Riverside</div>
        <div style={{ fontFamily: hfFonts.ui, fontSize: 11, color: hf.muted, marginTop: -1 }}>Admin console</div>
      </div>
    </div>

    {/* Year switcher */}
    <div style={{
      margin: '4px 4px 14px',
      padding: '10px 12px', borderRadius: 9,
      background: hf.surface2, border: `1px solid ${hf.borderS}`,
      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: hf.primarySoft, color: hf.primary,
        border: `1px solid ${hf.primaryEdge}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{I.cal}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: hf.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Academic year</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: hf.ink, ...hfText.num }}>2025–26</div>
      </div>
      <span style={{ color: hf.muted, display: 'inline-flex' }}>{I.chev}</span>
    </div>

    {/* Nav */}
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {adminNav.map(item => {
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
    <div onClick={doLogout} title="Sign out" className="hf-clickable" style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 8px 6px', borderTop: `1px solid ${hf.borderS}`,
    }}>
      <Avatar name={user?.username || 'R Singh'} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: hf.ink, lineHeight: 1.2 }}>
          {user?.username === 'admin' || !user ? 'Mr. R. Singh' : user.username}
        </div>
        <div style={{ fontSize: 11, color: hf.muted, lineHeight: 1.2 }}>
          {user?.role ? `${user.role.charAt(0).toUpperCase()}${user.role.slice(1)}` : 'Principal · admin'} · sign out
        </div>
      </div>
      <span style={{ color: hf.muted, display: 'inline-flex' }}>{I.logout || I.more}</span>
    </div>
  </aside>
  );
};

export const AdminTopBar = ({ title, breadcrumb, right }) => (
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px 6px 12px', borderRadius: 10,
        background: hf.surface2, border: `1px solid ${hf.borderS}`,
        color: hf.muted, fontSize: 12.5, fontFamily: hfFonts.ui,
        minWidth: 280,
      }}>
        {I.search}
        <span style={{ color: hf.faint }}>Search students, receipts, teachers…</span>
        <span style={{ marginLeft: 'auto', fontFamily: hfFonts.mono, fontSize: 10, color: hf.faint,
          border: `1px solid ${hf.border}`, padding: '1px 5px', borderRadius: 4 }}>⌘K</span>
      </div>
      <div style={{
        position: 'relative', width: 36, height: 36, borderRadius: 9,
        background: hf.surface2, border: `1px solid ${hf.borderS}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: hf.ink2,
      }}>
        {I.bell}
        <span style={{
          position: 'absolute', top: 5, right: 6, width: 7, height: 7, borderRadius: '50%',
          background: hf.accent, border: `2px solid ${hf.surface2}`,
        }} />
      </div>
    </div>
  </header>
);

export const AdminChrome = ({ active, title, breadcrumb, topRight, children, contentPad = 24 }) => (
  <div className="hf" style={{
    width: '100%', height: '100%', display: 'flex',
    background: hf.bg, fontFamily: hfFonts.ui, color: hf.ink, overflow: 'hidden',
  }}>
    <AdminSidebar active={active} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <AdminTopBar title={title} breadcrumb={breadcrumb} right={topRight} />
      <main className="hf-scroll" style={{
        flex: 1, overflow: 'auto', padding: contentPad,
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {children}
      </main>
    </div>
  </div>
);

export const Tabs = ({ items, active, onChange }) => (
  <div style={{
    display: 'flex', gap: 4, borderBottom: `1px solid ${hf.border}`,
  }}>
    {items.map(it => {
      const isActive = it === active || it.id === active;
      const label = typeof it === 'string' ? it : it.label;
      const value = typeof it === 'string' ? it : (it.id || it.label);
      const count = typeof it === 'object' ? it.count : null;
      return (
        <div key={label} onClick={() => onChange?.(value)} style={{
          padding: '10px 16px 12px',
          fontFamily: hfFonts.ui, fontSize: 13, fontWeight: 600,
          color: isActive ? hf.primary : hf.inkSoft,
          borderBottom: `2px solid ${isActive ? hf.primary : 'transparent'}`,
          marginBottom: -1,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 7,
        }}>
          {label}
          {count != null && (
            <span style={{
              padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 600,
              background: isActive ? hf.primarySoft : hf.surface2,
              color: isActive ? hf.primary : hf.muted,
              border: `1px solid ${isActive ? hf.primaryEdge : hf.borderS}`,
            }}>{count}</span>
          )}
        </div>
      );
    })}
  </div>
);

export const Segmented = ({ items, active, onChange }) => (
  <div style={{
    display: 'inline-flex', padding: 3, borderRadius: 10,
    background: hf.surface2, border: `1px solid ${hf.borderS}`,
  }}>
    {items.map(it => {
      const isActive = it === active;
      return (
        <button key={it} onClick={() => onChange?.(it)} className="hf-btn" style={{
          padding: '5px 12px', borderRadius: 7,
          background: isActive ? hf.surface : 'transparent',
          color: isActive ? hf.ink : hf.inkSoft,
          border: `1px solid ${isActive ? hf.border : 'transparent'}`,
          boxShadow: isActive ? '0 1px 1px rgba(20,24,32,0.04)' : 'none',
          fontFamily: hfFonts.ui, fontSize: 12.5, fontWeight: 600,
        }}>{it}</button>
      );
    })}
  </div>
);

export const ClassChip = ({ cls, style = {} }) => (
  <span style={{
    padding: '2px 9px', borderRadius: 6,
    background: hf.surface2, color: hf.inkSoft,
    border: `1px solid ${hf.borderS}`,
    fontFamily: hfFonts.ui, fontSize: 11, fontWeight: 650,
    letterSpacing: '-0.01em', ...style,
  }}>{cls}</span>
);

export const Searchbox = ({ placeholder, width = 240, style = {} }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', borderRadius: 9,
    background: hf.surface, border: `1px solid ${hf.border}`,
    color: hf.muted, fontSize: 12.5, fontFamily: hfFonts.ui,
    width, ...style,
  }}>{I.search}<span>{placeholder}</span></div>
);

export const Dropdown = ({ label, value, width = 160, style = {} }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', borderRadius: 9,
    background: hf.surface, border: `1px solid ${hf.border}`,
    fontSize: 12.5, fontFamily: hfFonts.ui, color: hf.ink2, fontWeight: 550,
    minWidth: width, justifyContent: 'space-between',
    ...style,
  }}>
    <span><span style={{ color: hf.muted, fontWeight: 500 }}>{label}: </span>{value}</span>
    <span style={{ color: hf.muted, display: 'inline-flex' }}>{I.arrDown}</span>
  </div>
);

export const FieldLabel = ({ children, required, hint }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
    <span style={{ ...hfText.small, fontWeight: 600, color: hf.ink2 }}>{children}</span>
    {required && <span style={{ color: hf.accent, fontSize: 11 }}>*</span>}
    {hint && <span style={{ marginLeft: 'auto', fontSize: 11, color: hf.muted }}>{hint}</span>}
  </div>
); 
export const TextInput = ({ value, placeholder, style = {} }) => (
  <div style={{
    padding: '9px 12px', background: hf.surface, border: `1px solid ${hf.border}`,
    borderRadius: 9, fontSize: 13, color: value ? hf.ink : hf.faint,
    fontFamily: hfFonts.ui, ...style,
  }}>{value || placeholder}</div>
); 
export const TextArea = ({ children, minHeight = 100, style = {} }) => (
  <div style={{
    padding: '11px 13px', background: hf.surface, border: `1px solid ${hf.border}`,
    borderRadius: 10, fontSize: 13, color: hf.ink, lineHeight: 1.6,
    fontFamily: hfFonts.ui, minHeight, ...style,
  }}>{children}</div>
); 


