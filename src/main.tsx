import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import * as usbService from './services/usbService';

const savedTheme = localStorage.getItem('conductor-theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

// Temporary console hook for testing the hold-tap positions RPC before the
// dedicated UI panel exists. Remove once TrackballConfig-style UI is wired.
(window as any).zmkDebug = usbService;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
