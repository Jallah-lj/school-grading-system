import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { api, apiError } from '../lib/api';

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine((data) => data.password === data.confirm, {
  message: "Passwords don't match",
  path: ['confirm'],
});

type FormValues = z.infer<typeof schema>;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, newPassword: values.password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 sm:p-10">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Set a new password</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a strong password to secure your account.</p>

            {!token && (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300">
                <div className="flex items-start gap-2.5">
                  <Icon name="x-circle" size={16} className="mt-0.5 shrink-0" />
                  <span>Missing or invalid reset token. Please use the link from your email.</span>
                </div>
              </div>
            )}

            {done ? (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                <div className="flex items-start gap-2.5">
                  <Icon name="check-circle" size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Password reset successfully</p>
                    <p className="mt-1">Redirecting you to sign in...</p>
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
                    <label className="label" htmlFor="password">New password</label>
                    <input id="password" type="password" className="input" placeholder="At least 8 characters" {...register('password')} />
                    {errors.password && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500"><Icon name="x-circle" size={13} />{errors.password.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="label" htmlFor="confirm">Confirm password</label>
                    <input id="confirm" type="password" className="input" placeholder="Re-enter your new password" {...register('confirm')} />
                    {errors.confirm && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500"><Icon name="x-circle" size={13} />{errors.confirm.message}</p>
                    )}
                  </div>
                  <button type="submit" className="btn-primary w-full py-2.5 text-sm font-semibold" disabled={isSubmitting || !token}>
                    {isSubmitting ? (<><Spinner className="h-4 w-4 animate-spin text-white" /> Updating…</>) : 'Reset password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
