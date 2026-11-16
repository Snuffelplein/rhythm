import React from 'react';
import { createRoot } from 'react-dom/client';
import { AccountShell } from './account/account-shell';
import './account/account.css';
import './style.css';
import './flow.css';
import './readability.css';
import './visual-design.css';
import './pwa.css';
import './guidance/guidance.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><AccountShell /></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => { }); });
}
