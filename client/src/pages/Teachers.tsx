import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { PasswordConfirmDialog } from '../components/PasswordConfirmDialog';
import { useToast } from '../components/toast';
import { Badge, EmptyState, Modal, PageHeader, TableSkeleton } from '../components/ui';
import { api, apiError } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { initials } from '../lib/utils';

import type { ClassRoom, Paged, Subject, TeacherRow } from '../lib/types';

const teacherSchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email required'),
  password: z
    .string()
    .min(8, 'Min 8 characters')
    .regex(/[A-Za-z]/)
    .regex(/[0-9]/),
  qualification: z.string().optional(),
  phone: z.string().optional(),
});
type TeacherForm = z.infer<typeof teacherSchema>;

export default function Teachers() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [assigning, setAssigning] = useState<TeacherRow | null>(null);
  const [assignSubject, setAssignSubject] = useState('');
  const [assignClass, setAssignClass] = useState('');
  const [deleting, setDeleting] = useState<TeacherRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [removingAssignment, setRemovingAssignment] = useState<{
    teacherId: string;
    assignmentId: string;
    label: string;
  } | null>(null);
  const [removeAssignBusy, setRemoveAssignBusy] = useState(false);

  const { data, loading, refetch } = useQuery(
    () =>
      api
        .get<Paged<TeacherRow>>(
          `/teachers?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`,
        )
        .then((r) => r.data),
    [search],
  );
  const { data: subjects } = useQuery(
    () => api.get<{ data: Subject[] }>('/subjects').then((r) => r.data),
    [],
  );
  const { data: classes } = useQuery(
    () => api.get<{ data: ClassRoom[] }>('/classes').then((r) => r.data),
    [],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TeacherForm>({
    resolver: zodResolver(teacherSchema),
  });
  useEffect(() => {
    if (modalOpen) reset();
  }, [modalOpen, reset]);

  const onSubmit = async (values: TeacherForm) => {
    try {
      const { data: created } = await api.post<{ staffNumber: string }>('/teachers', values);
      toast('success', `Teacher created — staff no. ${created.staffNumber}`);
      setModalOpen(false);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const addAssignment = async () => {
    if (!assigning || !assignSubject || !assignClass) return;
    try {
      await api.post(`/teachers/${assigning.id}/assignments`, {
        subjectId: assignSubject,
        classId: assignClass,
      });
      toast('success', 'Assignment added');
      setAssignSubject('');
      setAssignClass('');
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const removeAssignment = async () => {
    if (!removingAssignment) return;
    setRemoveAssignBusy(true);
    try {
      await api.delete(
        `/teachers/${removingAssignment.teacherId}/assignments/${removingAssignment.assignmentId}`,
      );
      toast('success', 'Assignment removed');
      setRemovingAssignment(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setRemoveAssignBusy(false);
    }
  };

  const doDelete = async (password: string) => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/teachers/${deleting.id}`, { data: { password } });
      toast('success', `${deleting.user.name} removed`);
      setDeleting(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Teachers"
        subtitle="Manage teacher accounts and their subject/class assignments."
        actions={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <Icon name="user-plus" size={15} /> Add Teacher
          </button>
        }
      />

      <div className="card mb-4 p-4">
        <input
          className="input max-w-xs"
          placeholder="Search name or staff number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card">
          <TableSkeleton />
        </div>
      ) : !data?.data.length ? (
        <EmptyState title="No teachers found" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.data.map((t) => (
            <div key={t.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/teachers/${t.id}`} className="group flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sm font-bold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                    {initials(t.user.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-indigo-700 group-hover:underline dark:text-indigo-300">
                      {t.user.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {t.user.email} · {t.staffNumber}
                    </div>
                    {t.qualification && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t.qualification}
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 gap-2">
                  <Link to={`/teachers/${t.id}`} className="btn-ghost px-3 py-1.5 text-xs">
                    View
                  </Link>
                  <button
                    className="btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => setAssigning(t)}
                  >
                    Assign
                  </button>
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs text-rose-500"
                    title="Delete teacher"
                    onClick={() => setDeleting(t)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {t.assignments.length === 0 && (
                  <span className="text-xs text-slate-400">No assignments yet</span>
                )}
                {t.assignments.map((a) => (
                  <Badge
                    key={a.id ?? `${a.subject.id}-${a.classRoom.id}`}
                    className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                  >
                    {a.subject.code} · {a.classRoom.name} {a.classRoom.stream}
                    {a.id && (
                      <button
                        className="ml-1.5 opacity-60 hover:opacity-100"
                        title="Remove"
                        onClick={() =>
                          setRemovingAssignment({
                            teacherId: t.id,
                            assignmentId: a.id!,
                            label: `${a.subject.code} · ${a.classRoom.name} ${a.classRoom.stream}`,
                          })
                        }
                      >
                        <Icon name="x" size={11} />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Teacher">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Full name</label>
              <input className="input" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" {...register('email')} />
              {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="text"
                {...register('password')}
                placeholder="Min 8, letter + number"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>
              )}
            </div>
            <div>
              <label className="label">Staff number</label>
              <div className="input bg-slate-50 text-slate-400 dark:bg-slate-800/60">
                Assigned automatically
              </div>
            </div>
            <div>
              <label className="label">Qualification (optional)</label>
              <input className="input" {...register('qualification')} placeholder="B.Ed, M.Ed…" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Teacher'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        title={`Assign — ${assigning?.user.name ?? ''}`}
      >
        <div className="space-y-4">
          <div>
            <label className="label">Subject</label>
            <select
              className="input"
              value={assignSubject}
              onChange={(e) => setAssignSubject(e.target.value)}
            >
              <option value="">Select subject…</option>
              {subjects?.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Class</label>
            <select
              className="input"
              value={assignClass}
              onChange={(e) => setAssignClass(e.target.value)}
            >
              <option value="">Select class…</option>
              {classes?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.stream}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setAssigning(null)}>
              Done
            </button>
            <button
              className="btn-primary"
              onClick={() => void addAssignment()}
              disabled={!assignSubject || !assignClass}
            >
              Add Assignment
            </button>
          </div>
        </div>
      </Modal>

      <PasswordConfirmDialog
        open={!!deleting}
        busy={deleteBusy}
        title="Delete teacher — security check"
        message={`You are about to permanently delete ${deleting?.user.name} (${deleting?.staffNumber}). Their account, assignments and linked records will be removed. This cannot be undone.`}
        confirmText="Delete permanently"
        onConfirm={(pw) => void doDelete(pw)}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={!!removingAssignment}
        danger
        busy={removeAssignBusy}
        title="Remove assignment"
        message={
          removingAssignment
            ? `Remove assignment “${removingAssignment.label}”? The teacher will no longer be able to enter grades for this subject/class.`
            : ''
        }
        confirmText="Remove"
        onConfirm={() => void removeAssignment()}
        onCancel={() => setRemovingAssignment(null)}
      />
    </div>
  );
}
