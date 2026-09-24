import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Crop, Mail, Phone, Trash2, UserMinus } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { relationLabel, relationLabelPlural } from '../../lib/participation';
import { roleLabel } from '../../lib/roles';
import Avatar from '../ui/Avatar';
// Der Ausschnitt-Dialog wird selten gebraucht (nur Administration, nur beim
// Wechsel eines Fotos) – deshalb erst beim Öffnen nachladen.
const PhotoFrameDialog = lazy(() => import('./PhotoFrameDialog'));

// Reihenfolge im Auswahlfeld „Mitglied hinzufügen" (häufigster Fall zuerst).
//
// `fan` steht hier BEWUSST nicht mehr: Wer eine Mannschaft verfolgen möchte,
// stellt das selbst unter „Mein Konto" ein. Die Zuordnung steuert nur, wessen
// Spieltermine jemand angezeigt bekommt – sie ist keine Kadereigenschaft und
// nichts, was ein Trainerteam pflegen müsste.
const ADD_RELATIONS = ['player', 'coach'];
// Kader-Abschnitte in der Entfernen-Liste (aus demselben Grund ohne `fan`).
const SECTIONS = ['coach', 'player'];

/**
 * Verwaltungsbereich der Mannschaftsseite – nur für Trainer:innen dieser
 * Mannschaft und Administrator:innen sichtbar.
 *
 * Bewusst in einem eigenen Reiter und nicht zwischen den Fan-Inhalten: Wer
 * die Seite als Zuschauer:in öffnet, soll Kader und Spielplan sehen, nicht
 * Formulare. Die Berechtigung prüft ohnehin das Backend – dieses Bauteil
 * blendet nur aus, was ohne Rechte ohnehin scheitern würde.
 *
 * @param {{ code: string,
 *           team: object,
 *           isAdmin?: boolean,
 *           pendingMembers?: object[],
 *           members?: { player:object[], coach:object[] },
 *           busy?: boolean,
 *           onRun: (action: () => Promise<any>, fallback?: string) => Promise<void>,
 *           reloadToken?: unknown }} props
 *   `reloadToken` ändert sich nach jeder Aktion – daran hängt das Nachladen
 *   der Kandidatenliste.
 */
