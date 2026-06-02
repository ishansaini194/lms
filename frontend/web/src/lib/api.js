// API layer. Currently runs in MOCK mode (no backend in this environment).
// When the Go backend is ready: set USE_MOCK = false and point API_BASE at it
// (or rely on the Vite dev proxy forwarding /api → :8080). Nothing else changes.

const USE_MOCK = false;
const API_BASE = ''; // '' = same origin; Vite proxy forwards /api in dev

const TOKEN_KEY = 'studyme_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
}

// Core fetch wrapper — attaches Bearer token, parses JSON, throws on non-2xx.
export async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// Multipart upload — attaches the Bearer token but lets the browser set the
// multipart boundary. NEVER set Content-Type on a FormData request, or the
// boundary is lost and the server can't parse the parts.
export async function apiUpload(path, formData) {
  const headers = {};
  const t = getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return data;
}

// ─── Auth calls ───────────────────────────────────────────────────────────
// Login: POST /api/login { school_code, username, password }
//   → { token, user: { id, username, role, school_id, display_name },
//       school: { id, name, code } }
export async function login({ school_code, username, password }) {
  if (USE_MOCK) {
    // Mock: accept the demo admin so the gated flow is testable without a backend.
    await new Promise((r) => setTimeout(r, 350)); // simulate latency
    const ok =
      school_code.trim().toLowerCase() === 'krb' &&
      username.trim() === 'admin' &&
      password === 'admin123';
    if (!ok) {
      throw new Error('invalid credentials');
    }
    return {
      token: 'mock.jwt.token',
      user: { id: 1, username: 'admin', role: 'admin', school_id: 1 },
    };
  }
  return apiFetch('/api/login', {
    method: 'POST',
    auth: false,
    body: { school_code, username, password },
  });
}

// Decode a JWT payload (no verification — display only). Real verification is
// server-side. Returns null for the mock token or anything unparseable.
export function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}
