import { Search, X } from 'lucide-react';

/**
 * Suchfeld mit Lupe und Löschen-Knopf.
 *
 * `type="search"` bewusst NICHT: Safari zeichnet dort ein eigenes „x“, das
 * sich nicht gestalten lässt und neben unserem doppelt stünde.
 */
export default function SearchField({
  value,
  onChange,
  placeholder = 'Suchen …',
  label,
  id,
  className = '',
}) {
  return (
    <div className={`relative min-w-0 flex-1 ${className}`}>
      {label && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}

      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />

      <input
        id={id}
        type="text"
        className="admin-search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Suche zurücksetzen"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center
            justify-center rounded-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
