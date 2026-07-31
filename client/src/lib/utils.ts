import clsx, { type ClassValue } from 'clsx';

export const cx = (...args: ClassValue[]) => clsx(...args);

export const gradeBadgeClass = (letter: string): string =>
  letter.startsWith('A')
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
    : letter.startsWith('B')
      ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400'
      : letter === 'C'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
        : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400';

export const statusBadgeClass = (status: string): string => ({
  DRAFT: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  SUBMITTED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  APPROVED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  PUBLISHED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  GENERATED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  EMPTY: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}[status] ?? 'bg-slate-200 text-slate-700');

export const fmtDate = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export const fmtDateTime = (iso?: string | null): string =>
  iso
    ? new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

export const timeAgo = (iso?: string | null): string => {
  if (!iso) return '—';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
};

export const ordinal = (n: number | null | undefined): string => {
  if (!n) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const initials = (name: string): string =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
