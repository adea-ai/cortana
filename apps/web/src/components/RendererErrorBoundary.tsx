import { ErrorBoundary, type JSX } from 'solid-js'

/** Catches renderer chunk and root failures before either visual system loads. */
export function RendererErrorBoundary(props: { children: JSX.Element }) {
  return (
    <ErrorBoundary
      fallback={(error) => {
        console.error('Cortana renderer failed', error)
        return (
          <main
            role="alert"
            style={{
              'align-items': 'center',
              background: 'var(--background, #0f1624)',
              color: 'var(--foreground, #f0f3fc)',
              display: 'flex',
              'flex-direction': 'column',
              'font-family': 'system-ui, sans-serif',
              gap: '0.75rem',
              'justify-content': 'center',
              'min-height': '100vh',
              padding: '2rem',
              'text-align': 'center',
            }}
          >
            <h1>Cortana needs a reload</h1>
            <p>The renderer could not load. Your local index and settings are safe.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: 'var(--primary, #59defc)',
                border: 0,
                'border-radius': '0.5rem',
                color: 'var(--primary-foreground, #151b2b)',
                cursor: 'pointer',
                font: 'inherit',
                'font-weight': 600,
                'min-height': '2.75rem',
                padding: '0.625rem 1rem',
              }}
            >
              Reload workspace
            </button>
          </main>
        )
      }}
    >
      {props.children}
    </ErrorBoundary>
  )
}
