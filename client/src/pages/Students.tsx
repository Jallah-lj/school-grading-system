import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/useQuery';
import { useToast } from '../components/toast';
import { PasswordConfirmDialog } from '../components/PasswordConfirmDialog';
import { Icon } from '../components/Icon';
import { Badge, EmptyState, Modal, PageHeader, TableSkeleton } from '../components/ui';
import { cx, downloadBlob, fmtDate, initials } from '../lib/utils';
import type { ClassRoom, ImportPreviewResult, ImportResult, Paged, StudentRow } from '../lib/types';

const studentSchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Min 8 characters').regex(/[A-Za-z]/, 'Needs a letter').regex(/[0-9]/, 'Needs a number').optional().or(z.literal('')),
  dateOfBirth: z.string().min(1, 'Date of birth required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  classId: z.string().optional(),
  parentEmail: z.string().email('Valid email required').optional().or(z.literal('')),
});
type StudentForm = z.infer<typeof studentSchema>;

function StudentModal({ open, onClose, onSaved, editing, classes }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  editing: StudentRow | null; classes: ClassRoom[];
}) {
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
  });

  useEffect(() => {
    if (open) {
      reset(editing ? {
        name: editing.user.name,
        email: editing.user.email,
        dateOfBirth: editing.dateOfBirth.slice(0, 10),
        gender: editing.gender as StudentForm['gender'],
        classId: editing.classRoom?.id ?? '',
        parentEmail: editing.parent?.user.email ?? '',
        password: '',
      } : { gender: 'MALE', classId: '', password: '', parentEmail: '' });
    }
  }, [open, editing, reset]);

  const onSubmit = async (values: StudentForm) => {
    try {
      const payload = {
        ...values,
        classId: values.classId || null,
        parentEmail: values.parentEmail || null,
      };
      if (editing) {
        const { password, ...rest } = payload;
        await api.put(`/students/${editing.id}`, rest);
        toast('success', 'Student updated');
      } else {
        const { data: created } = await api.post<{ admissionNumber: string }>('/students', payload);
        toast('success', `Student registered — admission no. ${created.admissionNumber}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast('error', apiError(err));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Student' : 'Register Student'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Full name</label>
            <input className="input" {...register('name')} placeholder="e.g. Aline Ingabire" />
            {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" {...register('email')} placeholder="student@school.rw" />
            {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email.message}</p>}
          </div>
          {!editing && (
            <div>
              <label className="label">Password</label>
              <input className="input" type="text" {...register('password')} placeholder="Min 8 chars, letter + number" />
              {errors.password && <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>}
            </div>
          )}
          <div>
            <label className="label">Admission number</label>
            {editing
              ? <input className="input bg-slate-50 font-mono dark:bg-slate-800/60" value={editing.admissionNumber} disabled readOnly />
              : <div className="input bg-slate-50 text-slate-400 dark:bg-slate-800/60">Assigned automatically</div>}
            <p className="mt-1 text-xs text-slate-400">System-generated — unique and conflict-free.</p>
          </div>
          <div>
            <label className="label">Date of birth</label>
            <input className="input" type="date" {...register('dateOfBirth')} />
            {errors.dateOfBirth && <p className="mt-1 text-xs text-rose-500">{errors.dateOfBirth.message}</p>}
          </div>
          <div>
            <label className="label">Gender</label>
            <select className="input" {...register('gender')}>
              <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Class</label>
            <select className="input" {...register('classId')}>
              <option value="">— Unassigned —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Parent email (optional — links an existing parent account)</label>
            <input className="input" type="email" {...register('parentEmail')} placeholder="parent@school.rw" />
            {errors.parentEmail && <p className="mt-1 text-xs text-rose-500">{errors.parentEmail.message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save Student'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ImportStudentsModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null); setResult(null); setPreview(null); setBusy(false); setStep('upload');
    }
  }, [open]);

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/students/import/template', { responseType: 'blob' });
      downloadBlob(res.data as Blob, 'students_import_template.xlsx');
    } catch (err) { toast('error', apiError(err)); }
  };

  const runPreview = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<ImportPreviewResult>('/students/import/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data);
      setStep('preview');
      if (data.problems > 0 && data.ready === 0) {
        toast('error', `All ${data.problems} rows have problems — fix the file before importing`);
      } else if (data.problems > 0) {
        toast('info', `${data.ready} ready · ${data.problems} need fixing (they will be skipped)`);
      } else {
        toast('success', `${data.ready} student${data.ready === 1 ? '' : 's'} ready to import`);
      }
    } catch (err) { toast('error', apiError(err)); } finally { setBusy(false); }
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<ImportResult>('/students/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      setStep('done');
      if (data.created > 0) {
        toast('success', `Imported ${data.created} student${data.created === 1 ? '' : 's'} from ${data.file ?? 'file'}`);
        onDone();
      }
      if (data.failed > 0) toast('error', `${data.failed} row${data.failed === 1 ? '' : 's'} skipped — review below`);
      if (data.created === 0 && data.failed === 0) toast('info', 'Nothing imported');
    } catch (err) { toast('error', apiError(err)); } finally { setBusy(false); }
  };

  const resetToUpload = () => {
    setStep('upload'); setPreview(null); setResult(null); setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const credCsv = (rows: ImportResult['credentials']) =>
    ['name,email,password', ...rows.map((c) => `${JSON.stringify(c.name)},${c.email},${JSON.stringify(c.password)}`)].join('\n');

  return (
    <Modal open={open} onClose={onClose} title="Bulk import students from Excel" wide>
      {/* Step indicator */}
      <div className="mb-5 flex items-center gap-2 text-xs font-medium">
        {[
          { id: 'upload', label: '1. Upload' },
          { id: 'preview', label: '2. Preview' },
          { id: 'done', label: '3. Results' },
        ].map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-6 bg-slate-200 dark:bg-slate-700" />}
            <span className={cx(
              'rounded-full px-2.5 py-1',
              step === s.id ? 'bg-indigo-600 text-white'
                : (step === 'preview' && s.id === 'upload') || (step === 'done' && s.id !== 'done')
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-800',
            )}>{s.label}</span>
          </div>
        ))}
      </div>

      {step === 'upload' && (
        <div className="space-y-4">
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
            <li>Download the template — it lists required columns and exact class names on the <em>Classes</em> sheet.</li>
            <li>Fill one student per row. Admission numbers are assigned automatically.</li>
            <li>Leave <code className="rounded bg-slate-100 px-1 font-mono text-xs dark:bg-slate-800">password</code> blank to auto-generate — you&apos;ll get credentials after import.</li>
            <li>Upload the file and <strong>preview</strong> first. Fix any problems, then confirm the import.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button className="btn-secondary" onClick={() => void downloadTemplate()}><Icon name="download" size={15} /> Download template (.xlsx)</button>
            <button className="btn-secondary" onClick={() => inputRef.current?.click()}><Icon name="folder" size={15} /> Choose file…</button>
            {file && <span className="truncate text-sm text-slate-500 dark:text-slate-400">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
          </div>
          <p className="text-xs text-slate-400">Formats: .xlsx or .csv · max 5 MB · 500 rows per batch. Nothing is saved until you confirm after the preview.</p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={!file || busy} onClick={() => void runPreview()}>
              {busy ? 'Checking file…' : <><Icon name="eye" size={15} /> Preview import</>}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800/50">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{preview.total}</div>
              <div className="text-xs text-slate-400">Rows checked</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{preview.ready}</div>
              <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Ready to import</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center dark:border-rose-500/30 dark:bg-rose-500/10">
              <div className="text-2xl font-bold text-rose-700 dark:text-rose-300">{preview.problems}</div>
              <div className="text-xs text-rose-600/80 dark:text-rose-400/80">Problems (will skip)</div>
            </div>
          </div>

          {preview.errors.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-rose-600 dark:text-rose-400">
                <Icon name="warning" size={15} /> Problems to fix
              </h3>
              <p className="mb-2 text-xs text-slate-400">
                These rows will be skipped. Fix them in your spreadsheet and re-upload, or continue to import only the ready rows.
              </p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-rose-200 dark:border-rose-500/30">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-rose-50 dark:bg-rose-950/40">
                    <tr>
                      <th className="th py-2">Row</th>
                      <th className="th py-2">Name / Email</th>
                      <th className="th py-2">What to fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((e) => (
                      <tr key={`${e.row}-${e.email}`} className="border-t border-rose-100 dark:border-rose-900/40">
                        <td className="td py-1.5 font-mono text-xs font-semibold">{e.row}</td>
                        <td className="td py-1.5 text-xs">
                          <div className="font-medium">{e.name ?? '—'}</div>
                          <div className="text-slate-400">{e.email}</div>
                        </td>
                        <td className="td py-1.5 text-xs text-rose-600 dark:text-rose-400">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.preview.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <Icon name="check-circle" size={15} /> Ready rows
                {preview.previewTotal > preview.preview.length && (
                  <span className="font-normal text-slate-400"> (showing first {preview.preview.length} of {preview.previewTotal})</span>
                )}
              </h3>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="th py-2">Row</th>
                      <th className="th py-2">Student</th>
                      <th className="th py-2">Class</th>
                      <th className="th py-2">Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((r) => (
                      <tr key={r.row} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="td py-1.5 font-mono text-xs">{r.row}</td>
                        <td className="td py-1.5">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-slate-400">{r.email} · {r.gender}</div>
                        </td>
                        <td className="td py-1.5 text-xs">{r.classLabel}</td>
                        <td className="td py-1.5 text-xs">
                          {r.passwordMode === 'generated'
                            ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">Auto-generated</Badge>
                            : <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">From file</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" onClick={resetToUpload}><Icon name="corner-up-left" size={14} /> Choose different file</button>
            <button className="btn-primary" disabled={busy || preview.ready === 0} onClick={() => void runImport()}>
              {busy ? 'Importing…' : <><Icon name="upload" size={15} /> Confirm import ({preview.ready})</>}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-5">
          <div className={cx('flex items-center gap-3 rounded-xl p-3 text-sm',
            result.failed === 0
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300')}>
            {result.failed === 0
              ? <Icon name="check-circle" size={22} />
              : <Icon name="warning" size={22} />}
            <span><strong>{result.created}</strong> imported · <strong>{result.failed}</strong> skipped
              {result.file ? <span className="text-xs opacity-70"> · {result.file}</span> : null}
            </span>
          </div>

          {result.errors.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-rose-500">Skipped rows</h3>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr><th className="th py-2">Row</th><th className="th py-2">Email</th><th className="th py-2">Reason</th></tr></thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={`${e.row}-${e.email}`} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="td py-1.5 font-mono text-xs">{e.row}</td>
                        <td className="td py-1.5 text-xs">{e.email}</td>
                        <td className="td py-1.5 text-xs text-rose-500">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.credentials.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Icon name="key" size={15} /> Login credentials (share with students)</h3>
                <button className="btn-secondary px-3 py-1 text-xs"
                  onClick={() => downloadBlob(new Blob([credCsv(result.credentials)], { type: 'text/csv' }), 'student_credentials.csv')}>
                  <Icon name="download" size={13} /> Download CSV
                </button>
              </div>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr><th className="th py-2">Name</th><th className="th py-2">Email</th><th className="th py-2">Password</th></tr></thead>
                  <tbody>
                    {result.credentials.map((c) => (
                      <tr key={c.email} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="td py-1.5">{c.name}</td>
                        <td className="td py-1.5 text-xs">{c.email}</td>
                        <td className="td py-1.5 font-mono text-xs">{c.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={resetToUpload}><Icon name="corner-up-left" size={14} /> Import another file</button>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Students() {
  const toast = useToast();
  const { hasRole } = useAuth();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [classId, setClassId] = useState('');
  const [gender, setGender] = useState('');
  const [sort, setSort] = useState<{ by: string; dir: 'asc' | 'desc' }>({ by: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState<StudentRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debounced, classId, gender]);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '10', sortBy: sort.by, sortDir: sort.dir });
    if (debounced) p.set('search', debounced);
    if (classId) p.set('classId', classId);
    if (gender) p.set('gender', gender);
    return p.toString();
  }, [page, debounced, classId, gender, sort]);

  const { data, loading, error, refetch } = useQuery(() =>
    api.get<Paged<StudentRow>>(`/students?${params}`).then((r) => r.data), [params]);
  const { data: classesData } = useQuery(() => api.get<{ data: ClassRoom[] }>('/classes').then((r) => r.data), []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const toggleSort = (by: string) =>
    setSort((s) => (s.by === by ? { by, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: 'asc' }));
  const sortArrow = (by: string) =>
    sort.by === by ? <Icon name={sort.dir === 'asc' ? 'chevron-up' : 'chevron-down'} size={13} className="ml-0.5" /> : null;

  const doDelete = async (password: string) => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/students/${deleting.id}`, { data: { password } });
      toast('success', `${deleting.user.name} removed`);
      setDeleting(null);
      void refetch();
    } catch (err) { toast('error', apiError(err)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Students" subtitle="Register, search and manage student records."
        actions={hasRole('ADMIN') ? (
          <>
            <button className="btn-secondary" onClick={() => setImportOpen(true)}><Icon name="upload" size={15} /> Import from Excel</button>
            <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}><Icon name="user-plus" size={15} /> Register Student</button>
          </>
        ) : undefined} />

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input className="input max-w-xs" placeholder="Search name, email or admission no…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[180px]" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classesData?.data.map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}
        </select>
        <select className="input max-w-[140px]" value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">All genders</option>
          <option value="MALE">Male</option><option value="FEMALE">Female</option>
        </select>
        {data && <span className="ml-auto text-sm text-slate-400">{data.total} student{data.total === 1 ? '' : 's'}</span>}
      </div>

      <div className="card overflow-hidden">
        {loading ? <TableSkeleton /> : error ? <EmptyState title="Failed to load" hint={error} /> :
          !data || data.data.length === 0 ? <EmptyState title="No students found" hint="Try adjusting your search or filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="th cursor-pointer select-none" onClick={() => toggleSort('admissionNumber')}>Adm. No{sortArrow('admissionNumber')}</th>
                  <th className="th cursor-pointer select-none" onClick={() => toggleSort('name')}>Student{sortArrow('name')}</th>
                  <th className="th">Class</th><th className="th">Gender</th><th className="th">Date of Birth</th>
                  <th className="th">Status</th><th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                    <td className="td font-mono text-xs">{s.admissionNumber}</td>
                    <td className="td">
                      <Link to={`/students/${s.id}`} className="group flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                          {initials(s.user.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-indigo-700 group-hover:underline dark:text-indigo-300">{s.user.name}</div>
                          <div className="text-xs text-slate-400">{s.user.email}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="td">{s.classRoom ? `${s.classRoom.name} ${s.classRoom.stream}` : <span className="text-slate-400">—</span>}</td>
                    <td className="td capitalize">{s.gender.toLowerCase()}</td>
                    <td className="td">{fmtDate(s.dateOfBirth)}</td>
                    <td className="td">
                      <Badge className={s.user.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'}>
                        {s.user.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    {hasRole('ADMIN') && (
                      <td className="td text-right">
                        <Link to={`/students/${s.id}`} className="btn-ghost px-2 py-1 text-xs">View</Link>
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditing(s); setModalOpen(true); }}>Edit</button>
                        <button className="btn-ghost px-2 py-1 text-xs text-rose-500" onClick={() => setDeleting(s)}>Delete</button>
                      </td>
                    )}
                    {!hasRole('ADMIN') && (
                      <td className="td text-right">
                        <Link to={`/students/${s.id}`} className="btn-ghost px-2 py-1 text-xs">View profile</Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <span className="text-sm text-slate-400">Page {data.page} of {totalPages}</span>
            <div className="flex gap-2">
              <button className="btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><Icon name="arrow-left" size={14} /> Prev</button>
              <button className="btn-secondary px-3 py-1.5" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next <Icon name="arrow-right" size={14} /></button>
            </div>
          </div>
        )}
      </div>

      <StudentModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={() => void refetch()}
        editing={editing} classes={classesData?.data ?? []} />
      <ImportStudentsModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => void refetch()} />
      <PasswordConfirmDialog open={!!deleting} busy={busy} title="Delete student — security check"
        message={`You are about to permanently delete ${deleting?.user.name} (${deleting?.admissionNumber}). Their grades and records will also be removed. This cannot be undone.`}
        confirmText="Delete permanently" onConfirm={(pw) => void doDelete(pw)} onCancel={() => setDeleting(null)} />
    </div>
  );
}
