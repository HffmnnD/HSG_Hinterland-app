import { useRef, useState } from 'react';
import { Camera, Check, Phone, Trash2 } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import Avatar from '../ui/Avatar';

// Muss zu MAX_IMAGE_BYTES in backend/config/uploads.js passen.
const MAX_PHOTO_MB = 5;

/**
 * Profilbild und Telefonnummer – im Onboarding-Assistenten und unter
 * „Mein Konto" dieselbe Komponente.
 *
 * ── Zwei Angaben, zwei Speicherwege ─────────────────────────────────────────
 * Das BILD wird sofort hochgeladen. Eine Datei lässt sich nicht sinnvoll
 * „vormerken": Man will direkt sehen, ob der Ausschnitt passt, und im
 * Assistenten wäre ein Bild, das erst am Ende hochlädt, genau die Stelle, an
 * der ein Abbruch die Datei verschluckt.
 *
 * Die TELEFONNUMMER ist ein normales Formularfeld. Im Assistenten reicht sie
 * der letzte Schritt zusammen mit allem anderen ein (`value`/`onChange`),
 * unter „Mein Konto" speichert der Knopf hier.
 *
 * @param {{ phone?: string, onPhoneChange?: (value:string) => void }} props
 *   Mit beidem verhält sich das Feld wie ein Formularfeld (Assistent), ohne
 *   beides speichert die Komponente selbst (Kontoeinstellungen).
 */
export default function ProfileForm({ phone, onPhoneChange }) {
  const { user, updatePreferences, uploadPhoto, removePhoto } = useAuth();
  const controlled = typeof onPhoneChange === 'function';

  const [ownPhone, setOwnPhone] = useState(user?.phone ?? '');
  const value = controlled ? (phone ?? '') : ownPhone;

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handlePhone = (event) => {
    const next = event.target.value;
    if (controlled) onPhoneChange(next);
    else setOwnPhone(next);
    setNotice(null);
    setError(null);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    // Damit dieselbe Datei erneut gewählt werden kann.
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`Das Bild darf höchstens ${MAX_PHOTO_MB} MB groß sein.`);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await uploadPhoto(file);
    if (result.success) setNotice(result.message ?? 'Profilbild gespeichert.');
    else setError(result.message);
    setBusy(false);
  };

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await removePhoto();
    if (result.success) setNotice(result.message ?? 'Profilbild entfernt.');
    else setError(result.message);
    setBusy(false);
  };

  const savePhone = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await updatePreferences({ phone: ownPhone.trim() });
    if (result.success) setNotice('Telefonnummer gespeichert.');
    else setError(result.message);
    setBusy(false);
  };

  const phoneChanged = !controlled && ownPhone.trim() !== (user?.phone ?? '');

  return (
    <div className="space-y-5">
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

      {/* ------------------------------------------------------ Profilbild */}
      <div>
        <p className="field-label">Profilbild</p>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar person={user} size="xl" />

          <div className="flex flex-wrap gap-2">
            {/* Der Knopf löst das versteckte Dateifeld aus: Ein natives
                <input type="file"> lässt sich nicht gestalten und sieht in
                jedem Browser anders aus. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFile}
              className="sr-only"
              aria-label="Profilbild auswählen"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="btn btn-outline btn-sm"
            >
              <Camera size={14} aria-hidden="true" />
              {user?.photoUrl ? 'Bild ändern' : 'Bild auswählen'}
            </button>
            {user?.photoUrl && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRemove}
                className="btn btn-danger btn-sm"
              >
                <Trash2 size={14} aria-hidden="true" />
                Entfernen
              </button>
            )}
          </div>
        </div>
        <p className="field-hint">
          Zu sehen auf deiner Startseite und im Kader deiner Mannschaften. JPG,
          PNG, WEBP oder GIF, höchstens {MAX_PHOTO_MB} MB. Ohne Bild erscheinen
          deine Initialen.
        </p>
      </div>

      {/* --------------------------------------------------- Telefonnummer */}
      <div>
        <label htmlFor="profile-phone" className="field-label">
          Telefonnummer <span className="font-normal text-ink-muted">(freiwillig)</span>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Phone
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              id="profile-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={30}
              value={value}
              onChange={handlePhone}
              disabled={busy}
              placeholder="0170 1234567"
              className="field-control pl-9"
            />
          </div>
          {!controlled && (
            <button
              type="button"
              onClick={savePhone}
              disabled={busy || !phoneChanged}
              className="btn btn-primary btn-sm sm:w-auto"
            >
              {busy ? 'Speichert …' : 'Speichern'}
            </button>
          )}
        </div>
        <p className="field-hint">
          Steht im Kader neben deiner E-Mail – bei Trainer:innen für alle
          Mitglieder, bei Spieler:innen nur für das Trainerteam. Leer lassen
          heißt: keine Nummer anzeigen.
        </p>
      </div>
    </div>
  );
}
