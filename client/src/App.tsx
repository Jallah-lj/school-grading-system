import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './components/layout/AppLayout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';

import type { ReactNode } from 'react';

import type { Role } from './lib/types';

// Route-level code splitting: each page is fetched only when its route is
// visited, keeping the initial bundle small (chart.js, signature_pad, etc.
// are only loaded by the pages that actually use them).
const Administration = lazy(() => import('./pages/Administration'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Approvals = lazy(() => import('./pages/Approvals'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const GradeEntry = lazy(() => import('./pages/GradeEntry'));
const Legal = lazy(() => import('./pages/Legal'));
const Login = lazy(() => import('./pages/Login'));
const MyGrades = lazy(() => import('./pages/MyGrades'));
const MyProfile = lazy(() => import('./pages/MyProfile'));
const Parents = lazy(() => import('./pages/Parents'));
const ReportCards = lazy(() => import('./pages/ReportCards'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const Students = lazy(() => import('./pages/Students'));
const TeacherProfile = lazy(() => import('./pages/TeacherProfile'));
const Teachers = lazy(() => import('./pages/Teachers'));
const VerifyReportCard = lazy(() => import('./pages/VerifyReportCard'));

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
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/login" element={<Login />} />
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
