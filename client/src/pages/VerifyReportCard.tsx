import { useParams } from 'react-router-dom';

import { Icon } from '../components/Icon';
import { Badge, Spinner } from '../components/ui';
import { api, apiUrl } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { ordinal } from '../lib/utils';

import type { ReportCardDetail } from '../lib/types';

/** Classic official-document palette, mirroring the PDF report card. */
const NAVY = '#1c3557';
const GOLD = '#b8933d';
const HAIRLINE = '#d9dee4';
const ZEBRA = '#f5f6f8';
const MUTED = '#5f6b78';

/** Public report-card verification / printable view (linked from the QR code).
 *  Styled like a printed certificate: white paper, serif headings, navy + gold
 *  rules. The paper stays light even in dark mode so it prints correctly. */
export default function VerifyReportCard() {
  const { code } = useParams<{ code: string }>();
  const { data, loading, error } = useQuery(
    () => api.get<ReportCardDetail>(`/report-cards/verify/${code}`).then((r) => r.data),
    [code],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
        <Spinner /> Verifying report card…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <Icon name="x-circle" size={44} className="text-rose-500" />
          <h1 className="mt-2 text-lg font-bold">Verification failed</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {error ?? 'This report card could not be verified.'}
          </p>
        </div>
      </div>
    );
  }

  const details: [string, string][] = [
    ['Student Name', data.student.name],
    ['Admission No.', data.student.admissionNumber],
    ['Class', data.student.className],
    ['Term', data.semester.name],
    ['Year', data.semester.academicYear],
    ['Class Size', data.gpa?.classSize ? String(data.gpa.classSize) : '—'],
    ['Credits', data.gpa ? String(data.gpa.totalCredits) : '—'],
    ['Date Issued', data.publishedAt ? data.publishedAt.slice(0, 10) : '—'],
  ];
  const summary = [
    { label: 'Term GPA', value: data.gpa ? data.gpa.gpa.toFixed(2) : '—' },
    { label: 'Average', value: data.gpa ? `${data.gpa.average.toFixed(1)}%` : '—' },
    {
      label: 'Class Position',
      value: data.gpa?.position
        ? `${ordinal(data.gpa.position)} of ${data.gpa.classSize ?? '—'}`
        : '—',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 py-8 dark:bg-slate-950">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center justify-between px-4">
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
          <Icon name="shield-check" size={13} /> Verified authentic
        </Badge>
        <button className="btn-primary" onClick={() => window.print()}>
          <Icon name="printer" size={15} /> Print / Save PDF
        </button>
      </div>

      {/* White paper document — stays light in dark mode for printing */}
      <div className="print-area mx-auto max-w-3xl bg-white text-slate-900 shadow-lg">
        {/* Top band: navy with a thin gold rule */}
        <div className="h-2.5" style={{ backgroundColor: NAVY }} />
        <div className="h-0.5" style={{ backgroundColor: GOLD }} />

        {/* Certificate header */}
        <header className="px-8 pb-6 pt-8 text-center">
          {data.school.hasBadge && (
            <div
              className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white p-1.5"
              style={{ border: `2px solid ${GOLD}`, boxShadow: `0 0 0 1.5px ${NAVY} inset` }}
            >
              <img
                src={apiUrl('/school/badge')}
                alt={`${data.school.name} badge`}
                className="h-full w-full rounded-full object-contain"
              />
            </div>
          )}
          <h1
            className="font-doc mt-3 text-[26px] font-bold tracking-wide sm:text-[30px]"
            style={{ color: NAVY }}
          >
            {data.school.name}
          </h1>
          {data.school.motto && (
            <p className="font-doc mt-1 text-sm italic" style={{ color: GOLD }}>
              “{data.school.motto}”
            </p>
          )}
          {/* Navy + gold double rule */}
          <div className="mt-4 h-[3px]" style={{ backgroundColor: NAVY }} />
          <div className="mt-[3px] h-px" style={{ backgroundColor: GOLD }} />
          <p
            className="font-doc mt-4 text-[13px] font-bold tracking-[0.3em]"
            style={{ color: NAVY }}
          >
            OFFICIAL STUDENT REPORT CARD
          </p>
          <p className="font-doc mt-1.5 text-sm italic" style={{ color: MUTED }}>
            {data.semester.name} &nbsp;·&nbsp; Academic Year {data.semester.academicYear}
          </p>
        </header>

        {/* Formal details grid */}
        <div className="px-8">
          <div
            className="grid grid-cols-2 gap-px border sm:grid-cols-4"
            style={{ borderColor: NAVY, backgroundColor: HAIRLINE }}
          >
            {details.map(([label, value]) => (
              <div key={label} className="bg-white px-3 py-2.5">
                <div
                  className="text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: NAVY }}
                >
                  {label}
                </div>
                <div
                  className="font-doc mt-0.5 truncate text-[15px] font-bold"
                  style={{ color: '#232a33' }}
                  title={value}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navy summary band with gold dividers */}
        <div className="px-8 pt-4">
          <div className="grid grid-cols-3" style={{ backgroundColor: NAVY }}>
            {summary.map((k, i) => (
              <div
                key={k.label}
                className="px-4 py-3 text-center"
                style={i > 0 ? { borderLeft: `1px solid ${GOLD}66` } : undefined}
              >
                <div
                  className="text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: '#c9d4e6' }}
                >
                  {k.label}
                </div>
                <div className="font-doc mt-0.5 text-xl font-bold text-white">{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ruled results table */}
        <div className="px-8 pt-5">
          <div className="font-doc text-[11px] font-bold tracking-[0.22em]" style={{ color: NAVY }}>
            SUBJECT PERFORMANCE
          </div>
          <div className="mb-2 mt-1 h-[2px] w-10" style={{ backgroundColor: GOLD }} />
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: NAVY, boxShadow: `inset 0 -2px 0 ${GOLD}` }}>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-white">
                  Code
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-white">
                  Subject
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-white">
                  Score
                </th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-white">
                  Grade
                </th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-white">
                  Point
                </th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-white">
                  Rank
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-white">
                  Remark
                </th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr
                  key={r.code}
                  className="border-b"
                  style={{
                    borderColor: HAIRLINE,
                    backgroundColor: i % 2 === 0 ? ZEBRA : '#ffffff',
                  }}
                >
                  <td className="font-doc px-3 py-1.5 text-[13px] font-bold">{r.code}</td>
                  <td className="font-doc px-3 py-1.5 text-[13px] font-bold">{r.name}</td>
                  <td className="font-doc px-3 py-1.5 text-right text-[13px]">
                    {r.percentage.toFixed(1)}%
                  </td>
                  <td
                    className="font-doc px-3 py-1.5 text-center text-[13px] font-bold"
                    style={{ color: NAVY }}
                  >
                    {r.letterGrade}
                  </td>
                  <td className="font-doc px-3 py-1.5 text-center text-[13px]">
                    {r.gradePoint.toFixed(1)}
                  </td>
                  <td className="font-doc px-3 py-1.5 text-center text-[13px]">
                    {ordinal(r.position)}
                  </td>
                  <td className="font-doc px-3 py-1.5 text-[13px]" style={{ color: MUTED }}>
                    {r.remark}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bordered remarks */}
        <div className="space-y-3 px-8 pt-5">
          {(
            [
              ["Class Teacher's Remarks", data.teacherRemarks],
              ["Principal's Remarks", data.principalRemarks],
            ] as const
          ).map(([title, body]) => (
            <div key={title} className="border px-4 py-3" style={{ borderColor: HAIRLINE }}>
              <div
                className="text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: NAVY }}
              >
                {title}
              </div>
              <p className="font-doc mt-1 text-[15px]" style={{ color: '#232a33' }}>
                {body ?? '—'}
              </p>
            </div>
          ))}
        </div>

        {/* Signatures + QR verification panel */}
        <div className="flex flex-wrap items-end justify-between gap-6 px-8 pb-7 pt-6">
          <div className="flex flex-wrap gap-10 text-xs" style={{ color: MUTED }}>
            {[
              { label: 'Class Teacher', sig: data.signatures?.classTeacher ?? null },
              { label: 'Principal / Head of School', sig: data.signatures?.principal ?? null },
            ].map(({ label, sig }) => (
              <div key={label}>
                {sig?.dataUrl ? (
                  <img
                    src={sig.dataUrl}
                    alt={`${sig.name}'s signature`}
                    className="h-10 object-contain"
                  />
                ) : (
                  <div className="h-10" />
                )}
                <div className="w-44 border-b" style={{ borderColor: '#8a94a0' }} />
                <div className="font-doc mt-1 text-sm font-semibold" style={{ color: '#232a33' }}>
                  {sig?.title ?? label}
                </div>
                {sig?.name && (
                  <div className="font-doc italic" style={{ color: MUTED }}>
                    {sig.name}
                  </div>
                )}
              </div>
            ))}
          </div>
          {data.qr && (
            <div className="border p-2.5 text-center" style={{ borderColor: HAIRLINE }}>
              <img src={data.qr} alt="Verification QR code" className="mx-auto h-20 w-20" />
              <div
                className="mt-1 text-[9px] font-bold uppercase tracking-widest"
                style={{ color: MUTED }}
              >
                Scan to verify
              </div>
              <div className="mt-0.5 font-mono text-[10px]" style={{ color: MUTED }}>
                {data.verificationCode}
              </div>
            </div>
          )}
        </div>

        {/* Navy footer band with gold hairline */}
        <div className="h-0.5" style={{ backgroundColor: GOLD }} />
        <div
          className="px-6 py-2.5 text-center text-[11px]"
          style={{ backgroundColor: NAVY, color: '#c9d4e6' }}
        >
          {data.school.name} &nbsp;·&nbsp; Verified via School Grading System &nbsp;·&nbsp;{' '}
          {data.verificationCode}
        </div>
      </div>

      <p className="no-print mx-auto mt-4 max-w-3xl px-4 text-center text-xs text-slate-400">
        This document was cryptographically linked to verification code {data.verificationCode}. Any
        alteration after publication can be detected by re-scanning the QR code.
      </p>
    </div>
  );
}
