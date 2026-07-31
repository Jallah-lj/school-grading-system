import { Modal } from './ui';

export function ConfirmDialog({ open, title, message, confirmText = 'Confirm', danger, onConfirm, onCancel, busy }: {
  open: boolean; title: string; message: string; confirmText?: string;
  danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
