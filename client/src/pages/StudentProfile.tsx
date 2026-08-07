import { Link, useNavigate, useParams } from 'react-router-dom';

import { Icon } from '../components/Icon';
import { useToast } from '../components/toast';
import { Badge, EmptyState, Spinner, TableSkeleton } from '../components/ui';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/useQuery';
import {
  cx,
  downloadBlob,
  fmtDate,
  gradeBadgeClass,
  initials,
  ordinal,
  statusBadgeClass,
} from '../lib/utils';

import type { StudentResultsResponse } from '../lib/types';

interface StudentDetail {
  id: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: string;
  photoUrl?: string | null;
  address?: string | null;
  guardianPhone?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    lastLoginAt?: string | null;
    phone?: string | null;
  };
  classRoom?: { id: string; name: string; stream: string } | null;
  parent?: { id: string; user: { name: string; email: string; phone?: string | null } } | null;
  enrollments: {
    id: string;
    classRoom: { id: string; name: string; stream: string };
    semester: { id: string; name: string; academicYear: { name: string } };
  }[];
  gpaRecords: {
    id: string;
    gpa: number;
    average: number;
    position: number | null;
    classSize: number | null;
    totalCredits: number;
    semester: { id: string; name: string; academicYear: { name: string } };
  }[];
  reportCards: {
    id: string;
    status: string;
    verificationCode: string;
    publishedAt: string | null;
    semester: { name: string; academicYear: { name: string } };
  }[];
}

interface StudentProfileProps {
  /** Optional id override — used when rendering a student's own profile. */
  profileId?: string;
  /** When true, shows the page as a read-only self-profile. */
  self?: boolean;
}

