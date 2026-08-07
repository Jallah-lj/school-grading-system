import { useEffect, useState } from 'react';

import { Icon } from './Icon';
import { Modal } from './ui';

/**
 * Security gate for destructive actions (e.g. deleting a student/teacher):
 * the administrator must re-enter their own password before the request is
 * even sent. The password is verified again on the server.
 */
export function PasswordConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  busy?: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword('');
      setShow(false);
    }
  }, [open]);

  const submit = () => {
    if (password) onConfirm(password);
  };

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <Icon name="shield" size={18} className="mt-0.5 shrink-0" />
        <p>{message}</p>
      </div>
      <label className="label">Confirm with your password</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className="input pr-16"
          placeholder="Enter your account password"
          value={password}
          autoFocus
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && password && !busy) submit();
          }}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
          onClick={() => setShow((s) => !s)}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        For your security, destructive actions require step-up verification. Failed attempts are
        recorded in the audit log.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-danger" onClick={submit} disabled={!password || busy}>
          {busy ? (
            'Verifying…'
          ) : (
            <>
              <Icon name="lock" size={14} /> {confirmText}
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}
