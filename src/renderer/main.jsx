import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

function relayError(source, details) {
  console.error(`[${source}]`, details);
  window.electronAPI?.logError?.({ source, ...details }).catch?.(() => {});
}

window.addEventListener('error', (e) => {
  relayError('window.error', {
    message: e.message,
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
    stack: e.error?.stack,
    timestamp: new Date().toISOString(),
  });
});

window.addEventListener('unhandledrejection', (e) => {
  relayError('unhandledrejection', {
    message: String(e.reason),
    stack: e.reason?.stack,
    timestamp: new Date().toISOString(),
  });
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
