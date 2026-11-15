import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import './flow.css';
import './readability.css';
import './visual-design.css';
import './pwa.css';
import './cloud/cloud.css';
import './guidance/guidance.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => { }); });
}
