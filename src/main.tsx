import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installErrorReporting } from './lib/error-reporting';
import './styles/globals.css';

installErrorReporting();

// In the desktop app a startup script has already applied the saved theme
// (theme_script in src-tauri/src/desktop.rs); the browser preview follows the system.
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
