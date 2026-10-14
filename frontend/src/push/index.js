// Push-Benachrichtigungen – Einstieg des Frontend-Moduls.
//
// Eingebunden an genau zwei Stellen:
//   - components/account/AccountPanel.jsx  Bereich „Push" unter „Mein Konto"
//   - context/AuthContext.jsx              Gerät beim Abmelden austragen
// Entfernen: siehe backend/push/README.md.
import { Bell } from 'lucide-react';

import PushSettings from './PushSettings';

export { forgetThisDevice } from './pushClient';

/** Eintrag für die Umschalter in „Mein Konto". */
export const pushAccountTab = {
  key: 'push',
  label: 'Push',
  title: 'Benachrichtigungen',
  description: 'Absagen, Erinnerungen und News direkt aufs Handy.',
  Icon: Bell,
  Component: PushSettings,
};
