import React from 'react';
import { useNavigate } from 'react-router-dom';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { useAuth } from '@/auth/AuthContext';

// Stub landing for the student role until the student portal ships.
export default function PortalComingSoon() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const doLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div className="hf" style={{
      width: '100%', height: '100%', minHeight: '100vh',
      background: hf.bg, fontFamily: hfFonts.ui, color: hf.ink,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 24, textAlign: 'center',
    }}>
      <div style={{ ...hfText.h1 }}>Student portal is coming soon.</div>
      <div style={{ ...hfText.body, color: hf.muted }}>Hang tight — we're still building this.</div>
      <button onClick={doLogout} style={{
        marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: hfFonts.ui, fontSize: 13, fontWeight: 600, color: hf.primary,
      }}>Sign out</button>
    </div>
  );
}
