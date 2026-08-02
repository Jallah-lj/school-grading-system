import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { api, apiError, apiUrl } from '../lib/api';
import { useQuery } from '../lib/useQuery';

import type { SchoolPublicInfo } from '../lib/types';

const schema = z.object({ email: z.string().email('Enter a valid email address') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const { data: school } = useQuery(
    () => api.get<SchoolPublicInfo>('/school/public').then((r) => r.data),
    [],
  );

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email: values.email.toLowerCase().trim() });
      setSent(true);
    } catch (err) {
      setError(apiError(err));
    }
  };

  const schoolName = school?.name ?? 'School Grading System';

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 sm:p-10">
            <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">
              <Icon name="arrow-left" size={16} />
              Back to sign in
            </a>

            <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Reset your password</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter your email and we'll send a reset link.</p>

            {sent ? (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                <div className="flex items-start gap-2.5">
                  <Icon name="check-circle" size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Check your inbox</p>
                    <p className="mt-1">If an account exists, we've sent a reset link to that email. It expires in 15 minutes.</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300">
                    <Icon name="x-circle" size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
                  <div>
                    <label className="label" htmlFor="email">Email address</label>
                    <div className="relative">
                      <Icon name="mail" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input id="email" type="email" className="input pl-10" placeholder="you@school.rw" autoComplete="email" {...register('email')} />
                    </div>
                    {errors.email && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500"><Icon name="x-circle" size={13} />{errors.email.message}</p>
                    )}
                  </div>
                  <button type="submit" className="btn-primary w-full py-2.5 text-sm font-semibold" disabled={isSubmitting}>
                    {isSubmitting ? (<><Spinner className="h-4 w-4 animate-spin text-white" /> Sending…</>) : 'Send reset link'}
                  </button>
                </form>
              </>
            )}
          </div>
          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">© {new Date().getFullYear()} {schoolName}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
