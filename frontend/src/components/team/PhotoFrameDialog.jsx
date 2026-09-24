import { useRef, useState } from 'react';
import { Move, RotateCcw, ZoomIn } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { PHOTO_ZOOM_MAX, PHOTO_ZOOM_MIN, photoFrameStyle } from '../../lib/teams';
import Modal from '../ui/Modal';

/**
 * Bildausschnitt des Mannschaftsfotos im Kopfbereich einstellen.
 *
 * ── Das Problem ─────────────────────────────────────────────────────────────
 * Der Kopfbereich ist ein breiter Streifen, Mannschaftsfotos sind es nicht.
 * Das Bild wird also beschnitten – und zwar bisher immer genau mittig, weshalb
 * auf fast jedem Foto die Köpfe fehlten.
 *
 * ── Die Lösung ──────────────────────────────────────────────────────────────
 * Verschieben und Vergrößern, aber NICHT im Bild: Gespeichert werden drei
 * Zahlen (Bildmittelpunkt waagerecht/senkrecht und Vergrößerung, alle in
 * Prozent), das Original bleibt unangetastet. Vorteile gegenüber einem
 * Zuschnitt beim Hochladen:
 *
 *   - Der Ausschnitt lässt sich beliebig oft korrigieren.
 *   - Handy und Rechner zeigen den Streifen in verschiedenen Formaten; ein
 *     festes Zuschneiden würde auf einem der beiden wieder Köpfe abschneiden.
 *   - Das Foto bleibt in voller Auflösung erhalten.
 *
 * Bedienen kann man es auf drei Wegen – Ziehen mit Maus/Finger, die Pfeile und
 * die Schieberegler. Das ist Absicht: Ziehen ist am schnellsten, die Regler
 * sind die einzige Möglichkeit, die auch mit der Tastatur funktioniert.
 *
 * @param {{ code: string, team: object, onClose: () => void,
 *           onSaved: (team:object, message:string) => void }} props
 */
