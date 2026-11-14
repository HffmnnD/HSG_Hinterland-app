import { useCallback, useRef, useState } from 'react';

import ConfirmDialog from '../components/ui/ConfirmDialog';

/**
 * Rückfrage als Promise – Ersatz für `if (!window.confirm(…)) return;`:
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title: 'Rolle löschen?', tone: 'danger' }))) return;
 *   …
 *   return <>{…}{confirmDialog}</>;
 *
 * @returns {[(options: { title: string, text?: string, confirmLabel?: string,
 *             tone?: 'primary'|'danger' }) => Promise<boolean>, import('react').ReactNode]}
 */
export function useConfirm() {
  const [request, setRequest] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setRequest(options);
      }),
    []
  );

  const finish = (answer) => {
    resolveRef.current?.(answer);
    resolveRef.current = null;
    setRequest(null);
  };

  const dialog = request ? (
    <ConfirmDialog
      title={request.title}
      confirmLabel={request.confirmLabel}
      tone={request.tone}
      onConfirm={() => finish(true)}
      onClose={() => finish(false)}
    >
      {request.text ? <p>{request.text}</p> : null}
    </ConfirmDialog>
  ) : null;

  return [confirm, dialog];
}
