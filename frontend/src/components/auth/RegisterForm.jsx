import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
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
export default function RegisterForm({ initialFamilyCode = '' }) {
  const { register, error, clearError } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  // Familiencode: Kind übernimmt das Profil, das seine Eltern angelegt haben.
  const [withCode, setWithCode] = useState(Boolean(initialFamilyCode));
  const [familyCode, setFamilyCode] = useState(initialFamilyCode);
  const [checked, setChecked] = useState(null); // { code, firstName } | { code, error }

  const cleanCode = familyCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const codeInfo = withCode && checked?.code === cleanCode ? checked : null;

  // Code prüfen, sobald er vollständig ist – zeigt, wessen Profil übernommen
  // wird, und trägt den Vornamen schon ein.
  useEffect(() => {
    if (!withCode || cleanCode.length !== 8) return undefined;
    let cancelled = false;
    apiFetch('/api/family/invite/check', { method: 'POST', body: JSON.stringify({ code: cleanCode }) })
      .then((data) => {
        if (cancelled) return;
        setChecked({ code: cleanCode, firstName: data.firstName });
        setForm((prev) => ({ ...prev, firstName: prev.firstName || data.firstName, lastName: prev.lastName || data.lastName || '' }));
      })
      .catch((err) => !cancelled && setChecked({ code: cleanCode, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [withCode, cleanCode]);
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

    if (withCode && cleanCode.length !== 8) {
      setValidationError('Bitte den 8-stelligen Code deiner Eltern eingeben.');
      return;
    }

    setSubmitting(true);
    try {
      await register({ ...form, familyCode: withCode ? cleanCode : undefined });
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
      {shownError && <Alert variant="error">{shownError}</Alert>}

      {withCode ? (
        <div className="space-y-2 rounded-md border border-line p-3">
          <TextField
            label="Code von deinen Eltern"
            id="register-familyCode"
            name="familyCode"
            autoComplete="off"
            maxLength={12}
            value={familyCode}
            onChange={(event) => {
              setFamilyCode(event.target.value);
              setValidationError(null);
              clearError();
            }}
            placeholder="ABCD-EFGH"
            disabled={submitting}
          />
          {codeInfo?.firstName && (
            <p className="field-hint">
              Du übernimmst das Profil von <strong>{codeInfo.firstName}</strong> – mit Mannschaften und Zusagen. Deine
              Eltern bleiben verknüpft.
            </p>
          )}
          {codeInfo?.error && <p className="field-hint text-danger">{codeInfo.error}</p>}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setWithCode(false);
              setFamilyCode('');
            }}
          >
            Ohne Code registrieren
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWithCode(true)}>
          <KeyRound size={14} aria-hidden="true" /> Ich habe einen Code von meinen Eltern
        </button>
      )}

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

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary btn-block"
      >
        {submitting ? 'Konto wird erstellt …' : 'Konto erstellen'}
      </button>

    </form>
  );
}