export default function PhotoFrameDialog({ code, team, onClose, onSaved }) {
  const [frame, setFrame] = useState({
    focusX: team.photoFocusX ?? 50,
    focusY: team.photoFocusY ?? 50,
    zoom: team.photoZoom ?? 100,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const previewRef = useRef(null);
  // Startpunkt des Ziehens. In einem Ref und nicht im State: Jede
  // Mausbewegung würde sonst ein Rendern auslösen, nur um eine Zahl zu merken,
  // die niemand anzeigt.
  const dragRef = useRef(null);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const update = (patch) => {
    setFrame((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  const nudge = (axis, amount) =>
    update({ [axis]: clamp(Math.round(frame[axis] + amount), 0, 100) });

  // --- Ziehen ---------------------------------------------------------------
  // Pointer-Events statt Maus- UND Touch-Ereignissen: ein Satz Handler für
  // Maus, Finger und Stift. `setPointerCapture` hält das Ziehen am Element
  // fest, auch wenn der Zeiger den Dialog verlässt.

  const handlePointerDown = (event) => {
    const box = previewRef.current?.getBoundingClientRect();
    if (!box) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      focusX: frame.focusX,
      focusY: frame.focusY,
      width: box.width,
      height: box.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const start = dragRef.current;
    if (!start) return;

    // Nach unten ziehen heißt: einen höheren Teil des Bildes zeigen – der
    // Bildmittelpunkt wandert also nach OBEN. Deshalb das Minus.
    const dx = ((event.clientX - start.x) / start.width) * 100;
    const dy = ((event.clientY - start.y) / start.height) * 100;

    update({
      focusX: clamp(Math.round(start.focusX - dx), 0, 100),
      focusY: clamp(Math.round(start.focusY - dy), 0, 100),
    });
  };

  const endDrag = (event) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const reset = () => update({ focusX: 50, focusY: 50, zoom: 100 });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch(
        `/api/teams/${encodeURIComponent(code)}/photo/frame`,
        { method: 'PATCH', body: JSON.stringify(frame) }
      );
      onSaved(result.team, result.message ?? 'Bildausschnitt gespeichert.');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const unchanged =
    frame.focusX === (team.photoFocusX ?? 50) &&
    frame.focusY === (team.photoFocusY ?? 50) &&
    frame.zoom === (team.photoZoom ?? 100);

  return (
    <Modal
      title="Bildausschnitt anpassen"
      description="Ziehe das Bild an die richtige Stelle und zoome heran, damit keine Köpfe abgeschnitten werden."
      size="lg"
      onClose={onClose}
    >
      {error && (
        <div role="alert" className="alert alert-error mb-4">
          {error}
        </div>
      )}

      {/* Vorschau. Dieselben Klassen wie der echte Kopfbereich
          (`.team-hero`), damit hier nichts anders aussieht als später auf der
          Seite. */}
      <div
        ref={previewRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="team-hero h-40 cursor-grab touch-none select-none active:cursor-grabbing sm:h-48"
      >
        <img
          src={team.photoUrl}
          alt=""
          draggable={false}
          style={photoFrameStyle(frame)}
          className="team-hero__image"
        />
        <div className="team-hero__scrim" aria-hidden="true" />

        {/* Hilfslinien: Wo der Name steht, verdeckt der Streifen das Bild.
            Wer das beim Ausrichten nicht sieht, schiebt die Köpfe genau
            dorthin. */}
        <div className="pointer-events-none absolute inset-0 flex items-end">
          <p className="w-full truncate px-4 pb-3 font-display text-lg font-bold uppercase tracking-[0.02em] text-white">
            {team.name}
          </p>
        </div>
        <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-sm bg-black/45 px-2 py-1 text-xs font-semibold text-white">
          <Move size={12} aria-hidden="true" />
          Ziehen
        </span>
      </div>

      {/* Regler. Ihre Beschriftungen nennen den Zahlenwert – beim Ausrichten
          per Tastatur ist er die einzige Rückmeldung. */}
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="frame-focus-y" className="field-label">
            Senkrecht verschieben
            <span className="ml-1.5 font-normal text-ink-muted">
              {frame.focusY} %
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => nudge('focusY', -5)}
              className="btn btn-outline btn-sm"
              aria-label="Bild nach unten verschieben"
              title="Bild nach unten verschieben"
            >
              ↑
            </button>
            <input
              id="frame-focus-y"
              type="range"
              min={0}
              max={100}
              step={1}
              value={frame.focusY}
              onChange={(event) => update({ focusY: Number(event.target.value) })}
              className="min-w-0 flex-1 accent-hsg-green"
            />
            <button
              type="button"
              onClick={() => nudge('focusY', 5)}
              className="btn btn-outline btn-sm"
              aria-label="Bild nach oben verschieben"
              title="Bild nach oben verschieben"
            >
              ↓
            </button>
          </div>
          <p className="field-hint">
            0 % zeigt den oberen Bildrand, 100 % den unteren.
          </p>
        </div>

        <div>
          <label htmlFor="frame-focus-x" className="field-label">
            Waagerecht verschieben
            <span className="ml-1.5 font-normal text-ink-muted">
              {frame.focusX} %
            </span>
          </label>
          <input
            id="frame-focus-x"
            type="range"
            min={0}
            max={100}
            step={1}
            value={frame.focusX}
            onChange={(event) => update({ focusX: Number(event.target.value) })}
            className="w-full accent-hsg-green"
          />
        </div>

        <div>
          <label htmlFor="frame-zoom" className="field-label flex items-center gap-1.5">
            <ZoomIn size={14} aria-hidden="true" />
            Vergrößerung
            <span className="font-normal text-ink-muted">{frame.zoom} %</span>
          </label>
          <input
            id="frame-zoom"
            type="range"
            min={PHOTO_ZOOM_MIN}
            max={PHOTO_ZOOM_MAX}
            step={5}
            value={frame.zoom}
            onChange={(event) => update({ zoom: Number(event.target.value) })}
            className="w-full accent-hsg-green"
          />
          <p className="field-hint">
            100 % passt das Bild in den Streifen ein. Mehr zoomt heran – der
            Rand fällt dann weg.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || unchanged}
          className="btn btn-primary btn-sm"
        >
          {saving ? 'Wird gespeichert …' : 'Ausschnitt speichern'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="btn btn-outline btn-sm"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Zurücksetzen
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="btn btn-ghost btn-sm ml-auto"
        >
          Schließen
        </button>
      </div>
    </Modal>
  );
}
