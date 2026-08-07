import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './components/layout/AppLayout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Administration from './pages/Administration';
import Analytics from './pages/Analytics';
import Announcements from './pages/Announcements';
import Approvals from './pages/Approvals';
import AuditLogs from './pages/AuditLogs';
import Dashboard from './pages/Dashboard';
import ForgotPassword from './pages/ForgotPassword';
import GradeEntry from './pages/GradeEntry';
import Legal from './pages/Legal';
import Login from './pages/Login';
import MyGrades from './pages/MyGrades';
import MyProfile from './pages/MyProfile';
import Parents from './pages/Parents';
import ReportCards from './pages/ReportCards';
import ResetPassword from './pages/ResetPassword';
import ResetPasswordCode from './pages/ResetPasswordCode';
import StudentProfile from './pages/StudentProfile';
import Students from './pages/Students';
import TeacherProfile from './pages/TeacherProfile';
import Teachers from './pages/Teachers';
import VerifyReportCard from './pages/VerifyReportCard';

import type { ReactNode } from 'react';

import type { Role } from './lib/types';

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 text-stone-500 dark:bg-stone-950 dark:text-stone-400">
      <div className="flex flex-col items-center gap-4">
        {/* Elegant institutional-themed pulse badge */}
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 shadow-lg shadow-brand-900/10 ring-1 ring-brand-800/10 dark:from-brand-600 dark:to-brand-800">
          <svg
            className="h-8 w-8 text-amber-300 animate-pulse"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-brand-800 dark:text-brand-300 uppercase">
          <Spinner className="h-3.5 w-3.5 text-brand-700 dark:text-brand-400" />
          <span>Loading…</span>
        </div>
      </div>
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

/**
 * The sidebar calls this feature “Announcements”. Older links and bookmarks may
 * use /announcements or /broadcast, so both URLs point at the same protected
 * page and a deep link never falls through to the catch-all route.
 */
function AdminAnnouncementsRoute() {
  return (
    <RequireRole roles={['ADMIN']}>
      <Announcements />
    </RequireRole>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password-code" element={<ResetPasswordCode />} />
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
        {/* /broadcast is retained for older bookmarks and notification links. */}
        <Route path="/announcements" element={<AdminAnnouncementsRoute />} />
        <Route path="/broadcast" element={<AdminAnnouncementsRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
