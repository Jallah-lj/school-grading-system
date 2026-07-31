import { useState } from 'react';
import { Icon } from '../components/Icon';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
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
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
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

  const fill = (email: string, password: string) => {
    setValue('email', email);
    setValue('password', password);
  };

  return (
    <div className="flex min-h-screen">
      {/* Branding panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          {school?.hasBadge
            ? <img src={apiUrl('/school/badge')} alt="School badge" className="h-12 w-12 object-contain" />
            : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl font-extrabold">{(school?.name ?? 'S')[0]}</div>}
          <span className="text-lg font-semibold">{school?.name ?? 'School Grading System'}</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Assessment, automated.</h1>
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
        <div className="text-xs text-indigo-200">Secure · Role-based · Audited</div>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            {school?.hasBadge && <img src={apiUrl('/school/badge')} alt="" className="h-9 w-9 object-contain" />}
            <div className="text-2xl font-bold">{school?.name ?? 'School Grading System'}</div>
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
    </div>
  );
}
