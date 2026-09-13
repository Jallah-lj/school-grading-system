import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { api, apiUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cx, fmtDate, initials } from '../../lib/utils';
import { ConfirmDialog } from '../ConfirmDialog';
import { Icon, type IconName } from '../Icon';
import { PwaControls } from '../PwaControls';
import { SignatureModal } from '../SignatureModal';
import { useToast } from '../toast';

import type { MouseEvent as ReactMouseEvent } from 'react';

import type { AppNotification, PendingApproval, Role, SchoolPublicInfo } from '../../lib/types';

type NavItem = { to: string; label: string; icon: IconName; roles: Role[]; section: string };

const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: 'home',
    roles: ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
    section: 'Academic',
  },
  {
    to: '/grade-entry',
    label: 'Grade Entry',
    icon: 'edit',
    roles: ['TEACHER', 'ADMIN'],
    section: 'Academic',
  },
  {
    to: '/grades',
    label: 'My Grades',
    icon: 'book',
    roles: ['STUDENT', 'PARENT'],
    section: 'Academic',
  },
  {
    to: '/report-cards',
    label: 'Report Cards',
    icon: 'file-text',
    roles: ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
    section: 'Academic',
  },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: 'bar-chart',
    roles: ['ADMIN', 'TEACHER'],
    section: 'Academic',
  },
  {
    to: '/students',
    label: 'Students',
    icon: 'student',
    roles: ['ADMIN', 'TEACHER'],
    section: 'People',
  },
  { to: '/teachers', label: 'Teachers', icon: 'teacher', roles: ['ADMIN'], section: 'People' },
  { to: '/parents', label: 'Parents', icon: 'parent', roles: ['ADMIN'], section: 'People' },
  {
    to: '/approvals',
    label: 'Approvals',
    icon: 'check-circle',
    roles: ['ADMIN'],
    section: 'Operations',
  },
  {
    to: '/broadcast',
    label: 'Announcements',
    icon: 'megaphone',
    roles: ['ADMIN'],
    section: 'Operations',
  },
  { to: '/audit-logs', label: 'Audit Logs', icon: 'shield', roles: ['ADMIN'], section: 'System' },
  { to: '/admin', label: 'Administration', icon: 'settings', roles: ['ADMIN'], section: 'System' },
  {
    to: '/my-profile',
    label: 'My Profile',
    icon: 'users',
    roles: ['TEACHER', 'STUDENT'],
    section: 'System',
  },
];

