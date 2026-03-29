import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initGoogleAnalytics } from './initGoogleAnalytics.ts'

const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID
if (gaId) {
  initGoogleAnalytics(gaId)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
