import { useState } from 'react';

import { useAuth } from '../../context/AuthContext';
import AuthLayout from './AuthLayout';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

export default function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const { clearError } = useAuth();

  // Beim Wechsel den Fehler aus dem anderen Formular verwerfen.
  const switchTo = (nextMode) => {
    clearError();
    setMode(nextMode);
  };

  return (
    <AuthLayout>
      {/* Umschalter zwischen Login und Registrierung */}
      <div className="segment mb-6">
        <button
          type="button"
          onClick={() => switchTo('login')}
          aria-pressed={mode === 'login'}
          className={`segment__btn ${mode === 'login' ? 'segment__btn--active' : ''}`}
        >
          Anmelden
        </button>
        <button
          type="button"
          onClick={() => switchTo('register')}
          aria-pressed={mode === 'register'}
          className={`segment__btn ${mode === 'register' ? 'segment__btn--active' : ''}`}
        >
          Registrieren
        </button>
      </div>

      {mode === 'login' ? (
        <LoginForm onSwitchToRegister={() => switchTo('register')} />
      ) : (
        <RegisterForm onSwitchToLogin={() => switchTo('login')} />
      )}
    </AuthLayout>
  );
}
