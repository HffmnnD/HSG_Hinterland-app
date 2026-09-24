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
 * Diese Angaben fragt der Onboarding-Assistent ab, der direkt im Anschluss
 * läuft (components/onboarding/): Der Server meldet mit der Registrierung
 * sofort an, deshalb gibt es hier keine Erfolgsansicht und kein zweites
 * Anmeldeformular – nach dem Klick geht es in die App.
 */
export default function RegisterForm({ onSwitchToLogin }) {
  const { register, error, clearError } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  // Client-seitige Validierung, getrennt vom Server-Fehler aus dem Context.
  const [validationError, setValidationError] = useState(null);

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
      await register(form);
      // Bei Erfolg setzt der Context `user` – die App wechselt von selbst in
      // den Onboarding-Assistenten, diese Komponente verschwindet dabei.
      // Fehlerfall: Meldung steht in `error` aus dem AuthContext.
    } finally {
      setSubmitting(false);
    }
  };

  const shownError = validationError || error?.message;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <h2 className="section-title">Registrieren</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Vier Angaben genügen – Mannschaften und Design richtest du gleich
          danach in der App ein.
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
        Nach dem Anlegen bist du angemeldet und wirst in zwei Minuten durch die
        Einrichtung geführt.
      </p>

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary btn-block"
      >
        {submitting ? 'Konto wird erstellt …' : 'Konto erstellen & loslegen'}
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
