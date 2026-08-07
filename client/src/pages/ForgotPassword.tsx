import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { api, apiError } from '../lib/api';

const schema = z.object({ email: z.string().email('Enter a valid email address') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [code, setCode] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [resendDisabled, setResendDisabled] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/forgot-password', {
        email: values.email.toLowerCase().trim(),
      });
      if (data.code) {
        setCode(data.code);
        setExpiresIn(data.expiresInSeconds ?? 600);
        setStep('code');
      } else {
        // Email not found — same message as before, no code shown.
        setError(data.message ?? 'If an account exists, a verification code has been generated.');
      }
    } catch (err) {
      setError(apiError(err));
    }
  };

  const handleResend = async () => {
    setError(null);
    try {
      const { data } = await api.post('/auth/forgot-password', {
        email: (document.querySelector('input[type="email"]') as HTMLInputElement)?.value?.toLowerCase().trim() ?? '',
      });
      if (data.code) {
        setCode(data.code);
        setExpiresIn(data.expiresInSeconds ?? 600);
      }
    } catch (err) {
      setError(apiError(err));
    }
  };

  const schoolName = 'School Grading System';

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

            {step === 'form' && (
              <>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Enter your email and we'll generate a verification code you can use to set a new password.
                </p>

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
                  <button
                    type="submit"
                    className="btn-primary w-full py-2.5 text-sm font-semibold"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner className="h-4 w-4 animate-spin text-white" />
                        Sending…
                      </>
                    ) : (
                      'Generate verification code'
                    )}
                  </button>
                </form>
              </>
            )}

            {step === 'code' && code && (
              <div className="mt-6 space-y-5">
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/30 dark:text-indigo-300">
                  <div className="flex items-start gap-2.5">
                    <Icon name="key" size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Your verification code</p>
                      <p className="mt-1">
                        Enter this code on the next page along with your new password. The code expires in{' '}
                        <span className="font-mono font-bold">{expiresIn}</span> seconds.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Verification Code
                  </p>
                  <p className="mt-2 text-3xl font-mono font-bold tracking-[0.15em] text-slate-800 dark:text-slate-100 select-all">
                    {code.split('').join(' ')}
                  </p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {expiresIn > 0 ? `Expires in ${expiresIn}s` : 'Expired'}
                  </p>
                </div>

                <button
                  type="button"
                  className="btn-primary w-full py-2.5 text-sm font-semibold"
                  onClick={() => navigate('/reset-password-code', { state: { email: (document.querySelector('input[type="email"]') as HTMLInputElement)?.value } })}
                >
                  Continue to reset password
                </button>

                <button
                  type="button"
                  className="w-full py-2 text-center text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  disabled={resendDisabled}
                  onClick={handleResend}
                >
                  {resendDisabled ? 'Code regenerated' : 'Generate new code'}
                </button>
              </div>
            )}
          </div>
          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            © {new Date().getFullYear()} {schoolName}. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
