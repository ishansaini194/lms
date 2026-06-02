import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { hf, hfFonts, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Btn } from '@/components/ui/primitives';
import { FInput } from '@/components/ui/primitives';
import { useAuth } from '@/auth/AuthContext';

// School options — for now a small list; later this comes from the subdomain
// or a GET /api/schools lookup. Matches the school_code the backend expects.
const SCHOOLS = [
  { code: 'krb', name: 'Kendriya Riverside (KRB)' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '';

  const [schoolCode, setSchoolCode] = useState(SCHOOLS[0]?.code || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      const home = u?.role === 'teacher' ? '/teacher' : u?.role === 'student' ? '/portal-coming-soon' : '/admin';
      const dest = (from && from.startsWith(home)) ? from : home;
      navigate(dest, { replace: true });
    } catch (e) {
      setError(e.message === 'invalid credentials' ? 'Incorrect school, username, or password.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <div className="hf" style={{
      width: '100%', height: '100%', minHeight: '100vh',
      background: hf.bg, fontFamily: hfFonts.ui, color: hf.ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: 400, maxWidth: '100%' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, justifyContent: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${hf.primary}, oklch(0.55 0.16 290))`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em',
          }}>KR</div>
          <div>
            <div style={{ ...hfText.h2 }}>StudyMe</div>
            <div style={{ ...hfText.small, color: hf.muted, marginTop: -2 }}>School management</div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: hf.surface, border: `1px solid ${hf.border}`,
          borderRadius: 14, padding: 28, boxShadow: hf.shadowMd,
        }}>
          <div style={{ ...hfText.h1, fontSize: 22, marginBottom: 4 }}>Sign in</div>
          <div style={{ ...hfText.small, color: hf.muted, marginBottom: 20 }}>
            Welcome back. Enter your details to continue.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, display: 'block', marginBottom: 6 }}>School</label>
              <select
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', background: hf.surface,
                  border: `1px solid ${hf.border}`, borderRadius: 9,
                  fontSize: 13, color: hf.ink, fontFamily: hfFonts.ui,
                  appearance: 'none', cursor: 'pointer', outline: 'none',
                }}
              >
                {SCHOOLS.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, display: 'block', marginBottom: 6 }}>Username</label>
              <FInput value={username} onChange={setUsername} placeholder="admin or ePunjab / employee ID" />
            </div>

            <div>
              <label style={{ ...hfText.small, fontWeight: 600, color: hf.ink2, display: 'block', marginBottom: 6 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKey}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '9px 12px', background: hf.surface,
                  border: `1px solid ${hf.border}`, borderRadius: 9,
                  fontSize: 13, color: hf.ink, fontFamily: hfFonts.ui, outline: 'none',
                }}
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
              style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
