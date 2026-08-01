import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { Badge, EmptyState, Spinner } from '../components/ui';
import { fmtDate, initials } from '../lib/utils';

interface TeacherDetail {
  id: string;
  staffNumber: string;
  qualification?: string | null;
  photoUrl?: string | null;
  hireDate?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    phone?: string | null;
    lastLoginAt?: string | null;
  };
  assignments: {
    id?: string;
    subject: { id: string; code: string; name: string };
    classRoom: { id: string; name: string; stream: string; _count?: { students: number } };
  }[];
  homeroomClasses?: {
    id: string;
    name: string;
    stream: string;
    _count?: { students: number };
  }[];
}

interface TeacherProfileProps {
  /** Optional id override — used when rendering a teacher's own profile. */
  profileId?: string;
  /** When true, shows the page as a read-only self-profile. */
  self?: boolean;
}

export default function TeacherProfile({ profileId, self = false }: TeacherProfileProps = {}) {
  const { id: paramId } = useParams<{ id: string }>();
  const id = profileId ?? paramId;
  const navigate = useNavigate();

  const { data: teacher, loading, error } = useQuery(
    () => {
      if (!id) return Promise.resolve(undefined);
      // Self-profile uses the /me endpoint; otherwise the detail page by id.
      const url = self ? '/teachers/me' : `/teachers/${id}`;
      return api.get<TeacherDetail>(url).then((r) => r.data);
    },
    [id, self],
  );

  if (!id) return null;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-slate-500">
        <Spinner /> Loading profile…
      </div>
    );
  }

  if (error || !teacher) {
    return (
      <div className="card">
        <EmptyState title="Teacher not found" hint={error ?? 'This teacher may have been removed.'} icon="users" />
        <div className="pb-6 text-center">
          <button className="btn-secondary" onClick={() => navigate(self ? '/' : '/teachers')}>
            {self ? 'Back to dashboard' : 'Back to teachers'}
          </button>
        </div>
      </div>
    );
  }

  const uniqueClasses = new Set(teacher.assignments.map((a) => a.classRoom.id)).size;
  const uniqueSubjects = new Set(teacher.assignments.map((a) => a.subject.id)).size;
  const totalStudents = teacher.assignments.reduce((sum, a) => sum + (a.classRoom._count?.students ?? 0), 0);

  return (
    <div>
      <button className="btn-ghost mb-4 px-2 py-1.5 text-sm" onClick={() => navigate(self ? '/' : '/teachers')}>
        <Icon name="arrow-left" size={15} /> {self ? 'Back to dashboard' : 'Back to teachers'}
      </button>

      {/* Hero */}
      <div className="card mb-6 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-sky-600 via-indigo-500 to-violet-600" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-2xl font-extrabold text-sky-700 shadow-lg ring-4 ring-white dark:bg-slate-800 dark:text-sky-300 dark:ring-slate-900">
              {teacher.photoUrl
                ? <img src={teacher.photoUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                : initials(teacher.user.name)}
            </div>
            <div className="min-w-0 flex-1 pt-10 sm:pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{teacher.user.name}</h1>
                <Badge className={teacher.user.isActive
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'}>
                  {teacher.user.isActive ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                <span className="font-mono text-xs font-semibold text-sky-600 dark:text-sky-400">{teacher.staffNumber}</span>
                <span>·</span>
                <span>{teacher.user.email}</span>
                {teacher.qualification && (
                  <>
                    <span>·</span>
                    <span>{teacher.qualification}</span>
                  </>
                )}
              </div>
            </div>
            {!self && (
              <div className="pt-2">
                <Link to="/teachers" className="btn-secondary">
                  <Icon name="edit" size={14} /> Manage on Teachers page
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Assignments', value: String(teacher.assignments.length), icon: 'book' as const, tone: 'indigo' },
          { label: 'Subjects', value: String(uniqueSubjects), icon: 'book-open' as const, tone: 'sky' },
          { label: 'Classes', value: String(uniqueClasses), icon: 'graduation' as const, tone: 'emerald' },
          { label: 'Students reached', value: String(totalStudents), icon: 'users' as const, tone: 'amber' },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-4 p-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              s.tone === 'indigo' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
              : s.tone === 'sky' ? 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400'
              : s.tone === 'emerald' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
            }`}>
              <Icon name={s.icon} size={18} />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Icon name="users" size={14} /> Profile details
            </h2>
            <dl className="space-y-3 text-sm">
              {[
                ['Full name', teacher.user.name],
                ['Staff number', teacher.staffNumber],
                ['Email', teacher.user.email],
                ['Phone', teacher.user.phone || '—'],
                ['Qualification', teacher.qualification || '—'],
                ['Hire date', fmtDate(teacher.hireDate)],
                ['Joined system', fmtDate(teacher.createdAt)],
                ['Last login', fmtDate(teacher.user.lastLoginAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {(teacher.homeroomClasses?.length ?? 0) > 0 && (
            <div className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <Icon name="home" size={14} /> Homeroom classes
              </h2>
              <ul className="space-y-2">
                {teacher.homeroomClasses!.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
                    <span className="font-medium">{c.name} {c.stream}</span>
                    <span className="text-xs text-slate-400">{c._count?.students ?? 0} students</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <h2 className="font-semibold">Teaching assignments</h2>
              <p className="text-xs text-slate-400">Subject and class combinations this teacher is responsible for.</p>
            </div>
            {teacher.assignments.length === 0 ? (
              <EmptyState title="No assignments yet" hint="Assign subjects and classes from the Teachers page." icon="book" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Subject</th>
                      <th className="th">Code</th>
                      <th className="th">Class</th>
                      <th className="th text-right">Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teacher.assignments.map((a) => (
                      <tr key={a.id ?? `${a.subject.id}-${a.classRoom.id}`} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="td font-medium">{a.subject.name}</td>
                        <td className="td font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">{a.subject.code}</td>
                        <td className="td">{a.classRoom.name} {a.classRoom.stream}</td>
                        <td className="td text-right">{a.classRoom._count?.students ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
