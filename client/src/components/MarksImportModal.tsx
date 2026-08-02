import { useEffect, useRef, useState } from 'react';

import { api, apiError } from '../lib/api';
import { cx, downloadBlob } from '../lib/utils';

import { Icon } from './Icon';
import { useToast } from './toast';
import { Modal } from './ui';

import type { MarksImportResult } from '../lib/types';

export interface MarksImportContext {
  classId: string;
  subjectId: string;
  semesterId: string;
  classLabel: string;
  subjectLabel: string;
  semesterLabel: string;
}

/** Bulk marks import for the Grade Entry grid (teacher speed-up). */
export function MarksImportModal({
  open,
  onClose,
  ctx,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  ctx: MarksImportContext | null;
  onImported: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MarksImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
      setBusy(false);
    }
  }, [open]);

  const downloadTemplate = async () => {
    if (!ctx) return;
    try {
      const res = await api.get(
        `/grades/import/template?classId=${ctx.classId}&subjectId=${ctx.subjectId}&semesterId=${ctx.semesterId}`,
        { responseType: 'blob' },
      );
      downloadBlob(
        res.data as Blob,
        `marks_${ctx.classLabel}_${ctx.subjectLabel}.xlsx`.replace(/\s+/g, '_'),
      );
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  const runImport = async () => {
    if (!file || !ctx) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<MarksImportResult>(
        `/grades/import?classId=${ctx.classId}&subjectId=${ctx.subjectId}&semesterId=${ctx.semesterId}`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setResult(data);
      if (data.applied > 0) {
        toast(
          'success',
          `Applied ${data.applied} mark${data.applied === 1 ? '' : 's'} — review the grid, then submit`,
        );
        onImported();
      }
      if (data.failed > 0) {
        toast(
          'error',
          `${data.failed} cell${data.failed === 1 ? '' : 's'} rejected — see actionable reasons below`,
        );
      }
      if (data.applied === 0 && data.failed === 0) {
        toast('info', 'No new marks found — blank cells keep existing values');
      }
    } catch (err) {
      const msg = apiError(err);
      // Surface common spreadsheet mistakes more clearly
      if (/locked|approved|published/i.test(msg)) {
        toast('error', `${msg} Ask an administrator to unlock the grade sheet first.`);
      } else if (/template|header|column/i.test(msg)) {
        toast('error', `${msg} Re-download the pre-filled template so column names match exactly.`);
      } else {
        toast('error', msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import marks from Excel" wide>
      {!result ? (
        <div className="space-y-4">
          {ctx && (
            <div className="rounded-xl bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Icon name="book-open" size={15} /> {ctx.classLabel} — {ctx.subjectLabel} ·{' '}
              {ctx.semesterLabel}
            </div>
          )}
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
            <li>
              Download the template — it is <strong>pre-filled with the class roster</strong>{' '}
              (admission no + name) and any marks already entered.
            </li>
            <li>
              Type marks into the component columns.{' '}
              <strong>Blank cells keep what is already in the system.</strong>
            </li>
            <li>Upload the file here — valid marks land straight in the grid as a draft.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button className="btn-secondary" onClick={() => void downloadTemplate()}>
              <Icon name="download" size={15} /> Download pre-filled template
            </button>
            <button className="btn-secondary" onClick={() => inputRef.current?.click()}>
              <Icon name="folder" size={15} /> Choose file…
            </button>
            {file && (
              <span className="truncate text-sm text-slate-500 dark:text-slate-400">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Formats: .xlsx or .csv · locked grids (approved/published) are protected — ask an admin
            to unlock first.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!file || busy}
              onClick={() => void runImport()}
            >
              {busy ? (
                'Importing…'
              ) : (
                <>
                  <Icon name="upload" size={15} /> Import into grid
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div
            className={cx(
              'flex items-center gap-3 rounded-xl p-3 text-sm',
              result.failed === 0
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
            )}
          >
            {result.failed === 0 ? (
              <Icon name="check-circle" size={22} />
            ) : (
              <Icon name="warning" size={22} />
            )}
            <span>
              <strong>{result.applied}</strong> marks applied · <strong>{result.skipped}</strong>{' '}
              blank cells kept · <strong>{result.failed}</strong> rejected
            </span>
          </div>
          {result.errors.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-rose-600 dark:text-rose-400">
                <Icon name="warning" size={15} /> Rejected cells — how to fix
              </h3>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-rose-200 dark:border-rose-500/30">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-rose-50 dark:bg-rose-950/40">
                    <tr>
                      <th className="th py-2">Row</th>
                      <th className="th py-2">Student</th>
                      <th className="th py-2">Component</th>
                      <th className="th py-2">What to fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} className="border-t border-rose-100 dark:border-rose-900/40">
                        <td className="td py-1.5 font-mono text-xs font-semibold">{e.row}</td>
                        <td className="td py-1.5 font-mono text-xs">{e.admissionNumber || '—'}</td>
                        <td className="td py-1.5 text-xs">{e.component || '—'}</td>
                        <td className="td py-1.5 text-xs text-rose-600 dark:text-rose-400">
                          {e.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Tip: scores must be numbers within each component&apos;s max. Blank cells keep
                existing marks. Use the pre-filled template so admission numbers match the roster.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setResult(null)}>
              <Icon name="corner-up-left" size={14} /> Import another file
            </button>
            <button className="btn-primary" onClick={onClose}>
              Back to grid
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
