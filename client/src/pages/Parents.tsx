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

import type { Paged, ParentChildRow, ParentRow, StudentRow } from '../lib/types';

const parentSchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email required'),
  password: z
    .string()
    .min(8, 'Min 8 characters')
    .regex(/[A-Za-z]/, 'Needs a letter')
    .regex(/[0-9]/, 'Needs a number'),
  phone: z.string().optional(),
});
type ParentForm = z.infer<typeof parentSchema>;

export default function Parents() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [linking, setLinking] = useState<ParentRow | null>(null);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [unlinking, setUnlinking] = useState<{ parent: ParentRow; child: ParentChildRow } | null>(
    null,
  );
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<ParentRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [deleting, setDeleting] = useState<ParentRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const { data, loading, refetch } = useQuery(
    () =>
      api
        .get<Paged<ParentRow>>(
          `/parents?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`,
        )
        .then((r) => r.data),
    [search],
  );

  // Unlinked students offered in the "link a child" picker.
  const { data: unlinked } = useQuery(
    () =>
      linking
        ? api
            .get<Paged<StudentRow>>('/students?parentStatus=unlinked&pageSize=100')
            .then((r) => r.data)
        : Promise.resolve(undefined),
    [linking],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ParentForm>({
    resolver: zodResolver(parentSchema),
  });
  useEffect(() => {
    if (modalOpen) reset();
  }, [modalOpen, reset]);

  const onSubmit = async (values: ParentForm) => {
    try {
      const { data: created } = await api.post<{ user: { email: string } }>('/parents', values);
      toast('success', `Parent account created — ${created.user.email}`);
      setModalOpen(false);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const linkChild = async () => {
    if (!linking || !linkStudentId) return;
    setLinkBusy(true);
    try {
      await api.post(`/parents/${linking.id}/children`, { studentId: linkStudentId });
      toast('success', 'Child linked');
      setLinking(null);
      setLinkStudentId('');
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setLinkBusy(false);
    }
  };

  const unlinkChild = async () => {
    if (!unlinking) return;
    setUnlinkBusy(true);
    try {
      await api.delete(`/parents/${unlinking.parent.id}/children/${unlinking.child.id}`);
      toast('success', `${unlinking.child.user.name} unlinked`);
      setUnlinking(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setUnlinkBusy(false);
    }
  };

  const doReset = async () => {
    if (!resetTarget) return;
    setResetBusy(true);
    try {
      await api.post(`/parents/${resetTarget.id}/reset-password`, { password: newPassword });
      toast('success', `Password reset for ${resetTarget.user.name}`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setResetBusy(false);
    }
  };

  const doDelete = async (password: string) => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/parents/${deleting.id}`, { data: { password } });
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
        title="Parents"
        subtitle="Manage parent accounts and the students linked to each one."
        actions={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <Icon name="user-plus" size={15} /> Add Parent
          </button>
        }
      />

      <div className="card mb-4 p-4">
        <input
          className="input max-w-xs"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card">
          <TableSkeleton />
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          title="No parents found"
          icon="users"
          hint="Create a parent account, then link their children — the parent can then sign in and follow their children's academic progress."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.data.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-sm font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                    {initials(p.user.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900 dark:text-white">
                      {p.user.name}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      {p.user.email}
                      {p.user.phone ? ` · ${p.user.phone}` : ''}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {p.children.length === 0
                        ? 'No children linked'
                        : `${p.children.length} linked child${p.children.length === 1 ? '' : 'ren'}`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => {
                      setLinking(p);
                      setLinkStudentId('');
                    }}
                  >
                    Link child
                  </button>
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs"
                    title="Reset password"
                    onClick={() => {
                      setResetTarget(p);
                      setNewPassword('');
                    }}
                  >
                    Reset password
                  </button>
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs text-rose-500"
                    title="Delete parent"
                    onClick={() => setDeleting(p)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {p.children.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.children.map((c) => (
                    <Badge
                      key={c.id}
                      className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    >
                      <Link to={`/students/${c.id}`} className="hover:underline">
                        {c.user.name} ·{' '}
                        {c.classRoom
                          ? `${c.classRoom.name} ${c.classRoom.stream}`
                          : c.admissionNumber}
                      </Link>
                      <button
                        className="ml-1.5 opacity-60 hover:opacity-100"
                        title="Unlink this child"
                        onClick={() => setUnlinking({ parent: p, child: c })}
                      >
                        <Icon name="x" size={11} />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Parent">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Full name</label>
              <input
                className="input"
                {...register('name')}
                placeholder="e.g. Jean Bosco Nkurunziza"
              />
              {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                {...register('email')}
                placeholder="parent@school.rw"
              />
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
            <div className="sm:col-span-2">
              <label className="label">Phone (optional)</label>
              <input className="input" {...register('phone')} placeholder="+250 7xx xxx xxx" />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            The parent signs in with this email and password. Once created, link their children from
            this page — or use the “Parent email” field when registering students.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Parent'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!linking}
        onClose={() => setLinking(null)}
        title={`Link a child — ${linking?.user.name ?? ''}`}
      >
        <div className="space-y-4">
          <div>
            <label className="label">Child (unlinked students)</label>
            {!unlinked ? (
              <div className="input bg-slate-50 text-slate-400 dark:bg-slate-800/60">
                Loading students…
              </div>
            ) : unlinked.total === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-400 dark:border-slate-700">
                All students are already linked to a parent. Edit a student in Admin → Students to
                change which parent they belong to.
              </div>
            ) : (
              <select
                className="input"
                value={linkStudentId}
                onChange={(e) => setLinkStudentId(e.target.value)}
              >
                <option value="">Select a student…</option>
                {unlinked.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.user.name} — {s.admissionNumber}
                    {s.classRoom ? ` · ${s.classRoom.name} ${s.classRoom.stream}` : ''}
                  </option>
                ))}
              </select>
            )}
            {unlinked && unlinked.total > 100 && (
              <p className="mt-1.5 text-xs text-slate-400">
                {unlinked.total - 100} more unlinked students — refine with search on the Students
                page if needed.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setLinking(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => void linkChild()}
              disabled={!linkStudentId || linkBusy}
            >
              {linkBusy ? 'Linking…' : 'Link Child'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`Reset password — ${resetTarget?.user.name ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Set a new password for{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {resetTarget?.user.email}
            </span>
            . All of the parent&apos;s existing sessions will be ended.
          </p>
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
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!newPassword || resetBusy}
              onClick={() => void doReset()}
            >
              {resetBusy ? 'Resetting…' : 'Reset Password'}
            </button>
          </div>
        </div>
      </Modal>

      <PasswordConfirmDialog
        open={!!deleting}
        busy={deleteBusy}
        title="Delete parent — security check"
        message={`You are about to permanently delete ${deleting?.user.name} (${deleting?.user.email}). Their login account will be removed and ${deleting?.children.length ?? 0} linked student${deleting?.children.length === 1 ? '' : 's'} will be unlinked (the students themselves are kept). This cannot be undone.`}
        confirmText="Delete permanently"
        onConfirm={(pw) => void doDelete(pw)}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={!!unlinking}
        danger
        busy={unlinkBusy}
        title="Unlink child"
        message={
          unlinking
            ? `Unlink ${unlinking.child.user.name} from ${unlinking.parent.user.name}? The student will keep their record but will no longer appear in this parent's Academic Progress.`
            : ''
        }
        confirmText="Unlink"
        onConfirm={() => void unlinkChild()}
        onCancel={() => setUnlinking(null)}
      />
    </div>
  );
}
