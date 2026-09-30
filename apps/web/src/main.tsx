import { Suspense } from 'solid-js'
import { render } from 'solid-js/web'

import { App } from './App'
import { RendererErrorBoundary } from './components/RendererErrorBoundary'
import { installInertBackground } from './lib/inertBackground'

// Cortana is dark-chrome only. The shared theme.css `.dark` block owns the
// first-paint tokens, so the class goes on before the first render; the
// ThemeProvider inside App refines it to the workspace's catalogue theme.
document.documentElement.classList.add('dark')
installInertBackground(document.getElementById('root')!)

render(
  () => (
    <RendererErrorBoundary>
      <Suspense>
        <App />
      </Suspense>
    </RendererErrorBoundary>
  ),
  document.getElementById('root')!
)
