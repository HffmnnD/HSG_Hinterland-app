import { useMemo, useState } from 'react';

import { apiFetch } from '../../lib/api';
import { useHandballSchedule } from '../../hooks/useHandball';
import Modal from '../ui/Modal';
import { formatReportDate } from '../../lib/content';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Lokales Datum eines ISO-Zeitpunkts als "YYYY-MM-DD". */
function isoDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Spielbericht schreiben oder bearbeiten: Mannschaft, verknüpftes Spiel aus
 * dem nuLiga-Spielplan (füllt Datum, Gegner und Heim/Auswärts selbst), Titel,
 * Untertitel, langer Berichtstext sowie Bilder und PDFs.
 *
 * @param {{ teams: {id:number, code:string, name:string, handballTeamId:string|null}[],
 *           report?: object|null, onClose: () => void, onSaved: (message:string) => void }} props
 */
export default function MatchReportEditor({ teams, report = null, onClose, onSaved }) {
  const editing = Boolean(report);
  const [teamId, setTeamId] = useState(String(report?.teamId ?? teams[0]?.id ?? ''));
  const [form, setForm] = useState({
    gameId: report?.gameId ?? '',
    gameDate: report?.gameDate ?? '',
    opponent: report?.opponent ?? '',
    isHome: report?.isHome === null || report?.isHome === undefined ? '' : String(report.isHome),
    title: report?.title ?? '',
    summary: report?.summary ?? '',
    body: report?.body ?? '',
  });
  const [files, setFiles] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const team = teams.find((entry) => String(entry.id) === teamId) ?? null;
  const { games } = useHandballSchedule(team?.handballTeamId ?? null);
  // Gespielte bzw. laufende Spiele, neueste zuerst.
  const linkable = useMemo(
    () =>
      (games ?? [])
        .filter((game) => game.id && game.state !== 'upcoming' && game.startsAt)
        .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt)),
    [games]
  );

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const chooseGame = (event) => {
    const gameId = event.target.value;
    const game = linkable.find((entry) => entry.id === gameId);
    setForm((prev) => ({
      ...prev,
      gameId,
      ...(game
        ? {
            gameDate: isoDay(game.startsAt),
            opponent: game.opponent?.name ?? (game.isHome ? game.away?.name : game.home?.name) ?? prev.opponent,
            isHome: game.isHome === null || game.isHome === undefined ? '' : String(game.isHome),
            title: prev.title || `${game.home?.name ?? ''} – ${game.away?.name ?? ''}`.trim(),
          }
        : {}),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!team) {
      setError('Bitte eine Mannschaft wählen.');
      return;
    }
    if (!form.body.trim() && files.length === 0 && (!editing || report.files.length === removed.length)) {
      setError('Bitte den Berichtstext schreiben oder Bilder anhängen.');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await apiFetch(`/api/match-reports/${report.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...form, teamId: team.id }),
        });
        for (const fileId of removed) {
          await apiFetch(`/api/match-reports/${report.id}/files/${fileId}`, { method: 'DELETE' });
        }
        if (files.length > 0) {
          const data = new FormData();
          files.forEach((file) => data.append('files', file));
          await apiFetch(`/api/match-reports/${report.id}/files`, { method: 'POST', body: data });
        }
        onSaved('Spielbericht gespeichert.');
      } else {
        const data = new FormData();
        for (const [key, value] of Object.entries(form)) data.append(key, value);
        files.forEach((file) => data.append('files', file));
        await apiFetch(`/api/match-reports?teamId=${team.id}`, { method: 'POST', body: data });
        onSaved('Spielbericht veröffentlicht.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? 'Spielbericht bearbeiten' : 'Spielbericht schreiben'} onClose={() => !busy && onClose()} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div role="alert" className="alert alert-error">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="mr-team" className="field-label">Mannschaft</label>
            <select
              id="mr-team"
              className="field-control"
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                setForm((prev) => ({ ...prev, gameId: '' }));
              }}
              disabled={busy}
            >
              {teams.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mr-game" className="field-label">Spiel verknüpfen (optional)</label>
            <select id="mr-game" className="field-control" value={form.gameId} onChange={chooseGame} disabled={busy || !team?.handballTeamId}>
              <option value="">{team?.handballTeamId ? '– ohne Verknüpfung –' : 'Kein nuLiga-Spielplan'}</option>
              {form.gameId && !linkable.some((game) => game.id === form.gameId) && (
                <option value={form.gameId}>Verknüpftes Spiel</option>
              )}
              {linkable.map((game) => (
                <option key={game.id} value={game.id}>
                  {formatReportDate(isoDay(game.startsAt))} · {game.home?.name} – {game.away?.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="mr-date" className="field-label">Spieldatum</label>
            <input id="mr-date" type="date" required className="field-control" value={form.gameDate} onChange={set('gameDate')} disabled={busy} />
          </div>
          <div>
            <label htmlFor="mr-opponent" className="field-label">Gegner</label>
            <input id="mr-opponent" required maxLength={120} className="field-control" value={form.opponent} onChange={set('opponent')} disabled={busy} />
          </div>
          <div>
            <label htmlFor="mr-home" className="field-label">Heim/Auswärts</label>
            <select id="mr-home" className="field-control" value={form.isHome} onChange={set('isHome')} disabled={busy}>
              <option value="">unbekannt</option>
              <option value="true">Heimspiel</option>
              <option value="false">Auswärtsspiel</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="mr-title" className="field-label">Überschrift</label>
          <input id="mr-title" required maxLength={160} className="field-control" value={form.title} onChange={set('title')} disabled={busy} />
        </div>
        <div>
          <label htmlFor="mr-summary" className="field-label">
            Untertitel <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id="mr-summary" maxLength={300} className="field-control" value={form.summary} onChange={set('summary')} disabled={busy} placeholder="z. B. Starke zweite Halbzeit sichert den Heimsieg" />
        </div>
        <div>
          <label htmlFor="mr-body" className="field-label">Spielbericht</label>
          <textarea id="mr-body" rows={12} className="field-control resize-y" value={form.body} onChange={set('body')} disabled={busy} placeholder="Wie lief das Spiel?" />
        </div>

        {editing && report.files.length > 0 && (
          <div>
            <p className="field-label">Vorhandene Dateien</p>
            <ul className="flex flex-wrap gap-2">
              {report.files.map((file) => {
                const gone = removed.includes(file.id);
                return (
                  <li key={file.id} className={`flex items-center gap-2 rounded-md border border-line p-1.5 ${gone ? 'opacity-40' : ''}`}>
                    {file.kind === 'image' ? (
                      <img src={file.url} alt="" className="h-12 w-12 rounded-sm object-cover" />
                    ) : (
                      <span className="max-w-[10rem] truncate px-1 text-xs">{file.originalName ?? 'PDF'}</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRemoved((list) => (gone ? list.filter((id) => id !== file.id) : [...list, file.id]))}
                    >
                      {gone ? 'Behalten' : 'Entfernen'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <label htmlFor="mr-files" className="field-label">{editing ? 'Bilder oder PDF ergänzen' : 'Bilder oder PDF (optional)'}</label>
          <input id="mr-files" type="file" multiple accept={ACCEPT} className="field-control" onChange={(event) => setFiles([...event.target.files])} disabled={busy} />
          <p className="field-hint">JPG, PNG, WEBP oder PDF · bis 15 MB je Datei · das erste Bild wird das Titelbild</p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-outline">Abbrechen</button>
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? 'Wird gespeichert …' : editing ? 'Speichern' : 'Veröffentlichen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
