import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import './styles/index.css';

// Einladungslink (#/einladung/<token>) merken: Nach dem Google-Login geht die Adresse sonst verloren.
const invite = /^#\/einladung\/([0-9a-f]+)/.exec(window.location.hash);
if (invite) {
  try {
    localStorage.setItem('pendingInvite', invite[1]);
  } catch {
    /* ignorieren */
  }
}

// HashRouter: funktioniert auf GitHub Pages ohne Server-Weiterleitungen.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
);
