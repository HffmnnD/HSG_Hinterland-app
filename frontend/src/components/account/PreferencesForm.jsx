import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useTeams } from '../../hooks/useTeams';
import { PARTICIPATION_OPTIONS } from '../../lib/participation';
import TeamChoice from '../onboarding/TeamChoice';

/**
 * Nachträgliche Änderung der Onboarding-Angaben: Beteiligung und
 * Mannschaftszuordnung.
 *
 * Genau dieselben Fragen wie im Assistenten und dieselbe Auswahl
 * (<TeamChoice>) – wer sie einmal beantwortet hat, soll sie hier wiedererkennen
 * statt eine zweite Darstellung derselben Sache zu lernen.
 *
 * ── Was beim Speichern passiert ─────────────────────────────────────────────
 * Geschickt wird die VOLLSTÄNDIGE neue Wahl. Der Server gleicht sie mit dem
 * Bestand ab (teamRepository.replaceSelfRelations): Bestehendes bleibt samt
 * Bestätigung und Rückennummer erhalten, Abgewähltes wird entfernt, Neues ist
 * eine Anfrage an das Trainerteam – bei „Zuschauer:in" gilt es sofort.
 */
export default function PreferencesForm() {
  const { teams: myTeams, updatePreferences } = useAuth();
  const { teams: allTeams, loading: teamsLoading } = useTeams();

  // Startwerte aus dem Profil. `useState`-Initialisierer statt Effekt: Der
  // Bestand ist beim ersten Rendern bereits bekannt (er steckt im Profil),
  // und ein Effekt würde jede Eingabe wieder überschreiben.
  const [selection, setSelection] = useState(() => ({
    player: idsFor(myTeams, 'player'),
    coach: idsFor(myTeams, 'coach'),
    fan: idsFor(myTeams, 'fan'),
  }));

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const relations = useMemo(
    () =>
      PARTICIPATION_OPTIONS.flatMap((option) =>
        selection[option.relationType].map((teamId) => ({
          teamId,
          relationType: option.relationType,
        }))
      ),
    [selection]
  );

  // Hat sich gegenüber dem Profil etwas geändert? Ohne diesen Vergleich stünde
  // der Speichern-Knopf immer aktiv da und man wüsste nie, ob noch etwas offen ist.
  const dirty = useMemo(() => {
    const before = new Set(
      myTeams.map((team) => `${team.id}:${team.relationType}`)
    );
    const after = new Set(
      relations.map((rel) => `${rel.teamId}:${rel.relationType}`)
    );
    if (before.size !== after.size) return true;
    return [...after].some((key) => !before.has(key));
  }, [myTeams, relations]);

  const toggleTeam = (relationType, teamId) => {
    setSelection((prev) => {
      const ids = new Set(prev[relationType]);
      if (ids.has(teamId)) ids.delete(teamId);
      else ids.add(teamId);
      return { ...prev, [relationType]: [...ids] };
    });
    setNotice(null);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving || !dirty) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    const result = await updatePreferences({ teams: relations });
    if (result.success) setNotice(result.message ?? 'Einstellungen gespeichert.');
    else setError(result.message);

    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success">
          <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {teamsLoading ? (
        <p className="text-sm text-ink-muted">Mannschaften werden geladen …</p>
      ) : (
        PARTICIPATION_OPTIONS.map((option) => (
          <fieldset key={option.relationType}>
            <legend className="field-label">{option.teamPrompt}</legend>
            {option.needsConfirmation && (
              <p className="field-hint mb-2">
                Neue Zuordnungen bestätigt das Trainerteam der Mannschaft.
              </p>
            )}
            <TeamChoice
              teams={allTeams}
              selectedIds={selection[option.relationType]}
              onToggle={(teamId) => toggleTeam(option.relationType, teamId)}
              disabled={saving}
              idPrefix={`pref-${option.relationType}`}
            />
          </fieldset>
        ))
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          type="submit"
          disabled={saving || !dirty}
          className="btn btn-primary btn-sm"
        >
          {saving ? 'Wird gespeichert …' : 'Zuordnungen speichern'}
        </button>
        {dirty && !saving && (
          <span className="text-xs text-ink-muted">
            Es gibt ungespeicherte Änderungen.
          </span>
        )}
      </div>
    </form>
  );
}

/** Team-IDs des Profils zu einem Beziehungstyp. */
function idsFor(teams, relationType) {
  return teams
    .filter((team) => team.relationType === relationType)
    .map((team) => team.id);
}
