import { Suspense } from 'solid-js'
import { render } from 'solid-js/web'

import { App } from './App'
import { RendererErrorBoundary } from './components/RendererErrorBoundary'
import { installInertBackground } from './lib/inertBackground'

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

// Cortana is dark-chrome only. The shared theme.css `.dark` block owns the
// first-paint tokens, so the class goes on before the first render; the
// ThemeProvider inside App refines it to the workspace's catalogue theme.
document.documentElement.classList.add('dark')
document.documentElement.style.colorScheme = 'dark'
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
