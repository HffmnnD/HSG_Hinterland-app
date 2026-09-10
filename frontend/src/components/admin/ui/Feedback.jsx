import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from 'lucide-react';

/**
 * Die vier Zustände, die jeder Verwaltungsabschnitt hat: lädt, Fehler,
 * Erfolgsmeldung, nichts gefunden. Als eigene Bausteine, damit sie überall
 * gleich aussehen und in den Abschnitten nur eine Zeile kosten.
 */

/** Ladehinweis mit drehendem Ring. */
export function Loading({ children = 'Wird geladen …' }) {
  return (
    <p className="flex items-center gap-2 px-1 py-6 text-sm text-ink-muted">
      <Loader2 size={16} aria-hidden="true" className="animate-spin" />
      {children}
    </p>
  );
}

/** Fehlermeldung. `role="alert"`, damit Screenreader sie ansagen. */
export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="alert alert-error">
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Erfolgsmeldung nach einer gespeicherten Änderung. */
export function SuccessNote({ children }) {
  if (!children) return null;
  return (
    <div role="status" className="alert alert-success">
      <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * Leerer Zustand. `hint` erklärt, was zu tun ist – „Keine Treffer" allein
 * lässt ratlos zurück.
 */
export function EmptyState({ icon: Icon = Inbox, title, hint, children }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon size={24} aria-hidden="true" className="text-ink-muted" />
      <p className="font-display text-sm font-semibold uppercase tracking-[0.05em] text-ink">
        {title}
      </p>
      {hint && <p className="max-w-sm text-sm text-ink-muted">{hint}</p>}
      {children}
    </div>
  );
}
