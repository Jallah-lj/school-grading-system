import { useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api, apiUrl } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { Badge, Spinner } from '../components/ui';
import { gradeBadgeClass, ordinal } from '../lib/utils';
import type { ReportCardDetail } from '../lib/types';

/** Public report-card verification / printable view (linked from the QR code). */
export default function VerifyReportCard() {
  const { code } = useParams<{ code: string }>();
  const { data, loading, error } = useQuery(
    () => api.get<ReportCardDetail>(`/report-cards/verify/${code}`).then((r) => r.data),
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

      <div className="print-area card mx-auto max-w-3xl overflow-hidden shadow-lg">
        {/* Top accent */}
        <div className="h-1.5 bg-gradient-to-r from-indigo-600 via-violet-500 to-indigo-600" />

        {/* Brand header */}
        <div className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 px-8 py-8 text-white">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
            {data.school.hasBadge ? (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/95 p-2 shadow-lg">
                <img src={apiUrl('/school/badge')} alt={`${data.school.name} badge`} className="h-full w-full object-contain" />
              </div>
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-3xl font-extrabold">
                {data.school.name[0]}
              </div>
            )}
            <div className="min-w-0 text-center sm:text-left">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{data.school.name}</h1>
              {data.school.motto && (
                <p className="mt-1 text-sm italic text-indigo-100/90">“{data.school.motto}”</p>
              )}
              <p className="mt-3 inline-block rounded-full bg-white/15 px-4 py-1 text-[11px] font-semibold uppercase tracking-widest backdrop-blur">
                Official Student Report Card
              </p>
              <p className="mt-2 text-sm text-indigo-100">
                {data.semester.name} · Academic Year {data.semester.academicYear}
              </p>
            </div>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-3 gap-px border-b border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700">
          {[
            { label: 'Term GPA', value: data.gpa ? data.gpa.gpa.toFixed(2) : '—', accent: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Average', value: data.gpa ? `${data.gpa.average.toFixed(1)}%` : '—', accent: 'text-sky-600 dark:text-sky-400' },
            { label: 'Position', value: data.gpa?.position ? `${ordinal(data.gpa.position)} of ${data.gpa.classSize ?? '—'}` : '—', accent: 'text-emerald-600 dark:text-emerald-400' },
          ].map((k) => (
            <div key={k.label} className="bg-white px-4 py-4 text-center dark:bg-slate-900">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</div>
              <div className={`mt-0.5 text-xl font-extrabold ${k.accent}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Student info */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-b border-slate-200 px-8 py-5 text-sm dark:border-slate-700 sm:grid-cols-4">
          {[
            ['Student', data.student.name],
            ['Admission No.', data.student.admissionNumber],
            ['Class', data.student.className],
            ['Credits', data.gpa ? String(data.gpa.totalCredits) : '—'],
            ['Term', data.semester.name],
            ['Academic Year', data.semester.academicYear],
            ['Status', data.status],
            ['Verification', data.verificationCode],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
              <div className="font-semibold text-slate-900 dark:text-white">{value}</div>
            </div>
          ))}
        </div>

        {/* Results table */}
        <div className="px-4 py-2 sm:px-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-indigo-100 dark:border-indigo-900/40">
                <th className="th">Code</th>
                <th className="th">Subject</th>
                <th className="th text-right">Score</th>
                <th className="th text-center">Grade</th>
                <th className="th text-center">Point</th>
                <th className="th text-center">Rank</th>
                <th className="th">Remark</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr key={r.code} className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${i % 2 === 0 ? 'bg-slate-50/60 dark:bg-slate-800/30' : ''}`}>
                  <td className="td font-mono text-xs font-semibold">{r.code}</td>
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
        </div>

        {/* Remarks */}
        <div className="space-y-3 px-8 py-6 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500">Class Teacher&apos;s Remarks</div>
            <p className="mt-1.5 text-slate-700 dark:text-slate-200">{data.teacherRemarks ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500">Principal&apos;s Remarks</div>
            <p className="mt-1.5 text-slate-700 dark:text-slate-200">{data.principalRemarks ?? '—'}</p>
          </div>
        </div>

        {/* Signatures + QR */}
        <div className="flex flex-wrap items-end justify-between gap-6 border-t border-slate-200 px-8 py-6 dark:border-slate-700">
          <div className="flex flex-wrap gap-10 text-xs text-slate-500">
            {([
              { label: 'Class Teacher', sig: data.signatures?.classTeacher ?? null },
              { label: 'Principal / Head of School', sig: data.signatures?.principal ?? null },
            ]).map(({ label, sig }) => (
              <div key={label}>
                {sig?.dataUrl
                  ? <img src={sig.dataUrl} alt={`${sig.name}'s signature`} className="h-10 object-contain" />
                  : <div className="h-10" />}
                <div className="w-44 border-b border-slate-300 dark:border-slate-600" />
                <div className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{sig?.title ?? label}</div>
                {sig?.name && <div className="text-slate-400">{sig.name}</div>}
              </div>
            ))}
          </div>
          {data.qr && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <img src={data.qr} alt="Verification QR code" className="mx-auto h-24 w-24" />
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Scan to verify</div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-500">{data.verificationCode}</div>
            </div>
          )}
        </div>

        <div className="bg-indigo-950 px-6 py-2.5 text-center text-[11px] text-indigo-200">
          {data.school.name} · Verified via School Grading System · {data.verificationCode}
        </div>
      </div>

      <p className="no-print mx-auto mt-4 max-w-3xl px-4 text-center text-xs text-slate-400">
        This document was cryptographically linked to verification code {data.verificationCode}.
        Any alteration after publication can be detected by re-scanning the QR code.
      </p>
    </div>
  );
}
