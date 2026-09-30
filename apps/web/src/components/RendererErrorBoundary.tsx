import { ErrorBoundary, type JSX } from 'solid-js'
import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@adea-ai/ui/components/ui/empty'

/** Keep recovery in the eagerly loaded shell when a renderer chunk fails. */
export function RendererErrorBoundary(props: { children: JSX.Element }) {
  return (
    <ErrorBoundary
      fallback={(error) => {
        console.error('Cortana renderer failed', error)
        return (
          <main role="alert">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Cortana needs a reload</EmptyTitle>
                <EmptyDescription>
                  The renderer could not load. Your local index and settings are safe.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => window.location.reload()} tooltip="Reload the workspace">
                  Reload workspace
                </Button>
              </EmptyContent>
            </Empty>
          </main>
        )
      }}
    >
      {props.children}
    </ErrorBoundary>
  )
}
