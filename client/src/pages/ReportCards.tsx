import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Link } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/useQuery';
import { useToast } from '../components/toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Badge, EmptyState, Modal, PageHeader, TableSkeleton } from '../components/ui';
import { downloadBlob, fmtDate, statusBadgeClass } from '../lib/utils';
import type { AcademicYear, ClassRoom, ReportCardListItem } from '../lib/types';

function AdminReportCards() {
  const toast = useToast();
  const [semesterId, setSemesterId] = useState('');
  const [classId, setClassId] = useState('');
  const [editing, setEditing] = useState<ReportCardListItem | null>(null);
  const [teacherRemarks, setTeacherRemarks] = useState('');
  const [principalRemarks, setPrincipalRemarks] = useState('');
  const [publishAllOpen, setPublishAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: year } = useQuery(() => api.get<AcademicYear>('/academic-years/active').then((r) => r.data), []);
  const { data: classes } = useQuery(() => api.get<{ data: ClassRoom[] }>('/classes').then((r) => r.data), []);

  useEffect(() => {
    if (year && !semesterId) {
      const current = year.semesters.find((s) => s.isCurrent) ?? year.semesters[0];
      if (current) setSemesterId(current.id);
    }
  }, [year, semesterId]);

  const ready = classId && semesterId;
  const { data, loading, refetch } = useQuery(
    () => (ready ? api.get<{ data: ReportCardListItem[] }>(`/report-cards?classId=${classId}&semesterId=${semesterId}`).then((r) => r.data) : Promise.resolve(undefined)),
    [classId, semesterId],
  );

  const generate = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.post<{ generated: number; skipped: number }>('/report-cards/generate', { classId, semesterId });
      toast('success', `Generated ${res.generated} report cards${res.skipped ? ` (${res.skipped} skipped — approve grades first)` : ''}`);
      void refetch();
    } catch (err) { toast('error', apiError(err)); } finally { setBusy(false); }
  };

  const publishOne = async (card: ReportCardListItem) => {
    try {
      await api.post(`/report-cards/${card.id}/publish`);
      toast('success', `Published ${card.student.name}'s report card`);
      void refetch();
    } catch (err) { toast('error', apiError(err)); }
  };

  const publishAll = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.post<{ published: number; notified: number }>('/report-cards/publish-all', { classId, semesterId });
      toast('success', `Published ${res.published} cards · ${res.notified} notifications sent`);
      setPublishAllOpen(false);
      void refetch();
    } catch (err) { toast('error', apiError(err)); } finally { setBusy(false); }
  };

  const saveRemarks = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api.patch(`/report-cards/${editing.id}/remarks`, { teacherRemarks, principalRemarks });
      toast('success', 'Remarks saved');
      setEditing(null);
      void refetch();
    } catch (err) { toast('error', apiError(err)); } finally { setBusy(false); }
  };

  const downloadPdf = async (card: ReportCardListItem) => {
    try {
      const res = await api.get(`/report-cards/${card.id}/pdf`, { responseType: 'blob' });
      downloadBlob(res.data as Blob, `report_card_${card.student.admissionNumber}.pdf`);
    } catch (err) { toast('error', apiError(err)); }
  };

  const downloadClassCsv = async () => {
    try {
      const res = await api.get(`/reports/class-report.csv?classId=${classId}&semesterId=${semesterId}`, { responseType: 'blob' });
      downloadBlob(res.data as Blob, 'class_report.csv');
    } catch (err) { toast('error', apiError(err)); }
  };

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Term</label>
          <select className="input" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
            <option value="">Select term…</option>
            {year?.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? ' (current)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Class</label>
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select class…</option>
            {classes?.data.map((c) => <option key={c.id} value={c.id}>{c.name} {c.stream}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button className="btn-primary" onClick={() => void generate()} disabled={!ready || busy}><Icon name="settings" size={15} /> Generate Cards</button>
          <button className="btn-secondary" onClick={() => setPublishAllOpen(true)} disabled={!ready}><Icon name="megaphone" size={15} /> Publish All</button>
          <button className="btn-secondary" onClick={() => void downloadClassCsv()} disabled={!ready}><Icon name="download" size={15} /> Class CSV</button>
        </div>
      </div>

      {!ready ? <EmptyState title="Select a term and class" /> : loading ? <div className="card"><TableSkeleton /></div> :
        !data || data.data.length === 0 ? <EmptyState title="No report cards yet" hint="Click “Generate Cards” after grades have been approved." /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr><th className="th">Student</th><th className="th">GPA</th><th className="th">Position</th><th className="th">Status</th><th className="th">Code</th><th className="th text-right">Actions</th></tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="td">
                      <Link to={`/students/${c.student.id}`} className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">{c.student.name}</Link>
                      <div className="font-mono text-xs text-slate-400">{c.student.admissionNumber}</div>
                    </td>
                    <td className="td font-semibold">{c.gpa !== null ? c.gpa.toFixed(2) : '—'}</td>
                    <td className="td">{c.position ?? '—'}</td>
                    <td className="td"><Badge className={statusBadgeClass(c.status)}>{c.status}</Badge></td>
                    <td className="td font-mono text-xs text-slate-400">{c.verificationCode}</td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        <Link to={`/verify/${c.verificationCode}`} target="_blank" className="btn-ghost px-2 py-1 text-xs">View</Link>
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void downloadPdf(c)}>PDF</button>
                        {c.status !== 'PUBLISHED' && (
                          <>
                            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditing(c); setTeacherRemarks(c.teacherRemarks ?? ''); setPrincipalRemarks(c.principalRemarks ?? ''); }}>Remarks</button>
                            <button className="btn-ghost px-2 py-1 text-xs text-indigo-500" onClick={() => void publishOne(c)}>Publish</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Remarks — ${editing?.student.name ?? ''}`}>
        <div className="space-y-4">
          <div>
            <label className="label">Class teacher's remarks</label>
            <textarea className="input min-h-20" value={teacherRemarks} onChange={(e) => setTeacherRemarks(e.target.value)} />
          </div>
          <div>
            <label className="label">Principal's remarks</label>
            <textarea className="input min-h-20" value={principalRemarks} onChange={(e) => setPrincipalRemarks(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => void saveRemarks()} disabled={busy}>Save Remarks</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={publishAllOpen} busy={busy} title="Publish all report cards"
        message="Publish every generated report card for this class? Students and parents will be notified and cards become publicly verifiable via QR code."
        confirmText="Publish All" onConfirm={() => void publishAll()} onCancel={() => setPublishAllOpen(false)} />
    </div>
  );
}

function MineReportCards() {
  const toast = useToast();
  const { user } = useAuth();
  const isParent = user?.role === 'PARENT';
  const children = user?.parent?.children ?? [];
  const [childId, setChildId] = useState(children[0]?.id ?? '');
  const studentId = isParent ? childId : undefined;

  const { data, loading } = useQuery(
    () => api.get<{ data: { id: string; verificationCode: string; semesterName: string; publishedAt: string | null }[] }>(
      `/report-cards/mine${studentId ? `?studentId=${studentId}` : ''}`).then((r) => r.data),
    [studentId],
  );

  const downloadPdf = async (id: string) => {
    try {
      const res = await api.get(`/report-cards/${id}/pdf`, { responseType: 'blob' });
      downloadBlob(res.data as Blob, 'report_card.pdf');
    } catch (err) { toast('error', apiError(err)); }
  };

  return (
    <div className="space-y-4">
      {isParent && children.length > 1 && (
        <div className="card p-4">
          <select className="input max-w-xs" value={childId} onChange={(e) => setChildId(e.target.value)}>
            {children.map((c) => <option key={c.id} value={c.id}>{c.user.name}</option>)}
          </select>
        </div>
      )}
      {loading ? <div className="card"><TableSkeleton /></div> : !data?.data.length ? (
        <EmptyState title="No report cards available" hint="You'll be notified as soon as a report card is published." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="text-sm font-semibold">{c.semesterName}</div>
              <div className="mt-1 text-xs text-slate-400">Published {fmtDate(c.publishedAt)}</div>
              <div className="mt-1 font-mono text-xs text-slate-400">Verify code: {c.verificationCode}</div>
              <div className="mt-4 flex gap-2">
                <Link to={`/verify/${c.verificationCode}`} className="btn-primary flex-1 px-3 py-1.5 text-xs">View Card</Link>
                <button className="btn-secondary flex-1 px-3 py-1.5 text-xs" onClick={() => void downloadPdf(c.id)}><Icon name="download" size={13} /> PDF</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportCards() {
  const { hasRole } = useAuth();
  return (
    <div>
      <PageHeader title="Report Cards" subtitle="Generate, publish and download official term report cards." />
      {hasRole('ADMIN', 'TEACHER') ? <AdminReportCards /> : <MineReportCards />}
    </div>
  );
}
