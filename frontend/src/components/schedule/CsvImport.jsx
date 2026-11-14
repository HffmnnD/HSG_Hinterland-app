import { useState } from 'react';
import { FileUp } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { formatClock, formatEventDay } from '../../lib/schedule';
import { ErrorNote, SuccessNote } from '../admin/ui/Feedback';

/**
 * Spielplan aus einer CSV-Datei übernehmen: Datei wählen, Vorschau prüfen,
 * übernehmen. Für Mannschaften ohne nuLiga-Anbindung, Turniere und
 * Freundschaftsspiele. Schon vorhandene Spiele legt der Import nicht doppelt an.
 *
 * @param {{ teamId:number, onImported: () => Promise<void>|void }} props
 */
export default function CsvImport({ teamId, onImported }) {
  const [csv, setCsv] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const send = (text, dryRun) =>
    apiFetch('/api/events/import-csv', { method: 'POST', body: JSON.stringify({ teamId, csv: text, dryRun }) });

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setSuccess(null);
    setPreview(null);
    if (file.size > 90 * 1024) return setError('Die Datei ist zu groß (höchstens 90 KB).');
    setBusy(true);
    try {
      // Excel speichert CSV oft in Windows-1252 – dann wären Umlaute kaputt.
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buffer);
      if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buffer);
      setCsv(text);
      setPreview(await send(text, true));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await send(csv, false);
      setSuccess(result.message);
      setPreview(null);
      setCsv(null);
      await onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className="section-title">Spielplan aus CSV</h2>
      <div className="card mt-3 space-y-3 p-4">
        <p className="text-sm text-ink-soft">
          Spalten: <strong>Datum; Zeit; Heim; Gast; Halle</strong> – aus Excel oder nuLiga exportiert.
        </p>
        <label className={`btn btn-outline btn-sm ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          <FileUp size={16} aria-hidden="true" /> CSV-Datei wählen
          <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={choose} disabled={busy} />
        </label>

        <ErrorNote>{error}</ErrorNote>
        <SuccessNote>{success}</SuccessNote>

        {preview && (
          <>
            {preview.errors.length > 0 && (
              <ul className="alert alert-error block space-y-0.5 text-sm">
                {preview.errors.map((entry) => (
                  <li key={entry.line}>Zeile {entry.line}: {entry.message}</li>
                ))}
              </ul>
            )}
            {preview.matches.length > 0 && (
              <>
                <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
                  {preview.matches.map((match) => (
                    <li key={match.line} className="px-3 py-2 text-sm">
                      <span className="block font-semibold text-ink">{match.title}</span>
                      <span className="block text-xs text-ink-muted">
                        {formatEventDay(match.startTime.replace(' ', 'T'))} · {formatClock(match.startTime.replace(' ', 'T'))} Uhr
                        {match.location ? ` · ${match.location}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={commit}>
                    {busy ? 'Übernimmt …' : `${preview.matches.length} ${preview.matches.length === 1 ? 'Spiel' : 'Spiele'} übernehmen`}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setPreview(null)}>Verwerfen</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
