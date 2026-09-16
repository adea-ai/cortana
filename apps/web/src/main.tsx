import { lazy, Suspense } from 'solid-js'
import { render } from 'solid-js/web'

import { RendererErrorBoundary } from './components/RendererErrorBoundary'
import { applyTheme, DEFAULT_THEME } from './theme'

const App = lazy(() =>
  import('./App').then((module) => ({
    default: module.App,
  }))
)

applyTheme(DEFAULT_THEME)

render(
  () => (
    <RendererErrorBoundary>
      <Suspense fallback={<main aria-label="Loading Cortana" />}>
        <App />
      </Suspense>
    </RendererErrorBoundary>
  ),
  document.getElementById('root')!
)
