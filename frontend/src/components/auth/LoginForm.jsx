import { useState } from 'react';

import { useAuth } from '../../context/AuthContext';
import Alert from './Alert';
import TextField from './TextField';

export default function LoginForm({ onSwitchToRegister }) {
  const { login, error, clearError } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    clearError();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await login(form);
      // Bei Erfolg wechselt die App automatisch zum Dashboard (user gesetzt).
      // Fehler stehen danach in `error` aus dem AuthContext.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <h2 className="text-lg font-semibold text-white">Anmelden</h2>
        <p className="mt-0.5 text-sm text-slate-400">
          Melde dich mit deinem Vereinskonto an.
        </p>
      </div>

      {error && <Alert variant="error">{error.message}</Alert>}

      <TextField
        label="E-Mail"
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={form.email}
        onChange={handleChange}
        placeholder="name@example.com"
        disabled={submitting}
      />

      <TextField
        label="Passwort"
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={form.password}
        onChange={handleChange}
        placeholder="••••••••"
        disabled={submitting}
      />

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Anmelden …' : 'Anmelden'}
      </button>

      <p className="text-center text-sm text-slate-400">
        Noch kein Konto?{' '}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Jetzt registrieren
        </button>
      </p>
    </form>
  );
}
