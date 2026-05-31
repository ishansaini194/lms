import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, setToken, login as apiLogin } from '@/lib/api';

const AuthContext = createContext(null);

const USER_KEY = 'studyme_user';
const SCHOOL_KEY = 'studyme_school';

function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadSchool() {
  try {
    const raw = localStorage.getItem(SCHOOL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Initialize from localStorage so a refresh keeps the session.
  const [token, setTok] = useState(() => getToken());
  const [user, setUser] = useState(() => loadUser());
  const [school, setSchool] = useState(() => loadSchool());

  // Keep storage in sync whenever token/user/school change.
  useEffect(() => { setToken(token); }, [token]);
  useEffect(() => {
    try {
      user ? localStorage.setItem(USER_KEY, JSON.stringify(user))
           : localStorage.removeItem(USER_KEY);
    } catch {}
  }, [user]);
  useEffect(() => {
    try {
      school ? localStorage.setItem(SCHOOL_KEY, JSON.stringify(school))
             : localStorage.removeItem(SCHOOL_KEY);
    } catch {}
  }, [school]);

  const login = async (credentials) => {
    const res = await apiLogin(credentials);
    setTok(res.token);
    setUser(res.user);
    setSchool(res.school || null);
    return res.user;
  };

  const logout = () => {
    setTok(null);
    setUser(null);
    setSchool(null);
  };

  const value = {
    token,
    user,
    school,
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
