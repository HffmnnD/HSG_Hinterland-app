import { Moon, MonitorCog, Sun } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';
import { THEMES } from '../lib/theme';

/** Beschriftungen und Icons der drei Einstellungen. */
const OPTIONS = {
  system: {
    label: 'System',
    hint: 'Folgt der Einstellung deines Geräts.',
    Icon: MonitorCog,
  },
  light: { label: 'Hell', hint: 'Immer heller Hintergrund.', Icon: Sun },
  dark: { label: 'Dunkel', hint: 'Immer dunkler Hintergrund.', Icon: Moon },
};

/**
 * Auswahl des Designs – im Onboarding-Assistenten und unter „Mein Konto".
 *
 * Es gibt bewusst KEINEN Ein-Klick-Umschalter in der Kopfzeile mehr: Das
 * Design wird einmal eingestellt und dann selten geändert; ein Dauerknopf auf
 * jeder Seite kostet Platz, den die Navigation besser braucht.
 *
 * @param {{ value?: string, onChange?: (theme:string) => void,
 *           disabled?: boolean }} props
 *   Ohne `value`/`onChange` schaltet die Auswahl direkt das Thema um (Bereich
 *   „Mein Konto"). Mit beidem verhält sie sich wie ein Formularfeld – der
 *   Assistent speichert erst am Ende, zeigt die Wahl aber sofort.
 */
export default function ThemeChoice({ value, onChange, disabled = false }) {
  const { theme, setTheme } = useTheme();
  const current = value ?? theme;

  const select = (next) => {
    if (onChange) onChange(next);
    else setTheme(next);
  };

  return (
    <div role="radiogroup" aria-label="Design" className="grid gap-2 sm:grid-cols-3">
      {THEMES.map((key) => {
        const { label, hint, Icon } = OPTIONS[key];
        const active = current === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => select(key)}
            className={`flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors ${
              active
                ? 'border-hsg-green bg-hsg-green-soft'
                : 'border-line bg-paper hover:border-hsg-green'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <Icon
              size={18}
              aria-hidden="true"
              className={`mt-0.5 shrink-0 ${
                active ? 'text-hsg-green-dark' : 'text-ink-muted'
              }`}
            />
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold uppercase tracking-[0.04em] text-ink">
                {label}
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
