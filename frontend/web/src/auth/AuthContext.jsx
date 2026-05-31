import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, setToken, login as apiLogin } from '@/lib/api';

const AuthContext = createContext(null);

const USER_KEY = 'studyme_user';

function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Initialize from localStorage so a refresh keeps the session.
  const [token, setTok] = useState(() => getToken());
  const [user, setUser] = useState(() => loadUser());

  // Keep storage in sync whenever token/user change.
  useEffect(() => { setToken(token); }, [token]);
  useEffect(() => {
    try {
      user ? localStorage.setItem(USER_KEY, JSON.stringify(user))
           : localStorage.removeItem(USER_KEY);
    } catch {}
  }, [user]);

  const login = async (credentials) => {
    const { token: t, user: u } = await apiLogin(credentials);
    setTok(t);
    setUser(u);
    return u;
  };

  const logout = () => {
    setTok(null);
    setUser(null);
  };

  const value = {
    token,
    user,
    isAuthenticated: !!token,
    login,
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
