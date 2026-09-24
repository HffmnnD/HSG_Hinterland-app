import { useState } from 'react';
import { Check, KeyRound } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import TextField from '../auth/TextField';

// Muss zu MIN_/MAX_PASSWORD_LENGTH in backend/utils/validation.js passen.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

const EMPTY = { currentPassword: '', newPassword: '', repeatPassword: '' };

/**
 * Passwortwechsel für das eigene Konto.
 *
 * Drei Felder, und jedes hat einen Grund:
 *   - Das AKTUELLE Passwort, weil ein offen gebliebener Browser nicht genügen
 *     darf, um ein Konto zu übernehmen. Geprüft wird es am Server.
 *   - Das neue Passwort.
 *   - Die Wiederholung: Das Feld ist maskiert, ein Tippfehler bliebe sonst
 *     unbemerkt – und wer sein neues Passwort nicht kennt, kommt nicht mehr
 *     hinein. Diese Prüfung bleibt bewusst im Browser, sie ist keine
 *     Sicherheitsfrage.
 */
export default function PasswordForm() {
  const { changePassword } = useAuth();

  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Das neue Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`
      );
      return;
    }
    if (form.newPassword !== form.repeatPassword) {
      setError('Die Wiederholung stimmt nicht mit dem neuen Passwort überein.');
      return;
    }

    setSaving(true);
    const result = await changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    if (result.success) {
      setNotice(result.message ?? 'Passwort geändert.');
      setForm(EMPTY);
    } else {
      setError(result.message);
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

      <TextField
        label="Aktuelles Passwort"
        id="account-current-password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        value={form.currentPassword}
        onChange={handleChange}
        disabled={saving}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Neues Passwort"
          id="account-new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          value={form.newPassword}
          onChange={handleChange}
          hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`}
          disabled={saving}
        />
        <TextField
          label="Neues Passwort wiederholen"
          id="account-repeat-password"
          name="repeatPassword"
          type="password"
          autoComplete="new-password"
          required
          maxLength={MAX_PASSWORD_LENGTH}
          value={form.repeatPassword}
          onChange={handleChange}
          disabled={saving}
        />
      </div>

      <button
        type="submit"
        disabled={
          saving ||
          !form.currentPassword ||
          !form.newPassword ||
          !form.repeatPassword
        }
        className="btn btn-primary btn-sm"
      >
        <KeyRound size={14} aria-hidden="true" />
        {saving ? 'Wird geändert …' : 'Passwort ändern'}
      </button>

      <p className="field-hint">
        Du bleibst nach der Änderung angemeldet. Auf anderen Geräten musst du
        dich beim nächsten Mal mit dem neuen Passwort anmelden.
      </p>
    </form>
  );
}
