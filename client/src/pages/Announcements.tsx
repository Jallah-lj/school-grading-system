import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  message: z.string().min(1, 'Message is required').max(2000),
  audience: z.enum(['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STUDENTS_AND_PARENTS']).default('ALL'),
  link: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  includeEmail: z.boolean().optional().default(true),
  includeSMS: z.boolean().optional().default(false),
});

type FormValues = z.infer<typeof schema>;

export default function Announcements() {
  const { hasRole } = useAuth();
  const [sent, setSent] = useState(false);
  const [result, setResult] = useState<{ notifiedInApp: number; notifiedEmail?: number; notifiedSMS?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { audience: 'ALL', includeEmail: true, includeSMS: false } });

  if (!hasRole('ADMIN')) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access denied</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Only administrators can broadcast announcements.</p>
        </div>
      </div>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const { data } = await api.post('/announcements/broadcast', {
        title: values.title,
        message: values.message,
        audience: values.audience,
        link: values.link || undefined,
        includeEmail: values.includeEmail,
        includeSMS: values.includeSMS,
      });
      setSent(true);
      setResult({
        notifiedInApp: data.notifiedInApp,
        notifiedEmail: data.notifiedEmail,
        notifiedSMS: data.notifiedSMS,
      });
      reset();
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Broadcast Announcement</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Send a message to students, parents, teachers, or everyone — via in-app notification, email, and optional SMS/WhatsApp.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {sent && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            <div className="flex items-start gap-2.5">
              <Icon name="check-circle" size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Announcement sent</p>
                <p className="mt-1">
                  Notified {result?.notifiedInApp ?? 0} users in-app
                  {result?.notifiedEmail ? ` · ${result.notifiedEmail} emails` : ''}
                  {result?.notifiedSMS ? ` · ${result.notifiedSMS} SMS` : ''}.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300">
            <Icon name="x-circle" size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" type="text" className="input" placeholder="Term 2 grades released" {...register('title')} />
            {errors.title && (<p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500"><Icon name="x-circle" size={13} />{errors.title.message}</p>)}
          </div>

          <div>
            <label className="label" htmlFor="message">Message</label>
            <textarea id="message" rows={4} className="input min-h-[120px] resize-y" placeholder="Your announcement details..." {...register('message')} />
            {errors.message && (<p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500"><Icon name="x-circle" size={13} />{errors.message.message}</p>)}
          </div>

          <div>
            <label className="label" htmlFor="audience">Audience</label>
            <select id="audience" className="input" {...register('audience')}>
              <option value="ALL">All users</option>
              <option value="STUDENTS">Students only</option>
              <option value="PARENTS">Parents only</option>
              <option value="TEACHERS">Teachers only</option>
              <option value="STUDENTS_AND_PARENTS">Students & Parents</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="link">Deep link (optional)</label>
            <input id="link" type="url" className="input" placeholder="https://..." {...register('link')} />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800" {...register('includeEmail')} />
              <span>Email notification</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800" {...register('includeSMS')} />
              <span>SMS / WhatsApp-style</span>
            </label>
          </div>

          <button type="submit" className="btn-primary w-full py-2.5 text-sm font-semibold" disabled={isSubmitting}>
            {isSubmitting ? (<><Spinner className="h-4 w-4 animate-spin text-white" /> Sending…</>) : 'Broadcast Announcement'}
          </button>
        </form>
      </div>
    </div>
  );
}
