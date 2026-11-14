import { useState } from 'react';
import { DatabaseBackup, Download, Trash2 } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useApiResource } from '../../hooks/useSchedule';
import { useConfirm } from '../../hooks/useConfirm';
import { EmptyState, ErrorNote, Loading, SuccessNote } from './ui/Feedback';

const select = (result) => result ?? null;

/**
 * Datensicherungen: Die App sichert die Datenbank automatisch in festen
 * Abständen. Hier lassen sich Sicherungen sofort anstoßen, herunterladen
 * und löschen.
 */
export default function BackupsSection() {
  const { data, loading, error, reload } = useApiResource('/api/admin/backups', select, null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  if (loading) return <Loading />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return null;

  const run = async (path, method) => {
    setBusy(true);
    setNotice(null);
    setActionError(null);
    try {
      const result = await apiFetch(path, { method });
      setNotice(result?.message ?? null);
      await reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (backup) => {
    if (!(await confirm({ title: 'Sicherung löschen?', text: backup.name, confirmLabel: 'Löschen', tone: 'danger' }))) return;
    await run(`/api/admin/backups/${backup.name}`, 'DELETE');
  };

  const { settings } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink-soft">
          {settings.enabled
            ? `Automatisch alle ${settings.intervalHours} Stunden, die letzten ${settings.keep} bleiben erhalten.`
            : 'Die automatische Sicherung ist ausgeschaltet (BACKUP_ENABLED=false).'}
        </p>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run('/api/admin/backups', 'POST')}>
          <DatabaseBackup size={16} aria-hidden="true" /> {busy ? 'Läuft …' : 'Jetzt sichern'}
        </button>
      </div>

      <SuccessNote>{notice}</SuccessNote>
      <ErrorNote>{actionError ?? (data.lastError ? `Letzte automatische Sicherung fehlgeschlagen: ${data.lastError}` : null)}</ErrorNote>

      {data.backups.length === 0 ? (
        <EmptyState icon={DatabaseBackup} title="Noch keine Sicherung" />
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-paper">
          {data.backups.map((backup) => (
            <li key={backup.name} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{formatDateTime(backup.createdAt)}</span>
                <span className="block truncate text-xs text-ink-muted">{backup.name} · {formatBytes(backup.sizeBytes)}</span>
              </span>
              <a href={`/api/admin/backups/${backup.name}`} className="btn btn-outline btn-sm shrink-0" download>
                <Download size={16} aria-hidden="true" /> <span className="hidden sm:inline">Herunterladen</span>
              </a>
              <button type="button" className="btn btn-ghost btn-sm shrink-0 text-danger" disabled={busy} onClick={() => remove(backup)} aria-label="Sicherung löschen">
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
