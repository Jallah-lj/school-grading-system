import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Chart } from '../components/Chart';
import { Icon } from '../components/Icon';
import {
  Badge,
  ChartPanelSkeleton,
  EmptyState,
  ErrorState,
  MetaChip,
  PageHeader,
  StatCard,
  StatCardSkeleton,
  TableSkeleton,
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/useQuery';
import { cx, fmtDate, gradeBadgeClass, ordinal } from '../lib/utils';

import type { ChartConfiguration } from 'chart.js';

import type { DashboardStats, StudentResultsResponse, TeacherRow } from '../lib/types';

const statIcon = (path: string) => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={path} />
  </svg>
);

/** Reactive media query (SSR-safe) — used to reflow chart legends on small screens. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

const GRADE_COLORS: Record<string, string> = {
  A: '#2d5442', // deep forest — highest band
  B: '#6fa086', // green
  C: '#94a772', // moss
  D: '#b8933d', // gold
  E: '#d97706', // amber
  F: '#e11d48', // rose — failing band
};
const gradeColor = (letter: string, fallbackIndex: number) =>
  GRADE_COLORS[letter] ??
  ['#2d5442', '#6fa086', '#94a772', '#b8933d', '#d97706', '#e11d48'][fallbackIndex % 6];

function AdminDashboard() {
  const { user, hasRole } = useAuth();
  const { data, loading, error, refetch } = useQuery(
    () => api.get<DashboardStats>('/analytics/dashboard').then((r) => r.data),
    [],
  );
  const isNarrow = useMediaQuery('(max-width: 640px)');

  const termName = data?.activeSemester?.name;
  const yearName = data?.activeSemester?.academicYear?.name;
  const firstName = user?.name.split(' ')[0] ?? '';

  const header = (
    <PageHeader
      eyebrow="Dashboard"
      title={`Welcome, ${firstName}`}
      subtitle="Enrolment, results and pending approvals at a glance."
      meta={
        data ? (
          <>
            {termName ? (
              <MetaChip icon="calendar">{termName}</MetaChip>
            ) : (
              <MetaChip icon="calendar">No active term configured</MetaChip>
            )}
            {yearName && <MetaChip>{yearName}</MetaChip>}
          </>
        ) : undefined
      }
    />
  );

  if (loading) {
    return (
      <div>
        <PageHeader
          eyebrow="Dashboard"
          title={`Welcome, ${firstName}`}
          subtitle="Loading school overview…"
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ChartPanelSkeleton />
          <ChartPanelSkeleton />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        {header}
        <div className="card">
          <ErrorState
            title="Dashboard unavailable"
            message={error ?? 'The school overview could not be loaded.'}
            onRetry={() => void refetch()}
          />
        </div>
      </div>
    );
  }

  const totalGraded = data.distribution.reduce((a, d) => a + d.count, 0);

  const distConfig: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: {
      labels: data.distribution.map((d) => d.letter),
      datasets: [
        {
          data: data.distribution.map((d) => d.count),
          backgroundColor: data.distribution.map((d, i) => gradeColor(d.letter, i)),
          borderWidth: 2,
          borderColor: 'rgba(0,0,0,0)',
          hoverOffset: 6,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: isNarrow ? 'bottom' : 'right',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            boxHeight: 8,
            padding: 14,
          },
        },
        tooltip: {
          backgroundColor: '#1c1917',
          titleColor: '#fafaf9',
          bodyColor: '#d6d3d1',
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => {
              const count = ctx.parsed as number;
              const pct = totalGraded > 0 ? Math.round((count / totalGraded) * 100) : 0;
              return ` ${count} result${count === 1 ? '' : 's'} · ${pct}% of ${totalGraded}`;
            },
          },
        },
      },
    },
  };

  const trendConfig: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: data.gpaTrend.map((t) => `${t.semester} · ${t.year}`),
      datasets: [
        {
          label: 'School average GPA',
          data: data.gpaTrend.map((t) => t.average),
          borderColor: '#2d5442',
          backgroundColor: 'rgba(45,84,66,0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: data.gpaTrend.length === 1 ? 5 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#2d5442',
          pointHoverBackgroundColor: '#d9a626',
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          min: 0,
          max: 4,
          ticks: { stepSize: 1, callback: (v) => `${Number(v).toFixed(1)}` },
          grid: { color: 'rgba(168,162,158,0.15)' },
          border: { display: false },
        },
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { maxRotation: 0, autoSkipPadding: 16 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c1917',
          titleColor: '#fafaf9',
          bodyColor: '#d6d3d1',
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => ` Average GPA ${Number(ctx.parsed.y).toFixed(2)} of 4.00`,
          },
        },
      },
    },
  };

  const distributionEmptyAction = hasRole('ADMIN') ? (
    <Link to="/approvals" className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
      Review submissions
      <Icon name="arrow-right" size={13} />
    </Link>
  ) : (
    <Link to="/grade-entry" className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
      Enter grades
      <Icon name="arrow-right" size={13} />
    </Link>
  );

  return (
    <div>
      {header}
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Students"
            value={data.counts.students}
            tone="brand"
            hint={`${data.counts.teachers} teachers · ${data.counts.classes} classes · ${data.counts.subjects} subjects`}
            icon={statIcon(
              'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
            )}
          />
          <StatCard
            label="Average Performance"
            value={data.averagePerformance !== null ? `${data.averagePerformance}%` : 'N/A'}
            muted={data.averagePerformance === null}
            tone="emerald"
            hint={
              data.averagePerformance !== null
                ? `Mean of published results${termName ? ` — ${termName}` : ''}`
                : 'No published grades for this term yet'
            }
            icon={statIcon('M23 6l-9.5 9.5-5-5L1 18M17 6h6v6')}
          />
          <StatCard
            label="Pending Submissions"
            value={data.pendingSubmissions}
            tone={data.pendingSubmissions > 0 ? 'rose' : 'brand'}
            to="/approvals"
            linkTitle="Open the approval inbox"
            hint={
              data.pendingSubmissions > 0
                ? 'awaiting approval — click to review'
                : 'grade grids awaiting approval'
            }
            icon={statIcon('M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z')}
          />
          <StatCard
            label="Active Term"
            value={data.activeSemester ? data.activeSemester.name : 'N/A'}
            muted={!data.activeSemester}
            hint={data.activeSemester?.academicYear?.name ?? 'No active term configured'}
            tone="brand"
            icon={statIcon(
              'M8 7V3M16 7V3M3 11h18M5 5h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="card flex min-w-0 flex-col p-5" aria-label="Grade distribution">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold text-stone-900 dark:text-white">
                Grade Distribution
              </h3>
              <span className="text-xs text-stone-400 dark:text-stone-500">
                {termName ? `Published results — ${termName}` : 'Published results'}
              </span>
            </div>
            {data.distribution.length > 0 ? (
              <div className="min-h-0 flex-1">
                <Chart
                  config={distConfig}
                  height={280}
                  ariaLabel={`Grade distribution of ${totalGraded} published results for ${termName ?? 'the active term'}`}
                />
              </div>
            ) : (
              <EmptyState
                compact
                icon="bar-chart"
                title="No published grades yet"
                hint={
                  termName
                    ? `Nothing has been published for ${termName}. Approve and publish submitted grades to see how results are distributed.`
                    : 'Set an active term and publish results to see the distribution.'
                }
                action={distributionEmptyAction}
              />
            )}
          </section>

          <section className="card flex min-w-0 flex-col p-5" aria-label="School GPA trend">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold text-stone-900 dark:text-white">
                School GPA Trend
              </h3>
              <span className="text-xs text-stone-400 dark:text-stone-500">
                {data.gpaTrend.length > 0
                  ? `${data.gpaTrend.length} term${data.gpaTrend.length === 1 ? '' : 's'} · 0–4.0 scale`
                  : '0–4.0 scale'}
              </span>
            </div>
            {data.gpaTrend.length > 0 ? (
              <div className="min-h-0 flex-1">
                <Chart
                  config={trendConfig}
                  height={280}
                  ariaLabel={`Average school GPA across ${data.gpaTrend.length} published terms`}
                />
              </div>
            ) : (
              <EmptyState
                compact
                icon="trending-up"
                title="Not enough history yet"
                hint="The trend line appears once results are published for at least one term — no data is estimated in the meantime."
                action={
                  <Link to="/analytics" className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
                    View analytics
                    <Icon name="arrow-right" size={13} />
                  </Link>
                }
              />
            )}
          </section>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            {
              title: 'Top Students',
              icon: 'award' as const,
              iconClass: 'text-amber-500',
              rows: data.topStudents,
              good: true,
            },
            {
              title: 'Students Needing Support',
              icon: 'warning' as const,
              iconClass: 'text-rose-500',
              rows: data.bottomStudents,
              good: false,
            },
          ].map((panel) => (
            <section key={panel.title} className="card overflow-hidden">
              <h3 className="flex items-center gap-2 border-b border-stone-200 px-5 py-3.5 text-base font-semibold text-stone-900 dark:border-stone-800 dark:text-white">
                <Icon name={panel.icon} size={18} className={panel.iconClass} /> {panel.title}
              </h3>
              {panel.rows.length === 0 ? (
                <EmptyState
                  compact
                  title="No published GPA records"
                  hint="Rankings appear once grades are approved and published for the active term."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <tbody>
                      {panel.rows.map((s, i) => (
                        <tr
                          key={s.studentId}
                          className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/50"
                        >
                          <td className="td w-10 text-center font-bold text-stone-400">{i + 1}</td>
                          <td className="td">
                            <Link
                              to={`/students/${s.studentId}`}
                              className="font-medium text-stone-800 hover:text-brand-700 hover:underline dark:text-stone-100 dark:hover:text-brand-300"
                            >
                              {s.name}
                            </Link>
                            <div className="text-xs text-stone-400">{s.className}</div>
                          </td>
                          <td className="td whitespace-nowrap text-right">
                            <span
                              className={cx(
                                'font-bold tabular-nums',
                                panel.good ? 'text-emerald-500' : 'text-rose-500',
                              )}
                            >
                              {s.gpa.toFixed(2)}
                            </span>
                            <span className="text-xs text-stone-400">
                              {' '}
                              GPA · {s.average.toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>

        <section className="card overflow-hidden">
          <h3 className="border-b border-stone-200 px-5 py-3.5 text-base font-semibold text-stone-900 dark:border-stone-800 dark:text-white">
            Recent Published Results
          </h3>
          {data.recentResults.length === 0 ? (
            <EmptyState
              compact
              title="Nothing published yet"
              hint="Approved and published subject results will be listed here."
            />
          ) : (
            <>
              <div className="divide-y divide-stone-100 md:hidden dark:divide-stone-800">
                {data.recentResults.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-stone-800 dark:text-stone-100">
                        {r.student}
                      </div>
                      <div className="text-xs text-stone-500">{r.subject}</div>
                      <div className="mt-1 text-[11px] text-stone-400">{fmtDate(r.computedAt)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge className={gradeBadgeClass(r.letterGrade)}>{r.letterGrade}</Badge>
                      <div className="mt-1 text-sm font-semibold tabular-nums">
                        {r.percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead className="border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="th">Student</th>
                      <th className="th">Subject</th>
                      <th className="th">Score</th>
                      <th className="th">Grade</th>
                      <th className="th">Computed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentResults.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/50"
                      >
                        <td className="td font-medium text-stone-800 dark:text-stone-100">
                          {r.student}
                        </td>
                        <td className="td">{r.subject}</td>
                        <td className="td font-semibold tabular-nums">
                          {r.percentage.toFixed(1)}%
                        </td>
                        <td className="td">
                          <Badge className={gradeBadgeClass(r.letterGrade)}>{r.letterGrade}</Badge>
                        </td>
                        <td className="td text-stone-400">{fmtDate(r.computedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function TeacherDashboard() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useQuery(
    () => api.get<TeacherRow>('/teachers/me').then((r) => r.data),
    [],
  );
  const firstName = user?.name.split(' ')[0] ?? '';

  if (loading) {
    return (
      <div>
        <PageHeader
          eyebrow="Dashboard"
          title={`Welcome, ${firstName}`}
          subtitle="Your classes, assignments and recent activity."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="mt-6 card overflow-hidden">
          <div className="skeleton m-5 h-5 w-48" />
          <TableSkeleton rows={3} cols={3} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader
          eyebrow="Dashboard"
          title={`Welcome, ${firstName}`}
          subtitle="Your classes, assignments and recent activity."
        />
        <div className="card">
          <ErrorState
            title="Could not load your assignments"
            message={error ?? 'Please try again in a moment.'}
            onRetry={() => void refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome, ${firstName}`}
        subtitle="Your classes, assignments and recent activity."
      />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Assigned Subjects"
            value={new Set(data.assignments.map((a) => a.subject.id)).size}
            tone="brand"
            hint={`${data.assignments.length} class assignment${data.assignments.length === 1 ? '' : 's'} in total`}
            icon={statIcon(
              'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z',
            )}
          />
          <StatCard
            label="Assigned Classes"
            value={new Set(data.assignments.map((a) => a.classRoom.id)).size}
            tone="moss"
            icon={statIcon('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z')}
          />
          <StatCard
            label="Total Students Taught"
            value={data.assignments.reduce((a, x) => a + (x.classRoom._count?.students ?? 0), 0)}
            tone="emerald"
            hint="Across all of your classes"
            icon={statIcon('M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8')}
          />
        </div>
        <section className="card overflow-hidden">
          <h3 className="flex items-center gap-2 border-b border-stone-200 px-5 py-3.5 text-base font-semibold text-stone-900 dark:border-stone-800 dark:text-white">
            <Icon name="edit" size={17} className="text-brand-700 dark:text-brand-300" />
            My Teaching Assignments
          </h3>
          {data.assignments.length === 0 ? (
            <EmptyState
              icon="book-open"
              title="No assignments yet"
              hint="Ask an administrator to assign subjects and classes, then return here to enter marks."
            />
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.assignments.map((a, i) => (
                <Link
                  key={i}
                  to={`/grade-entry?classId=${a.classRoom.id}&subjectId=${a.subject.id}`}
                  className="card card-hover p-4"
                >
                  <div className="font-semibold text-stone-900 dark:text-white">
                    {a.subject.name}
                  </div>
                  <div className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                    {a.subject.code} · {a.classRoom.name} {a.classRoom.stream}
                  </div>
                  <div className="mt-2 text-xs text-stone-400">
                    {a.classRoom._count?.students ?? 0} students
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
                    Enter marks <Icon name="arrow-right" size={14} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StudentDashboard() {
  const { user } = useAuth();
  const isParent = user?.role === 'PARENT';
  const children = user?.parent?.children ?? [];
  const [childId, setChildId] = useState(children[0]?.id ?? '');
  const targetId = isParent ? childId : user?.student?.id;
  const selectedChild = children.find((c) => c.id === childId) ?? children[0];
  const semesterLabel =
    isParent && selectedChild ? `Viewing ${selectedChild.user.name}` : undefined;

  const { data, loading, error, refetch } = useQuery(
    () =>
      targetId
        ? api.get<StudentResultsResponse>(`/students/${targetId}/results`).then((r) => r.data)
        : Promise.resolve(undefined),
    [targetId],
  );

  if (!targetId)
    return (
      <div>
        <PageHeader eyebrow="Dashboard" title={`Welcome, ${user?.name.split(' ')[0] ?? ''}`} />
        <div className="card">
          <EmptyState
            icon="parent"
            title="No student linked"
            hint="Contact the school to link a student to your account."
          />
        </div>
      </div>
    );

  const header = (
    <PageHeader
      eyebrow="Dashboard"
      title={`Welcome, ${user?.name.split(' ')[0]}`}
      subtitle="Latest results, GPA and class position."
      meta={
        data ? (
          <>
            {isParent && selectedChild && (
              <MetaChip icon="student">{selectedChild.user.name}</MetaChip>
            )}
            {user?.student?.classRoom && (
              <MetaChip>
                {user.student.classRoom.name} {user.student.classRoom.stream}
              </MetaChip>
            )}
            {data.semester?.name && <MetaChip icon="calendar">{data.semester.name}</MetaChip>}
          </>
        ) : undefined
      }
    />
  );

  if (loading)
    return (
      <div>
        {header}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="mt-6 card overflow-hidden">
          <div className="skeleton m-5 h-5 w-52" />
          <TableSkeleton rows={4} cols={4} />
        </div>
      </div>
    );

  if (error || !data)
    return (
      <div>
        {header}
        <div className="card">
          <ErrorState
            title="Could not load results"
            message={error ?? 'Please try again in a moment.'}
            onRetry={() => void refetch()}
          />
        </div>
      </div>
    );

  return (
    <div>
      {header}
      <div className="space-y-6">
        {isParent && children.length > 1 && (
          <div className="card flex flex-wrap items-center gap-3 p-4">
            <label
              className="text-sm font-medium text-stone-600 dark:text-stone-300"
              htmlFor="child-switcher"
            >
              Child
            </label>
            <select
              id="child-switcher"
              className="input max-w-xs"
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.user.name} —{' '}
                  {c.classRoom ? `${c.classRoom.name} ${c.classRoom.stream}` : c.admissionNumber}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="GPA"
            value={data.gpa ? data.gpa.gpa.toFixed(2) : 'N/A'}
            muted={!data.gpa}
            tone="brand"
            hint={data.gpa ? 'of 4.00' : 'Published once grades are released'}
            icon={statIcon(
              'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
            )}
          />
          <StatCard
            label="Class Position"
            value={data.gpa?.position ? ordinal(data.gpa.position) : 'N/A'}
            muted={!data.gpa?.position}
            tone="emerald"
            hint={data.gpa?.classSize ? `of ${data.gpa.classSize} students` : undefined}
            icon={statIcon('M23 6l-9.5 9.5-5-5L1 18M17 6h6v6')}
          />
          <StatCard
            label="Average Score"
            value={data.gpa ? `${data.gpa.average.toFixed(1)}%` : 'N/A'}
            muted={!data.gpa}
            tone="moss"
            hint={data.semester?.name}
            icon={statIcon('M18 20V10M12 20V4M6 20v-6')}
          />
        </div>
        <section className="card overflow-hidden">
          <h3 className="flex flex-wrap items-baseline gap-x-2 border-b border-stone-200 px-5 py-3.5 text-base font-semibold text-stone-900 dark:border-stone-800 dark:text-white">
            Latest Published Results
            {semesterLabel && (
              <span className="text-sm font-normal text-stone-400">({semesterLabel})</span>
            )}
          </h3>
          {data.results.length === 0 ? (
            <EmptyState
              icon="book-open"
              title="No published results yet"
              hint="You'll be notified when grades are published."
            />
          ) : (
            <>
              <div className="divide-y divide-stone-100 md:hidden dark:divide-stone-800">
                {data.results.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-stone-800 dark:text-stone-100">
                        {r.subject.name}
                      </div>
                      <div className="text-xs text-stone-500">{r.remark}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge className={gradeBadgeClass(r.letterGrade)}>{r.letterGrade}</Badge>
                      <div className="mt-1 text-sm font-semibold tabular-nums">
                        {r.percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead className="border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="th">Subject</th>
                      <th className="th">Score</th>
                      <th className="th">Grade</th>
                      <th className="th">Point</th>
                      <th className="th">Rank</th>
                      <th className="th">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/50"
                      >
                        <td className="td">
                          <span className="font-medium text-stone-800 dark:text-stone-100">
                            {r.subject.name}
                          </span>{' '}
                          <span className="text-xs text-stone-400">{r.subject.code}</span>
                        </td>
                        <td className="td font-semibold tabular-nums">
                          {r.percentage.toFixed(1)}%
                        </td>
                        <td className="td">
                          <Badge className={gradeBadgeClass(r.letterGrade)}>{r.letterGrade}</Badge>
                        </td>
                        <td className="td tabular-nums">{r.gradePoint.toFixed(1)}</td>
                        <td className="td">{ordinal(r.position)}</td>
                        <td className="td text-stone-500 dark:text-stone-400">{r.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
        <Link
          to="/grades"
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
        >
          View full academic progress <Icon name="arrow-right" size={14} />
        </Link>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { hasRole } = useAuth();
  return hasRole('ADMIN') ? (
    <AdminDashboard />
  ) : hasRole('TEACHER') ? (
    <TeacherDashboard />
  ) : (
    <StudentDashboard />
  );
}
