import { useState } from 'react';
import { Icon } from '../components/Icon';
import type { ChartConfiguration } from 'chart.js';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/useQuery';
import { useToast } from '../components/toast';
import { Chart } from '../components/Chart';
import { Badge, EmptyState, PageHeader, TableSkeleton } from '../components/ui';
import { downloadBlob, gradeBadgeClass, ordinal } from '../lib/utils';
import type { AcademicYear, StudentResultsResponse } from '../lib/types';

interface TrendPoint { semester: string; year: string; gpa: number; average: number; position: number | null; }

export default function MyGrades() {
  const toast = useToast();
  const { user } = useAuth();
  const isParent = user?.role === 'PARENT';
  const children = user?.parent?.children ?? [];
  const [childId, setChildId] = useState(children[0]?.id ?? '');
  const [semesterId, setSemesterId] = useState('');

  const studentId = isParent ? childId : user?.student?.id;

  const { data: year } = useQuery(() => api.get<AcademicYear>('/academic-years/active').then((r) => r.data), []);

  const { data, loading } = useQuery(
    () => (studentId
      ? api.get<StudentResultsResponse>(`/students/${studentId}/results${semesterId ? `?semesterId=${semesterId}` : ''}`).then((r) => r.data)
      : Promise.resolve(undefined)),
    [studentId, semesterId],
  );

  const { data: trend } = useQuery(
    () => (studentId
      ? api.get<{ points: TrendPoint[] }>(`/analytics/gpa-trends?studentId=${studentId}`).then((r) => r.data)
      : Promise.resolve(undefined)),
    [studentId],
  );

  const downloadTranscript = async () => {
    try {
      const res = await api.get(`/report-cards/transcript/${studentId}/pdf`, { responseType: 'blob' });
      downloadBlob(res.data as Blob, 'transcript.pdf');
    } catch (err) { toast('error', apiError(err)); }
  };

  const trendConfig: ChartConfiguration = {
    type: 'line',
    data: {
      labels: (trend?.points ?? []).map((p) => p.semester),
      datasets: [{
        label: 'GPA',
        data: (trend?.points ?? []).map((p) => p.gpa),
        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.12)',
        fill: true, tension: 0.35, pointRadius: 5, pointBackgroundColor: '#6366f1',
      }],
    },
    options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 4 } }, plugins: { legend: { display: false } } },
  };

  if (!studentId) {
    return <EmptyState title="No student linked" hint={isParent ? 'Select one of your children above.' : 'Your account is not linked to a student profile.'} />;
  }

  return (
    <div>
      <PageHeader title="Academic Progress" subtitle="Published results, GPA history and transcripts."
        actions={<button className="btn-secondary" onClick={() => void downloadTranscript()}><Icon name="download" size={15} /> Download Transcript</button>} />

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        {isParent && (
          <select className="input max-w-xs" value={childId} onChange={(e) => setChildId(e.target.value)}>
            {children.map((c) => <option key={c.id} value={c.id}>{c.user.name} — {c.classRoom ? `${c.classRoom.name} ${c.classRoom.stream}` : c.admissionNumber}</option>)}
          </select>
        )}
        <select className="input max-w-xs" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
          <option value="">Current term</option>
          {year?.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {data?.semester && <span className="ml-auto text-sm text-slate-400">{data.semester.name}</span>}
      </div>

      {loading ? <TableSkeleton /> : !data ? null : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: 'GPA', value: data.gpa ? data.gpa.gpa.toFixed(2) : '—', sub: 'out of 4.00' },
              { label: 'Average', value: data.gpa ? `${data.gpa.average.toFixed(1)}%` : '—', sub: 'all subjects' },
              { label: 'Position', value: data.gpa?.position ? ordinal(data.gpa.position) : '—', sub: data.gpa?.classSize ? `of ${data.gpa.classSize}` : 'class' },
              { label: 'Credits', value: data.gpa ? String(data.gpa.totalCredits) : '—', sub: 'credit units' },
            ].map((s) => (
              <div key={s.label} className="card p-4 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-400">{s.label}</div>
                <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{s.value}</div>
                <div className="text-xs text-slate-400">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <h3 className="border-b border-slate-200 px-5 py-3.5 font-semibold dark:border-slate-800">Subject Results</h3>
            {data.results.length === 0 ? <EmptyState title="No published results for this term" /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-200 dark:border-slate-800">
                    <tr><th className="th">Code</th><th className="th">Subject</th><th className="th">Credits</th><th className="th">Score</th><th className="th">Grade</th><th className="th">Point</th><th className="th">Rank</th><th className="th">Remark</th></tr>
                  </thead>
                  <tbody>
                    {data.results.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                        <td className="td font-mono text-xs">{r.subject.code}</td>
                        <td className="td font-medium">{r.subject.name}</td>
                        <td className="td">{r.subject.creditUnits}</td>
                        <td className="td font-semibold">{r.percentage.toFixed(1)}%</td>
                        <td className="td"><Badge className={gradeBadgeClass(r.letterGrade)}>{r.letterGrade}</Badge></td>
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

          {(trend?.points.length ?? 0) > 0 && (
            <div className="card p-5">
              <h3 className="mb-4 font-semibold">GPA Trend Across Terms</h3>
              <Chart config={trendConfig} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
