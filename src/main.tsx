import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider } from './context/I18nContext'
import { initGoogleAnalytics } from './initGoogleAnalytics.ts'

const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID
if (gaId) {
  initGoogleAnalytics(gaId)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)
