import Modal from './Modal';

/**
 * Rückfrage vor einer Aktion („Dienst übernehmen?", „Plan löschen?").
 *
 * Ersetzt `window.confirm`: gleiche Optik wie alle anderen Dialoge, auf dem
 * Handy gut zu treffen und mit Platz für ein paar Details, damit klar ist,
 * WORAUF sich die Bestätigung bezieht.
 *
 * @param {{ title: string,
 *           children?: import('react').ReactNode,
 *           confirmLabel?: string,
 *           cancelLabel?: string,
 *           tone?: 'primary'|'danger',
 *           busy?: boolean,
 *           onConfirm: () => void,
 *           onClose: () => void }} props
 */
export default function ConfirmDialog({
  title,
  children = null,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  tone = 'primary',
  busy = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal title={title} size="sm" onClose={busy ? () => {} : onClose}>
      {children && <div className="space-y-2 text-sm text-ink-soft">{children}</div>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className="btn btn-ghost btn-sm">
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`btn btn-sm ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
        >
          {busy ? '…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
