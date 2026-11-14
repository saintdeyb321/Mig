import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { FullscreenState } from './shared/ui'
import { LegalDocumentDialog } from './features/legal/LegalDocuments.jsx'
import { legalRoutes } from './features/legal/publication.js'

const App = lazy(() => import('./App.jsx'))
const legalKind = Object.keys(legalRoutes).find(kind => legalRoutes[kind] === window.location.pathname.replace(/\/$/, ''))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {legalKind ? <LegalDocumentDialog kind={legalKind} onClose={() => window.location.replace('/')} />
        : <Suspense fallback={<FullscreenState loading title="Iniciando MigaPOS…" />}><App /></Suspense>}
    </ErrorBoundary>
  </StrictMode>,
)
