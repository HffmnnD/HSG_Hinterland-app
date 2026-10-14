import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTeams } from '../../hooks/useTeams';
import { PARTICIPATION_OPTIONS } from '../../lib/participation';
import Brand from '../Brand';
import ThemeChoice from '../ThemeChoice';
import ProfileForm from '../account/ProfileForm';
import TeamChoice from './TeamChoice';

/**
 * Onboarding beim ersten Login: Was machst du im Verein, welche Mannschaften
 * betrifft das, und wie soll die App aussehen?
 *
 * ── Warum ein Assistent und nicht ein Formular ──────────────────────────────
 * Genau diese Angaben standen früher im Registrierungsformular – gemeinsam mit
 * Name, E-Mail und Passwort, auf einer Seite, vor dem ersten Blick in die App.
 * Hier sind es drei Schritte mit je einer Frage, und jeder lässt sich
 * überspringen: Wer nur zuschauen will, ist nach zwei Klicks fertig.
 *
 * ── Was gespeichert wird ────────────────────────────────────────────────────
 * Am Ende genau EIN Aufruf (POST /api/auth/me/onboarding) mit Mannschaftswahl
 * und Design. Erst dann gilt das Onboarding als erledigt – bricht jemand ab
 * oder lädt die Seite neu, beginnt es wieder, statt halbe Angaben zu hinterlassen.
 *
 * Spieler:in- und Trainer:in-Zuordnungen sind Anfragen: Bestätigen muss sie
 * das Trainerteam der Mannschaft (siehe teamRepository.initialConfirmation).
 * Die Zuschauer-Zuordnung gilt sofort – sie steuert nur, wessen Spieltermine
 * jemand angezeigt bekommt.
 */

const STEPS = [
  { key: 'rollen', label: 'Deine Rolle' },
  { key: 'mannschaften', label: 'Mannschaften' },
  { key: 'profil', label: 'Profil' },
  { key: 'design', label: 'Design' },
];

const EMPTY_SELECTION = { player: [], coach: [], fan: [] };

