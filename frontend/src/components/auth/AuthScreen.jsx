import { useState } from 'react';

import AuthLayout from './AuthLayout';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

export default function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  return (
    <AuthLayout>
      {/* Umschalter zwischen Login und Registrierung */}
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-950 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`rounded-lg py-2 transition ${
            mode === 'login'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Anmelden
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`rounded-lg py-2 transition ${
            mode === 'register'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Registrieren
        </button>
      </div>

      {mode === 'login' ? (
        <LoginForm onSwitchToRegister={() => setMode('register')} />
      ) : (
        <RegisterForm onSwitchToLogin={() => setMode('login')} />
      )}
    </AuthLayout>
  );
}
