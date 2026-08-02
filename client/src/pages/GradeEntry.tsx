import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { MarksImportModal } from '../components/MarksImportModal';
import { useToast } from '../components/toast';
import { Badge, EmptyState, Modal, PageHeader, Spinner, TableSkeleton } from '../components/ui';
import { api, apiError } from '../lib/api';
import { gradeDraftKey, getOfflineDraft, removeOfflineDraft, saveOfflineDraft } from '../lib/offlineDrafts';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/useQuery';
import { downloadBlob, statusBadgeClass } from '../lib/utils';

import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import type { AcademicYear, ClassRoom, GradeGrid, Subject, TeacherRow } from '../lib/types';

// cell value: string so the input can be temporarily empty / partial
type CellMap = Record<string, Record<string, string>>;

export default function GradeEntry() {
  const toast = useToast();
  const { hasRole, user } = useAuth();
  const [params] = useSearchParams();

  const [semesterId, setSemesterId] = useState(params.get('semesterId') ?? '');
  const [classId, setClassId] = useState(params.get('classId') ?? '');
  const [subjectId, setSubjectId] = useState(params.get('subjectId') ?? '');
  const [cells, setCells] = useState<CellMap>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | 'submit' | 'approve' | 'publish' | 'unlock'>(null);
  const [acting, setActing] = useState(false);
  // speed-entry toolkit state
  const [importOpen, setImportOpen] = useState(false);
  const [fillComp, setFillComp] = useState<{ id: string; name: string; maxScore: number } | null>(
    null,
  );
  const [fillValue, setFillValue] = useState('');
  const [fillEmptyOnly, setFillEmptyOnly] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'queued' | 'error'>(
    'idle',
  );
  const cellRefs = useRef<Record<string, Record<string, HTMLInputElement | null>>>({});
  const editVersionRef = useRef(0);
  const lastFailedVersionRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);

  // ── Reference data ----------------------------------------
  const { data: year } = useQuery(
    () => api.get<AcademicYear>('/academic-years/active').then((r) => r.data),
    [],
  );
  const { data: classes } = useQuery(
    () => api.get<{ data: ClassRoom[] }>('/classes').then((r) => r.data),
    [],
  );
  const { data: subjects } = useQuery(
    () => api.get<{ data: Subject[] }>('/subjects').then((r) => r.data),
    [],
  );
  const { data: myTeacher } = useQuery(
    () =>
      user?.role === 'TEACHER'
        ? api.get<TeacherRow>('/teachers/me').then((r) => r.data)
        : Promise.resolve(undefined),
    [user?.role],
  );

  useEffect(() => {
    if (year && !semesterId) {
      const current = year.semesters.find((s) => s.isCurrent) ?? year.semesters[0];
      if (current) setSemesterId(current.id);
    }
  }, [year, semesterId]);

  // For teachers, restrict dropdowns to assigned pairs
  const allowedClasses = useMemo(() => {
    if (hasRole('ADMIN') || !myTeacher) return classes?.data ?? [];
    const ids = new Set(myTeacher.assignments.map((a) => a.classRoom.id));
    return (classes?.data ?? []).filter((c) => ids.has(c.id));
  }, [classes, myTeacher, hasRole]);

  const allowedSubjects = useMemo(() => {
    if (hasRole('ADMIN') || !myTeacher) return subjects?.data ?? [];
    const ids = new Set(
      myTeacher.assignments
        .filter((a) => !classId || a.classRoom.id === classId)
        .map((a) => a.subject.id),
    );
    return (subjects?.data ?? []).filter((s) => ids.has(s.id));
  }, [subjects, myTeacher, classId, hasRole]);

  const ready = classId && subjectId && semesterId;

  // ── Grid data ----------------------------------------
  const {
    data: grid,
    loading,
    error,
    refetch,
  } = useQuery(
    () =>
      ready
        ? api
            .get<GradeGrid>(
              `/grades/grid?classId=${classId}&subjectId=${subjectId}&semesterId=${semesterId}`,
            )
            .then((r) => r.data)
        : Promise.resolve(undefined),
    [classId, subjectId, semesterId],
  );

  useEffect(() => {
    if (!grid) return;
    const next: CellMap = {};
    for (const s of grid.students) {
      next[s.id] = {};
      for (const c of grid.components) {
        const entry = grid.entries[s.id]?.[c.id];
        next[s.id][c.id] = entry ? String(entry.score) : '';
      }
    }
    const offline = getOfflineDraft(gradeDraftKey(classId, subjectId, semesterId));
    if (offline) {
      for (const entry of offline.payload.entries) {
        if (next[entry.studentId]) {
          for (const [componentId, score] of Object.entries(entry.scores)) {
            if (componentId in next[entry.studentId]) next[entry.studentId][componentId] = score === null ? '' : String(score);
          }
        }
      }
      setDirty(true);
      setSaveState('queued');
    } else {
      setDirty(false);
      setSaveState('idle');
    }
    setCells(next);
  }, [grid]);

  const setCell = (studentId: string, componentId: string, value: string) => {
    if (!/^\d*\.?\d*$/.test(value)) return;
    setCells((m) => ({ ...m, [studentId]: { ...m[studentId], [componentId]: value } }));
    editVersionRef.current += 1;
    setDirty(true);
  };

  // ── Speed toolkit: keyboard navigation, Excel paste, column fill ------------
  const focusCell = (row: number, col: number) => {
    if (!grid) return;
    const s = grid.students[row];
    const c = grid.components[col];
    if (!s || !c) return;
    const el = cellRefs.current[s.id]?.[c.id];
    el?.focus();
    el?.select();
  };

  const handleCellKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusCell(row + (e.shiftKey ? -1 : 1), col);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(row - 1, col);
    }
  };

  /** Paste a block of Excel cells (tabs = columns, newlines = rows) into the grid. */
  const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (!grid || !editable) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text || !/[\t\n]/.test(text)) return; // single value: let onChange handle it
    e.preventDefault();
    const matrix = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((r) => r.length > 0)
      .map((r) => r.split('\t'));
    setCells((prev) => {
      const next: CellMap = { ...prev };
      matrix.forEach((vals, dr) => {
        const s = grid.students[row + dr];
        if (!s) return;
        next[s.id] = { ...(next[s.id] ?? {}) };
        vals.forEach((rawVal, dc) => {
          const comp = grid.components[col + dc];
          if (!comp) return;
          const v = rawVal.trim();
          if (v === '' || !/^\d*\.?\d*$/.test(v)) return; // keep existing on blank/junk
          next[s.id][comp.id] = v;
        });
      });
      return next;
    });
    editVersionRef.current += 1;
    setDirty(true);
  };

  const applyFill = () => {
    if (!fillComp || !grid || fillValue === '') return;
    const v = Number(fillValue);
    if (!Number.isFinite(v) || v < 0 || v > fillComp.maxScore) {
      toast('error', `Value must be between 0 and ${fillComp.maxScore}`);
      return;
    }
    let count = 0;
    setCells((prev) => {
      const next: CellMap = { ...prev };
      for (const s of grid.students) {
        const current = next[s.id]?.[fillComp.id] ?? '';
        if (fillEmptyOnly && current !== '') continue;
        next[s.id] = { ...next[s.id], [fillComp.id]: fillValue };
        count += 1;
      }
      return next;
    });
    editVersionRef.current += 1;
    setDirty(true);
    toast(
      'success',
      `${fillComp.name} = ${fillValue} applied to ${count} student${count === 1 ? '' : 's'}`,
    );
    setFillComp(null);
  };

  // Live weighted preview per student
  const preview = (studentId: string): string => {
    if (!grid) return '';
    const totalWeight = grid.components.reduce((a, c) => a + c.weight, 0);
    if (totalWeight === 0) return '';
    const earned = grid.components.reduce((a, c) => {
      const raw = cells[studentId]?.[c.id];
      const score = raw === '' || raw === undefined ? 0 : Number(raw);
      return (
        a + (Number.isFinite(score) ? (c.weight * Math.min(score, c.maxScore)) / c.maxScore : 0)
      );
    }, 0);
    return ((earned / totalWeight) * 100).toFixed(1);
  };

  const save = async (silent = false): Promise<boolean> => {
    if (!grid || saveInFlightRef.current) return false;
    const savingVersion = editVersionRef.current;
    saveInFlightRef.current = true;
    setSaving(true);
    const payload = {
      classId,
      subjectId,
      semesterId,
      entries: grid.students.map((s) => ({
        studentId: s.id,
        scores: Object.fromEntries(
          grid.components.map((c) => {
            const v = cells[s.id]?.[c.id] ?? '';
            return [c.id, v === '' ? null : Number(v)];
          }),
        ),
      })),
    };
    // A draft is stored locally before any request, so closing the app or losing
    // signal cannot discard marks typed on a phone.
    const offlineKey = gradeDraftKey(classId, subjectId, semesterId);
    if (!navigator.onLine) {
      saveOfflineDraft({ key: offlineKey, savedAt: new Date().toISOString(), payload });
      setSaveState('queued');
      setDirty(true);
      if (!silent) toast('success', 'Draft saved on this device and will sync when online');
      setSaving(false);
      saveInFlightRef.current = false;
      return true;
    }
    try {
      await api.post('/grades/entry', payload);
      // Do not mark the grid clean if the teacher changed another cell while
      // this request was in flight; the effect below will queue one more save.
      lastFailedVersionRef.current = null;
      removeOfflineDraft(offlineKey);
      if (editVersionRef.current === savingVersion) setDirty(false);
      if (!silent) toast('success', 'Marks saved as draft');
      return true;
    } catch (err) {
      // Axios has no response for a connectivity failure. Queue only those;
      // validation/permission failures remain visible rather than being retried forever.
      if (!navigator.onLine || (err as { response?: unknown }).response === undefined) {
        saveOfflineDraft({ key: offlineKey, savedAt: new Date().toISOString(), payload });
        setSaveState('queued');
        if (!silent) toast('success', 'Draft saved on this device and will sync when online');
        return true;
      }
      lastFailedVersionRef.current = savingVersion;
      toast('error', apiError(err));
      return false;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const status = grid?.status ?? 'EMPTY';
  const editable = grid?.editable ?? false;

  // Auto-save drafts ~2s after the teacher stops typing.
  useEffect(() => {
    if (
      !dirty ||
      !editable ||
      !ready ||
      saving ||
      lastFailedVersionRef.current === editVersionRef.current
    )
      return;
    setSaveState('dirty');
    const t = setTimeout(() => {
      void (async () => {
        setSaveState('saving');
        const ok = await save(true);
        setSaveState(ok ? (navigator.onLine ? 'saved' : 'queued') : 'error');
      })();
    }, 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, dirty, editable, ready, saving]);

  // Retry the locally queued draft as soon as the browser regains a connection.
  useEffect(() => {
    const sync = () => {
      if (dirty && editable && ready) void save(true).then((ok) => setSaveState(ok ? 'saved' : 'queued'));
    };
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
    // save intentionally reads the current grid/cells from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, editable, ready, cells]);

  const manualSave = async () => {
    const ok = await save();
    setSaveState(ok ? (navigator.onLine ? 'saved' : 'queued') : 'error');
  };

  const downloadMarksTemplate = async () => {
    try {
      const res = await api.get(
        `/grades/import/template?classId=${classId}&subjectId=${subjectId}&semesterId=${semesterId}`,
        { responseType: 'blob' },
      );
      downloadBlob(res.data as Blob, 'marks_template.xlsx');
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const act = async () => {
    if (!confirm) return;
    setActing(true);
    try {
      if (confirm === 'submit') {
        if (dirty && !(await save())) return;
        const { data } = await api.post('/grades/submit', { classId, subjectId, semesterId });
        toast('success', `${data.submitted} marks submitted for approval`);
      } else if (confirm === 'approve') {
        const { data } = await api.post('/grades/approve', { classId, subjectId, semesterId });
        toast('success', `Approved — computed results for ${data.resultsComputed} students`);
      } else if (confirm === 'publish') {
        const { data } = await api.post('/grades/publish', { classId, subjectId, semesterId });
        toast('success', `Published. ${data.notified} students & parents notified.`);
      } else {
        const { data } = await api.post('/grades/unlock', {
          classId,
          subjectId,
          semesterId,
          to: 'SUBMITTED',
        });
        toast('success', `${data.unlocked} marks reopened for correction`);
      }
      setConfirm(null);
      void refetch();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setActing(false);
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.get(
        `/reports/gradesheet.csv?classId=${classId}&subjectId=${subjectId}&semesterId=${semesterId}`,
        { responseType: 'blob' },
      );
      downloadBlob(res.data as Blob, 'gradesheet.csv');
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Grade Entry"
        subtitle="Enter marks per assessment component — totals, grades and GPA are computed automatically."
        actions={
          <>
            {ready && (
              <button className="btn-secondary" onClick={() => void exportCsv()}>
                <Icon name="download" size={15} /> Export CSV
              </button>
            )}
          </>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <label className="label">Term</label>
          <select
            className="input"
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
          >
            <option value="">Select term…</option>
            {year?.semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Class</label>
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select class…</option>
            {allowedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.stream}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Subject</label>
          <select
            className="input"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Select subject…</option>
            {allowedSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!ready ? (
        <EmptyState
          title="Choose a term, class and subject"
          hint="Teachers only see the classes and subjects they are assigned to."
        />
      ) : loading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : error ? (
        <EmptyState title="Could not load the grid" hint={error} />
      ) : !grid ? null : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={statusBadgeClass(status)}>Status: {status}</Badge>
            {!editable && status !== 'EMPTY' && (
              <span className="text-xs text-slate-400">
                {status === 'APPROVED'
                  ? 'Marks approved — only an administrator can edit.'
                  : 'Marks published — locked.'}
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={() => void downloadMarksTemplate()}
                disabled={grid.students.length === 0}
                title="Download an Excel sheet pre-filled with this roster — fill it offline and import it back"
              >
                <Icon name="grid" size={15} /> Excel Template
              </button>
              <button
                className="btn-secondary"
                onClick={() => setImportOpen(true)}
                disabled={!editable || grid.students.length === 0}
                title="Import marks from an Excel/CSV file into this grid"
              >
                <Icon name="upload" size={15} /> Import Marks
              </button>
              <button
                className="btn-secondary"
                onClick={() => void manualSave()}
                disabled={!editable || saving || grid.students.length === 0}
              >
                {saving ? (
                  'Saving…'
                ) : (
                  <>
                    <Icon name="save" size={15} /> Save Draft
                  </>
                )}
              </button>
              {(status === 'DRAFT' || status === 'SUBMITTED') && !hasRole('ADMIN') && (
                <button
                  className="btn-primary"
                  onClick={() => setConfirm('submit')}
                  disabled={grid.students.length === 0}
                >
                  <Icon name="send" size={15} /> Submit for Approval
                </button>
              )}
              {hasRole('ADMIN') && status === 'SUBMITTED' && (
                <button className="btn-primary" onClick={() => setConfirm('approve')}>
                  <Icon name="check-circle" size={15} /> Approve &amp; Compute
                </button>
              )}
              {hasRole('ADMIN') && status === 'APPROVED' && (
                <button className="btn-primary" onClick={() => setConfirm('publish')}>
                  <Icon name="megaphone" size={15} /> Publish to Students &amp; Parents
                </button>
              )}
              {hasRole('ADMIN') && (status === 'APPROVED' || status === 'PUBLISHED') && (
                <button className="btn-secondary" onClick={() => setConfirm('unlock')}>
                  <Icon name="unlock" size={15} /> Unlock for Correction
                </button>
              )}
            </div>
          </div>

          {grid.components.length === 0 ? (
            <EmptyState
              title="No assessment components configured"
              hint="An administrator must configure this subject's components (weights summing to 100) under Administration › Subjects."
            />
          ) : grid.students.length === 0 ? (
            <EmptyState title="No students enrolled" hint="Assign students to this class first." />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="th sticky left-0 bg-white dark:bg-slate-900">Student</th>
                    {grid.components.map((c) => (
                      <th key={c.id} className="th text-center">
                        {c.name}
                        <div className="font-normal normal-case text-slate-400">
                          {c.weight}% · /{c.maxScore}
                        </div>
                        {editable && (
                          <button
                            className="mt-0.5 rounded px-1 text-[11px] font-medium normal-case text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                            title={`Give everyone the same ${c.name} mark`}
                            onClick={() => {
                              setFillComp(c);
                              setFillValue('');
                              setFillEmptyOnly(true);
                            }}
                          >
                            <Icon name="zap" size={11} /> fill
                          </button>
                        )}
                      </th>
                    ))}
                    <th className="th text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.students.map((s, si) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="td sticky left-0 bg-white dark:bg-slate-900">
                        <div className="font-medium">{s.name}</div>
                        <div className="font-mono text-xs text-slate-400">{s.admissionNumber}</div>
                      </td>
                      {grid.components.map((c, ci) => (
                        <td key={c.id} className="td p-1.5 text-center">
                          <input
                            ref={(el) => {
                              (cellRefs.current[s.id] ??= {})[c.id] = el;
                            }}
                            type="text"
                            inputMode="decimal"
                            className="input mx-auto w-20 px-2 py-1.5 text-center"
                            value={cells[s.id]?.[c.id] ?? ''}
                            disabled={!editable}
                            onChange={(e) => setCell(s.id, c.id, e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, si, ci)}
                            onPaste={(e) => handlePaste(e, si, ci)}
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="td text-center">
                        <span className="inline-flex min-w-14 justify-center rounded-lg bg-indigo-50 px-2 py-1 font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                          {preview(s.id)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {editable && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex flex-wrap items-center gap-x-1.5 text-slate-400">
                <strong>Enter</strong> next student · <strong>Shift+Enter</strong> previous · paste
                straight from Excel · <Icon name="zap" size={12} /> fill a column — it{' '}
                <strong>auto-saves</strong>
              </span>
              {saveState === 'dirty' && (
                <span className="text-amber-500">editing… auto-saving shortly</span>
              )}
              {saveState === 'saving' && (
                <span className="flex items-center gap-1 text-indigo-500">
                  <Spinner /> Auto-saving…
                </span>
              )}
              {saveState === 'saved' && (
                <span className="inline-flex items-center gap-1 text-emerald-500">
                  <Icon name="check-circle" size={13} /> All changes saved
                </span>
              )}
              {saveState === 'queued' && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <Icon name="warning" size={13} /> Saved on this device — syncs when you are online
                </span>
              )}
              {saveState === 'error' && (
                <span className="inline-flex items-center gap-1 text-rose-500">
                  <Icon name="warning" size={13} /> Auto-save failed — press Save Draft
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        busy={acting}
        danger={confirm === 'unlock'}
        title={
          {
            submit: 'Submit marks',
            approve: 'Approve marks',
            publish: 'Publish results',
            unlock: 'Reopen marks',
          }[confirm ?? 'submit']
        }
        message={
          {
            submit:
              'Submit all draft marks for administrative approval? You can still edit them before they are approved.',
            approve:
              'Approve these marks? The system will automatically compute totals, letter grades, grade points, GPA and class positions.',
            publish:
              'Publish results to students and parents? They will receive a notification immediately.',
            unlock:
              'Reopen these marks for correction? Published students will lose access until re-published.',
          }[confirm ?? 'submit']
        }
        confirmText={
          { submit: 'Submit', approve: 'Approve & Compute', publish: 'Publish', unlock: 'Unlock' }[
            confirm ?? 'submit'
          ]
        }
        onConfirm={() => void act()}
        onCancel={() => setConfirm(null)}
      />

      {/* Fill a whole column with one value */}
      <Modal
        open={!!fillComp}
        onClose={() => setFillComp(null)}
        title={`Fill column: "${fillComp?.name ?? ''}"`}
      >
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          Set <strong>{fillComp?.name}</strong> for every student in one go (max{' '}
          {fillComp?.maxScore}).
        </p>
        <label className="label">Score for everyone</label>
        <input
          type="text"
          inputMode="decimal"
          className="input"
          autoFocus
          value={fillValue}
          placeholder={`0 – ${fillComp?.maxScore ?? ''}`}
          onChange={(e) => {
            if (/^\d*\.?\d*$/.test(e.target.value)) setFillValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyFill();
          }}
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={fillEmptyOnly}
            onChange={(e) => setFillEmptyOnly(e.target.checked)}
          />
          Only fill empty cells (keep marks already entered)
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setFillComp(null)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={fillValue === ''} onClick={applyFill}>
            Apply to column
          </button>
        </div>
      </Modal>

      <MarksImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void refetch()}
        ctx={
          ready
            ? {
                classId,
                subjectId,
                semesterId,
                classLabel: (() => {
                  const c = (classes?.data ?? []).find((x) => x.id === classId);
                  return c ? `${c.name} ${c.stream}` : '';
                })(),
                subjectLabel: subjects?.data.find((x) => x.id === subjectId)?.name ?? '',
                semesterLabel: year?.semesters.find((x) => x.id === semesterId)?.name ?? '',
              }
            : null
        }
      />
    </div>
  );
}
