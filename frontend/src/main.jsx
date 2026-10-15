import React from 'react';
import { HelmetProvider } from 'react-helmet-async';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { loadTheme } from './lib/theme';
import { ensureConsentLoaded } from './components/CookieConsentBanner';
import './i18n';

const style = document.createElement('style');
style.textContent = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #ece7db; color: #0e1f18; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
h1, h2, h3 { font-family: 'Fraunces', 'Hoefler Text', 'Iowan Old Style', Georgia, serif !important; letter-spacing: -0.015em; }
button { font-family: inherit; }
input, select, textarea { font-family: inherit; }
input:focus, select:focus, textarea:focus { outline: none; border-color: #0e7a54 !important; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cfc8b8; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #99a09a; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes slideIn { from { transform: translateX(100%); } to { transform: none; } }
.fade-in { animation: fadeIn 0.3s ease-out; }
.slide-in { animation: slideIn 0.3s ease-out; }
`;
document.head.appendChild(style);
loadTheme();
// Re-arm GA for visitors who already accepted on a previous visit.
// The banner itself only renders for first-time / cleared-consent
// users, so without this call returning visitors would lose analytics.
ensureConsentLoaded();

ReactDOM.createRoot(document.getElementById('root')).render(
  <HelmetProvider>
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  </HelmetProvider>
);
