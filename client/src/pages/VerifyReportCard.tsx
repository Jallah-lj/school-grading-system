import { useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import axios from 'axios';
import { useQuery } from '../lib/useQuery';
import { Badge, Spinner } from '../components/ui';
import { gradeBadgeClass, ordinal } from '../lib/utils';
import type { ReportCardDetail } from '../lib/types';

const API = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

/** Public report-card verification / printable view (linked from the QR code). */
export default function VerifyReportCard() {
  const { code } = useParams<{ code: string }>();
  const { data, loading, error } = useQuery(
    () => axios.get<ReportCardDetail>(`${API}/report-cards/verify/${code}`).then((r) => r.data),
    [code],
  );

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500"><Spinner /> Verifying report card…</div>;
  }
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <Icon name="x-circle" size={44} className="text-rose-500" />
          <h1 className="mt-2 text-lg font-bold">Verification failed</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error ?? 'This report card could not be verified.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 dark:bg-slate-950">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center justify-between px-4">
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"><Icon name="shield-check" size={13} /> Verified authentic</Badge>
        <button className="btn-primary" onClick={() => window.print()}><Icon name="printer" size={15} /> Print / Save PDF</button>
      </div>

      <div className="print-area card mx-auto max-w-3xl overflow-hidden">
        <div className="bg-indigo-700 px-8 py-6 text-center text-white">
          {data.school.hasBadge && (
            <img src={`${API}/school/badge`} alt={`${data.school.name} badge`} className="mx-auto mb-3 h-16 w-16 object-contain" />
          )}
          <h1 className="text-2xl font-extrabold tracking-tight">{data.school.name}</h1>
          <p className="text-sm text-indigo-200">{data.school.motto}</p>
          <p className="mt-3 inline-block rounded-full bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-widest">
            Student Report Card — {data.semester.name}, {data.semester.academicYear}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-b border-slate-200 px-8 py-5 text-sm dark:border-slate-700 sm:grid-cols-4">
          {[
            ['Student', data.student.name],
            ['Admission No.', data.student.admissionNumber],
            ['Class', data.student.className],
            ['Position', data.gpa?.position ? `${ordinal(data.gpa.position)} of ${data.gpa.classSize ?? '—'}` : '—'],
            ['GPA', data.gpa ? data.gpa.gpa.toFixed(2) : '—'],
            ['Average', data.gpa ? `${data.gpa.average.toFixed(1)}%` : '—'],
            ['Credits', data.gpa ? String(data.gpa.totalCredits) : '—'],
            ['Term', data.semester.name],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
              <div className="font-semibold text-slate-900 dark:text-white">{value}</div>
            </div>
          ))}
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="th">Code</th><th className="th">Subject</th><th className="th text-right">Score</th>
              <th className="th text-center">Grade</th><th className="th text-center">Point</th>
              <th className="th text-center">Rank</th><th className="th">Remark</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.code} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="td font-mono text-xs">{r.code}</td>
                <td className="td font-medium">{r.name}</td>
                <td className="td text-right font-semibold">{r.percentage.toFixed(1)}%</td>
                <td className="td text-center"><Badge className={gradeBadgeClass(r.letterGrade)}>{r.letterGrade}</Badge></td>
                <td className="td text-center">{r.gradePoint.toFixed(1)}</td>
                <td className="td text-center">{ordinal(r.position)}</td>
                <td className="td text-slate-500 dark:text-slate-400">{r.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-4 px-8 py-6 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Class Teacher's Remarks</div>
            <p className="mt-1">{data.teacherRemarks ?? '—'}</p>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Principal's Remarks</div>
            <p className="mt-1">{data.principalRemarks ?? '—'}</p>
          </div>
        </div>

        <div className="flex items-end justify-between border-t border-slate-200 px-8 py-6 dark:border-slate-700">
          <div className="space-y-6 text-xs text-slate-500">
            {([
              { label: 'Class Teacher', sig: data.signatures?.classTeacher ?? null },
              { label: 'Principal / Head of School', sig: data.signatures?.principal ?? null },
            ]).map(({ label, sig }) => (
              <div key={label}>
                {sig?.dataUrl
                  ? <img src={sig.dataUrl} alt={`${sig.name}'s signature`} className="h-10 object-contain" />
                  : <div className="h-10" />}
                <div className="w-44 border-b border-slate-300 dark:border-slate-600" />
                <div className="mt-1 font-medium">{sig?.title ?? label}</div>
                {sig?.name && <div className="text-slate-400">{sig.name}</div>}
              </div>
            ))}
          </div>
          {data.qr && (
            <div className="text-center">
              <img src={data.qr} alt="Verification QR code" className="h-24 w-24" />
              <div className="mt-1 font-mono text-[10px] text-slate-400">{data.verificationCode}</div>
            </div>
          )}
        </div>
      </div>
      <p className="no-print mx-auto mt-4 max-w-3xl px-4 text-center text-xs text-slate-400">
        Verified via the School Grading System · code {data.verificationCode}
      </p>
    </div>
  );
}
