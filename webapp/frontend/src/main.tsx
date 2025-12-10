
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

// Global app styles (used for the authenticated application shell)
// Move any login background out of index.css and into login.css instead
import './App.css';

import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
