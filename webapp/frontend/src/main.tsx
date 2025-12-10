
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Global app styles (used for the authenticated application shell)
// Move any login background out of index.css and into login.css instead
import './App.css';

import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
