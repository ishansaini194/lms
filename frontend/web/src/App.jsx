import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { AuthProvider, useAuth } from '@/auth/AuthContext';
import Login from '@/pages/auth/Login.jsx';

// Screen components ported from the hi-fi mock. They already render their own
// AdminChrome (sidebar + topbar), so each route renders one screen directly.
import { HA1, HA2, HA3, HA3Detail } from '@/pages/admin/screens.jsx';
import { HA4, HA5, HA6 } from '@/pages/admin/screens2.jsx';
import { HA7, HA7Detail, HA7ReportCard, HA9 } from '@/pages/admin/screens3.jsx';

// Redirect to /login when there's no token, remembering where we came from.
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Admin portal — all gated behind auth */}
      <Route path="/admin"                          element={<ProtectedRoute><HA1 /></ProtectedRoute>} />
      <Route path="/admin/classes"                  element={<ProtectedRoute><HA2 /></ProtectedRoute>} />
      <Route path="/admin/students"                 element={<ProtectedRoute><HA3 /></ProtectedRoute>} />
      <Route path="/admin/students/:id"             element={<ProtectedRoute><HA3Detail /></ProtectedRoute>} />
      <Route path="/admin/fees"                     element={<ProtectedRoute><HA4 /></ProtectedRoute>} />
      <Route path="/admin/teachers"                 element={<ProtectedRoute><HA5 /></ProtectedRoute>} />
      <Route path="/admin/notices"                  element={<ProtectedRoute><HA6 /></ProtectedRoute>} />
      <Route path="/admin/exams"                    element={<ProtectedRoute><HA7 /></ProtectedRoute>} />
      <Route path="/admin/exams/:id"                element={<ProtectedRoute><HA7Detail /></ProtectedRoute>} />
      <Route path="/admin/exams/:id/report/:studentId" element={<ProtectedRoute><HA7ReportCard /></ProtectedRoute>} />
      <Route path="/admin/settings"                 element={<ProtectedRoute><HA9 /></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
