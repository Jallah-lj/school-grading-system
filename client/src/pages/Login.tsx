import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../lib/auth';
import { api, apiError, apiUrl } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import type { SchoolPublicInfo } from '../lib/types';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const { data: school } = useQuery(() => api.get<SchoolPublicInfo>('/school/public').then((r) => r.data), []);

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
  const schoolYearLabel = school?.academicYear
    ? `Academic Year ${school.academicYear}`
    : null;

  return (
    <div className="flex min-h-screen">
      {/* Branding panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          {school?.hasBadge
            ? <img src={apiUrl('/school/badge')} alt="School badge" className="h-12 w-12 object-contain" />
            : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl font-extrabold">{(school?.name ?? 'S')[0]}</div>}
          <div className="min-w-0">
            <span className="block text-lg font-semibold leading-tight">{school?.name ?? 'School Grading System'}</span>
            {school?.motto && (
              <span className="mt-0.5 block truncate text-xs italic text-indigo-200/90">“{school.motto}”</span>
            )}
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Assessment, automated.</h1>
          {school?.motto && (
            <p className="mt-3 max-w-md text-base font-medium italic text-indigo-100/95">
              “{school.motto}”
            </p>
          )}
          <p className="mt-4 max-w-md text-indigo-100">
            Grade entry, automatic GPA &amp; ranking, printable report cards with QR verification,
            and performance analytics — in one secure platform.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-indigo-100">
            {['Automatic totals, percentages, letter grades & GPA', 'Role-based access for admins, teachers, students & parents', 'PDF report cards, transcripts & CSV exports'].map((f) => (
              <li key={f} className="flex items-center gap-2"><Icon name="check-circle" size={15} className="text-emerald-300" />{f}</li>
            ))}
          </ul>
        </div>
        <footer className="border-t border-white/15 pt-6">
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
              <span>© {copyrightYear} {school?.name ?? 'School Grading System'}. All rights reserved.</span>
              <span className="flex gap-2">
                <Link to="/terms" className="hover:text-white hover:underline">Terms</Link>
                <span>·</span>
                <Link to="/privacy" className="hover:text-white hover:underline">Privacy</Link>
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Form */}
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              {school?.hasBadge && <img src={apiUrl('/school/badge')} alt="" className="h-9 w-9 object-contain" />}
              <div className="min-w-0">
                <div className="text-2xl font-bold">{school?.name ?? 'School Grading System'}</div>
                {school?.motto && (
                  <div className="mt-0.5 truncate text-xs italic text-slate-500 dark:text-slate-400">“{school.motto}”</div>
                )}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to your account to continue.</p>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
              <div>
                <label className="label" htmlFor="email">Email address</label>
                <input id="email" type="email" className="input" placeholder="you@school.rw" autoComplete="email" {...register('email')} />
                {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label" htmlFor="password">Password</label>
                <input id="password" type="password" className="input" placeholder="••••••••" autoComplete="current-password" {...register('password')} />
                {errors.password && <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>}
              </div>
              <button type="submit" className="btn-primary w-full py-2.5" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

          </div>
        </div>

        {/* Mobile / narrow footer */}
        <footer className="border-t border-slate-200 px-6 py-4 text-center text-xs text-slate-400 dark:border-slate-800 lg:hidden">
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center sm:gap-3">
            {schoolYearLabel && <span className="font-medium text-slate-500 dark:text-slate-400">{schoolYearLabel}</span>}
            <span>© {copyrightYear} {school?.name ?? 'School Grading System'}. All rights reserved.</span>
          </div>
          <div className="mt-1.5 flex justify-center gap-2">
            <Link to="/terms" className="hover:text-indigo-500 hover:underline">Terms</Link>
            <span>·</span>
            <Link to="/privacy" className="hover:text-indigo-500 hover:underline">Privacy</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
