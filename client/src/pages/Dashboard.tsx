import { Link } from 'react-router-dom';

import { Chart } from '../components/Chart';
import { Icon } from '../components/Icon';
import { Badge, EmptyState, PageHeader, StatCard, TableSkeleton } from '../components/ui';
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

function AdminDashboard() {
  const { data, loading } = useQuery(
    () => api.get<DashboardStats>('/analytics/dashboard').then((r) => r.data),
    [],
  );

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
        <div className="skeleton h-72" />
      </div>
    );
  }

  const distConfig: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: {
      labels: data.distribution.map((d) => d.letter),
      datasets: [
        {
          data: data.distribution.map((d) => d.count),
          backgroundColor: ['#2d5442', '#6fa086', '#b8933d', '#d97706', '#5c7040', '#e11d48'],
          borderWidth: 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: { legend: { position: 'right' } },
    },
  };

  const trendConfig: ChartConfiguration = {
    type: 'line',
    data: {
      labels: data.gpaTrend.map((t) => `${t.semester}`),
      datasets: [
        {
          label: 'School average GPA',
          data: data.gpaTrend.map((t) => t.average),
          borderColor: '#2d5442',
          backgroundColor: 'rgba(45,84,66,0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#2d5442',
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 4 } },
      plugins: { legend: { display: false } },
    },
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Students"
          value={data.counts.students}
          tone="brand"
          icon={statIcon(
            'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
          )}
        />
        <StatCard
          label="Total Teachers"
          value={data.counts.teachers}
          tone="moss"
          icon={statIcon('M22 10L12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5')}
        />
        <StatCard
          label="Classes"
          value={data.counts.classes}
          tone="emerald"
          icon={statIcon('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z')}
        />
        <StatCard
          label="Subjects"
          value={data.counts.subjects}
          tone="amber"
          icon={statIcon(
            'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z',
          )}
        />
        <StatCard
          label="Average Performance"
          value={data.averagePerformance !== null ? `${data.averagePerformance}%` : '—'}
          tone="emerald"
          hint={data.activeSemester ? data.activeSemester.name : undefined}
          icon={statIcon('M23 6l-9.5 9.5-5-5L1 18M17 6h6v6')}
        />
        <Link
          to="/approvals"
          className="block transition hover:scale-[1.02]"
          title="Open the approval inbox"
        >
          <StatCard
            label="Pending Submissions"
            value={data.pendingSubmissions}
            tone={data.pendingSubmissions > 0 ? 'rose' : 'brand'}
            hint={
              data.pendingSubmissions > 0
                ? 'awaiting approval — click to review'
                : 'grade grids awaiting approval'
            }
            icon={statIcon('M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z')}
          />
        </Link>
        <StatCard
          label="Active Term"
          value={data.activeSemester ? data.activeSemester.name : '—'}
          hint={data.activeSemester?.academicYear?.name}
          tone="brand"
          icon={statIcon(
            'M8 7V3M16 7V3M3 11h18M5 5h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
          )}
        />
        <StatCard
          label="Top &amp; Review Lists"
          value={
            data.topStudents.length + data.bottomStudents.length > 0
              ? `${data.topStudents.length} + ${data.bottomStudents.length}`
              : '—'
          }
          tone="moss"
          hint="top 5 and 5 needing support this term"
          icon={statIcon(
            'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
          )}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">
            Grade Distribution {data.activeSemester ? `— ${data.activeSemester.name}` : ''}
          </h3>
          {data.distribution.length > 0 ? (
            <Chart config={distConfig} />
          ) : (
            <EmptyState
              title="No published results yet"
              hint="Approve and publish grades to see the distribution."
            />
          )}
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">School GPA Trend</h3>
          {data.gpaTrend.length > 0 ? (
            <Chart config={trendConfig} />
          ) : (
            <EmptyState title="No GPA records yet" />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
          <div key={panel.title} className="card overflow-hidden">
            <h3 className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5 font-semibold dark:border-slate-800">
              <Icon name={panel.icon} size={18} className={panel.iconClass} /> {panel.title}
            </h3>
            {panel.rows.length === 0 ? (
              <EmptyState title="No data" />
            ) : (
              <table className="w-full">
                <tbody>
                  {panel.rows.map((s, i) => (
                    <tr
                      key={s.studentId}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="td w-10 text-center font-bold text-slate-400">{i + 1}</td>
                      <td className="td">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-slate-400">{s.className}</div>
                      </td>
                      <td className="td text-right">
                        <span
                          className={cx(
                            'font-bold',
                            panel.good ? 'text-emerald-500' : 'text-rose-500',
                          )}
                        >
                          {s.gpa.toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {' '}
                          GPA · {s.average.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <h3 className="border-b border-slate-200 px-5 py-3.5 font-semibold dark:border-slate-800">
          Recent Published Results
        </h3>
        {data.recentResults.length === 0 ? (
          <EmptyState title="Nothing published yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
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
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="td font-medium">{r.student}</td>
                    <td className="td">{r.subject}</td>
                    <td className="td">{r.percentage.toFixed(1)}%</td>
                    <td className="td">
                      <Badge className={gradeBadgeClass(r.letterGrade)}>{r.letterGrade}</Badge>
                    </td>
                    <td className="td text-slate-400">{fmtDate(r.computedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TeacherDashboard() {
  const { data, loading } = useQuery(
    () => api.get<TeacherRow>('/teachers/me').then((r) => r.data),
    [],
  );
  if (loading || !data) return <TableSkeleton rows={3} cols={3} />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Assigned Subjects"
          value={new Set(data.assignments.map((a) => a.subject.id)).size}
          tone="brand"
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
          icon={statIcon('M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8')}
        />
      </div>
      <div className="card overflow-hidden">
        <h3 className="border-b border-slate-200 px-5 py-3.5 font-semibold dark:border-slate-800">
          My Teaching Assignments
        </h3>
        {data.assignments.length === 0 ? (
          <EmptyState
            title="No assignments yet"
            hint="Ask an administrator to assign subjects and classes."
          />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.assignments.map((a, i) => (
              <Link
                key={i}
                to={`/grade-entry?classId=${a.classRoom.id}&subjectId=${a.subject.id}`}
                className="card p-4 transition hover:border-brand-400 hover:shadow-md"
              >
                <div className="font-semibold">{a.subject.name}</div>
                <div className="text-sm text-slate-400">
                  {a.subject.code} · {a.classRoom.name} {a.classRoom.stream}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {a.classRoom._count?.students ?? 0} students
                </div>
                <div className="mt-3 flex items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
                  Enter marks <Icon name="arrow-right" size={14} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentDashboard() {
  const { user } = useAuth();
  const targetId = user?.role === 'PARENT' ? user.parent?.children[0]?.id : user?.student?.id;
  const semesterLabel =
    user?.role === 'PARENT' && user.parent?.children[0]
      ? `Viewing ${user.parent.children[0].user.name}`
      : undefined;

  const { data, loading } = useQuery(
    () =>
      targetId
        ? api.get<StudentResultsResponse>(`/students/${targetId}/results`).then((r) => r.data)
        : Promise.resolve(undefined),
    [targetId],
  );

  if (!targetId)
    return (
      <EmptyState
        title="No student linked"
        hint="Contact the school to link a student to your account."
      />
    );
  if (loading || !data) return <TableSkeleton rows={4} cols={4} />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="GPA"
          value={data.gpa ? data.gpa.gpa.toFixed(2) : '—'}
          tone="brand"
          hint={`of 4.00`}
          icon={statIcon(
            'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
          )}
        />
        <StatCard
          label="Class Position"
          value={data.gpa?.position ? ordinal(data.gpa.position) : '—'}
          tone="emerald"
          hint={data.gpa?.classSize ? `of ${data.gpa.classSize} students` : undefined}
          icon={statIcon('M23 6l-9.5 9.5-5-5L1 18M17 6h6v6')}
        />
        <StatCard
          label="Average Score"
          value={data.gpa ? `${data.gpa.average.toFixed(1)}%` : '—'}
          tone="moss"
          hint={data.semester?.name}
          icon={statIcon('M18 20V10M12 20V4M6 20v-6')}
        />
      </div>
      <div className="card overflow-hidden">
        <h3 className="border-b border-slate-200 px-5 py-3.5 font-semibold dark:border-slate-800">
          Latest Published Results{' '}
          {semesterLabel && (
            <span className="ml-2 text-sm font-normal text-slate-400">({semesterLabel})</span>
          )}
        </h3>
        {data.results.length === 0 ? (
          <EmptyState
            title="No published results yet"
            hint="You'll be notified when grades are published."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
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
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="td">
                      <span className="font-medium">{r.subject.name}</span>{' '}
                      <span className="text-xs text-slate-400">{r.subject.code}</span>
                    </td>
                    <td className="td font-semibold">{r.percentage.toFixed(1)}%</td>
                    <td className="td">
                      <Badge className={gradeBadgeClass(r.letterGrade)}>{r.letterGrade}</Badge>
                    </td>
                    <td className="td">{r.gradePoint.toFixed(1)}</td>
                    <td className="td">{ordinal(r.position)}</td>
                    <td className="td text-slate-500 dark:text-slate-400">{r.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Link
        to="/grades"
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
      >
        View full academic progress <Icon name="arrow-right" size={14} />
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const subtitle = hasRole('ADMIN')
    ? 'Enrolment, results and pending approvals at a glance.'
    : hasRole('TEACHER')
      ? 'Your classes, assignments and recent activity.'
      : 'Latest results, GPA and class position.';

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name.split(' ')[0]}`}
        subtitle={subtitle}
      />
      {hasRole('ADMIN') ? (
        <AdminDashboard />
      ) : hasRole('TEACHER') ? (
        <TeacherDashboard />
      ) : (
        <StudentDashboard />
      )}
    </div>
  );
}
