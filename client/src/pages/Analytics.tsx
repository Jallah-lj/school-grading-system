import { useEffect, useState } from 'react';

import { Chart } from '../components/Chart';
import { EmptyState, PageHeader, TableSkeleton } from '../components/ui';
import { api } from '../lib/api';
import { useQuery } from '../lib/useQuery';

import type { ChartConfiguration } from 'chart.js';

import type { AcademicYear, ClassRoom } from '../lib/types';

interface SubjectPerf {
  subjectId: string;
  code: string;
  name: string;
  average: number;
  highest: number;
  lowest: number;
  entries: number;
}
interface ClassPerf {
  classId: string;
  name: string;
  students: number;
  averageGpa: number | null;
  averageScore: number | null;
}

export default function Analytics() {
  const [semesterId, setSemesterId] = useState('');
  const [classId, setClassId] = useState('');

  const { data: year } = useQuery(
    () => api.get<AcademicYear>('/academic-years/active').then((r) => r.data),
    [],
  );
  const { data: classes } = useQuery(
    () => api.get<{ data: ClassRoom[] }>('/classes').then((r) => r.data),
    [],
  );

  useEffect(() => {
    if (year && !semesterId) {
      const current = year.semesters.find((s) => s.isCurrent) ?? year.semesters[0];
      if (current) setSemesterId(current.id);
    }
  }, [year, semesterId]);
  useEffect(() => {
    if (classes && !classId && classes.data[0]) setClassId(classes.data[0].id);
  }, [classes, classId]);

  const { data: subjectPerf, loading: loadingSubjects } = useQuery(
    () =>
      classId && semesterId
        ? api
            .get<{ data: SubjectPerf[] }>(
              `/analytics/subject-performance?classId=${classId}&semesterId=${semesterId}`,
            )
            .then((r) => r.data)
        : Promise.resolve(undefined),
    [classId, semesterId],
  );

  const { data: classPerf, loading: loadingClasses } = useQuery(
    () =>
      semesterId
        ? api
            .get<{ data: ClassPerf[] }>(`/analytics/class-performance?semesterId=${semesterId}`)
            .then((r) => r.data)
        : Promise.resolve(undefined),
    [semesterId],
  );

  const subjectConfig: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: (subjectPerf?.data ?? []).map((s) => s.code),
      datasets: [
        {
          label: 'Class average',
          data: (subjectPerf?.data ?? []).map((s) => s.average),
          backgroundColor: '#2d5442',
          borderRadius: 6,
        },
        {
          label: 'Highest',
          data: (subjectPerf?.data ?? []).map((s) => s.highest),
          backgroundColor: '#34d399',
          borderRadius: 6,
        },
        {
          label: 'Lowest',
          data: (subjectPerf?.data ?? []).map((s) => s.lowest),
          backgroundColor: '#f87171',
          borderRadius: 6,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100 } },
      plugins: { legend: { position: 'bottom' } },
    },
  };

  const classConfig: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: (classPerf?.data ?? []).map((c) => c.name),
      datasets: [
        {
          label: 'Average GPA',
          data: (classPerf?.data ?? []).map((c) => c.averageGpa ?? 0),
          backgroundColor: '#b8933d',
          borderRadius: 6,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: { x: { min: 0, max: 4 } },
      plugins: { legend: { display: false } },
    },
  };

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Subject, class and school-wide performance."
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:max-w-xl">
        <div>
          <label className="label">Term</label>
          <select
            className="input"
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
          >
            {year?.semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Class (for subject analysis)</label>
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.stream}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">
            Subject Performance — {classes?.data.find((c) => c.id === classId)?.name ?? ''}
          </h3>
          {loadingSubjects ? (
            <TableSkeleton rows={4} cols={2} />
          ) : (subjectPerf?.data.length ?? 0) > 0 ? (
            <Chart config={subjectConfig} height={320} />
          ) : (
            <EmptyState
              title="No published data"
              hint="Results appear here once grades are published."
            />
          )}
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">Class Comparison (Average GPA)</h3>
          {loadingClasses ? (
            <TableSkeleton rows={4} cols={2} />
          ) : classPerf?.data.some((c) => c.averageGpa !== null) ? (
            <Chart config={classConfig} height={320} />
          ) : (
            <EmptyState title="No published data" />
          )}
        </div>
      </div>

      {(subjectPerf?.data.length ?? 0) > 0 && (
        <div className="card mt-4 overflow-hidden">
          <h3 className="border-b border-slate-200 px-5 py-3.5 font-semibold dark:border-slate-800">
            Subject Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="th">Subject</th>
                  <th className="th text-right">Average</th>
                  <th className="th text-right">Highest</th>
                  <th className="th text-right">Lowest</th>
                  <th className="th text-right">Students</th>
                </tr>
              </thead>
              <tbody>
                {subjectPerf!.data.map((s) => (
                  <tr
                    key={s.subjectId}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="td">
                      <span className="font-medium">{s.name}</span>{' '}
                      <span className="text-xs text-slate-400">{s.code}</span>
                    </td>
                    <td className="td text-right font-semibold">{s.average}%</td>
                    <td className="td text-right text-emerald-500">{s.highest}%</td>
                    <td className="td text-right text-rose-500">{s.lowest}%</td>
                    <td className="td text-right">{s.entries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
