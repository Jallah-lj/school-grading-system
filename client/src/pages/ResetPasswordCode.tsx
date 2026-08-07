import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { api, apiError } from '../lib/api';

const schema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    code: z
      .string()
      .length(6, 'Code must be exactly 6 digits')
      .regex(/^\d{6}$/, 'Code must be 6 digits'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordCode() {
  const location = useLocation();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialEmail = ((location.state as { email?: string } | null)?.email ?? '').toLowerCase().trim();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail },
  });

  // Pre-fill email from URL param or state
  useState(() => {
    const params = new URLSearchParams(location.search);
    const emailParam = params.get('email');
    if (emailParam) setValue('email', emailParam.toLowerCase().trim());
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post('/auth/reset-password', {
        email: values.email,
        code: values.code,
        newPassword: values.password,
      });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-900/5 dark:border-stone-800 dark:bg-stone-900 sm:p-10">
            <h2 className="text-[26px] font-semibold font-display tracking-tight text-stone-900 dark:text-white">Set a new password</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Enter the verification code shown on the previous page, then choose a new password.
            </p>

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
                    <label className="label" htmlFor="email">Email address</label>
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
                    <label className="label" htmlFor="code">
                      Verification code
                      <span className="text-slate-400 font-normal ml-1">(from previous page)</span>
                    </label>
                    <div className="relative">
                      <Icon
                        name="shield-check"
                        size={16}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                      />
                      <input
                        id="code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        className="input pl-10 font-mono tracking-[0.15em] text-center text-lg"
                        placeholder="1 2 3 4 5 6"
                        autoComplete="one-time-code"
                        {...register('code')}
                      />
                    </div>
                    {errors.code && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500">
                        <Icon name="x-circle" size={13} />
                        {errors.code.message}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Enter the 6-digit code displayed on the previous page.
                    </p>
                  </div>

                  <div>
                    <label className="label" htmlFor="password">New password</label>
                    <input
                      id="password"
                      type="password"
                      className="input"
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      {...register('password')}
                    />
                    {errors.password && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500">
                        <Icon name="x-circle" size={13} />
                        {errors.password.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="label" htmlFor="confirm">Confirm password</label>
                    <input
                      id="confirm"
                      type="password"
                      className="input"
                      placeholder="Re-enter your new password"
                      autoComplete="new-password"
                      {...register('confirm')}
                    />
                    {errors.confirm && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500">
                        <Icon name="x-circle" size={13} />
                        {errors.confirm.message}
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
                        Updating…
                      </>
                    ) : (
                      'Reset password'
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            © {new Date().getFullYear()} School Grading System. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
