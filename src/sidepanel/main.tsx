// CRITICAL: Initialize mock Chrome API FIRST, before any other imports
// This ensures chrome.storage is available when i18n initializes
import { initMockChrome } from '../services/mockChrome';
initMockChrome();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '../i18n';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
