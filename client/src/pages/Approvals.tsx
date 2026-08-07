import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { useToast } from '../components/toast';
import { Badge, EmptyState, Modal, PageHeader, TableSkeleton } from '../components/ui';
import { api, apiError } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { fmtDate, timeAgo } from '../lib/utils';

import type { PendingApproval } from '../lib/types';

export default function Approvals() {
  const toast = useToast();
  const { data, loading, error, refetch } = useQuery(
    () =>
      api.get<{ data: PendingApproval[] }>('/grades/pending-approvals').then((r) => r.data.data),
    [],
  );
  const [approving, setApproving] = useState<PendingApproval | null>(null);
  const [returning, setReturning] = useState<PendingApproval | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = data ?? [];
  const totalMarks = rows.reduce((a, r) => a + r.marks, 0);

  const approve = async () => {
    if (!approving) return;
    setBusy(true);
    try {
      const { classId, subjectId, semesterId } = approving;
      const { data: res } = await api.post('/grades/approve', { classId, subjectId, semesterId });
      toast('success', `Approved — computed results for ${res.resultsComputed} students`);
      setApproving(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async () => {
    if (!returning) return;
    setBusy(true);
    try {
      const { classId, subjectId, semesterId } = returning;
      await api.post('/grades/unlock', {
        classId,
        subjectId,
        semesterId,
        to: 'DRAFT',
        note: note.trim() || undefined,
      });
      toast('success', 'Returned to the teacher for correction');
      setReturning(null);
      setNote('');
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Submitted marks wait here for review. Approving computes totals, grades, GPA and positions."
        actions={
          rows.length > 0 ? (
            <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400">
              {rows.length} grid{rows.length === 1 ? '' : 's'} · {totalMarks} marks waiting
            </Badge>
          ) : undefined
        }
      />

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} cols={7} />
        ) : error ? (
          <EmptyState title="Failed to load" hint={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="smile"
            title="Nothing awaiting approval"
            hint="When teachers submit marks for review, they will appear here for one-click approval. You'll also get a notification that links straight here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="th">Submitted</th>
                  <th className="th">Class</th>
                  <th className="th">Subject</th>
                  <th className="th">Term</th>
                  <th className="th">Teacher(s)</th>
                  <th className="th text-center">Marks</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.classId}-${r.subjectId}-${r.semesterId}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                  >
                    <td className="td whitespace-nowrap">
                      <div className="font-medium">{timeAgo(r.submittedAt)}</div>
                      <div className="text-xs text-slate-400">{fmtDate(r.submittedAt)}</div>
                    </td>
                    <td className="td font-medium">
                      {r.className} {r.stream}
                    </td>
                    <td className="td">
                      <div className="font-medium">{r.subjectName}</div>
                      <div className="text-xs text-slate-400">{r.subjectCode}</div>
                    </td>
                    <td className="td whitespace-nowrap">
                      {r.semesterName}
                      <span className="ml-1 text-xs text-slate-400">{r.academicYearName}</span>
                    </td>
                    <td className="td">
                      {r.teachers.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        r.teachers.map((t) => (
                          <div key={t} className="text-sm">
                            {t}
                          </div>
                        ))
                      )}
                    </td>
                    <td className="td text-center">
                      <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {r.marks} · {r.students} students
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/grade-entry?classId=${r.classId}&subjectId=${r.subjectId}&semesterId=${r.semesterId}`}
                          className="btn-secondary px-3 py-1.5 text-xs"
                        >
                          <Icon name="eye" size={13} /> Review
                        </Link>
                        <button
                          className="btn-ghost px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400"
                          onClick={() => {
                            setReturning(r);
                            setNote('');
                          }}
                        >
                          <Icon name="corner-up-left" size={13} /> Return
                        </button>
                        <button
                          className="btn-primary px-3 py-1.5 text-xs"
                          onClick={() => setApproving(r)}
                        >
                          <Icon name="check-circle" size={13} /> Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!approving}
        busy={busy}
        title="Approve marks"
        message={`Approve ${approving?.marks} marks for ${approving?.className} ${approving?.stream} — ${approving?.subjectName} (${approving?.semesterName})? Totals, letter grades, grade points, GPA and class positions will be computed automatically.`}
        confirmText="Approve & Compute"
        onConfirm={() => void approve()}
        onCancel={() => setApproving(null)}
      />

      <Modal open={!!returning} onClose={() => setReturning(null)} title="Return for correction">
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          Send{' '}
          <strong>
            {returning?.className} {returning?.stream} — {returning?.subjectName}
          </strong>{' '}
          back to
          {returning?.teachers.length ? ` ${returning.teachers.join(', ')}` : ' the teacher'} as a
          draft. They will be notified and can edit and resubmit.
        </p>
        <label className="label">Note to the teacher (optional)</label>
        <textarea
          className="input min-h-24 resize-y"
          placeholder="e.g. Two students are missing the CAT mark — please complete and resubmit."
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setReturning(null)}>
            Cancel
          </button>
          <button className="btn-danger" onClick={() => void sendBack()} disabled={busy}>
            {busy ? (
              'Returning…'
            ) : (
              <>
                <Icon name="corner-up-left" size={14} /> Return to teacher
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
