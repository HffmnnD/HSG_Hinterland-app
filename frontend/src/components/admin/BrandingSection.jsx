import { useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { reloadBranding, useBranding } from '../../hooks/useBranding';
import { ErrorNote, SuccessNote } from './ui/Feedback';

const MAX_MB = 8;

/**
 * Quadratisches PNG in fester Größe aus einem Bild – für das App-Symbol der
 * installierten App (192 und 512 Pixel). Das Logo wird mittig eingepasst,
 * der Rand bleibt weiß, damit es auf jedem Startbildschirm lesbar ist.
 */
async function squarePng(file, size) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    // 10 % Rand – „maskable" Symbole werden von Android rund beschnitten.
    const box = size * 0.8;
    const scale = Math.min(box / image.width, box / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new File([blob], `icon-${size}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function upload(kind, file) {
  const body = new FormData();
  body.append('file', file);
  return apiFetch(`/api/branding/files/${kind}`, { method: 'POST', body });
}

/**
 * Verwaltung → App-Einstellungen: Logo (Kopfzeile, Browser-Tab und Symbol der
 * installierten App), Hintergrundbild der Anmeldeseite und die beiden Sprüche
 * dort. Leere Sprüche werden ausgeblendet.
 */
export default function BrandingSection() {
  const branding = useBranding();
  const [title, setTitle] = useState(null);
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const titleValue = title ?? branding.loginTitle ?? '';
  const textValue = text ?? branding.loginText ?? '';

  const run = async (action, message) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await reloadBranding();
      setNotice(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (handler) => (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Das Bild darf höchstens ${MAX_MB} MB groß sein.`);
      return;
    }
    handler(file);
  };

  const saveLogo = (file) =>
    run(async () => {
      await upload('logo', file);
      await upload('icon192', await squarePng(file, 192));
      await upload('icon512', await squarePng(file, 512));
    }, 'Logo gespeichert. Es erscheint oben in der Leiste, im Browser-Tab und als App-Symbol.');

  const removeLogo = () =>
    run(async () => {
      for (const kind of ['logo', 'icon192', 'icon512']) {
        await apiFetch(`/api/branding/files/${kind}`, { method: 'DELETE' });
      }
    }, 'Logo entfernt – es gilt wieder das Standard-Logo.');

  const saveTexts = (event) => {
    event.preventDefault();
    run(async () => {
      await apiFetch('/api/branding', {
        method: 'PATCH',
        body: JSON.stringify({ loginTitle: titleValue, loginText: textValue }),
      });
      setTitle(null);
      setText(null);
    }, 'Sprüche gespeichert.');
  };

  const resetTexts = () =>
    run(async () => {
      await apiFetch('/api/branding', { method: 'PATCH', body: JSON.stringify({ loginTitle: null, loginText: null }) });
      setTitle(null);
      setText(null);
    }, 'Standard-Sprüche wiederhergestellt.');

  return (
    <div className="space-y-6">
      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote>{notice}</SuccessNote>}

      {/* ------------------------------------------------------------- Logo */}
      <section className="panel">
        <div className="panel__header">
          <h3 className="section-title text-base">App-Logo</h3>
        </div>
        <div className="panel__body flex flex-wrap items-center gap-4">
          <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Aktuelles Logo" className="h-full w-full object-contain" />
            ) : (
              <span className="brand__mark h-14 w-14 text-2xl" aria-hidden="true">H</span>
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm text-ink-soft">
              Erscheint oben in der Leiste, im Browser-Tab und als Symbol der installierten App. Am besten ein quadratisches PNG mit
              transparentem Hintergrund, mindestens 512 × 512 Pixel.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className={`btn btn-primary btn-sm ${busy ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
                <ImagePlus size={15} aria-hidden="true" /> Logo hochladen
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={pick(saveLogo)} disabled={busy} />
              </label>
              {branding.logoUrl && (
                <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={removeLogo} disabled={busy}>
                  <Trash2 size={15} aria-hidden="true" /> Entfernen
                </button>
              )}
            </div>
            <p className="field-hint">Eine bereits installierte App übernimmt das neue Symbol meist erst nach einer Neuinstallation.</p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Login-Bild */}
      <section className="panel">
        <div className="panel__header">
          <h3 className="section-title text-base">Bild der Anmeldeseite</h3>
        </div>
        <div className="panel__body space-y-3">
          <div
            className="auth-visual flex h-40 items-end overflow-hidden rounded-lg p-4 text-white"
            style={branding.loginImageUrl ? { '--image-login': `url("${branding.loginImageUrl}")` } : undefined}
          >
            <span className="text-sm font-semibold text-white/80">{branding.loginImageUrl ? 'Eigenes Bild' : 'Standard-Verlauf'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={`btn btn-primary btn-sm ${busy ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
              <ImagePlus size={15} aria-hidden="true" /> Bild hochladen
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={pick((file) => run(() => upload('login', file), 'Bild der Anmeldeseite gespeichert.'))}
                disabled={busy}
              />
            </label>
            {branding.loginImageUrl && (
              <button
                type="button"
                className="btn btn-ghost btn-sm text-danger"
                onClick={() => run(() => apiFetch('/api/branding/files/login', { method: 'DELETE' }), 'Bild entfernt.')}
                disabled={busy}
              >
                <Trash2 size={15} aria-hidden="true" /> Entfernen
              </button>
            )}
          </div>
          <p className="field-hint">Querformat, z. B. ein Mannschafts- oder Hallenfoto. JPG, PNG oder WEBP bis {MAX_MB} MB.</p>
        </div>
      </section>

      {/* ----------------------------------------------------------- Sprüche */}
      <form onSubmit={saveTexts} className="panel">
        <div className="panel__header">
          <h3 className="section-title text-base">Sprüche der Anmeldeseite</h3>
        </div>
        <div className="panel__body space-y-3">
          <div>
            <label htmlFor="branding-title" className="field-label">Hauptspruch</label>
            <input
              id="branding-title"
              className="field-control"
              maxLength={120}
              value={titleValue}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy}
              placeholder="leer = kein Hauptspruch"
            />
          </div>
          <div>
            <label htmlFor="branding-text" className="field-label">Text darunter</label>
            <textarea
              id="branding-text"
              rows={2}
              className="field-control resize-y"
              maxLength={400}
              value={textValue}
              onChange={(event) => setText(event.target.value)}
              disabled={busy}
              placeholder="leer = kein Text"
            />
          </div>
          <p className="field-hint">Leere Felder werden auf der Anmeldeseite einfach weggelassen.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Speichern</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTitle(''); setText(''); }} disabled={busy}>
              Beide leeren
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetTexts} disabled={busy}>
              Standard wiederherstellen
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
