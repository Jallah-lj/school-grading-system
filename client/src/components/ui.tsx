import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { cx } from '../lib/utils';

import { Icon, type IconName } from './Icon';

import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  meta,
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Small overline above the title, e.g. the section name. */
  eyebrow?: string;
  /** Context chips rendered under the subtitle (academic term, class…). */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-7">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[1.5rem] font-semibold leading-tight tracking-tight text-stone-900 dark:text-white sm:text-[1.75rem]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
            {subtitle}
          </p>
        )}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Small context chip used under page titles (academic term, class, role…). */
export function MetaChip({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
      {icon && (
        <Icon name={icon} size={12} className="shrink-0 text-brand-700 dark:text-brand-300" />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'brand',
  muted = false,
  to,
  linkTitle,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: string;
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'moss';
  /** Renders the value in a muted style — for intentional "not available" values. */
  muted?: boolean;
  /** When set the whole card becomes a router link. */
  to?: string;
  linkTitle?: string;
}) {
  const tones: Record<string, string> = {
    brand:
      'bg-brand-700/10 text-brand-800 ring-brand-700/15 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20',
    emerald:
      'bg-emerald-100 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-400/20',
    amber:
      'bg-amber-100 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-400/25',
    rose: 'bg-rose-100 text-rose-700 ring-rose-600/15 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-400/20',
    moss: 'bg-moss-100 text-moss-700 ring-moss-600/15 dark:bg-moss-500/15 dark:text-moss-400 dark:ring-moss-400/20',
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm font-medium text-stone-500 dark:text-stone-400">
          {label}
        </div>
        <div
          className={cx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
            tones[tone],
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      </div>
      <div className="mt-auto pt-3">
        <div
          className={cx(
            'truncate text-2xl font-bold leading-none tracking-tight tabular-nums',
            muted
              ? 'font-semibold text-stone-400 dark:text-stone-500'
              : 'text-stone-900 dark:text-white',
          )}
        >
          {value}
        </div>
        {hint && (
          <div className="mt-1.5 text-xs leading-snug text-stone-500 dark:text-stone-400">
            {hint}
          </div>
        )}
      </div>
    </>
  );

  const className = cx(
    'card flex h-full min-h-[7.25rem] flex-col justify-between p-5',
    to && 'card-hover',
  );

  if (to) {
    return (
      <Link to={to} title={linkTitle} data-testid="metric-card" className={className}>
        {body}
      </Link>
    );
  }
  return (
    <div data-testid="metric-card" className={className}>
      {body}
    </div>
  );
}

/** Loading skeleton that mirrors the StatCard layout. */
export function StatCardSkeleton() {
  return (
    <div
      data-testid="metric-card"
      className="card flex h-full min-h-[7.25rem] flex-col justify-between p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-10 w-10 rounded-lg" />
      </div>
      <div className="pt-3">
        <div className="skeleton h-7 w-16" />
        <div className="skeleton mt-2 h-3 w-32" />
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
  action,
  compact = false,
}: {
  title: string;
  hint?: string;
  icon?: IconName;
  /** Optional call-to-action (e.g. a link to the relevant page). */
  action?: ReactNode;
  /** Tighter vertical rhythm for panels inside a grid. */
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-2 px-6 text-center',
        compact ? 'py-8' : 'py-12',
      )}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500"
        aria-hidden="true"
      >
        <Icon name={icon} size={22} />
      </div>
      <div className="text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</div>
      {hint && (
        <p className="max-w-sm text-sm leading-relaxed text-stone-400 dark:text-stone-500">
          {hint}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Error panel with a recovery action (retry). */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center"
      role="alert"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
        aria-hidden="true"
      >
        <Icon name="warning" size={22} />
      </div>
      <div className="text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</div>
      {message && (
        <p className="max-w-sm text-sm leading-relaxed text-stone-400 dark:text-stone-500">
          {message}
        </p>
      )}
      {onRetry && (
        <button type="button" className="btn-secondary mt-3 px-3 py-1.5 text-xs" onClick={onRetry}>
          <Icon name="refresh" size={14} /> Try again
        </button>
      )}
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

/** Skeleton for a titled chart panel (title bar + plot area). */
export function ChartPanelSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="card p-5">
      <div className="skeleton mb-4 h-5 w-44" />
      <div className="skeleton w-full" style={{ height }} />
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-brand-950/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cx(
          'card relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl p-0 sm:rounded-lg',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800 sm:px-6">
          <h2
            id="modal-title"
            className="font-display text-lg font-semibold text-stone-900 dark:text-white"
          >
            {title}
          </h2>
          <button className="btn-ghost min-h-11 min-w-11 px-2" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

export function RoleCard({
  role,
  description,
}: {
  role: 'parent' | 'student' | 'teacher';
  description: string;
}) {
  const labels = { parent: 'Parent', student: 'Student', teacher: 'Teacher' };
  return (
    <div className="flex items-start gap-3 rounded-md border border-white/10 bg-white/5 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-300/15 text-amber-300">
        <Icon name={role} size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{labels[role]}</div>
        <p className="mt-0.5 text-xs leading-snug text-brand-100/75">{description}</p>
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
