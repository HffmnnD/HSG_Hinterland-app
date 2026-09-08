import { useState } from 'react';

import { useAuth } from '../../context/AuthContext';
import { useTeams } from '../../hooks/useTeams';
import {
  IMPLIES,
  PARTICIPATION_OPTIONS,
  SERVICE_TYPES,
  serviceLabel,
} from '../../lib/participation';
import TeamSelect from '../TeamSelect';
import Alert from './Alert';
import TextField from './TextField';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
};
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

// Welche Team-Auswahl gehört zu welcher Beteiligung?
const TEAM_SECTIONS = [
  {
    participation: 'spieler',
    relationType: 'player',
    label: 'In welchen Mannschaften spielst du?',
  },
  {
    participation: 'trainer',
    relationType: 'coach',
    label: 'Welche Mannschaften trainierst du?',
  },
  {
    participation: 'zuschauer',
    relationType: 'fan',
    label: 'Welche Mannschaften interessieren dich?',
  },
];

export default function RegisterForm({ onSwitchToLogin }) {
  const { register, error, clearError } = useAuth();
  const { teams, loading: teamsLoading } = useTeams();

  const [form, setForm] = useState(EMPTY_FORM);
  const [participation, setParticipation] = useState(() => new Set());
  // Team-IDs je Beziehungstyp
  const [teamsByRelation, setTeamsByRelation] = useState({
    player: [],
    coach: [],
    fan: [],
  });
  const [services, setServices] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  // Client-seitige Validierung, getrennt vom Server-Fehler aus dem Context.
  const [validationError, setValidationError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const resetErrors = () => {
    setValidationError(null);
    clearError();
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    resetErrors();
  };

  // „Mitwirkende:r“ aktiviert „Zuschauer:in“ automatisch mit; solange
  // Mitwirkende:r aktiv ist, lässt sich Zuschauer:in nicht abwählen.
  const isLockedOn = (key) =>
    Object.entries(IMPLIES).some(
      ([source, implied]) => participation.has(source) && implied.includes(key)
    );

  const toggleParticipation = (key) => {
    setParticipation((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (isLockedOn(key)) return prev; // erzwungen – nicht abwählbar
        next.delete(key);
      } else {
        next.add(key);
        for (const implied of IMPLIES[key] ?? []) next.add(implied);
      }
      return next;
    });
    resetErrors();
  };

  const toggleTeam = (relationType, teamId) => {
    setTeamsByRelation((prev) => {
      const set = new Set(prev[relationType]);
      if (set.has(teamId)) set.delete(teamId);
      else set.add(teamId);
      return { ...prev, [relationType]: [...set] };
    });
    resetErrors();
  };

  const toggleService = (service) => {
    setServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service]
    );
    resetErrors();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setValidationError(
        `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`
      );
      return;
    }
    if (form.password.length > MAX_PASSWORD_LENGTH) {
      setValidationError(
        `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen lang sein.`
      );
      return;
    }
    if (participation.size === 0) {
      setValidationError(
        'Bitte wähle mindestens aus, wie du im Verein mitmachst.'
      );
      return;
    }
    if (participation.has('mitwirkender') && services.length === 0) {
      setValidationError(
        'Bitte wähle mindestens einen Helferdienst aus.'
      );
      return;
    }

    // Nur Teams der tatsächlich aktiven Beteiligungen übernehmen.
    const selectedTeams = TEAM_SECTIONS.filter((section) =>
      participation.has(section.participation)
    ).flatMap((section) =>
      teamsByRelation[section.relationType].map((teamId) => ({
        teamId,
        relationType: section.relationType,
      }))
    );

    setSubmitting(true);
    try {
      const res = await register({
        ...form,
        teams: selectedTeams,
        services: participation.has('mitwirkender') ? services : [],
      });
      if (res.success) {
        setSuccessMessage(
          res.message ||
            'Registrierung erfolgreich. Dein Konto muss noch von einem Admin freigegeben werden.'
        );
        setForm(EMPTY_FORM);
        setParticipation(new Set());
        setTeamsByRelation({ player: [], coach: [], fan: [] });
        setServices([]);
      }
      // Fehlerfall: Meldung steht in `error` aus dem AuthContext.
    } finally {
      setSubmitting(false);
    }
  };

  const shownError = validationError || error?.message;

  // Erfolgs-Ansicht: Hinweis auf die notwendige Admin-Freischaltung.
  if (successMessage) {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          <p className="font-semibold">Registrierung erfolgreich!</p>
          <p className="mt-1">{successMessage}</p>
        </Alert>

        <p className="text-sm text-slate-400">
          Dein Konto ist angelegt, aber noch <strong>nicht freigeschaltet</strong>.
          Ein Admin prüft deine Angaben, gibt das Konto frei und vergibt deine
          endgültige Rolle. Danach kannst du dich anmelden.
        </p>

        <button
          type="button"
          onClick={onSwitchToLogin}
          className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        >
          Zurück zur Anmeldung
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <h2 className="text-lg font-semibold text-white">Registrieren</h2>
        <p className="mt-0.5 text-sm text-slate-400">
          Erstelle ein neues Vereinskonto.
        </p>
      </div>

      {shownError && <Alert variant="error">{shownError}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Vorname"
          id="register-firstName"
          name="firstName"
          autoComplete="given-name"
          required
          maxLength={100}
          value={form.firstName}
          onChange={handleChange}
          placeholder="Max"
          disabled={submitting}
        />
        <TextField
          label="Nachname"
          id="register-lastName"
          name="lastName"
          autoComplete="family-name"
          required
          maxLength={100}
          value={form.lastName}
          onChange={handleChange}
          placeholder="Muster"
          disabled={submitting}
        />
      </div>

      <TextField
        label="E-Mail"
        id="register-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={255}
        value={form.email}
        onChange={handleChange}
        placeholder="name@example.com"
        disabled={submitting}
      />

      <TextField
        label="Passwort"
        id="register-password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        value={form.password}
        onChange={handleChange}
        placeholder="Mindestens 8 Zeichen"
        disabled={submitting}
      />

      {/* Beteiligung im Verein */}
      <fieldset className="rounded-xl border border-slate-800 p-4">
        <legend className="px-1 text-sm font-medium text-slate-300">
          Wie machst du mit?
        </legend>

        <div className="space-y-2">
          {PARTICIPATION_OPTIONS.map((option) => {
            const checked = participation.has(option.key);
            const locked = checked && isLockedOn(option.key);
            return (
              <label
                key={option.key}
                className={`flex gap-3 rounded-lg p-2 transition ${
                  locked ? 'opacity-80' : 'cursor-pointer hover:bg-slate-800/50'
                }`}
              >
                <input
                  type="checkbox"
                  id={`participation-${option.key}`}
                  checked={checked}
                  disabled={submitting || locked}
                  onChange={() => toggleParticipation(option.key)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-100">
                    {option.label}
                  </span>
                  {locked && (
                    <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                      automatisch
                    </span>
                  )}
                  <span className="block text-xs text-slate-500">
                    {option.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Helferdienste – nur für Mitwirkende */}
      {participation.has('mitwirkender') && (
        <fieldset className="rounded-xl border border-slate-800 p-4">
          <legend className="px-1 text-sm font-medium text-slate-300">
            Helferdienste
          </legend>
          <div className="space-y-2">
            {SERVICE_TYPES.map((service) => (
              <label
                key={service}
                className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition hover:bg-slate-800/50"
              >
                <input
                  type="checkbox"
                  id={`service-${service}`}
                  checked={services.includes(service)}
                  disabled={submitting}
                  onChange={() => toggleService(service)}
                  className="h-4 w-4 shrink-0 accent-emerald-500"
                />
                <span className="text-sm text-slate-100">
                  {serviceLabel(service)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Mannschaftsauswahl je nach Beteiligung */}
      {TEAM_SECTIONS.filter((section) =>
        participation.has(section.participation)
      ).map((section) => (
        <div key={section.relationType}>
          <span className="mb-1.5 block text-sm font-medium text-slate-300">
            {section.label}
          </span>
          {teamsLoading ? (
            <p className="text-xs text-slate-500">
              Mannschaften werden geladen …
            </p>
          ) : (
            <TeamSelect
              teams={teams}
              selectedIds={teamsByRelation[section.relationType]}
              onToggle={(teamId) => toggleTeam(section.relationType, teamId)}
              disabled={submitting}
            />
          )}
        </div>
      ))}

      <p className="text-xs text-slate-500">
        Deine Angaben helfen bei der Zuordnung. Die endgültige Rolle vergibt ein
        Admin bei der Freischaltung.
      </p>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Konto wird erstellt …' : 'Konto erstellen'}
      </button>

      <p className="text-center text-sm text-slate-400">
        Bereits registriert?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Zur Anmeldung
        </button>
      </p>
    </form>
  );
}
