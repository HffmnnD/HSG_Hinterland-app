import { useEffect, useRef, useState } from 'react';
import { Minus, Move, Plus } from 'lucide-react';

import Modal from '../ui/Modal';

// Größe des gespeicherten Profilbilds. 512 px reichen für jede Anzeige (das
// größte Avatar ist 64 px, auf Retina 128 px) und halten die Datei klein.
const OUTPUT_PX = 512;
const MAX_ZOOM = 4;

/**
 * Profilbild zuschneiden: Bild im runden Rahmen verschieben (Finger oder Maus)
 * und zoomen (Regler, Knöpfe, Mausrad, zwei Finger). Ergebnis ist ein
 * quadratisches JPEG – geschnitten wird im Browser, hochgeladen wird nur der
 * Ausschnitt.
 *
 * @param {{ src: string, onCancel: () => void, onConfirm: (file: File) => void, busy?: boolean }} props
 */
export default function AvatarCropper({ src, onCancel, onConfirm, busy = false }) {
  const frameRef = useRef(null);
  const imageRef = useRef(null);
  const [natural, setNatural] = useState(null);
  const [frame, setFrame] = useState(280);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  // Rahmengröße an den Bildschirm anpassen (Handy hoch/quer, Fold).
  useEffect(() => {
    const measure = () => {
      const width = frameRef.current?.parentElement?.clientWidth ?? 320;
      setFrame(Math.max(200, Math.min(320, width - 8, window.innerHeight * 0.45)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Grundmaßstab: das Bild füllt den Rahmen gerade vollständig.
  const baseScale = natural ? Math.max(frame / natural.w, frame / natural.h) : 1;
  const scale = baseScale * zoom;
  const shown = natural ? { w: natural.w * scale, h: natural.h * scale } : { w: frame, h: frame };

  // Verschiebung so begrenzen, dass nie ein leerer Rand im Kreis entsteht.
  const clamp = (next, size = shown) => {
    const maxX = Math.max(0, (size.w - frame) / 2);
    const maxY = Math.max(0, (size.h - frame) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const applyZoom = (nextZoom) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    if (!natural) return setZoom(z);
    const ratio = z / zoom;
    const size = { w: natural.w * baseScale * z, h: natural.h * baseScale * z };
    setOffset((prev) => clamp({ x: prev.x * ratio, y: prev.y * ratio }, size));
    return setZoom(z);
  };

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = { offset, zoom, points: [...pointers.current.values()] };
  };

  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const start = gesture.current;

    if (points.length >= 2 && start.points.length >= 2) {
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const factor = dist(points[0], points[1]) / Math.max(1, dist(start.points[0], start.points[1]));
      applyZoom(start.zoom * factor);
      return;
    }
    const dx = points[0].x - start.points[0].x;
    const dy = points[0].y - start.points[0].y;
    setOffset(clamp({ x: start.offset.x + dx, y: start.offset.y + dy }));
  };

  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    gesture.current = pointers.current.size
      ? { offset, zoom, points: [...pointers.current.values()] }
      : null;
  };

  const onWheel = (event) => applyZoom(zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));

  const nudge = (dx, dy) => setOffset((prev) => clamp({ x: prev.x + dx, y: prev.y + dy }));
  const onKeyDown = (event) => {
    const step = event.shiftKey ? 30 : 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) {
      event.preventDefault();
      nudge(...moves[event.key]);
    } else if (event.key === '+' || event.key === '=') applyZoom(zoom + 0.1);
    else if (event.key === '-') applyZoom(zoom - 0.1);
  };

  const confirm = () => {
    const image = imageRef.current;
    if (!image || !natural) return;
    // Sichtbarer Ausschnitt in Bildkoordinaten.
    const size = frame / scale;
    const sx = natural.w / 2 - (frame / 2 + offset.x) / scale;
    const sy = natural.h / 2 - (frame / 2 + offset.y) / scale;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_PX;
    canvas.height = OUTPUT_PX;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
    ctx.drawImage(image, sx, sy, size, size, 0, 0, OUTPUT_PX, OUTPUT_PX);
    canvas.toBlob(
      (blob) => blob && onConfirm(new File([blob], 'profilbild.jpg', { type: 'image/jpeg' })),
      'image/jpeg',
      0.9
    );
  };

  return (
    <Modal onClose={onCancel} title="Profilbild ausrichten" size="sm">
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Move size={16} aria-hidden="true" className="shrink-0" />
          Bild verschieben und zoomen, bis der Ausschnitt passt.
        </p>

        <div className="flex justify-center">
          <div
            ref={frameRef}
            role="application"
            tabIndex={0}
            aria-label="Bildausschnitt. Pfeiltasten verschieben, Plus und Minus zoomen."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            className="relative cursor-grab touch-none select-none overflow-hidden rounded-md bg-surface-strong outline-none focus-visible:ring-2 focus-visible:ring-hsg-green active:cursor-grabbing"
            style={{ width: frame, height: frame }}
          >
            <img
              ref={imageRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: shown.w,
                height: shown.h,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
            {/* Runde Maske: so wird das Bild später überall angezeigt. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.45)' }}
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyZoom(zoom - 0.2)} aria-label="Verkleinern">
            <Minus size={16} />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="h-2 flex-1 accent-hsg-green"
            aria-label="Zoom"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyZoom(zoom + 0.2)} aria-label="Vergrößern">
            <Plus size={16} />
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={confirm} disabled={busy || !natural}>
            {busy ? 'Speichert …' : 'Übernehmen'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
