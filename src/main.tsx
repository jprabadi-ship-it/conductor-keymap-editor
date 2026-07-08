import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LayerPopup } from './LayerPopup.tsx'
import * as usbService from './services/usbService';

const savedTheme = localStorage.getItem('conductor-theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

// Temporary console hook for testing the hold-tap positions RPC before the
// dedicated UI panel exists. Remove once TrackballConfig-style UI is wired.
(window as any).zmkDebug = usbService;

// The Electron tray's small popup window loads this same index.html with a
// #/popup hash (see electron/main.cjs createPopupWindow) instead of a
// separate HTML entry point, and renders the read-only layer viewer instead
// of the full editor.
const isPopup = window.location.hash === '#/popup';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPopup ? <LayerPopup /> : <App />}
  </StrictMode>,
)
