import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DialogContext,
  type AlertOptions,
  type ConfirmOptions,
  type DialogApi,
} from '../hooks/useDialog';

type DialogRequest =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (confirmed: boolean) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: (confirmed: boolean) => void };

/**
 * One native modal <dialog> shared by the whole app. The browser makes the page behind it inert,
 * keeps focus inside, closes it with Esc, and returns focus to the button that opened it.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef<DialogRequest | null>(null);
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const titleId = useId();
  const messageId = useId();

  const api = useMemo<DialogApi>(() => {
    const show = (next: DialogRequest) => {
      // A newer request replaces one still open; the older one counts as cancelled.
      pendingRef.current?.resolve(false);
      pendingRef.current = next;
      setRequest(next);
    };

    return {
      confirm: (options) =>
        new Promise<boolean>((resolve) => show({ kind: 'confirm', options, resolve })),
      alert: (options) =>
        new Promise<void>((resolve) => show({ kind: 'alert', options, resolve: () => resolve() })),
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!request || !dialog) {
      return;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    // The safe choice gets focus first, so pressing Enter never throws anything away.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [request]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    // Esc sets no return value, and browsers differ on whether they clear the previous one.
    const confirmed = dialog?.returnValue === 'confirm';

    if (dialog) {
      dialog.returnValue = '';
    }

    const pending = pendingRef.current;
    pendingRef.current = null;
    setRequest(null);
    pending?.resolve(confirmed);
  };

  const close = (value: 'confirm' | 'cancel') => dialogRef.current?.close(value);
  const options = request?.options;

  return (
    <DialogContext.Provider value={api}>
      {children}
      <dialog
        ref={dialogRef}
        className="app-dialog"
        aria-labelledby={titleId}
        aria-describedby={options?.message ? messageId : undefined}
        onClose={handleClose}
      >
        {request && options && (
          <>
            <h2 id={titleId}>{options.title}</h2>
            {options.message && <p id={messageId}>{options.message}</p>}
            <div className="dialog-actions">
              {request.kind === 'confirm' ? (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    data-autofocus
                    onClick={() => close('cancel')}
                  >
                    {request.options.cancelLabel ?? 'Cancel'}
                  </button>
                  <button
                    type="button"
                    className={
                      request.options.destructive
                        ? 'primary-button danger-solid-button'
                        : 'primary-button'
                    }
                    onClick={() => close('confirm')}
                  >
                    {request.options.confirmLabel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  data-autofocus
                  onClick={() => close('confirm')}
                >
                  {request.options.okLabel ?? 'OK'}
                </button>
              )}
            </div>
          </>
        )}
      </dialog>
    </DialogContext.Provider>
  );
}
