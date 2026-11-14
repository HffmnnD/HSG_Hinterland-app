import { useState } from 'react';
import { CalendarPlus, Download } from 'lucide-react';

import { apiFetch, apiUrl } from '../../lib/api';
import Modal from '../ui/Modal';

/**
 * Eigenen Kalender als .ics herunterladen oder abonnieren. Das Abo ist eine
 * geheime Adresse: Kalender-Apps (Google, Apple, Outlook) holen sie
 * regelmäßig ab und bleiben so von selbst aktuell.
 */
export default function CalendarExport({ compact = false }) {
  const [open, setOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  const load = async (renew = false) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const data = await apiFetch(renew ? '/api/calendar/subscription/renew' : '/api/calendar/subscription', {
        method: renew ? 'POST' : 'GET',
      });
      setFeedUrl(apiUrl(data.path));
      if (renew) setNote('Neuer Link erstellt. Der alte funktioniert nicht mehr.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openSubscription = () => {
    setOpen(true);
    if (!feedUrl) load();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setNote('Link kopiert.');
    } catch {
      setNote('Kopieren nicht möglich. Bitte den Link markieren und kopieren.');
    }
  };

  const webcalUrl = feedUrl?.replace(/^https?:/, 'webcal:');
  const googleUrl = webcalUrl && `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'mt-3' : 'border-t border-line pt-4'}`}>
      {!compact && (
        <a href={apiUrl('/api/calendar/export.ics')} download="hsg-hinterland.ics" className="btn btn-outline btn-sm">
          <Download size={16} aria-hidden="true" />
          Als Datei exportieren
        </a>
      )}
      <button type="button" onClick={openSubscription} className="btn btn-outline btn-sm">
        <CalendarPlus size={16} aria-hidden="true" />
        Kalender abonnieren
      </button>

      {open && (
        <Modal title="Kalender abonnieren" size="sm" onClose={() => setOpen(false)}>
          {error && (
            <div role="alert" className="alert alert-error mb-3">
              {error}
            </div>
          )}
          {feedUrl ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={feedUrl}
                  aria-label="Abo-Link"
                  onFocus={(e) => e.target.select()}
                  className="field-control field-control-sm min-w-0 flex-1"
                />
                <button type="button" onClick={copy} className="btn btn-outline btn-sm shrink-0">
                  Kopieren
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={webcalUrl} className="btn btn-primary btn-sm">
                  Kalender-App öffnen
                </a>
                <a href={googleUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                  Google Kalender
                </a>
              </div>
              {note && <p className="text-sm text-ink-soft">{note}</p>}
              <p className="field-hint">Der Link ist persönlich. Nicht weitergeben.</p>
              <button type="button" onClick={() => load(true)} disabled={busy} className="btn btn-ghost btn-sm">
                Neuen Link erstellen
              </button>
            </div>
          ) : (
            !error && <p className="text-sm text-ink-muted">Lädt …</p>
          )}
        </Modal>
      )}
    </div>
  );
}