export default function StudentProfile({ profileId, self = false }: StudentProfileProps = {}) {
  const { id: paramId } = useParams<{ id: string }>();
  const id = profileId ?? paramId;
  const navigate = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();

  const {
    data: student,
    loading,
    error,
  } = useQuery(() => {
    if (!id) return Promise.resolve(undefined);
    // Self-profile uses the /me endpoint (a student can't fetch by id);
    // otherwise the detail page by id.
    const url = self ? '/students/me' : `/students/${id}`;
    return api.get<StudentDetail>(url).then((r) => r.data);
  }, [id, self]);

  const { data: results, loading: resultsLoading } = useQuery(
    () =>
      id
        ? api.get<StudentResultsResponse>(`/students/${id}/results?all=true`).then((r) => r.data)
        : Promise.resolve(undefined),
    [id],
  );

  if (!id) return null;

  const downloadTranscript = async () => {
    if (!student) return;
    try {
      const res = await api.get(`/report-cards/transcript/${student.id}/pdf`, {
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, `transcript_${student.admissionNumber}.pdf`);
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-slate-500">
        <Spinner /> Loading profile…
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="card">
        <EmptyState
          title="Student not found"
          hint={error ?? 'This student may have been removed.'}
          icon="users"
        />
        <div className="pb-6 text-center">
          <button className="btn-secondary" onClick={() => navigate(self ? '/' : '/students')}>
            {self ? 'Back to dashboard' : 'Back to students'}
          </button>
        </div>
      </div>
    );
  }

  const latestGpa = student.gpaRecords[0];

  return (
    <div>
      <button
        className="btn-ghost mb-4 px-2 py-1.5 text-sm"
        onClick={() => navigate(self ? '/' : '/students')}
      >
        <Icon name="arrow-left" size={15} /> {self ? 'Back to dashboard' : 'Back to students'}
      </button>

      {/* Hero */}
      <div className="card mb-6 overflow-hidden">
        <div className="h-20 bg-brand-900 border-b border-amber-400" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-400 text-2xl font-display font-bold text-brand-950 shadow-lg ring-4 ring-white dark:ring-stone-900">
              {student.photoUrl ? (
                <img
                  src={student.photoUrl}
                  alt=""
                  className="h-full w-full rounded-2xl object-cover"
                />
              ) : (
                initials(student.user.name)
              )}
            </div>
            <div className="min-w-0 flex-1 pt-10 sm:pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {student.user.name}
                </h1>
                <Badge
                  className={
                    student.user.isActive
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
                  }
                >
                  {student.user.isActive ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                <span className="font-mono text-xs font-semibold text-brand-700 dark:text-brand-400">
                  {student.admissionNumber}
                </span>
                <span>·</span>
                <span>{student.user.email}</span>
                {student.classRoom && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="graduation" size={13} />
                      {student.classRoom.name} {student.classRoom.stream}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {hasRole('ADMIN') && (
                <Link to="/students" className="btn-secondary" state={{ editId: student.id }}>
                  <Icon name="edit" size={14} /> Edit
                </Link>
              )}
              <button className="btn-primary" onClick={() => void downloadTranscript()}>
                <Icon name="download" size={14} /> Transcript PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Term GPA',
            value: latestGpa ? latestGpa.gpa.toFixed(2) : '—',
            hint: latestGpa ? `${latestGpa.semester.name}` : 'No results yet',
            tone: 'brand' as const,
            icon: 'award' as const,
          },
          {
            label: 'Average',
            value: latestGpa ? `${latestGpa.average.toFixed(1)}%` : '—',
            hint: latestGpa ? `${latestGpa.totalCredits} credits` : undefined,
            tone: 'sky' as const,
            icon: 'bar-chart' as const,
          },
          {
            label: 'Class position',
            value: latestGpa?.position ? ordinal(latestGpa.position) : '—',
            hint: latestGpa?.classSize ? `of ${latestGpa.classSize}` : undefined,
            tone: 'emerald' as const,
            icon: 'trending-up' as const,
          },
          {
            label: 'Report cards',
            value: String(student.reportCards.length),
            hint: student.reportCards.filter((c) => c.status === 'PUBLISHED').length + ' published',
            tone: 'amber' as const,
            icon: 'file-text' as const,
          },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-4 p-4">
            <div
              className={cx(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                s.tone === 'brand' &&
                  'bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300',
                s.tone === 'sky' && 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
                s.tone === 'emerald' &&
                  'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
                s.tone === 'amber' &&
                  'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
              )}
            >
              <Icon name={s.icon} size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</div>
              {s.hint && <div className="truncate text-xs text-slate-400">{s.hint}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — personal details */}
        <div className="space-y-6 lg:col-span-1">
          <div className="card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Icon name="users" size={14} /> Personal details
            </h2>
            <dl className="space-y-3 text-sm">
              {[
                ['Full name', student.user.name],
                ['Admission no.', student.admissionNumber],
                ['Email', student.user.email],
                ['Gender', student.gender.charAt(0) + student.gender.slice(1).toLowerCase()],
                ['Date of birth', fmtDate(student.dateOfBirth)],
                [
                  'Class',
                  student.classRoom
                    ? `${student.classRoom.name} ${student.classRoom.stream}`
                    : '— Unassigned —',
                ],
                ['Address', student.address || '—'],
                ['Guardian phone', student.guardianPhone || '—'],
                ['Registered', fmtDate(student.createdAt)],
                ['Last login', fmtDate(student.user.lastLoginAt)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800"
                >
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="text-right font-medium text-slate-800 dark:text-slate-200">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {student.parent && (
            <div className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <Icon name="users" size={14} /> Parent / guardian
              </h2>
              <div className="font-medium text-slate-900 dark:text-white">
                {student.parent.user.name}
              </div>
              <div className="mt-1 text-sm text-slate-500">{student.parent.user.email}</div>
              {student.parent.user.phone && (
                <div className="mt-1 text-sm text-slate-500">{student.parent.user.phone}</div>
              )}
            </div>
          )}

          {student.enrollments.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <Icon name="book-open" size={14} /> Enrolment history
              </h2>
              <ul className="space-y-2">
                {student.enrollments.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
                  >
                    <span className="font-medium">
                      {e.classRoom.name} {e.classRoom.stream}
                    </span>
                    <span className="text-xs text-slate-400">
                      {e.semester.name} · {e.semester.academicYear.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right column — academics */}
        <div className="space-y-6 lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-white">
                Current term results
                {results?.semester && (
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    {results.semester.name}
                    {results.semester.academicYear
                      ? ` · ${results.semester.academicYear.name}`
                      : ''}
                  </span>
                )}
              </h2>
            </div>
            {resultsLoading ? (
              <TableSkeleton rows={4} cols={5} />
            ) : !results?.results.length ? (
              <EmptyState
                title="No results yet"
                hint="Results appear after grades are approved for this term."
                icon="book"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
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
                    {results.results.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="td font-mono text-xs font-semibold">{r.subject.code}</td>
                        <td className="td font-medium">{r.subject.name}</td>
                        <td className="td text-right font-semibold">{r.percentage.toFixed(1)}%</td>
                        <td className="td text-center">
                          <Badge className={gradeBadgeClass(r.letterGrade)}>{r.letterGrade}</Badge>
                        </td>
                        <td className="td text-center">{r.gradePoint.toFixed(1)}</td>
                        <td className="td text-center">{ordinal(r.position)}</td>
                        <td className="td text-slate-500">{r.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {student.gpaRecords.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                <h2 className="font-semibold">GPA history</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Term</th>
                      <th className="th">Year</th>
                      <th className="th text-right">GPA</th>
                      <th className="th text-right">Average</th>
                      <th className="th text-center">Position</th>
                      <th className="th text-center">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.gpaRecords.map((g) => (
                      <tr key={g.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="td font-medium">{g.semester.name}</td>
                        <td className="td text-slate-500">{g.semester.academicYear.name}</td>
                        <td className="td text-right font-bold text-brand-700 dark:text-brand-300">
                          {g.gpa.toFixed(2)}
                        </td>
                        <td className="td text-right">{g.average.toFixed(1)}%</td>
                        <td className="td text-center">
                          {g.position ? `${ordinal(g.position)} / ${g.classSize ?? '—'}` : '—'}
                        </td>
                        <td className="td text-center">{g.totalCredits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {student.reportCards.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                <h2 className="font-semibold">Report cards</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {student.reportCards.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <div className="font-medium">
                        {c.semester.name} · {c.semester.academicYear.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {c.publishedAt ? `Published ${fmtDate(c.publishedAt)}` : 'Not published'} ·{' '}
                        {c.verificationCode}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusBadgeClass(c.status)}>{c.status}</Badge>
                      <Link
                        to={`/verify/${c.verificationCode}`}
                        target="_blank"
                        className="btn-ghost px-2 py-1 text-xs"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
