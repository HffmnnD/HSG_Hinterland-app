import { useMemo, useState } from 'react';

import {
  POSITIONS,
  positionLabel,
  positionLabelLong,
} from '../../lib/participation';
import { roleLabel } from '../../lib/roles';

/** Initialen als Rückfallebene, wenn keine Rückennummer hinterlegt ist. */
function initials(member) {
  return `${member.firstName?.[0] ?? ''}${member.lastName?.[0] ?? ''}`.toUpperCase();
}

/**
 * Eine Spielerkarte: Rückennummer (oder Initialen), Name, Position.
 *
 * Ein Profilbild gibt es bewusst noch nicht – dafür fehlt bislang sowohl die
 * Spalte als auch ein Upload. Der Trikot-Kreis mit der Rückennummer ist die
 * Rückfallebene und für eine Handball-Mannschaft ohnehin die Information,
 * nach der auf der Tribüne gesucht wird.
 *
 * @param {{ member: object }} props
 */
function PlayerCard({ member }) {
  const number = member.jerseyNumber;
  const position = positionLabel(member.position);

  return (
    <li className="player-card">
      <span
        className={`jersey ${number === null ? 'jersey--empty' : ''}`}
        aria-hidden="true"
      >
        {number ?? initials(member)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">
          {member.firstName} {member.lastName}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          {/* Nummer für Vorlesehilfen: der Trikot-Kreis ist aria-hidden. */}
          {number !== null && <span className="sr-only">Rückennummer {number}. </span>}
          {position ?? 'Position offen'}
        </span>
      </span>
    </li>
  );
}

/**
 * Bearbeitbare Zeile für die Kaderangaben einer Person (nur Verwaltung).
 *
 * Gespeichert wird pro Person mit einem Klick – kein Formular über den
 * gesamten Kader. So kann eine Trainerin zwischendurch eine Nummer ändern,
 * ohne alles andere anzufassen.
 *
 * @param {{ member: object, relationType: 'player'|'coach',
 *           busy: boolean, onSave: Function }} props
 */
function RosterEditRow({ member, relationType, busy, onSave }) {
  const [jerseyNumber, setJerseyNumber] = useState(
    member.jerseyNumber === null ? '' : String(member.jerseyNumber)
  );
  const [position, setPosition] = useState(member.position ?? '');
  const [staffTitle, setStaffTitle] = useState(member.staffTitle ?? '');

  const isPlayer = relationType === 'player';

  const changed = isPlayer
    ? jerseyNumber !== (member.jerseyNumber === null ? '' : String(member.jerseyNumber)) ||
      position !== (member.position ?? '')
    : staffTitle !== (member.staffTitle ?? '');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!changed) return;

    onSave(
      member.id,
      relationType,
      isPlayer
        ? {
            // Leeres Feld = Angabe entfernen (das Backend erlaubt null).
            jerseyNumber: jerseyNumber === '' ? null : Number(jerseyNumber),
            position: position === '' ? null : position,
          }
        : { staffTitle: staffTitle === '' ? null : staffTitle }
    );
  };

  return (
    <li className="px-4 py-3">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <span className="min-w-0 flex-1 basis-full truncate text-sm font-bold text-ink sm:basis-40">
          {member.firstName} {member.lastName}
        </span>

        {isPlayer ? (
          <>
            <label className="shrink-0">
              <span className="field-hint mt-0 block">Nummer</span>
              <input
                type="number"
                min="1"
                max="99"
                inputMode="numeric"
                value={jerseyNumber}
                disabled={busy}
                onChange={(event) => setJerseyNumber(event.target.value)}
                className="field-control-sm mt-1 w-20"
              />
            </label>

            <label className="min-w-0 flex-1">
              <span className="field-hint mt-0 block">Position</span>
              <select
                value={position}
                disabled={busy}
                onChange={(event) => setPosition(event.target.value)}
                className="field-control-sm mt-1 w-full"
              >
                <option value="">ohne Angabe</option>
                {POSITIONS.map((key) => (
                  <option key={key} value={key}>
                    {positionLabelLong(key)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label className="min-w-0 flex-1">
            <span className="field-hint mt-0 block">Bezeichnung</span>
            <input
              type="text"
              maxLength={60}
              placeholder="z. B. Co-Trainer"
              value={staffTitle}
              disabled={busy}
              onChange={(event) => setStaffTitle(event.target.value)}
              className="field-control-sm mt-1 w-full"
            />
          </label>
        )}

        <button
          type="submit"
          disabled={busy || !changed}
          className="btn btn-primary btn-sm shrink-0"
        >
          Speichern
        </button>
      </form>
    </li>
  );
}

/**
 * Kader einer Mannschaft: Trainer-/Betreuerstab und Spieler:innen.
 *
 * Die Trennung ist bewusst: Auf der Tribüne sucht man entweder „wer trainiert
 * die?" oder „wer trägt die 7?" – beides in einer Liste würde beides
 * erschweren.
 *
 * Der Positionsfilter erscheint nur, wenn er etwas bringt (mindestens zwei
 * verschiedene Positionen im Kader). Bei einer D-Jugend mit fünf Namen wäre
 * er nur zusätzliches Bedienelement ohne Nutzen.
 *
 * @param {{ players: object[], staff: object[],
 *           canManage?: boolean, busy?: boolean,
 *           onSaveDetails?: (userId:number, relationType:string,
 *                            fields:object) => void }} props
 */
export default function RosterSection({
  players = [],
  staff = [],
  canManage = false,
  busy = false,
  onSaveDetails,
}) {
  const [filter, setFilter] = useState('alle');
  const [editing, setEditing] = useState(false);

  // Anzahl je Position – dient sowohl den Filter-Chips als auch der
  // Entscheidung, ob der Filter überhaupt angezeigt wird.
  const counts = useMemo(() => {
    const result = {};
    for (const player of players) {
      if (player.position) {
        result[player.position] = (result[player.position] ?? 0) + 1;
      }
    }
    return result;
  }, [players]);

  const usedPositions = POSITIONS.filter((key) => counts[key] > 0);
  const showFilter = usedPositions.length > 1;

  const visiblePlayers =
    filter === 'alle'
      ? players
      : players.filter((player) => player.position === filter);

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------ Trainer / Betreuer */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">Trainer &amp; Betreuer</h2>
          <span className="text-sm text-ink-muted">{staff.length}</span>
        </div>

        {staff.length === 0 ? (
          <p className="card-note mt-3">
            Für diese Mannschaft ist noch kein Trainerstab eingetragen.
          </p>
        ) : (
          <ul className="list-panel mt-3">
            {editing
              ? staff.map((member) => (
                  <RosterEditRow
                    key={`staff-edit-${member.id}`}
                    member={member}
                    relationType="coach"
                    busy={busy}
                    onSave={onSaveDetails}
                  />
                ))
              : staff.map((member) => (
                  <li
                    key={`staff-${member.id}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span className="avatar h-10 w-10 text-sm" aria-hidden="true">
                      {initials(member)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">
                        {member.firstName} {member.lastName}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {member.staffTitle ?? 'Trainer:in'}
                      </span>
                    </span>
                    {member.email && (
                      <a
                        href={`mailto:${member.email}`}
                        className="link shrink-0 text-xs"
                      >
                        E-Mail
                      </a>
                    )}
                  </li>
                ))}
          </ul>
        )}
      </section>

      {/* -------------------------------------------------------- Spieler */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">Spieler:innen</h2>
          <span className="text-sm text-ink-muted">{players.length}</span>
        </div>

        {canManage && (players.length > 0 || staff.length > 0) && (
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="btn btn-outline btn-sm mt-3"
          >
            {editing ? 'Bearbeiten beenden' : 'Kaderangaben bearbeiten'}
          </button>
        )}

        {showFilter && !editing && (
          <div
            role="group"
            aria-label="Nach Position filtern"
            className="mt-3 flex flex-wrap gap-2"
          >
            <button
              type="button"
              onClick={() => setFilter('alle')}
              aria-pressed={filter === 'alle'}
              className={`chip chip-sm ${filter === 'alle' ? 'chip-active' : ''}`}
            >
              Alle {players.length}
            </button>
            {usedPositions.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`chip chip-sm ${filter === key ? 'chip-active' : ''}`}
              >
                {positionLabel(key)} {counts[key]}
              </button>
            ))}
          </div>
        )}

        {players.length === 0 ? (
          <p className="card-note mt-3">
            Für diese Mannschaft ist noch kein Kader eingetragen.
          </p>
        ) : editing ? (
          <ul className="list-panel mt-3">
            {players.map((member) => (
              <RosterEditRow
                key={`player-edit-${member.id}`}
                member={member}
                relationType="player"
                busy={busy}
                onSave={onSaveDetails}
              />
            ))}
          </ul>
        ) : visiblePlayers.length === 0 ? (
          <p className="card-note mt-3">
            Auf dieser Position ist niemand eingetragen.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePlayers.map((member) => (
              <PlayerCard key={`player-${member.id}`} member={member} />
            ))}
          </ul>
        )}

        {/* Rollen-Hinweis nur für die Verwaltung: Fans interessiert die
            App-Rolle nicht, Trainer:innen schon (wer darf was). */}
        {canManage && !editing && visiblePlayers.length > 0 && (
          <p className="field-hint">
            App-Rollen: {[...new Set(visiblePlayers.map((m) => roleLabel(m.role)))].join(', ')}
          </p>
        )}
      </section>
    </div>
  );
}
