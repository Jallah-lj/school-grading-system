import { useEffect, useState } from 'react';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { useToast } from '../components/toast';
import { Badge, Modal, PageHeader, TableSkeleton } from '../components/ui';
import { api, apiError, apiUrl } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { cx, downloadBlob, fmtDate } from '../lib/utils';

import type {
  AcademicYear,
  ClassRoom,
  GradeScale,
  ManagedUser,
  Role,
  SchoolSettings,
  Subject,
  TeacherRow,
} from '../lib/types';

const TABS = ['School', 'Users', 'Subjects', 'Classes', 'Grade Scales', 'Academic Years'] as const;
type Tab = (typeof TABS)[number];

/* ------------------------------- Users tab ------------------------------- */
function UsersTab() {
  const toast = useToast();
  const [role, setRole] = useState('');
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmToggle, setConfirmToggle] = useState<ManagedUser | null>(null);
  const [confirmRole, setConfirmRole] = useState<{ user: ManagedUser; role: Role } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const { data, loading, refetch } = useQuery(
    () =>
      api
        .get<{ data: ManagedUser[] }>(`/users?pageSize=100${role ? `&role=${role}` : ''}`)
        .then((r) => r.data),
    [role],
  );

  const toggleActive = async () => {
    if (!confirmToggle) return;
    setActionBusy(true);
    try {
      await api.patch(`/users/${confirmToggle.id}`, { isActive: !confirmToggle.isActive });
      toast(
        'success',
        `${confirmToggle.name} ${confirmToggle.isActive ? 'deactivated' : 'activated'}`,
      );
      setConfirmToggle(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setActionBusy(false);
    }
  };

  const changeRole = async () => {
    if (!confirmRole) return;
    setActionBusy(true);
    try {
      await api.patch(`/users/${confirmRole.user.id}`, { role: confirmRole.role });
      toast('success', 'Role updated');
      setConfirmRole(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setActionBusy(false);
    }
  };

  const doReset = async () => {
    if (!resetTarget) return;
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { password: newPassword });
      toast('success', `Password reset for ${resetTarget.name}`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const roleBadge = (r: string) =>
    ({
      ADMIN: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
      TEACHER: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
      STUDENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      PARENT: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    })[r] ?? '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {['', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT'].map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={cx(
              'btn px-3 py-1.5 text-xs',
              role === r ? 'bg-indigo-600 text-white' : 'btn-secondary',
            )}
          >
            {r === '' ? 'All' : r.charAt(0) + r.slice(1).toLowerCase() + 's'}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="card">
          <TableSkeleton />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="th">User</th>
                  <th className="th">Role</th>
                  <th className="th">Last login</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="td">
                      <div className="flex items-center gap-1.5 font-medium">
                        {u.name}
                        {u.signature && (
                          <span
                            title="Digital signature on file"
                            className="inline-flex text-emerald-500"
                          >
                            <Icon name="pen" size={13} />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>
                    <td className="td">
                      <select
                        className="input w-28 px-2 py-1 text-xs"
                        value={u.role}
                        onChange={(e) => {
                          const next = e.target.value as Role;
                          if (next === u.role) return;
                          setConfirmRole({ user: u, role: next });
                        }}
                      >
                        {(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>{' '}
                      <Badge className={roleBadge(u.role)}>{u.role}</Badge>
                    </td>
                    <td className="td text-slate-400">{fmtDate(u.lastLoginAt)}</td>
                    <td className="td">
                      <Badge
                        className={
                          u.isActive
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
                        }
                      >
                        {u.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td className="td text-right">
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => {
                          setResetTarget(u);
                          setNewPassword('');
                        }}
                      >
                        Reset password
                      </button>
                      <button
                        className={cx('btn-ghost px-2 py-1 text-xs', u.isActive && 'text-rose-500')}
                        onClick={() => setConfirmToggle(u)}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`Reset password — ${resetTarget?.name ?? ''}`}
      >
        <div className="space-y-4">
          <div>
            <label className="label">New password</label>
            <input
              className="input"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, letter + number"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => void doReset()}>
              Reset Password
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmToggle}
        danger={!!confirmToggle?.isActive}
        busy={actionBusy}
        title={confirmToggle?.isActive ? 'Deactivate user' : 'Activate user'}
        message={
          confirmToggle
            ? confirmToggle.isActive
              ? `Deactivate ${confirmToggle.name}? They will no longer be able to sign in until reactivated.`
              : `Reactivate ${confirmToggle.name}? They will regain access to the system.`
            : ''
        }
        confirmText={confirmToggle?.isActive ? 'Deactivate' : 'Activate'}
        onConfirm={() => void toggleActive()}
        onCancel={() => setConfirmToggle(null)}
      />
      <ConfirmDialog
        open={!!confirmRole}
        busy={actionBusy}
        title="Change user role"
        message={
          confirmRole
            ? `Change ${confirmRole.user.name}'s role from ${confirmRole.user.role} to ${confirmRole.role}? This immediately affects their permissions.`
            : ''
        }
        confirmText="Change Role"
        onConfirm={() => void changeRole()}
        onCancel={() => setConfirmRole(null)}
      />
    </div>
  );
}

/* ------------------------------ Subjects tab ------------------------------ */
const COMPONENT_TYPES: ComponentType[] = [
  'ASSIGNMENT',
  'QUIZ',
  'CAT',
  'PRACTICAL',
  'MIDTERM',
  'PROJECT',
  'FINAL',
];
type ComponentType = 'ASSIGNMENT' | 'QUIZ' | 'CAT' | 'PRACTICAL' | 'MIDTERM' | 'FINAL' | 'PROJECT';

interface ComponentDraft {
  type: ComponentType;
  name: string;
  weight: number;
  maxScore: number;
}

function SubjectsTab() {
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [componentsOf, setComponentsOf] = useState<Subject | null>(null);
  const [form, setForm] = useState({ code: '', name: '', creditUnits: 3, department: '' });
  const [drafts, setDrafts] = useState<ComponentDraft[]>([]);

  const { data, loading, refetch } = useQuery(
    () => api.get<{ data: Subject[] }>('/subjects').then((r) => r.data),
    [],
  );

  const openComponents = (s: Subject) => {
    setComponentsOf(s);
    setDrafts(
      (s.components ?? []).map((c) => ({
        type: c.type as ComponentType,
        name: c.name,
        weight: c.weight,
        maxScore: c.maxScore,
      })),
    );
  };

  const saveSubject = async () => {
    try {
      const payload = {
        ...form,
        creditUnits: Number(form.creditUnits),
        code: form.code.toUpperCase(),
      };
      if (editing) await api.put(`/subjects/${editing.id}`, payload);
      else await api.post('/subjects', payload);
      toast('success', editing ? 'Subject updated' : 'Subject created');
      setFormOpen(false);
      setEditing(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const saveComponents = async () => {
    if (!componentsOf) return;
    try {
      await api.put(`/subjects/${componentsOf.id}/components`, { components: drafts });
      toast('success', 'Assessment components saved');
      setComponentsOf(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const totalWeight = drafts.reduce((a, c) => a + Number(c.weight || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setForm({ code: '', name: '', creditUnits: 3, department: '' });
            setFormOpen(true);
          }}
        >
          + New Subject
        </button>
      </div>
      {loading ? (
        <div className="card">
          <TableSkeleton />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Subject</th>
                  <th className="th">Credits</th>
                  <th className="th">Department</th>
                  <th className="th">Components</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="td font-mono text-xs font-semibold">{s.code}</td>
                    <td className="td font-medium">{s.name}</td>
                    <td className="td">{s.creditUnits}</td>
                    <td className="td text-slate-400">{s.department ?? '—'}</td>
                    <td className="td">
                      <button
                        className="text-indigo-500 hover:underline"
                        onClick={() => openComponents(s)}
                      >
                        {s.components?.length ?? 0} configured
                      </button>
                    </td>
                    <td className="td text-right">
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => {
                          setEditing(s);
                          setForm({
                            code: s.code,
                            name: s.name,
                            creditUnits: s.creditUnits,
                            department: s.department ?? '',
                          });
                          setFormOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Subject' : 'New Subject'}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Code</label>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="MAT"
              />
            </div>
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mathematics"
              />
            </div>
            <div>
              <label className="label">Credit units</label>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={form.creditUnits}
                onChange={(e) => setForm({ ...form, creditUnits: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Department (optional)</label>
              <input
                className="input"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="Sciences"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => void saveSubject()}
              disabled={!form.code || !form.name}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!componentsOf}
        onClose={() => setComponentsOf(null)}
        wide
        title={`Assessment Components — ${componentsOf?.name ?? ''}`}
      >
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Define how this subject is assessed. Weights must total <strong>100</strong>.
        </p>
        <div className="space-y-2">
          {drafts.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                className="input w-36"
                value={c.type}
                onChange={(e) => {
                  const next = [...drafts];
                  next[i] = { ...c, type: e.target.value as ComponentType };
                  setDrafts(next);
                }}
              >
                {COMPONENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                className="input flex-1"
                value={c.name}
                placeholder="Component name"
                onChange={(e) => {
                  const next = [...drafts];
                  next[i] = { ...c, name: e.target.value };
                  setDrafts(next);
                }}
              />
              <div className="flex items-center gap-1">
                <input
                  className="input w-20"
                  type="number"
                  min={1}
                  max={100}
                  value={c.weight}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[i] = { ...c, weight: Number(e.target.value) };
                    setDrafts(next);
                  }}
                />
                <span className="text-xs text-slate-400">% weight</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  className="input w-20"
                  type="number"
                  min={1}
                  value={c.maxScore}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[i] = { ...c, maxScore: Number(e.target.value) };
                    setDrafts(next);
                  }}
                />
                <span className="text-xs text-slate-400">max score</span>
              </div>
              <button
                className="btn-ghost px-2 text-rose-500"
                onClick={() => setDrafts(drafts.filter((_, x) => x !== i))}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="btn-secondary mt-3"
          onClick={() =>
            setDrafts([...drafts, { type: 'ASSIGNMENT', name: '', weight: 10, maxScore: 100 }])
          }
        >
          + Add component
        </button>
        <div
          className={cx(
            'mt-4 rounded-lg px-4 py-2 text-sm font-medium',
            totalWeight === 100
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
          )}
        >
          Total weight: {totalWeight} / 100
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setComponentsOf(null)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => void saveComponents()}
            disabled={totalWeight !== 100 || drafts.length === 0 || drafts.some((d) => !d.name)}
          >
            Save Components
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------- Classes tab ------------------------------ */
function ClassesTab() {
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    level: 1,
    stream: 'A',
    academicYearId: '',
    homeroomTeacherId: '',
  });

  const { data, loading, refetch } = useQuery(
    () => api.get<{ data: ClassRoom[] }>('/classes').then((r) => r.data),
    [],
  );
  const { data: years } = useQuery(
    () => api.get<{ data: AcademicYear[] }>('/academic-years').then((r) => r.data),
    [],
  );
  const { data: teachers } = useQuery(
    () => api.get<{ data: TeacherRow[] }>('/teachers?pageSize=100').then((r) => r.data),
    [],
  );

  const save = async () => {
    try {
      await api.post('/classes', {
        ...form,
        level: Number(form.level),
        homeroomTeacherId: form.homeroomTeacherId || null,
      });
      toast('success', 'Class created');
      setFormOpen(false);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="btn-primary"
          onClick={() => {
            const active = years?.data.find((y) => y.isActive) ?? years?.data[0];
            setForm({
              name: '',
              level: 1,
              stream: 'A',
              academicYearId: active?.id ?? '',
              homeroomTeacherId: '',
            });
            setFormOpen(true);
          }}
        >
          + New Class
        </button>
      </div>
      {loading ? (
        <div className="card">
          <TableSkeleton />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="th">Class</th>
                  <th className="th">Level</th>
                  <th className="th">Academic Year</th>
                  <th className="th">Homeroom Teacher</th>
                  <th className="th">Students</th>
                  <th className="th">Subjects Taught</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="td font-medium">
                      {c.name} {c.stream}
                    </td>
                    <td className="td">{c.level}</td>
                    <td className="td text-slate-400">{c.academicYear?.name}</td>
                    <td className="td">
                      {c.homeroomTeacher?.user.name ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="td">{c._count?.students ?? 0}</td>
                    <td className="td">{c._count?.assignments ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New Class">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Senior 3"
              />
            </div>
            <div>
              <label className="label">Stream / Section</label>
              <input
                className="input"
                value={form.stream}
                onChange={(e) => setForm({ ...form, stream: e.target.value })}
                placeholder="A"
              />
            </div>
            <div>
              <label className="label">Level</label>
              <input
                className="input"
                type="number"
                min={0}
                max={14}
                value={form.level}
                onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Academic year</label>
              <select
                className="input"
                value={form.academicYearId}
                onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
              >
                {years?.data.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Homeroom teacher (optional)</label>
              <select
                className="input"
                value={form.homeroomTeacherId}
                onChange={(e) => setForm({ ...form, homeroomTeacherId: e.target.value })}
              >
                <option value="">— None —</option>
                {teachers?.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => void save()}
              disabled={!form.name || !form.academicYearId}
            >
              Create Class
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------------------- Grade scales tab ---------------------------- */
interface BandDraft {
  minScore: number;
  maxScore: number;
  letter: string;
  gradePoint: number;
  remark: string;
}

function GradeScalesTab() {
  const toast = useToast();
  const [editing, setEditing] = useState<GradeScale | null>(null);
  const [bands, setBands] = useState<BandDraft[]>([]);
  const [name, setName] = useState('');

  const { data, loading, refetch } = useQuery(
    () => api.get<{ data: GradeScale[] }>('/grade-scales').then((r) => r.data),
    [],
  );

  const openEditor = (s: GradeScale) => {
    setEditing(s);
    setName(s.name);
    setBands(
      s.bands.map((b) => ({
        minScore: b.minScore,
        maxScore: b.maxScore,
        letter: b.letter,
        gradePoint: b.gradePoint,
        remark: b.remark,
      })),
    );
  };

  const save = async () => {
    if (!editing) return;
    try {
      await api.put(`/grade-scales/${editing.id}`, { name, bands });
      toast('success', 'Grading scale updated');
      setEditing(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const activate = async (s: GradeScale) => {
    try {
      await api.post(`/grade-scales/${s.id}/activate`);
      toast('success', `“${s.name}” is now the active scale`);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="card">
          <TableSkeleton />
        </div>
      ) : (
        (data?.data ?? []).map((s) => (
          <div key={s.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{s.name}</span>
                {s.isActive && (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                    Active
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                {!s.isActive && (
                  <button
                    className="btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => void activate(s)}
                  >
                    Set Active
                  </button>
                )}
                <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => openEditor(s)}>
                  Edit Scale
                </button>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Range</th>
                  <th className="th">Grade</th>
                  <th className="th">Point</th>
                  <th className="th">Remark</th>
                </tr>
              </thead>
              <tbody>
                {s.bands.map((b) => (
                  <tr
                    key={b.id ?? b.letter}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="td font-mono text-xs">
                      {b.minScore} – {b.maxScore}
                    </td>
                    <td className="td font-bold">{b.letter}</td>
                    <td className="td">{b.gradePoint.toFixed(1)}</td>
                    <td className="td text-slate-500 dark:text-slate-400">{b.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title="Edit Grading Scale">
        <div className="mb-4">
          <label className="label">Scale name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          {bands.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className="input w-20"
                type="number"
                value={b.minScore}
                onChange={(e) => {
                  const n = [...bands];
                  n[i] = { ...b, minScore: Number(e.target.value) };
                  setBands(n);
                }}
              />
              <span className="text-slate-400">–</span>
              <input
                className="input w-20"
                type="number"
                value={b.maxScore}
                onChange={(e) => {
                  const n = [...bands];
                  n[i] = { ...b, maxScore: Number(e.target.value) };
                  setBands(n);
                }}
              />
              <input
                className="input w-16"
                value={b.letter}
                onChange={(e) => {
                  const n = [...bands];
                  n[i] = { ...b, letter: e.target.value };
                  setBands(n);
                }}
              />
              <input
                className="input w-20"
                type="number"
                step="0.1"
                value={b.gradePoint}
                onChange={(e) => {
                  const n = [...bands];
                  n[i] = { ...b, gradePoint: Number(e.target.value) };
                  setBands(n);
                }}
              />
              <input
                className="input flex-1"
                value={b.remark}
                placeholder="Remark"
                onChange={(e) => {
                  const n = [...bands];
                  n[i] = { ...b, remark: e.target.value };
                  setBands(n);
                }}
              />
              <button
                className="btn-ghost px-2 text-rose-500"
                onClick={() => setBands(bands.filter((_, x) => x !== i))}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="btn-secondary mt-3"
          onClick={() =>
            setBands([
              { minScore: 0, maxScore: 0, letter: '', gradePoint: 0, remark: '' },
              ...bands,
            ])
          }
        >
          + Add band
        </button>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setEditing(null)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void save()}>
            Save Scale
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* --------------------------- Academic years tab --------------------------- */
function AcademicYearsTab() {
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    yearId?: string;
    semesterId?: string;
    label: string;
  } | null>(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', terms: 3 });

  const { data, loading, refetch } = useQuery(
    () => api.get<{ data: AcademicYear[] }>('/academic-years').then((r) => r.data),
    [],
  );

  const createYear = async () => {
    try {
      const start = new Date(form.startDate);
      const terms = Array.from({ length: form.terms }, (_, i) => {
        const spanMonths = 12 / form.terms;
        const s = new Date(start);
        s.setMonth(s.getMonth() + Math.round(i * spanMonths));
        const e = new Date(start);
        e.setMonth(e.getMonth() + Math.round((i + 1) * spanMonths));
        e.setDate(e.getDate() - 7);
        return {
          name: `Term ${i + 1}`,
          number: i + 1,
          kind: 'TERM',
          startDate: s.toISOString(),
          endDate: e.toISOString(),
        };
      });
      await api.post('/academic-years', {
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
        activate: true,
        semesters: terms,
      });
      toast('success', `Academic year ${form.name} created and activated`);
      setFormOpen(false);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const doAction = async () => {
    if (!confirm) return;
    try {
      if (confirm.semesterId) {
        await api.post(`/academic-years/semesters/${confirm.semesterId}/set-current`);
        toast('success', 'Current term updated');
      } else if (confirm.yearId) {
        await api.post(`/academic-years/${confirm.yearId}/activate`);
        toast('success', 'Academic year activated');
      }
      setConfirm(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="btn-primary"
          onClick={() => {
            setForm({ name: '', startDate: '', endDate: '', terms: 3 });
            setFormOpen(true);
          }}
        >
          + New Academic Year
        </button>
      </div>
      {loading ? (
        <div className="card">
          <TableSkeleton />
        </div>
      ) : (
        (data?.data ?? []).map((y) => (
          <div key={y.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{y.name}</span>
                {y.isActive && (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                    Active
                  </Badge>
                )}
                <span className="text-xs text-slate-400">
                  {fmtDate(y.startDate)} – {fmtDate(y.endDate)}
                </span>
              </div>
              {!y.isActive && (
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => setConfirm({ yearId: y.id, label: `Activate ${y.name}?` })}
                >
                  Activate
                </button>
              )}
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              {y.semesters.map((s) => (
                <div
                  key={s.id}
                  className={cx(
                    'rounded-xl border p-4',
                    s.isCurrent
                      ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500/50 dark:bg-indigo-500/10'
                      : 'border-slate-200 dark:border-slate-700',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.name}</span>
                    {s.isCurrent ? (
                      <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                        Current
                      </Badge>
                    ) : (
                      <button
                        className="text-xs text-indigo-500 hover:underline"
                        onClick={() =>
                          setConfirm({
                            semesterId: s.id,
                            label: `Set ${s.name} as the current term? Grade entry and dashboards will switch to it.`,
                          })
                        }
                      >
                        Set current
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {fmtDate(s.startDate)} – {fmtDate(s.endDate)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New Academic Year">
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="2026–2027"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start date</label>
              <input
                className="input"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">End date</label>
              <input
                className="input"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Terms / semesters</label>
            <select
              className="input"
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: Number(e.target.value) })}
            >
              <option value={2}>2 semesters</option>
              <option value={3}>3 terms</option>
              <option value={4}>4 quarters</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => void createYear()}
              disabled={!form.name || !form.startDate || !form.endDate}
            >
              Create &amp; Activate
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title="Confirm change"
        message={confirm?.label ?? ''}
        confirmText="Confirm"
        onConfirm={() => void doAction()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/* ------------------------------- School tab ------------------------------- */
function SchoolTab() {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', motto: '', studentIdPrefix: 'SGS' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [badgeVersion, setBadgeVersion] = useState(0);
  const [confirmRemoveBadge, setConfirmRemoveBadge] = useState(false);

  const { data, loading, refetch } = useQuery(
    () => api.get<SchoolSettings>('/school/settings').then((r) => r.data),
    [],
  );

  useEffect(() => {
    if (data)
      setForm({ name: data.name, motto: data.motto, studentIdPrefix: data.studentIdPrefix });
  }, [data]);

  const saveSettings = async () => {
    setBusy(true);
    try {
      await api.patch('/school/settings', form);
      toast('success', 'School settings saved');
      void refetch();
      window.dispatchEvent(new Event('school-updated'));
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const uploadBadge = async () => {
    if (!file) {
      toast('error', 'Choose a badge image first');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      await api.post('/school/badge', body);
      toast('success', 'Badge updated — it now appears on all report cards');
      setFile(null);
      setPreview((p) => {
        if (p) URL.revokeObjectURL(p);
        return null;
      });
      setBadgeVersion((v) => v + 1);
      void refetch();
      window.dispatchEvent(new Event('school-updated'));
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const removeBadge = async () => {
    setBusy(true);
    try {
      await api.delete('/school/badge');
      toast('success', 'Badge removed');
      setConfirmRemoveBadge(false);
      setBadgeVersion((v) => v + 1);
      void refetch();
      window.dispatchEvent(new Event('school-updated'));
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data)
    return (
      <div className="card">
        <TableSkeleton />
      </div>
    );

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-1 font-semibold">School Identity</h3>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Shown on report cards, transcripts, the login page and the sidebar.
          </p>
          <div className="space-y-4">
            <div>
              <label className="label">School name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Motto</label>
              <input
                className="input"
                value={form.motto}
                onChange={(e) => setForm({ ...form, motto: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Admission number prefix</label>
              <input
                className="input w-32 font-mono uppercase"
                maxLength={6}
                value={form.studentIdPrefix}
                onChange={(e) =>
                  setForm({ ...form, studentIdPrefix: e.target.value.toUpperCase() })
                }
              />
              <p className="mt-1 text-xs text-slate-400">
                New students get{' '}
                <span className="font-mono">{form.studentIdPrefix || 'SGS'}-2026-0001</span>, new
                teachers <span className="font-mono">{form.studentIdPrefix || 'SGS'}-STF-001</span>.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => void saveSettings()}
              disabled={busy || !form.name.trim()}
            >
              {busy ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-1 font-semibold">School Badge / Crest</h3>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Stamped in the header of every report card and transcript PDF.
          </p>
          <div className="flex items-start gap-4">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700">
              {preview ? (
                <img
                  src={preview}
                  alt="New badge preview"
                  className="h-full w-full object-contain"
                />
              ) : data.hasBadge ? (
                <img
                  src={`${apiUrl('/school/badge')}?v=${badgeVersion}`}
                  alt="Current badge"
                  className="h-full w-full object-contain"
                />
              ) : (
                <Icon name="home" size={30} className="text-slate-300 dark:text-slate-600" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <input
                id="badge-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setPreview((p) => {
                    if (p) URL.revokeObjectURL(p);
                    return f ? URL.createObjectURL(f) : null;
                  });
                }}
              />
              <label htmlFor="badge-upload" className="btn-secondary w-full cursor-pointer">
                Choose image…
              </label>
              <button
                className="btn-primary w-full"
                onClick={() => void uploadBadge()}
                disabled={busy || !file}
              >
                {busy ? 'Uploading…' : 'Upload Badge'}
              </button>
              {data.hasBadge && (
                <button
                  className="btn-secondary w-full text-rose-500"
                  onClick={() => setConfirmRemoveBadge(true)}
                  disabled={busy}
                >
                  Remove Badge
                </button>
              )}
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            PNG with transparency recommended. Images are auto-resized to fit 512×512 and stored in
            the database.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemoveBadge}
        danger
        busy={busy}
        title="Remove school badge"
        message="Remove the school badge/crest? It will no longer appear on the login page, sidebar, or report cards until a new one is uploaded."
        confirmText="Remove Badge"
        onConfirm={() => void removeBadge()}
        onCancel={() => setConfirmRemoveBadge(false)}
      />
    </>
  );
}

/* ------------------------------- Main page -------------------------------- */
export default function Administration() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('School');

  const downloadBackup = async () => {
    try {
      const res = await api.get('/admin/backup', { responseType: 'blob' });
      downloadBlob(res.data as Blob, `sgs_backup_${new Date().toISOString().slice(0, 10)}.json`);
      toast('success', 'Backup downloaded');
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Administration"
        subtitle="System configuration: users, academics, grading scales and data."
        actions={
          <button className="btn-secondary" onClick={() => void downloadBackup()}>
            <Icon name="download" size={15} /> Download Backup (JSON)
          </button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === t
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'School' && <SchoolTab />}
      {tab === 'Users' && <UsersTab />}
      {tab === 'Subjects' && <SubjectsTab />}
      {tab === 'Classes' && <ClassesTab />}
      {tab === 'Grade Scales' && <GradeScalesTab />}
      {tab === 'Academic Years' && <AcademicYearsTab />}
    </div>
  );
}
