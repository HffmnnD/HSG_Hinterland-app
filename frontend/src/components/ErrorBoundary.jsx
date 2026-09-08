import { Component } from 'react';

/**
 * Fängt Render-Fehler ab, damit die PWA nicht mit einer weissen Seite endet.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message ?? null };
  }

  componentDidCatch(error, info) {
    console.error('Unerwarteter Fehler in der Oberfläche:', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <h1 className="text-lg font-semibold">Etwas ist schiefgelaufen</h1>
          <p className="mt-2 text-sm text-slate-400">
            Die Ansicht konnte nicht geladen werden. Bitte lade die Seite neu.
          </p>
          {this.state.message && (
            <p className="mt-3 break-words rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-500">
              {this.state.message}
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Seite neu laden
          </button>
        </div>
      </div>
    );
  }
}