export default function TeamManagePanel({
  code,
  team,
  isAdmin = false,
  pendingMembers = [],
  members = { player: [], coach: [] },
  busy = false,
  onRun,
  reloadToken,
}) {
  // Formular „Mitglied hinzufügen"
  const [candidates, setCandidates] = useState([]);
  const [addRelation, setAddRelation] = useState('player');
  const [addUserId, setAddUserId] = useState('');

  // Stammdaten (nur Administration)
  const [handballTeamId, setHandballTeamId] = useState(team.handballTeamId ?? '');
  const photoInputRef = useRef(null);
  // Dialog für den Bildausschnitt des Kopfbereichs.
  const [frameOpen, setFrameOpen] = useState(false);

  // Kandidatenliste für den gewählten Beziehungstyp nachladen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch(
          `/api/teams/${encodeURIComponent(code)}/candidates?relationType=${addRelation}`
        );
        if (!cancelled) {
          setCandidates(result?.candidates ?? []);
          setAddUserId('');
        }
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, addRelation, reloadToken]);

  const handleAdd = (event) => {
    event.preventDefault();
    if (!addUserId) return;
    onRun(
      () =>
        apiFetch(`/api/teams/${encodeURIComponent(code)}/members`, {
          method: 'POST',
          body: JSON.stringify({
            userId: Number(addUserId),
            relationType: addRelation,
          }),
        }),
      'Mitglied hinzugefügt.'
    );
  };

  const handleConfirm = (userId, relationType, name) =>
    onRun(
      () =>
        apiFetch(
          `/api/teams/${encodeURIComponent(code)}/members/${userId}/confirm?relationType=${relationType}`,
          { method: 'POST' }
        ),
      `${name} bestätigt.`
    );

  const handleRemove = (userId, relationType, name, rejected = false) =>
    onRun(
      () =>
        apiFetch(
          `/api/teams/${encodeURIComponent(code)}/members/${userId}?relationType=${relationType}`,
          { method: 'DELETE' }
        ),
      rejected ? `Anfrage von ${name} abgelehnt.` : `${name} entfernt.`
    );

  const handleSaveTeamData = (event) => {
    event.preventDefault();
    onRun(
      () =>
        apiFetch(`/api/teams/${encodeURIComponent(code)}`, {
          method: 'PATCH',
          body: JSON.stringify({ handballTeamId: handballTeamId.trim() }),
        }),
      'Ligaverknüpfung gespeichert.'
    );
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append('photo', file);
    const result = await onRun(
      () =>
        apiFetch(`/api/teams/${encodeURIComponent(code)}/photo`, {
          method: 'POST',
          body: form,
        }),
      'Mannschaftsfoto gespeichert.'
    );
    // Damit dieselbe Datei erneut gewählt werden kann.
    if (photoInputRef.current) photoInputRef.current.value = '';

    // Direkt nach dem Hochladen den Ausschnitt anbieten: Ein frisches Foto
    // sitzt mittig, und genau dabei fehlen auf einem breiten Streifen fast
    // immer die Köpfe. Wer nichts ändern will, schließt den Dialog.
    if (result) setFrameOpen(true);
  };

  const handlePhotoDelete = () =>
    onRun(
      () =>
        apiFetch(`/api/teams/${encodeURIComponent(code)}/photo`, {
          method: 'DELETE',
        }),
      'Mannschaftsfoto entfernt.'
    );

  return (
    <div className="space-y-6">
      {/* ------------------------------------------- Offene Beitrittsanfragen */}
      {pendingMembers.length > 0 && (
        <section className="card-warn">
          <h2 className="section-title flex items-center gap-2 text-base">
            Offene Beitrittsanfragen
            <span className="badge badge-pending">{pendingMembers.length}</span>
          </h2>
          <ul className="list-panel mt-3">
            {pendingMembers.map((member) => {
              const name = `${member.firstName} ${member.lastName}`;
              return (
                <li
                  key={`pending-${member.id}-${member.relationType}`}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <span className="font-bold text-ink">{name}</span>
                    <span className="ml-2 text-ink-muted">
                      möchte als {relationLabel(member.relationType)} beitreten
                    </span>
                    {member.email && (
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
                        {member.email}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleConfirm(member.id, member.relationType, name)
                      }
                      className="btn btn-primary btn-sm"
                    >
                      Bestätigen
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleRemove(member.id, member.relationType, name, true)
                      }
                      className="btn btn-danger btn-sm"
                    >
                      Ablehnen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------ Mitglied hinzufügen */}
      <form onSubmit={handleAdd} className="card-accent">
        <h2 className="section-title text-base">Mitglied hinzufügen</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={addRelation}
            onChange={(event) => setAddRelation(event.target.value)}
            disabled={busy}
            aria-label="Rolle in der Mannschaft"
            className="field-control-sm sm:w-auto"
          >
            {ADD_RELATIONS.map((relation) => (
              <option key={relation} value={relation}>
                {relationLabelPlural(relation)}
              </option>
            ))}
          </select>

          <select
            value={addUserId}
            onChange={(event) => setAddUserId(event.target.value)}
            disabled={busy || candidates.length === 0}
            aria-label="Mitglied auswählen"
            className="field-control-sm min-w-0 flex-1"
          >
            <option value="">
              {candidates.length === 0
                ? 'Keine passenden Mitglieder'
                : 'Mitglied wählen …'}
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.firstName} {candidate.lastName} ({roleLabel(candidate.role)})
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={busy || !addUserId}
            className="btn btn-primary btn-sm btn-block sm:w-auto"
          >
            Hinzufügen
          </button>
        </div>
        <p className="field-hint">
          Manuell hinzugefügte Mitglieder sind sofort bestätigt.
        </p>
      </form>

      {/* --------------------------------------------- Zuordnungen verwalten */}
      {/* Eine Zeile je Person: Bild, Name mit Rückennummer, darunter die
          Kontaktdaten. Wer in einer zweiten Mannschaft mitspielt, wird dort
          über „Mitglied hinzufügen" eingetragen. */}
      {SECTIONS.map((relation) =>
        members[relation].length === 0 ? null : (
          <section key={relation}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="eyebrow">{relationLabelPlural(relation)}</h2>
              <span className="text-xs text-ink-muted">
                {members[relation].length}
              </span>
            </div>

            <ul className="list-panel mt-2">
              {members[relation].map((member) => {
                const name = `${member.firstName} ${member.lastName}`;
                return (
                  <li
                    key={`${relation}-${member.id}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Avatar person={member} size="md" />

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-bold text-ink">
                        {member.jerseyNumber !== null && (
                          <span className="tag shrink-0 tabular-nums">
                            {member.jerseyNumber}
                          </span>
                        )}
                        <span className="truncate">{name}</span>
                      </p>

                      <div className="mt-0.5 space-y-0.5 text-xs text-ink-muted">
                        {member.email && (
                          <a
                            href={`mailto:${member.email}`}
                            className="flex items-center gap-1.5 truncate hover:text-hsg-green-dark"
                          >
                            <Mail size={12} aria-hidden="true" className="shrink-0" />
                            <span className="truncate">{member.email}</span>
                          </a>
                        )}
                        {member.phone && (
                          <a
                            href={`tel:${member.phone.replace(/[^0-9+]/g, '')}`}
                            className="flex items-center gap-1.5 truncate hover:text-hsg-green-dark"
                          >
                            <Phone size={12} aria-hidden="true" className="shrink-0" />
                            <span className="truncate">{member.phone}</span>
                          </a>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRemove(member.id, relation, name)}
                      className="btn btn-danger btn-sm shrink-0"
                      title={`${name} aus der Mannschaft entfernen`}
                    >
                      <UserMinus size={14} aria-hidden="true" />
                      <span className="sr-only sm:not-sr-only">Entfernen</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      )}

      {/* ------------------------------------- Stammdaten (nur Administration) */}
      {isAdmin && (
        <section className="card">
          <h2 className="section-title text-base">Stammdaten der Mannschaft</h2>

          <form onSubmit={handleSaveTeamData} className="mt-3">
            <label htmlFor="handball-team-id" className="field-label">
              nuLiga-Nummer
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="handball-team-id"
                type="text"
                inputMode="numeric"
                value={handballTeamId}
                disabled={busy}
                placeholder="z. B. 2086554"
                onChange={(event) => setHandballTeamId(event.target.value)}
                className="field-control min-w-0 flex-1"
              />
              <button
                type="submit"
                disabled={busy}
                className="btn btn-primary btn-sm sm:w-auto"
              >
                Speichern
              </button>
            </div>
            <p className="field-hint">
              Die Zahl aus der Adresse der Mannschaftsseite auf
              hhv-handball.liga.nu (<code>…teamPortrait?teamtable=2086554</code>).
              Sie steuert Tabelle, Spielplan und Live-Ticker. Leer lassen, wenn
              die Mannschaft keine Ligaspiele bestreitet.
            </p>
          </form>

          <div className="mt-5 border-t border-line pt-4">
            <p className="field-label">Mannschaftsfoto</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={busy}
                onChange={handlePhotoChange}
                aria-label="Mannschaftsfoto auswählen"
                className="field-control-sm min-w-0 flex-1 py-2"
              />
              {team.photoUrl && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setFrameOpen(true)}
                    className="btn btn-outline btn-sm"
                  >
                    <Crop size={14} aria-hidden="true" />
                    Ausschnitt
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handlePhotoDelete}
                    className="btn btn-danger btn-sm"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Entfernen
                  </button>
                </div>
              )}
            </div>
            <p className="field-hint">
              Querformat wirkt im Kopfbereich am besten. JPG, PNG, WEBP oder
              GIF, höchstens 5 MB. Nach dem Hochladen lässt sich der Ausschnitt
              verschieben und heranzoomen, damit keine Köpfe abgeschnitten
              werden.
            </p>
          </div>
        </section>
      )}

      {frameOpen && team.photoUrl && (
        <Suspense fallback={null}>
          <PhotoFrameDialog
            code={code}
            team={team}
            onClose={() => setFrameOpen(false)}
            onSaved={(_, message) => {
              setFrameOpen(false);
              // Über onRun statt eines eigenen Zustands: So lädt die
              // Mannschaftsseite neu und zeigt den neuen Ausschnitt sofort im
              // echten Kopfbereich – mit derselben Erfolgsmeldung wie jede
              // andere Verwaltungsaktion.
              onRun(async () => ({ message }), message);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
