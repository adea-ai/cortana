import { ErrorBoundary, type JSX } from 'solid-js'
import { AlertTriangle } from 'lucide-solid'

import { EmptyState } from '@adea-ai/ui/components/ui/empty'

/** Keep recovery in the eagerly loaded shell when a renderer chunk fails. */
export function RendererErrorBoundary(props: { children: JSX.Element }) {
  return (
    <ErrorBoundary
      fallback={(error) => {
        console.error('Cortana renderer failed', error)
        return (
          <main class="flex h-full w-full">
            <EmptyState
              announceAs="alert"
              icon={<AlertTriangle aria-hidden="true" />}
              title="Cortana needs a reload"
              detail="The renderer could not load. Your local index and settings are safe."
              action={() => window.location.reload()}
              actionLabel="Reload workspace"
            />
          </main>
        )
      }}
    >
      {props.children}
    </ErrorBoundary>
  )
}
