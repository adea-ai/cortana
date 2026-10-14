// Writes node_modules/.cache/cortana-ui-tailwind-sources.css without a build.
// shadcn.css imports that file, so anything that compiles the stylesheet before
// `vite build` (the shared UI lint reads the project's Tailwind theme) needs it
// to exist. Bun cannot run Vite's bundled config loader (it resolves the
// config's import.meta.resolve through a module runner), so load it natively.
// Resolving Vite's config runs the selective-sources plugin's
// configResolved hook, which generates it.
import { fileURLToPath } from 'node:url'

import { resolveConfig } from 'vite'

const webRoot = fileURLToPath(new URL('..', import.meta.url))

await resolveConfig({ root: webRoot, logLevel: 'error', configLoader: 'native' }, 'build')
