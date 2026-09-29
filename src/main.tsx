import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installErrorReporting } from './lib/error-reporting';
import './styles/globals.css';

installErrorReporting();

// The desktop app opens its window in the saved theme (create_main_window in
// src-tauri/src/lib.rs); use that until the settings load, so nothing flashes.
const initialTheme = (window as Window & { __LINOTES_THEME__?: string }).__LINOTES_THEME__;
document.documentElement.dataset.theme =
  initialTheme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
