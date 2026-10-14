import { useEffect, useId, useState } from 'react';
import { BellOff, BellRing, Check, Send } from 'lucide-react';

import { apiFetch } from '../lib/api';
import {
  currentSubscription,
  disablePush,
  enablePush,
  permissionState,
  pushSupport,
} from './pushClient';

// Kategorien. Die Schlüssel müssen zu backend/push/preferences.js passen.
const GROUPS = [
  {
    title: 'Termine',
    items: [
      { key: 'changes', label: 'Absagen & Änderungen', hint: 'Fällt aus, wird verschoben, andere Halle.' },
      { key: 'newEvents', label: 'Neue Termine', hint: 'Extra-Trainings, Spiele, neue Trainingszeiten.' },
      { key: 'reminders', label: 'Erinnerung vorher', hint: 'Damit du rechtzeitig absagen kannst.' },
    ],
  },
  {
    title: 'Trainerteam',
    coachOnly: true,
    items: [
      { key: 'declines', label: 'Kurzfristige Absagen', hint: 'Weniger als 24 Std. vor Beginn.' },
      { key: 'requests', label: 'Beitrittsanfragen', hint: 'Neue Leute für deine Mannschaft.' },
    ],
  },
  {
    title: 'Verein',
    items: [
      { key: 'roster', label: 'Aufnahme in eine Mannschaft' },
      { key: 'news', label: 'Vereins-News' },
      { key: 'quietHours', label: 'Nachts ohne Ton', hint: '22–7 Uhr kommen Nachrichten still an.' },
    ],
  },
];

const REMINDER_LABELS = { 1: '1 Std. vorher', 3: '3 Std. vorher', 24: 'Am Vortag' };

const SUPPORT_HINTS = {
  'ios-install':
    'Auf iPhone und iPad gehen Benachrichtigungen nur aus der installierten App: im Safari auf „Teilen“ → „Zum Home-Bildschirm“, dann die App von dort öffnen.',
  insecure: 'Push braucht eine sichere Verbindung (https).',
  unsupported: 'Dieser Browser kann keine Push-Benachrichtigungen.',
};

/**
 * Bereich „Benachrichtigungen" unter „Mein Konto".
 *
 * Oben der Schalter für DIESES Gerät (Berechtigung + Abo), darunter, was man
 * bekommen möchte – das gilt für alle Geräte des Kontos.
 */
export default function PushSettings() {
  const [config, setConfig] = useState(null);
  const [data, setData] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const support = pushSupport();
  const reminderId = useId();

  useEffect(() => {
    let alive = true;
    apiFetch('/api/push/config')
      .then(async (cfg) => {
        // Ohne Push auf dem Server gibt es nichts einzustellen.
        const [settings, subscription] = cfg.enabled
          ? await Promise.all([
              apiFetch('/api/push/settings'),
              support === 'supported' ? currentSubscription() : null,
            ])
          : [null, null];
        if (!alive) return;
        setConfig(cfg);
        setData(settings);
        setSubscribed(Boolean(subscription) && permissionState() === 'granted');
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [support]);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleDevice = () =>
    run(async () => {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
      } else {
        await enablePush(config.publicKey);
        setSubscribed(true);
        setNotice('Benachrichtigungen sind auf diesem Gerät an.');
      }
    });

  const sendTest = () =>
    run(async () => {
      const result = await apiFetch('/api/push/test', { method: 'POST' });
      setNotice(result.message);
    });

  // Sofort speichern – ein eigener Speichern-Knopf wäre bei Schaltern
  // überraschend. Bei einem Fehler springt der Schalter zurück.
  const update = (patch) => {
    const previous = data.settings;
    setData((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
    setError(null);
    apiFetch('/api/push/settings', { method: 'PATCH', body: JSON.stringify(patch) }).catch(
      (err) => {
        setData((prev) => ({ ...prev, settings: previous }));
        setError(err.message);
      }
    );
  };

  if (config && !config.enabled) {
    return <div className="alert alert-info">Push ist auf diesem Server noch nicht eingerichtet.</div>;
  }

  if (!config || !data) {
    return error ? (
      <div role="alert" className="alert alert-error">{error}</div>
    ) : (
      <p className="text-sm text-ink-muted">Wird geladen …</p>
    );
  }

  const { settings } = data;

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

      {support !== 'supported' ? (
        <div className="alert alert-info">{SUPPORT_HINTS[support]}</div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleDevice}
            disabled={busy}
            className={`btn btn-sm ${subscribed ? 'btn-outline' : 'btn-primary'}`}
          >
            {subscribed ? <BellOff size={16} aria-hidden="true" /> : <BellRing size={16} aria-hidden="true" />}
            {subscribed ? 'Auf diesem Gerät aus' : 'Auf diesem Gerät aktivieren'}
          </button>
          {subscribed && (
            <button type="button" onClick={sendTest} disabled={busy} className="btn btn-ghost btn-sm">
              <Send size={16} aria-hidden="true" />
              Test senden
            </button>
          )}
          <span className="text-xs text-ink-muted">
            {data.devices === 0
              ? 'Noch auf keinem Gerät an.'
              : data.devices === 1
                ? '1 Gerät verbunden.'
                : `${data.devices} Geräte verbunden.`}
          </span>
        </div>
      )}

      <p className="field-hint">Was du bekommst, gilt für alle deine Geräte.</p>

      {GROUPS.filter((group) => !group.coachOnly || data.isCoach).map((group) => (
        <fieldset key={group.title} className="space-y-3">
          <legend className="field-label">{group.title}</legend>
          {group.items.map((item) => (
            <div key={item.key}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={settings[item.key]}
                  onChange={(event) => update({ [item.key]: event.target.checked })}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-hsg-green"
                />
                <span>
                  <span className="block text-sm font-bold text-ink">{item.label}</span>
                  {item.hint && <span className="field-hint">{item.hint}</span>}
                </span>
              </label>

              {item.key === 'reminders' && settings.reminders && (
                <div className="mt-2 pl-8">
                  <label htmlFor={reminderId} className="sr-only">
                    Wann erinnern?
                  </label>
                  <select
                    id={reminderId}
                    className="field-control field-control-sm w-auto"
                    value={settings.reminderHours}
                    onChange={(event) => update({ reminderHours: Number(event.target.value) })}
                  >
                    {data.reminderHours.map((hours) => (
                      <option key={hours} value={hours}>
                        {REMINDER_LABELS[hours] ?? `${hours} Std. vorher`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
