import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Reihenfolge der Provider: <ThemeProvider> liegt INNERHALB von
// <AuthProvider>, weil das gewählte Design am Benutzerprofil hängt – der
// Theme-Provider liest es über useAuth() und schreibt Änderungen dorthin
// zurück. Umgekehrt wüsste er nichts vom angemeldeten Konto.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
