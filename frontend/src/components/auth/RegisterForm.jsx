import { useState } from 'react';

import { useAuth } from '../../context/AuthContext';
import Alert from './Alert';
import TextField from './TextField';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
};

// Muss zu MIN_/MAX_PASSWORD_LENGTH in backend/utils/validation.js passen.
// Die Prüfung hier ersetzt die des Servers nicht – sie erspart nur die Runde
// über das Netz, wenn das Passwort offensichtlich zu kurz ist.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

/**
 * Registrierung – vier Felder, nicht mehr.
 *
 * Vorher standen hier zusätzlich Beteiligung, Helferdienste und drei
 * Mannschaftsauswahlen. Das war der längste Weg der ganzen App, und zwar an
 * der Stelle, an der niemand die App kennt: Wer sich anmeldet, weiß noch
 * nicht, welche Mannschaften es gibt oder was „Mitwirkende:r" bedeutet.
 *
 * Diese Angaben fragt jetzt der Onboarding-Assistent beim ersten Login ab
 * (components/onboarding/) – dort mit Erklärung, einer Frage je Schritt und
 * der Möglichkeit, später alles unter „Mein Konto" zu ändern.
 */
export default function RegisterForm({ onSwitchToLogin }) {
  const { register, error, clearError } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  // Client-seitige Validierung, getrennt vom Server-Fehler aus dem Context.
  const [validationError, setValidationError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setValidationError(null);
    clearError();
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

    setSubmitting(true);
    try {
      const res = await register(form);
      if (res.success) {
        setSuccessMessage(res.message);
        setForm(EMPTY_FORM);
      }
      // Fehlerfall: Meldung steht in `error` aus dem AuthContext.
    } finally {
      setSubmitting(false);
    }
  };

  const shownError = validationError || error?.message;

  // Erfolgs-Ansicht: Das Konto ist angelegt, wartet aber auf die Freigabe.
  // Deshalb hier kein „jetzt anmelden" als Hauptaktion – das würde in die
  // Fehlermeldung „wartet auf Freigabe" laufen.
  if (successMessage) {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          <p className="font-display font-semibold uppercase tracking-[0.04em]">
            Konto angelegt
          </p>
          <p className="mt-1">{successMessage}</p>
        </Alert>

        <ol className="space-y-2 text-sm text-ink-soft">
          <Step number={1} done>
            Konto angelegt
          </Step>
          <Step number={2}>
            Die Vereinsverwaltung gibt dein Konto frei
          </Step>
          <Step number={3}>
            Beim ersten Login richtest du in zwei Minuten ein, was du im Verein
            machst und welche Mannschaften dich betreffen
          </Step>
        </ol>

        <button
          type="button"
          onClick={onSwitchToLogin}
          className="btn btn-outline btn-block"
        >
          Zurück zur Anmeldung
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <h2 className="section-title">Registrieren</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Vier Angaben genügen. Mannschaften und Design stellst du nach der
          Freigabe in der App ein.
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

      <p className="field-hint">
        Neue Konten werden von der Vereinsverwaltung freigegeben. Sobald das
        erledigt ist, kannst du dich anmelden.
      </p>

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary btn-block"
      >
        {submitting ? 'Konto wird erstellt …' : 'Konto erstellen'}
      </button>

      <p className="text-center text-sm text-ink-muted">
        Bereits registriert?{' '}
        <button type="button" onClick={onSwitchToLogin} className="link">
          Zur Anmeldung
        </button>
      </p>
    </form>
  );
}

/** Ein Schritt der Ablaufübersicht nach der Registrierung. */
function Step({ number, done = false, children }) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-display text-[0.6875rem] font-bold leading-none ${
          done
            ? 'bg-hsg-green text-white'
            : 'border border-line-strong bg-surface text-ink-muted'
        }`}
      >
        {done ? '✓' : number}
      </span>
      <span className={done ? 'text-ink-muted line-through' : undefined}>
        {children}
      </span>
    </li>
  );
}
