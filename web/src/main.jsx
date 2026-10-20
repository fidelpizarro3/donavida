import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// TAREA-11: el service worker recibe las alertas push aunque la app esté cerrada
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.error('No se pudo registrar el service worker', err))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