const SECTIONS = ['Academic', 'People', 'Operations', 'System'];

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('sgs.theme', next ? 'dark' : 'light');
  };
  return (
    <button
      onClick={toggle}
      className="btn-ghost px-2.5 py-2"
      aria-label="Toggle theme"
      title="Toggle dark / light mode"
    >
      <Icon name={dark ? 'sun' : 'moon'} size={18} />
    </button>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const navigate = useNavigate();

  const load = async () => {
    try {
      const { data } = await api.get<{ data: AppNotification[]; unreadCount: number }>(
        '/notifications',
      );
      setItems(data.data);
      setUnread(data.unreadCount);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(load, 60_000);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const markRead = async (n: AppNotification) => {
    if (!n.isRead) {
      try {
        await api.patch(`/notifications/${n.id}/read`);
        setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        /* ignore */
      }
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const markAll = async () => {
    await api.patch('/notifications/read-all');
    setItems((xs) => xs.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
    toast('success', 'All notifications marked as read');
  };

  const remove = async (n: AppNotification) => {
    try {
      await api.delete(`/notifications/${n.id}`);
      setItems((xs) => xs.filter((x) => x.id !== n.id));
      if (!n.isRead) setUnread((u) => Math.max(0, u - 1));
      setDeletingId(null);
    } catch {
      toast('error', 'Could not delete the notification');
    }
  };

  const clearAll = async () => {
    setClearBusy(true);
    try {
      await api.delete('/notifications');
      setItems([]);
      setUnread(0);
      setConfirmClear(false);
      toast('success', 'All notifications cleared');
    } catch {
      toast('error', 'Could not clear notifications');
    } finally {
      setClearBusy(false);
    }
  };

  const pendingDelete = deletingId ? (items.find((x) => x.id === deletingId) ?? null) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn-ghost relative px-2.5 py-2"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        aria-label="Notifications"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-stone-900">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5 dark:border-stone-800">
            <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">
              Notifications
            </span>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button
                  className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                  onClick={markAll}
                >
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button
                  className="text-xs text-stone-400 hover:text-rose-600"
                  onClick={() => setConfirmClear(true)}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-stone-400">
                <Icon name="smile" size={22} className="text-stone-300 dark:text-stone-600" />
                You're all caught up
              </div>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={cx(
                  'group relative border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/60',
                  !n.isRead && 'bg-brand-50/70 dark:bg-brand-500/5',
                )}
              >
                <button
                  onClick={() => void markRead(n)}
                  className="block w-full px-4 py-3 pr-9 text-left"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-100">
                    {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                    {n.title}
                  </div>
                  <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                    {n.message}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
                    {fmtDate(n.createdAt)}
                    {n.link && (
                      <span className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-300">
                        Open <Icon name="arrow-right" size={12} />
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={(e: ReactMouseEvent) => {
                    e.stopPropagation();
                    setDeletingId(n.id);
                  }}
                  title="Delete notification"
                  aria-label="Delete notification"
                  className="absolute right-2 top-2.5 rounded-md p-1 text-stone-300 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 dark:text-stone-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        danger
        title="Delete notification"
        message={pendingDelete ? `Remove “${pendingDelete.title}”? This cannot be undone.` : ''}
        confirmText="Delete"
        onConfirm={() => {
          if (pendingDelete) void remove(pendingDelete);
        }}
        onCancel={() => setDeletingId(null)}
      />
      <ConfirmDialog
        open={confirmClear && items.length > 0 && !pendingDelete}
        danger
        busy={clearBusy}
        title="Clear all notifications"
        message={`Permanently delete all ${items.length} notification${items.length === 1 ? '' : 's'}? This cannot be undone.`}
        confirmText="Clear all"
        onConfirm={() => void clearAll()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

export function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const links = NAV.filter((n) => user && n.roles.includes(user.role));
  const [school, setSchool] = useState<SchoolPublicInfo | null>(null);
  const fetchSchool = () =>
    api
      .get<SchoolPublicInfo>('/school/public')
      .then((r) => setSchool(r.data))
      .catch(() => undefined);
  useEffect(() => {
    void fetchSchool();
  }, []);
  useEffect(() => {
    const handler = () => void fetchSchool();
    window.addEventListener('school-updated', handler);
    return () => window.removeEventListener('school-updated', handler);
  }, []);

  // Live count of grade submissions awaiting admin approval (sidebar badge).
  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let cancelled = false;
    const loadCount = () =>
      api
        .get<{ data: PendingApproval[] }>('/grades/pending-approvals')
        .then((r) => {
          if (!cancelled) setPendingApprovals(r.data.data.length);
        })
        .catch(() => undefined);
    loadCount();
    const timer = setInterval(loadCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.role, location.pathname]);

  // Dynamically update document title based on route and school context
  useEffect(() => {
    const titleMap: Record<string, string> = {
      '/': 'Dashboard',
      '/grade-entry': 'Grade Entry',
      '/approvals': 'Approvals',
      '/students': 'Students',
      '/teachers': 'Teachers',
      '/parents': 'Parents',
      '/grades': 'My Grades',
      '/my-profile': 'My Profile',
      '/report-cards': 'Report Cards',
      '/analytics': 'Analytics',
      '/audit-logs': 'Audit Logs',
      '/admin': 'Administration',
      '/announcements': 'Announcements',
      '/broadcast': 'Announcements',
    };
    const prefix = titleMap[location.pathname] || 'School Portal';
    const schoolName = school?.name || 'School Portal';
    document.title = `${prefix} | ${schoolName}`;
  }, [school, location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-950 text-brand-100">
      {/* Brand block */}
      <div className="border-b border-white/10 px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          {school?.hasBadge ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 p-1 shadow-sm ring-1 ring-white/20">
              <img
                src={apiUrl('/school/badge')}
                alt="School badge"
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 font-display text-xl font-bold text-brand-950 shadow-md ring-1 ring-white/20">
              {(school?.name ?? 'S')[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/90">
              School grading
            </div>
            <div
              className="truncate font-display text-[17px] font-semibold leading-snug text-white"
              title={school?.name ?? 'School Portal'}
            >
              {school?.name ?? 'School Portal'}
            </div>
          </div>
        </div>
        {school?.motto ? (
          <p className="mt-4 truncate border-t border-white/10 pt-3 text-xs italic leading-snug text-brand-200/80">
            “{school.motto}”
          </p>
        ) : (
          <p className="mt-4 truncate border-t border-white/10 pt-3 text-[11px] font-medium uppercase tracking-wider text-brand-300/60">
            Student &amp; staff portal
          </p>
        )}
        {school?.academicYear && (
          <div className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-amber-300/25">
            <Icon name="calendar" size={11} />
            <span className="truncate">{school.academicYear}</span>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {SECTIONS.map((section) => {
          const items = links.filter((n) => n.section === section);
          if (items.length === 0) return null;
          return (
            <div key={section} className="mb-1">
              <div className="nav-section">{section}</div>
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cx('navlink-sidebar', isActive && 'navlink-sidebar-active')
                  }
                >
                  <Icon name={n.icon} size={18} />
                  <span className="flex-1">{n.label}</span>
                  {n.to === '/approvals' && pendingApprovals > 0 && (
                    <span
                      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-brand-950"
                      title={`${pendingApprovals} submission(s) awaiting approval`}
                    >
                      {pendingApprovals > 99 ? '99+' : pendingApprovals}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-300 text-xs font-bold text-brand-950">
            {initials(user?.name ?? '?')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user?.name}</div>
            <div className="text-[11px] uppercase tracking-wider text-brand-300/60">
              {user?.role.toLowerCase()}
            </div>
          </div>
          <button
            className="rounded-lg p-2 text-brand-200/70 transition hover:bg-white/10 hover:text-white"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => {
              void logout().then(() => navigate('/login'));
            }}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const mobilePrimary = links.filter((n) =>
    ['/', '/grades', '/grade-entry', '/students', '/report-cards'].includes(n.to),
  ).slice(0, 4);

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand-950 lg:block">
        {sidebar}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-brand-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(18rem,88vw)] bg-brand-950 shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-h-screen flex-1 flex-col pb-16 lg:pl-64 lg:pb-0">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-stone-200 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-950 sm:px-4">
          <button
            className="btn-ghost min-h-11 min-w-11 px-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800 dark:text-stone-100 lg:hidden">
            {school?.name ?? 'School Portal'}
          </div>
          <div className="hidden flex-1 lg:block" />
          <PwaControls />
          {hasRole('TEACHER', 'ADMIN') && (
            <button
              className="btn-ghost min-h-11 min-w-11 px-2.5"
              title="My digital signature"
              aria-label="My digital signature"
              onClick={() => setSignatureOpen(true)}
            >
              <Icon name="pen" size={18} />
            </button>
          )}
          <NotificationBell />
          <ThemeToggle />
        </header>
        <main className="flex-1 px-3 py-5 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white pb-safe dark:border-stone-800 dark:bg-stone-950 lg:hidden"
          aria-label="Primary"
        >
          {mobilePrimary.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium',
                  isActive ? 'text-brand-800 dark:text-brand-300' : 'text-stone-500',
                )
              }
            >
              <Icon name={n.icon} size={20} />
              {n.label}
            </NavLink>
          ))}
          <button
            type="button"
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium text-stone-500"
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" size={20} />
            More
          </button>
        </nav>
        <SignatureModal open={signatureOpen} onClose={() => setSignatureOpen(false)} />
      </div>
    </div>
  );
}