export default function OnboardingWizard() {
  const { user, completeOnboarding } = useAuth();
  const { theme: activeTheme, setTheme } = useTheme();
  const { teams, loading: teamsLoading, error: teamsError } = useTeams();

  const [stepIndex, setStepIndex] = useState(0);
  // Gewählte Beteiligungen als Menge von Beziehungstypen ('player' | 'coach' | 'fan').
  const [roles, setRoles] = useState(() => new Set());
  // Mannschaften je Beziehungstyp.
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  // Das Design wird sofort angewandt (man will es sehen), aber erst am Ende
  // zusammen mit allem anderen gespeichert.
  const [theme, setThemeChoice] = useState(activeTheme);
  // Die Telefonnummer reicht der letzte Schritt mit ein; das Profilbild lädt
  // <ProfileForm> sofort hoch (siehe dort).
  const [phone, setPhone] = useState(user?.phone ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const activeRoles = useMemo(
    () => PARTICIPATION_OPTIONS.filter((option) => roles.has(option.relationType)),
    [roles]
  );

  const toggleRole = (relationType) => {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(relationType)) next.delete(relationType);
      else next.add(relationType);
      return next;
    });
    setError(null);
  };

  const toggleTeam = (relationType, teamId) => {
    setSelection((prev) => {
      const ids = new Set(prev[relationType]);
      if (ids.has(teamId)) ids.delete(teamId);
      else ids.add(teamId);
      return { ...prev, [relationType]: [...ids] };
    });
  };

  const chooseTheme = (next) => {
    setThemeChoice(next);
    // Sofort anwenden, damit die Wahl sichtbar ist. Gespeichert wird sie am
    // Ende – `setTheme` schreibt sie zwar auch ins Profil, das ist hier aber
    // nur eine Vorschau und stört nicht.
    setTheme(next);
  };

  // Relationen für den Server: nur Mannschaften zu tatsächlich gewählten Rollen.
  const relations = useMemo(
    () =>
      activeRoles.flatMap((option) =>
        selection[option.relationType].map((teamId) => ({
          teamId,
          relationType: option.relationType,
        }))
      ),
    [activeRoles, selection]
  );

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const goBack = () => setStepIndex((index) => Math.max(0, index - 1));

  const goNext = () => {
    if (step.key === 'rollen' && roles.size === 0) {
      setError('Bitte wähle mindestens eine Möglichkeit.');
      return;
    }
    setError(null);
    setStepIndex((index) => Math.min(STEPS.length - 1, index + 1));
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await completeOnboarding({
      theme,
      phone: phone.trim(),
      teams: relations,
    });
    if (!result.success) {
      setError(result.message);
      setSaving(false);
      return;
    }
    // Erfolg: `user.onboardingCompleted` ist jetzt gesetzt, die App zeigt von
    // selbst die Startseite. Kein setState danach – die Komponente verschwindet.
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">
      <div className="brand-ribbon" />

      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-4">
          <Brand />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        <h1 className="page-title">
          Willkommen{user?.firstName ? `, ${user.firstName}` : ''}!
        </h1>

        {/* Fortschritt: drei Schritte, keine Prozentzahl – bei drei Schritten
            sagt „Schritt 2 von 3" mehr als ein Balken. */}
        <ol className="mt-6 flex items-center gap-2" aria-label="Fortschritt">
          {STEPS.map((entry, index) => {
            const done = index < stepIndex;
            const current = index === stepIndex;
            return (
              <li key={entry.key} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold leading-none ${
                    done || current
                      ? 'bg-hsg-green text-white'
                      : 'border border-line-strong bg-paper text-ink-muted'
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Check size={13} strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={`truncate font-display text-xs font-semibold uppercase tracking-[0.06em] ${
                    current ? 'text-ink' : 'text-ink-muted'
                  }`}
                  aria-current={current ? 'step' : undefined}
                >
                  {entry.label}
                </span>
              </li>
            );
          })}
        </ol>

        {error && (
          <div role="alert" className="alert alert-error mt-4">
            {error}
          </div>
        )}
        {teamsError && (
          <div role="alert" className="alert alert-error mt-4">
            {teamsError}
          </div>
        )}

        <section className="card mt-4">
          {/* ------------------------------------------------- 1. Rollen */}
          {step.key === 'rollen' && (
            <>
              <h2 className="section-title text-base">
                Wie machst du im Verein mit?
              </h2>

              <div className="mt-4 space-y-2">
                {PARTICIPATION_OPTIONS.map((option) => {
                  const active = roles.has(option.relationType);
                  return (
                    <label
                      key={option.relationType}
                      htmlFor={`role-${option.relationType}`}
                      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border p-3.5 transition-colors ${
                        active
                          ? 'border-hsg-green bg-hsg-green-soft'
                          : 'border-line bg-paper hover:border-hsg-green'
                      }`}
                    >
                      <input
                        id={`role-${option.relationType}`}
                        type="checkbox"
                        className="sr-only"
                        checked={active}
                        onChange={() => toggleRole(option.relationType)}
                      />
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                          active
                            ? 'border-hsg-green bg-hsg-green text-white'
                            : 'border-line-strong bg-paper'
                        }`}
                      >
                        {active && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="font-display text-sm font-bold uppercase tracking-[0.03em] text-ink">
                        {option.question}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {/* ------------------------------------------ 2. Mannschaften */}
          {step.key === 'mannschaften' && (
            <>
              <h2 className="section-title text-base">Welche Mannschaften?</h2>

              {teamsLoading ? (
                <p className="mt-4 text-sm text-ink-muted">
                  Mannschaften werden geladen …
                </p>
              ) : (
                <div className="mt-4 space-y-6">
                  {activeRoles.map((option) => (
                    <div key={option.relationType}>
                      <h3 className="field-label">{option.teamPrompt}</h3>
                      <TeamChoice
                        teams={teams}
                        selectedIds={selection[option.relationType]}
                        onToggle={(teamId) =>
                          toggleTeam(option.relationType, teamId)
                        }
                        idPrefix={`onboarding-${option.relationType}`}
                      />
                    </div>
                  ))}

                </div>
              )}
            </>
          )}

          {/* ------------------------------------------------- 3. Profil */}
          {step.key === 'profil' && (
            <>
              <h2 className="section-title text-base">Profil</h2>

              <div className="mt-4">
                <ProfileForm phone={phone} onPhoneChange={setPhone} />
              </div>
            </>
          )}

          {/* ------------------------------------------------- 4. Design */}
          {step.key === 'design' && (
            <>
              <h2 className="section-title text-base">Design</h2>

              <div className="mt-4">
                <ThemeChoice value={theme} onChange={chooseTheme} />
              </div>

            </>
          )}
        </section>

        {/* Navigation. „Weiter" bleibt rechts, „Zurück" links – auch im letzten
            Schritt, damit der Abschluss-Knopf dort sitzt, wo vorher „Weiter"
            war. */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0 || saving}
            className="btn btn-ghost btn-sm"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Zurück
          </button>

          {isLastStep ? (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Speichert …' : 'Fertig'}
            </button>
          ) : (
            <button type="button" onClick={goNext} className="btn btn-primary">
              Weiter
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
