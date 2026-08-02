import { Fragment, useEffect, useMemo, useState } from 'react';

import { Icon } from '../components/Icon';
import { Badge, EmptyState, PageHeader, TableSkeleton } from '../components/ui';
import { api } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { cx, fmtDateTime } from '../lib/utils';

import type { AuditLogRow, Paged } from '../lib/types';

const actionTone = (action: string): string => {
  if (action.includes('DENIED') || action.includes('FAILED') || action.includes('DELETE')) {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400';
  }
  if (action.startsWith('CREATE') || action.includes('PUBLISH') || action.includes('APPROVE')) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';
  }
  if (action.startsWith('UPDATE') || action.includes('UNLOCK') || action.includes('RETURN')) {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  }
  if (action.includes('LOGIN') || action.includes('TOKEN')) {
    return 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400';
  }
  return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
};

const roleTone: Record<string, string> = {
  ADMIN: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  TEACHER: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  STUDENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  PARENT: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
};

export default function AuditLogs() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(1);
  }, [debounced, action, entity, from, to]);

  const { data: meta } = useQuery(
    () =>
      api
        .get<{ actions: string[]; entities: string[] }>('/admin/audit-logs/meta')
        .then((r) => r.data),
    [],
  );

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (debounced) p.set('search', debounced);
    if (action) p.set('action', action);
    if (entity) p.set('entity', entity);
    if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) p.set('to', new Date(`${to}T23:59:59.999`).toISOString());
    return p.toString();
  }, [page, debounced, action, entity, from, to]);

  const { data, loading, error } = useQuery(
    () => api.get<Paged<AuditLogRow>>(`/admin/audit-logs?${params}`).then((r) => r.data),
    [params],
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const clearFilters = () => {
    setSearch('');
    setAction('');
    setEntity('');
    setFrom('');
    setTo('');
  };
  const hasFilters = search || action || entity || from || to;

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Every sensitive action in the system is recorded here — who did what, when, and from where."
      />

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input
          className="input max-w-xs"
          placeholder="Search action, entity, user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input max-w-[220px]"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">All actions</option>
          {meta?.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          className="input max-w-[180px]"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
        >
          <option value="">All entities</option>
          {meta?.entities.map((en) => (
            <option key={en} value={en}>
              {en}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-sm text-slate-400">
          <input
            type="date"
            className="input w-auto"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            title="From date"
          />
          <Icon name="arrow-right" size={14} className="text-slate-400" />
          <input
            type="date"
            className="input w-auto"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            title="To date"
          />
        </div>
        {hasFilters && (
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={clearFilters}>
            <Icon name="x" size={12} /> Clear filters
          </button>
        )}
        {data && (
          <span className="ml-auto text-sm text-slate-400">
            {data.total} event{data.total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : error ? (
          <EmptyState title="Failed to load" hint={error} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            title="No audit events found"
            hint={
              hasFilters
                ? 'Try widening your filters.'
                : 'Events will appear here as the system is used.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="th">Time</th>
                  <th className="th">User</th>
                  <th className="th">Action</th>
                  <th className="th">Entity</th>
                  <th className="th">IP</th>
                  <th className="th text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((log) => (
                  <Fragment key={log.id}>
                    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                      <td className="td whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        {fmtDateTime(log.createdAt)}
                      </td>
                      <td className="td">
                        {log.user ? (
                          <>
                            <div className="font-medium">{log.user.name}</div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <span className="hidden xl:inline">{log.user.email}</span>
                              <Badge className={roleTone[log.user.role] ?? ''}>
                                {log.user.role}
                              </Badge>
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400">System</span>
                        )}
                      </td>
                      <td className="td">
                        <Badge className={cx('font-mono text-[11px]', actionTone(log.action))}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="td">
                        <div className="text-sm">{log.entity}</div>
                        {log.entityId && (
                          <div
                            className="max-w-[140px] truncate font-mono text-xs text-slate-400"
                            title={log.entityId}
                          >
                            {log.entityId}
                          </div>
                        )}
                      </td>
                      <td className="td font-mono text-xs text-slate-400">
                        {log.ipAddress ?? '—'}
                      </td>
                      <td className="td text-right">
                        {log.metadata != null && (
                          <button
                            className="btn-ghost px-2 py-1 text-xs"
                            onClick={() => setExpanded((x) => (x === log.id ? null : log.id))}
                          >
                            {expanded === log.id ? (
                              <>
                                <Icon name="chevron-down" size={12} /> Hide
                              </>
                            ) : (
                              <>
                                <Icon name="chevron-right" size={12} /> View
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === log.id && log.metadata != null && (
                      <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/30">
                        <td colSpan={6} className="px-4 py-3">
                          <pre className="max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-emerald-300">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <span className="text-sm text-slate-400">
              Page {data.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary px-3 py-1.5"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="arrow-left" size={14} /> Prev
              </button>
              <button
                className="btn-secondary px-3 py-1.5"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <Icon name="arrow-right" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
