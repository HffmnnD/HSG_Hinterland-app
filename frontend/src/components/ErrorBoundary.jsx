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
      <div className="flex min-h-[100dvh] flex-col bg-hsg-dark text-white">
        <div className="brand-ribbon" />
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-md rounded-md border-t-[3px] border-t-hsg-green bg-paper p-6 text-center text-ink-soft shadow-pop">
            <h1 className="section-title">Etwas ist schiefgelaufen</h1>
            <p className="mt-2 text-sm text-ink-muted">
              Die Ansicht konnte nicht geladen werden. Bitte lade die Seite neu.
            </p>
            {this.state.message && (
              <p className="mt-3 break-words rounded-sm bg-surface px-3 py-2 text-xs text-ink-muted">
                {this.state.message}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-primary btn-block mt-5"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }
}
