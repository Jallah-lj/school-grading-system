import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { api, apiError, apiUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/useQuery';

import type { SchoolPublicInfo } from '../lib/types';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

const FEATURES = [
  'Automatic totals, percentages, letter grades & GPA',
  'Role-based access for admins, teachers, students & parents',
  'PDF report cards, transcripts & CSV exports',
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const { data: school } = useQuery(
    () => api.get<SchoolPublicInfo>('/school/public').then((r) => r.data),
    [],
  );

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err));
    }
  };

  const copyrightYear = new Date().getFullYear();
  const schoolYearLabel = school?.academicYear ? `Academic Year ${school.academicYear}` : null;
  const schoolName = school?.name ?? 'School Grading System';

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Branding panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-950 p-12 text-white lg:flex">
        {/* Decorative background */}
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-indigo-400/20 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.13) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />

        {/* Header */}
        <div className="relative z-10 flex items-center gap-3">
          {school?.hasBadge ? (
            <img
              src={apiUrl('/school/badge')}
              alt="School badge"
              className="h-12 w-12 rounded-xl object-contain shadow-lg shadow-black/20 ring-1 ring-white/25"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl font-extrabold backdrop-blur">
              {schoolName[0]}
            </div>
          )}
          <div className="min-w-0">
            <span className="block truncate text-lg font-semibold leading-tight">{schoolName}</span>
            {school?.motto && (
              <span className="mt-0.5 block truncate text-xs italic text-indigo-200/90">
                “{school.motto}”
              </span>
            )}
          </div>
        </div>

        {/* Pitch */}
        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-indigo-100 ring-1 ring-white/15">
            <Icon name="shield-check" size={12} />
            School Grading Portal
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight">
            Assessment, <span className="text-indigo-300">automated.</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-indigo-100/95">
            Grade entry, automatic GPA &amp; ranking, printable report cards with QR verification,
            and performance analytics — in one secure platform.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-indigo-100">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/15 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-200">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {schoolYearLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-medium text-indigo-50">
                  <Icon name="calendar" size={12} />
                  {schoolYearLabel}
                </span>
              )}
              <span>Secure · Role-based · Audited</span>
            </div>
            <div className="flex flex-col items-end gap-1 text-indigo-200/80">
              <span>
                © {copyrightYear} {schoolName}. All rights reserved.
              </span>
              <span className="flex gap-2">
                <Link to="/terms" className="hover:text-white hover:underline">
                  Terms
                </Link>
                <span>·</span>
                <Link to="/privacy" className="hover:text-white hover:underline">
                  Privacy
                </Link>
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md">
            {/* Mobile / narrow header */}
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              {school?.hasBadge && (
                <img
                  src={apiUrl('/school/badge')}
                  alt=""
                  className="h-9 w-9 rounded-lg object-contain ring-1 ring-slate-200 dark:ring-slate-700"
                />
              )}
              <div className="min-w-0">
                <div className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {schoolName}
                </div>
                {school?.motto && (
                  <div className="mt-0.5 truncate text-xs italic text-slate-500 dark:text-slate-400">
                    “{school.motto}”
                  </div>
                )}
              </div>
            </div>

            {/* Sign-in card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 sm:p-10">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20">
                <Icon name="shield-check" size={12} />
                Secure sign in
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Sign in with your account credentials to continue.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300"
                >
                  <Icon name="x-circle" size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
                <div>
                  <label className="label" htmlFor="email">
                    Email address
                  </label>
                  <div className="relative">
                    <Icon
                      name="mail"
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    />
                    <input
                      id="email"
                      type="email"
                      className="input pl-10"
                      placeholder="you@school.rw"
                      autoComplete="email"
                      {...register('email')}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500">
                      <Icon name="x-circle" size={13} />
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <Icon
                      name="lock"
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="input pl-10 pr-11"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    >
                      <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500">
                      <Icon name="x-circle" size={13} />
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full py-2.5 text-sm font-semibold"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Spinner className="h-4 w-4 animate-spin text-white" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <Icon name="arrow-right" size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Help */}
            <div className="mt-4 flex items-center justify-between">
              <Link to="/forgot-password" className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300">
                Forgot your password?
              </Link>
              <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                <Icon name="corner-up-left" size={13} />
                Trouble signing in? Contact your school administrator.
              </span>
            </div>
          </div>
        </div>

        {/* Mobile / narrow footer */}
        <footer className="border-t border-slate-200 px-6 py-4 text-center text-xs text-slate-400 dark:border-slate-800 lg:hidden">
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center sm:gap-3">
            {schoolYearLabel && (
              <span className="font-medium text-slate-500 dark:text-slate-400">
                {schoolYearLabel}
              </span>
            )}
            <span>
              © {copyrightYear} {schoolName}. All rights reserved.
            </span>
          </div>
          <div className="mt-1.5 flex justify-center gap-2">
            <Link to="/terms" className="hover:text-indigo-500 hover:underline">
              Terms
            </Link>
            <span>·</span>
            <Link to="/privacy" className="hover:text-indigo-500 hover:underline">
              Privacy
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
