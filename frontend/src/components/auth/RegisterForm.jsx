import { useState } from 'react';

import { useAuth } from '../../context/AuthContext';
import Alert from './Alert';
import TextField from './TextField';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', password: '' };
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

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
        setSuccessMessage(
          res.message ||
            'Registrierung erfolgreich. Dein Konto muss noch von einem Admin freigegeben werden.'
        );
        setForm(EMPTY_FORM);
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
          Ein Admin muss es zuerst freigeben. Danach kannst du dich mit deiner
          E-Mail-Adresse und deinem Passwort anmelden.
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
