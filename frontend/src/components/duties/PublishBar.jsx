/** Haken „Push an Helfer" und die beiden Knöpfe. */
export default function PublishBar({ busy, notify, onNotifyChange, onDraft, onPublish }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={notify}
          onChange={(e) => onNotifyChange(e.target.checked)}
          className="h-5 w-5 accent-hsg-green"
          disabled={busy}
        />
        Helfer per Push benachrichtigen
      </label>
      <div className="flex flex-wrap gap-2">
        {onDraft && (
          <button type="button" onClick={onDraft} disabled={busy} className="btn btn-outline btn-sm">
            Als Entwurf speichern
          </button>
        )}
        <button type="button" onClick={onPublish} disabled={busy} className="btn btn-primary btn-sm">
          {busy ? 'Speichert …' : 'Veröffentlichen'}
        </button>
      </div>
    </div>
  );
}
