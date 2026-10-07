import { Suspense } from 'solid-js'
import { render } from 'solid-js/web'

import { App } from './App'
import { RendererErrorBoundary } from './components/RendererErrorBoundary'
import { installInertBackground } from './lib/inertBackground'
import { installTooltipFocusGate } from '@adea-ai/ui/lib/tooltip-focus-gate'

// Cortana is dark-chrome only. The shared theme.css `.dark` block owns the
// first-paint tokens, so the class goes on before the first render; the
// ThemeProvider inside App refines it to the workspace's catalogue theme.
document.documentElement.classList.add('dark')
installInertBackground(document.getElementById('root')!)
// Dialog/sheet autofocus lands on tooltip-carrying controls; the shared gate
// keeps tooltips from opening (and pinning) on programmatic focus — the same
// fix adea shipped via adea#1084, published in @adea-ai/ui 0.120.0.
installTooltipFocusGate(document)

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
