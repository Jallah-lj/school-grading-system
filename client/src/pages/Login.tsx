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
  'Automated Assessment Engine (GPA, Letter Grades & Weighted Totals)',
  'Secure Role-Based Access Control (RBAC) for all stakeholders',
  'Verifiable Digital Transcripts & Printable PDF Report Cards with QR Verification',
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
    <div className="flex min-h-screen bg-stone-100 dark:bg-stone-950">
      {/* Branding panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-12 text-white lg:flex">
        {/* Decorative background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(#f3d78f 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="pointer-events-none absolute -left-28 top-1/4 h-96 w-96 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-400/10 blur-3xl" />

        {/* Header */}
        <div className="relative z-10 flex items-center gap-4">
          {school?.hasBadge ? (
            <img
              src={apiUrl('/school/badge')}
              alt="School badge"
              className="h-12 w-12 rounded-xl bg-white/95 object-contain p-1 shadow-lg shadow-black/20 ring-1 ring-white/25"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 font-display text-xl font-bold text-brand-950 shadow-lg shadow-black/20 ring-1 ring-white/25">
              {schoolName[0]}
            </div>
          )}
          <div className="min-w-0">
            <span className="block truncate text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300/90">
              School grading portal
            </span>
            <span className="block truncate font-display text-xl font-semibold leading-tight">
              {schoolName}
            </span>
            {school?.motto && (
              <span className="mt-0.5 block truncate text-xs italic text-brand-200/80">
                “{school.motto}”
              </span>
            )}
          </div>
        </div>

        {/* Pitch */}
        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-200 ring-1 ring-amber-300/25">
            <Icon name="shield-check" size={12} />
            School Grading Portal
          </span>
          <h1 className="mt-6 font-display text-[42px] font-semibold leading-[1.1] tracking-tight">
            Assessment, <em className="text-amber-300">automated.</em>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-brand-100/85">
            Grade entry, automatic GPA &amp; ranking, printable report cards with QR verification,
            and performance analytics — in one secure platform.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-100/90">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-amber-300" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/10 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-brand-200/80">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {schoolYearLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300/10 px-2.5 py-1 font-semibold text-amber-200 ring-1 ring-amber-300/25">
                  <Icon name="calendar" size={12} />
                  {schoolYearLabel}
                </span>
              )}
              <span>Secure · Role-based · Audited</span>
            </div>
            <div className="flex flex-col items-end gap-1 text-brand-200/60">
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
                  className="h-9 w-9 rounded-lg bg-white object-contain p-0.5 ring-1 ring-stone-200 dark:ring-stone-700"
                />
              )}
              <div className="min-w-0">
                <div className="truncate font-display text-xl font-semibold tracking-tight text-stone-900 dark:text-white">
                  {schoolName}
                </div>
                {school?.motto && (
                  <div className="mt-0.5 truncate text-xs italic text-stone-500 dark:text-stone-400">
                    “{school.motto}”
                  </div>
                )}
              </div>
            </div>

            {/* Sign-in card */}
            <div className="rounded-xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-900/5 dark:border-stone-800 dark:bg-stone-900 sm:p-10">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-700/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-brand-800 ring-1 ring-brand-700/15 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/25">
                <Icon name="shield-check" size={12} />
                Secure sign in
              </span>
              <h2 className="mt-4 font-display text-[26px] font-semibold tracking-tight text-stone-900 dark:text-white">
                Welcome back
              </h2>
              <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
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
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500"
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
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500"
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 dark:hover:bg-stone-800 dark:hover:text-stone-300"
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
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
              >
                Forgot your password?
              </Link>
              <span className="flex items-center gap-1.5 text-xs text-stone-400 dark:text-stone-500">
                <Icon name="corner-up-left" size={13} />
                Trouble signing in? Contact your school administrator.
              </span>
            </div>
          </div>
        </div>

        {/* Mobile / narrow footer */}
        <footer className="border-t border-stone-200 px-6 py-4 text-center text-xs text-stone-400 dark:border-stone-800 lg:hidden">
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center sm:gap-3">
            {schoolYearLabel && (
              <span className="font-medium text-stone-500 dark:text-stone-400">
                {schoolYearLabel}
              </span>
            )}
            <span>
              © {copyrightYear} {schoolName}. All rights reserved.
            </span>
          </div>
          <div className="mt-1.5 flex justify-center gap-2">
            <Link to="/terms" className="hover:text-brand-700 hover:underline">
              Terms
            </Link>
            <span>·</span>
            <Link to="/privacy" className="hover:text-brand-700 hover:underline">
              Privacy
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
