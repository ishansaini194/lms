import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { Btn } from '@/components/ui/primitives';
import { useAuth } from '@/auth/AuthContext';
import { apiFetch } from '@/lib/api';
import { useIsMobile } from '@/lib/useIsMobile';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '';
  const isMobile = useIsMobile();

  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolCode, setSchoolCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Load the school list from the backend (public endpoint). The dropdown is
  // populated from the DB so adding a school needs no code change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await apiFetch('/api/schools', { auth: false });
        if (cancelled) return;
        setSchools(Array.isArray(list) ? list : []);
        if (Array.isArray(list) && list.length > 0) setSchoolCode(list[0].code);
      } catch (e) {
        if (!cancelled) setError('Could not load schools. Please try again or enter your details.');
      } finally {
        if (!cancelled) setSchoolsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    setError('');
    if (!schoolCode || !username || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setBusy(true);
    try {
      const u = await login({ school_code: schoolCode, username, password });
      // Honor an explicit "from" only if it matches the user's portal; else go to their home.
      const home = u?.role === 'teacher' ? '/teacher' : u?.role === 'student' ? '/student' : '/admin';
      const dest = (from && from.startsWith(home)) ? from : home;
      navigate(dest, { replace: true });
    } catch (e) {
      setError(e.message === 'invalid credentials' ? 'Incorrect school, username, or password.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter') submit(); };

  const fieldStyle = {
    width: '100%',
    height: isMobile ? 46 : 40,
    padding: isMobile ? '11px 13px' : '9px 12px',
    background: hf.surface,
    border: `1px solid ${hf.border}`,
    borderRadius: 9,
    fontSize: isMobile ? 16 : 13,
    color: hf.ink,
    fontFamily: hfFonts.ui,
    outline: 'none',
  };

  return (
    <div className="hf" style={{
      width: '100%', minHeight: '100dvh',
      background: hf.bg, fontFamily: hfFonts.ui, color: hf.ink,
      display: 'flex',
      alignItems: isMobile ? 'flex-start' : 'center',
      justifyContent: 'center',
      padding: isMobile ? '20px 16px 28px' : 24,
    }}>
      <div style={{ width: isMobile ? '100%' : 400, maxWidth: 400, paddingTop: isMobile ? 18 : 0 }}>
        {/* Brand */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: isMobile ? 18 : 22,
          justifyContent: isMobile ? 'flex-start' : 'center',
        }}>
          <div style={{
            width: isMobile ? 44 : 40,
            height: isMobile ? 44 : 40,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${hf.primary}, oklch(0.55 0.16 290))`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 15,
          }}>SM</div>
          <div>
            <div style={{ ...hfText.h2, fontSize: isMobile ? 18 : hfText.h2.fontSize }}>StudyMe</div>
            <div style={{ ...hfText.small, color: hf.muted, marginTop: -2 }}>School management</div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: hf.surface, border: `1px solid ${hf.border}`,
          borderRadius: isMobile ? 12 : 14,
          padding: isMobile ? 20 : 28,
          boxShadow: isMobile ? hf.shadowSm : hf.shadowMd,
        }}>
          <div style={{ ...hfText.h1, fontSize: isMobile ? 24 : 22, marginBottom: 4 }}>Sign in</div>
          <div style={{ ...hfText.small, color: hf.muted, marginBottom: 20 }}>
            Welcome back. Enter your details to continue.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 14 }}>
            <div>
              <label style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, display: 'block', marginBottom: 6 }}>School</label>
              <select
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value)}
                disabled={schoolsLoading}
                style={{
                  ...fieldStyle,
                  appearance: 'none',
                  cursor: schoolsLoading ? 'not-allowed' : 'pointer',
                  background: schoolsLoading ? hf.surface2 : hf.surface,
                }}
              >
                {schoolsLoading ? (
                  <option value="">Loading schools…</option>
                ) : schools.length === 0 ? (
                  <option value="">No schools available</option>
                ) : (
                  schools.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)
                )}
              </select>
            </div>

            <div>
              <label style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, display: 'block', marginBottom: 6 }}>Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={onKey}

                autoCapitalize="none"
                autoCorrect="off"
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, display: 'block', marginBottom: 6 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKey}
                style={fieldStyle}
              />
            </div>

            {error && (
              <div style={{
                ...hfText.small, color: hf.accent,
                background: hf.accentSoft, border: `1px solid ${hf.accentEdge}`,
                borderRadius: 9, padding: '9px 12px',
              }}>{error}</div>
            )}

            <Btn variant="primary" size="lg" onClick={submit} disabled={busy}
              style={{
                width: '100%',
                justifyContent: 'center',
                marginTop: 4,
                height: isMobile ? 48 : undefined,
                fontSize: isMobile ? 15 : undefined,
              }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
