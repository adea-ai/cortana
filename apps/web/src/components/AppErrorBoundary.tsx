import { ErrorBoundary, type JSX } from 'solid-js'
import { AlertTriangle } from 'lucide-solid'

import { Button } from './shadcn/button'

/** Keeps a renderer exception from leaving the desktop window blank. */
export function AppErrorBoundary(props: { children: JSX.Element }) {
  return (
    <ErrorBoundary
      fallback={(error) => {
        console.error('Cortana renderer failed', error)
        return (
          <main class="empty-state runtime-error" role="alert">
            <AlertTriangle size={30} />
            <h1>Cortana needs a reload</h1>
            <p>
              The workspace hit an unexpected renderer error. Your local index and settings are
              safe.
            </p>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload workspace
            </Button>
          </main>
        )
      }}
    >
      {props.children}
    </ErrorBoundary>
  )
}
