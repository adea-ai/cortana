import { Suspense } from 'solid-js'
import { render } from 'solid-js/web'

import { App } from './App'
import { RendererErrorBoundary } from './components/RendererErrorBoundary'
import { installInertBackground } from './lib/inertBackground'
import { applyTheme, DEFAULT_THEME } from './theme'

// The primary Latin variable font is discovered through the bundled CSS.
// Preloading it here starts the fetch in parallel with the first render
// instead of waiting for the stylesheet to download and parse.
import geistFontUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'

const fontPreload = document.createElement('link')
fontPreload.rel = 'preload'
fontPreload.href = geistFontUrl
fontPreload.as = 'font'
fontPreload.type = 'font/woff2'
fontPreload.crossOrigin = 'anonymous'
document.head.appendChild(fontPreload)

applyTheme(DEFAULT_THEME)
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
