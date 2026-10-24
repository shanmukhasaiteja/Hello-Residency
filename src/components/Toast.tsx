import { useCallback, useRef, useState } from 'react';

export interface ToastItem {
  id: number;
  message: string;
  kind: 'ok' | 'error';
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (message: string, kind: 'ok' | 'error' = 'ok') => {
      const id = nextId.current++;
      setToasts((t) => [...t.filter((x) => x.message !== message), { id, message, kind }].slice(-3));
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  return { toasts, notify, dismiss };
}

export function Toasts({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
          <span>{t.message}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
