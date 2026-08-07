import { cx } from '../lib/utils';

import { Icon, type IconName } from './Icon';

import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-stone-900 dark:text-white">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'brand',
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: string;
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'moss';
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-700/10 text-brand-800 dark:bg-brand-400/10 dark:text-brand-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
    moss: 'bg-moss-100 text-moss-700 dark:bg-moss-500/15 dark:text-moss-400',
  };
  return (
    <div className="card flex items-center gap-4 p-5">
      <div
        className={cx(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
          tones[tone],
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm text-stone-500 dark:text-stone-400">{label}</div>
        <div className="truncate text-2xl font-bold text-stone-900 dark:text-white">{value}</div>
        {hint && <div className="text-xs text-stone-400">{hint}</div>}
      </div>
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cx('badge', className)}>{children}</span>;
}

export function EmptyState({
  title,
  hint,
  icon = 'archive',
}: {
  title: string;
  hint?: string;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100 text-stone-400 dark:bg-stone-800">
        <Icon name={icon} size={22} />
      </div>
      <div className="font-medium text-stone-700 dark:text-stone-200">{title}</div>
      {hint && <div className="max-w-sm text-sm text-stone-400">{hint}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-950/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cx(
          'card relative max-h-[90vh] w-full overflow-y-auto p-6',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-white">
            {title}
          </h2>
          <button className="btn-ghost px-2 py-1" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ className = 'text-brand-700' }: { className?: string }) {
  return (
    <svg className={cx('h-5 w-5 animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
