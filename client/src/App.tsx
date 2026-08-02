import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './components/layout/AppLayout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Administration from './pages/Administration';
import Announcements from './pages/Announcements';
import Analytics from './pages/Analytics';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Approvals from './pages/Approvals';
import AuditLogs from './pages/AuditLogs';
import Dashboard from './pages/Dashboard';
import GradeEntry from './pages/GradeEntry';
import Legal from './pages/Legal';
import Login from './pages/Login';
import MyGrades from './pages/MyGrades';
import MyProfile from './pages/MyProfile';
import Parents from './pages/Parents';
import ReportCards from './pages/ReportCards';
import StudentProfile from './pages/StudentProfile';
import Students from './pages/Students';
import TeacherProfile from './pages/TeacherProfile';
import Teachers from './pages/Teachers';
import VerifyReportCard from './pages/VerifyReportCard';

import type { ReactNode } from 'react';

import type { Role } from './lib/types';

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
      <Spinner /> Loading…
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/terms" element={<Legal />} />
      <Route path="/privacy" element={<Legal />} />
      <Route path="/verify/:code" element={<VerifyReportCard />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/students"
          element={
            <RequireRole roles={['ADMIN', 'TEACHER']}>
              <Students />
            </RequireRole>
          }
        />
        <Route
          path="/students/:id"
          element={
            <RequireRole roles={['ADMIN', 'TEACHER']}>
              <StudentProfile />
            </RequireRole>
          }
        />
        <Route
          path="/teachers"
          element={
            <RequireRole roles={['ADMIN']}>
              <Teachers />
            </RequireRole>
          }
        />
        <Route
          path="/teachers/:id"
          element={
            <RequireRole roles={['ADMIN']}>
              <TeacherProfile />
            </RequireRole>
          }
        />
        <Route
          path="/parents"
          element={
            <RequireRole roles={['ADMIN']}>
              <Parents />
            </RequireRole>
          }
        />
        <Route
          path="/my-profile"
          element={
            <RequireRole roles={['TEACHER', 'STUDENT']}>
              <MyProfile />
            </RequireRole>
          }
        />
        <Route
          path="/grade-entry"
          element={
            <RequireRole roles={['TEACHER', 'ADMIN']}>
              <GradeEntry />
            </RequireRole>
          }
        />
        <Route
          path="/approvals"
          element={
            <RequireRole roles={['ADMIN']}>
              <Approvals />
            </RequireRole>
          }
        />
        <Route
          path="/grades"
          element={
            <RequireRole roles={['STUDENT', 'PARENT']}>
              <MyGrades />
            </RequireRole>
          }
        />
        <Route path="/report-cards" element={<ReportCards />} />
        <Route
          path="/analytics"
          element={
            <RequireRole roles={['ADMIN', 'TEACHER']}>
              <Analytics />
            </RequireRole>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <RequireRole roles={['ADMIN']}>
              <AuditLogs />
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole roles={['ADMIN']}>
              <Administration />
            </RequireRole>
          }
        />
        <Route
          path="/announcements"
          element={
            <RequireRole roles={['ADMIN']}>
              <Announcements />
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
