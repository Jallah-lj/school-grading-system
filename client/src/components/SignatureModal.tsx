import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';

import { api, apiError } from '../lib/api';
import { cx } from '../lib/utils';

import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { useToast } from './toast';
import { Modal } from './ui';

interface SignatureMeta {
  id: string;
  title: string;
  width: number;
  height: number;
  updatedAt: string;
}

/**
 * Capture a digital signature two ways:
 *  1. Draw it with mouse / finger / stylus on the pad, or
 *  2. Photograph a paper signature and upload it — the server auto-cleans
 *     the background so it stamps transparently onto report card PDFs.
 */
export function SignatureModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<'draw' | 'upload'>('draw');
  const [existing, setExisting] = useState<string | null>(null);
  const [meta, setMeta] = useState<SignatureMeta | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  // Load current signature
  const loadExisting = async () => {
    try {
      const [img, info] = await Promise.all([
        api.get('/signatures/me', { responseType: 'blob' }),
        api.get<SignatureMeta>('/signatures/me/meta'),
      ]);
      setExisting(URL.createObjectURL(img.data as Blob));
      setMeta(info.data);
    } catch {
      setExisting(null);
      setMeta(null);
    }
  };

  useEffect(() => {
    if (open) {
      setTab('draw');
      setFile(null);
      setPreview(null);
      void loadExisting();
    }
  }, [open]);

  // (Re)create the drawing pad whenever the draw tab becomes visible
  useEffect(() => {
    if (open && tab === 'draw' && canvasRef.current) {
      padRef.current?.off();
      padRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgba(255,255,255,0)',
        penColor: '#264437',
        minWidth: 1.2,
        maxWidth: 3.2,
      });
      return () => {
        padRef.current?.off();
        padRef.current = null;
      };
    }
  }, [open, tab]);

  const pickFile = (f: File | null) => {
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  };

  const uploadFile = async (f: File) => {
    const form = new FormData();
    form.append('file', f);
    await api.post('/signatures/me', form);
  };

  const saveDrawn = async () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      toast('error', 'Draw your signature first');
      return;
    }
    setBusy(true);
    try {
      const blob = await (await fetch(pad.toDataURL('image/png'))).blob();
      await uploadFile(new File([blob], 'signature.png', { type: 'image/png' }));
      toast('success', 'Signature saved — it will appear on future report cards');
      await loadExisting();
      setTab('draw');
      pad.clear();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveUploaded = async () => {
    if (!file) {
      toast('error', 'Choose a photo of your signature first');
      return;
    }
    setBusy(true);
    try {
      await uploadFile(file);
      toast('success', 'Signature saved — it will appear on future report cards');
      await loadExisting();
      pickFile(null);
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete('/signatures/me');
      toast('success', 'Signature removed');
      setExisting(null);
      setMeta(null);
      setConfirmRemove(false);
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="My Digital Signature">
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Your signature is stored securely and stamped automatically on report cards you are
          responsible for. Draw it below, or photograph a paper signature — the paper background is
          removed automatically.
        </p>

        {existing && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40">
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="inline-flex items-center gap-1">
                <Icon name="check-circle" size={13} /> Current signature{' '}
                {meta ? `(saved ${new Date(meta.updatedAt).toLocaleDateString()})` : ''}
              </span>
              <button
                className="text-rose-500 hover:underline"
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
              >
                Remove
              </button>
            </div>
            <img
              src={existing}
              alt="Current signature"
              className="h-16 rounded bg-white object-contain px-3 py-1 dark:bg-slate-200"
            />
          </div>
        )}

        <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['draw', 'upload'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition',
                tab === t ? 'bg-white shadow dark:bg-slate-700' : 'text-slate-500',
              )}
            >
              {t === 'draw' ? (
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="pen" size={14} /> Draw
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="camera" size={14} /> Photo / Scan
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'draw' ? (
          <div>
            <div className="overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white dark:border-slate-600">
              <canvas ref={canvasRef} width={520} height={190} className="h-48 w-full touch-none" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                className="btn-ghost px-3 py-1.5 text-sm"
                onClick={() => padRef.current?.clear()}
              >
                Clear pad
              </button>
              <button className="btn-primary" onClick={() => void saveDrawn()} disabled={busy}>
                {busy ? 'Saving…' : 'Save Signature'}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Tip: sign slowly with your finger or stylus for the smoothest result.
            </p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="sig-upload"
              className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 text-stone-400 transition hover:border-brand-500 hover:text-brand-600 dark:border-stone-600"
            >
              {preview ? (
                <img src={preview} alt="Signature preview" className="h-full object-contain p-2" />
              ) : (
                <>
                  <Icon name="camera" size={30} />
                  <span className="text-sm">Tap to take a photo or choose an image</span>
                  <span className="text-xs">PNG / JPG / WebP · max 5 MB</span>
                </>
              )}
            </label>
            <input
              id="sig-upload"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">{file ? file.name : ''}</span>
              <button
                className="btn-primary"
                onClick={() => void saveUploaded()}
                disabled={busy || !file}
              >
                {busy ? 'Processing…' : 'Clean & Save'}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              For photos: sign with a dark pen on plain white paper, photograph in good light,
              close-up. We handle rotation, background removal and cropping for you.
            </p>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmRemove}
        danger
        busy={busy}
        title="Remove signature"
        message="Remove your digital signature? It will no longer appear on report cards until you save a new one."
        confirmText="Remove Signature"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </>
  );
}
