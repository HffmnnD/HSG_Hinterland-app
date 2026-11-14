import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share, X } from 'lucide-react';

import {
  dismissInstallHint,
  installMode,
  isInstallHintDismissed,
  promptInstall,
  subscribeInstall,
} from '../lib/install';

/**
 * Dezenter Hinweis auf der Startseite: „Die App aufs Handy holen".
 *
 * Erscheint nur, wenn die Seite im Browser offen ist (nicht in der
 * installierten App), das Gerät die Installation kann und niemand „Später"
 * gesagt hat. Je nach Gerät mit Knopf (Chrome/Edge/Samsung) oder mit einer
 * Ein-Satz-Anleitung (iPhone, andere Android-Browser).
 */
export default function InstallHint() {
  const mode = useSyncExternalStore(subscribeInstall, installMode, () => null);
  const [dismissed, setDismissed] = useState(isInstallHintDismissed);
  // Nicht sofort beim Öffnen aufpoppen – erst, wenn die Seite steht.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready || dismissed || !mode) return null;

  const close = () => {
    dismissInstallHint();
    setDismissed(true);
  };

  return (
    <aside
      aria-label="App installieren"
      className="mb-4 flex items-start gap-3 rounded-md border border-line bg-paper px-4 py-3 text-sm text-ink-soft"
    >
      <Download size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-hsg-green-dark" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">Die App aufs Handy holen</p>
        <p className="mt-0.5">
          {mode === 'prompt' && 'Startet wie eine normale App vom Home-Bildschirm und kann dich benachrichtigen.'}
          {mode === 'ios' && (
            <>
              Unten in Safari auf{' '}
              <Share size={14} aria-label="Teilen" className="inline -mt-0.5" /> tippen, dann
              „Zum Home-Bildschirm". Danach startet sie wie eine normale App.
            </>
          )}
          {mode === 'menu' &&
            'Im Browser-Menü (⋮) „App installieren" oder „Zum Startbildschirm hinzufügen" wählen. Danach startet sie wie eine normale App.'}
        </p>
        {mode === 'prompt' && (
          <button
            type="button"
            onClick={async () => {
              if (await promptInstall()) setDismissed(true);
            }}
            className="btn btn-primary btn-sm mt-2"
          >
            Installieren
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Hinweis ausblenden"
        title="Später"
        className="btn btn-ghost btn-sm -mr-2 -mt-1 shrink-0"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
