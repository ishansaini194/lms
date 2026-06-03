import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { AuthProvider, useAuth } from '@/auth/AuthContext';
import Login from '@/pages/auth/Login.jsx';

// Screen components ported from the hi-fi mock. They already render their own
// AdminChrome (sidebar + topbar), so each route renders one screen directly.
import { HA1, HA2, HA3, HA3Detail } from '@/pages/admin/screens.jsx';
import { HA4, HA5, HA6 } from '@/pages/admin/screens2.jsx';
import { HA7, HA7Detail, HA7ReportCard, HA9 } from '@/pages/admin/screens3.jsx';

// Teacher portal.
import TeacherDashboard from '@/pages/teacher/TeacherDashboard.jsx';
import TeacherClasses from '@/pages/teacher/TeacherClasses.jsx';
import TeacherHomework from '@/pages/teacher/TeacherHomework.jsx';
import { TeacherMarksList, TeacherMarksGrid } from '@/pages/teacher/TeacherMarks.jsx';
import TeacherNotices from '@/pages/teacher/TeacherNotices.jsx';
import TeacherProfile from '@/pages/teacher/TeacherProfile.jsx';
import TeacherLibrary from '@/pages/teacher/TeacherLibrary.jsx';

// Student / parent portal.
import StudentDashboard from '@/pages/student/StudentDashboard.jsx';
import StudentHomework from '@/pages/student/StudentHomework.jsx';
import StudentNotices from '@/pages/student/StudentNotices.jsx';
import StudentResults from '@/pages/student/StudentResults.jsx';
import StudentProfile from '@/pages/student/StudentProfile.jsx';

// Where each role lands after login / when hitting a route they shouldn't.
function homeFor(role) {
  if (role === 'teacher') return '/teacher';
  if (role === 'student') return '/student';
  return '/admin'; // admin and any unknown role
}

// Redirect to /login when there's no token, remembering where we came from.
// When `role` is set, wrong-role users are sent to their own home (not a 403).
function ProtectedRoute({ children, role }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (role && user?.role !== role) {
    return <Navigate to={homeFor(user?.role)} replace />;
  }
  return children;
}

// Bare "/" and unknown paths resolve to the signed-in user's home.
function RoleHome() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(user?.role)} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Admin portal — gated behind auth + admin role */}
      <Route path="/admin"                          element={<ProtectedRoute role="admin"><HA1 /></ProtectedRoute>} />
      <Route path="/admin/classes"                  element={<ProtectedRoute role="admin"><HA2 /></ProtectedRoute>} />
      <Route path="/admin/students"                 element={<ProtectedRoute role="admin"><HA3 /></ProtectedRoute>} />
      <Route path="/admin/students/:id"             element={<ProtectedRoute role="admin"><HA3Detail /></ProtectedRoute>} />
      <Route path="/admin/fees"                     element={<ProtectedRoute role="admin"><HA4 /></ProtectedRoute>} />
      <Route path="/admin/teachers"                 element={<ProtectedRoute role="admin"><HA5 /></ProtectedRoute>} />
      <Route path="/admin/notices"                  element={<ProtectedRoute role="admin"><HA6 /></ProtectedRoute>} />
      <Route path="/admin/exams"                    element={<ProtectedRoute role="admin"><HA7 /></ProtectedRoute>} />
      <Route path="/admin/exams/:id"                element={<ProtectedRoute role="admin"><HA7Detail /></ProtectedRoute>} />
      <Route path="/admin/exams/:id/report/:studentId" element={<ProtectedRoute role="admin"><HA7ReportCard /></ProtectedRoute>} />
      <Route path="/admin/settings"                 element={<ProtectedRoute role="admin"><HA9 /></ProtectedRoute>} />

      {/* Teacher portal */}
      <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboard /></ProtectedRoute>} />
      <Route path="/teacher/classes" element={<ProtectedRoute role="teacher"><TeacherClasses /></ProtectedRoute>} />
      <Route path="/teacher/homework" element={<ProtectedRoute role="teacher"><TeacherHomework /></ProtectedRoute>} />
      <Route path="/teacher/marks" element={<ProtectedRoute role="teacher"><TeacherMarksList /></ProtectedRoute>} />
      <Route path="/teacher/marks/:examId" element={<ProtectedRoute role="teacher"><TeacherMarksGrid /></ProtectedRoute>} />
      <Route path="/teacher/notices" element={<ProtectedRoute role="teacher"><TeacherNotices /></ProtectedRoute>} />
      <Route path="/teacher/profile" element={<ProtectedRoute role="teacher"><TeacherProfile /></ProtectedRoute>} />
      <Route path="/teacher/library" element={<ProtectedRoute role="teacher"><TeacherLibrary /></ProtectedRoute>} />

      {/* Student / parent portal — gated behind auth + student role */}
      <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/homework" element={<ProtectedRoute role="student"><StudentHomework /></ProtectedRoute>} />
      <Route path="/student/notices" element={<ProtectedRoute role="student"><StudentNotices /></ProtectedRoute>} />
      <Route path="/student/results" element={<ProtectedRoute role="student"><StudentResults /></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute role="student"><StudentProfile /></ProtectedRoute>} />

      <Route path="/" element={<RoleHome />} />
      <Route path="*" element={<RoleHome />} />
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
