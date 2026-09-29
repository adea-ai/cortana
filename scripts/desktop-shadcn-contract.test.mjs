import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')

describe('Desktop shadcn renderer contract', () => {
  test('adopts the shared design system and its stylesheet entrypoints', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'apps/web/package.json'), 'utf8'))
    const css = readFileSync(resolve(root, 'apps/web/src/shadcn.css'), 'utf8')

    expect(manifest.dependencies).toMatchObject({
      // Exact pin: the shared packages are pre-1.0 and their patch releases
      // may change tokens or component DOM.
      '@adea-ai/ui': expect.any(String),
    })
    expect(css).toContain("@import '@adea-ai/ui/theme.css';")
    expect(css).toContain("@import '@adea-ai/ui/base.css';")
    // Tailwind must discover the shared components' class strings.
    expect(css).toContain("@source '../node_modules/@adea-ai/ui/src/components';")
  })

  test('keeps Tailwind and the Vite plugin in the web workspace', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'apps/web/package.json'), 'utf8'))

    expect(manifest.devDependencies).toMatchObject({
      '@tailwindcss/vite': expect.any(String),
      tailwindcss: expect.any(String),
    })
  })

  test('resolves generated components through the checked-in source alias', () => {
    const tsconfig = JSON.parse(readFileSync(resolve(root, 'apps/web/tsconfig.json'), 'utf8'))

    expect(tsconfig.compilerOptions).toMatchObject({
      baseUrl: '.',
      paths: { '@/*': ['./src/*'] },
    })
  })

  test('disables renderer motion when the operating system requests it', () => {
    const css = readFileSync(resolve(root, 'apps/web/src/shadcn.css'), 'utf8')

    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: 0.01ms !important')
    expect(css).toContain('transition-duration: 0.01ms !important')
  })
})
