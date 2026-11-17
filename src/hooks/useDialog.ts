import { createContext, useContext, type ReactNode } from 'react';

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  /** Says what the button does, for example "Delete question", never just "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Shows the confirm button in red, for actions that throw something away. */
  destructive?: boolean;
};

export type AlertOptions = {
  title: string;
  message?: ReactNode;
  okLabel?: string;
};

export type DialogApi = {
  /** Resolves true only when the confirm button was used; Esc and Cancel resolve false. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
};

export const DialogContext = createContext<DialogApi | null>(null);

/** In-app replacements for window.confirm and window.alert. Needs a <DialogProvider> above. */
export function useDialog(): DialogApi {
  const api = useContext(DialogContext);

  if (!api) {
    throw new Error('useDialog must be used inside <DialogProvider>.');
  }

  return api;
}
