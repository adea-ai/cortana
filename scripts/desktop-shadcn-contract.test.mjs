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

    // TypeScript 7 removed `baseUrl`; explicit ./ paths resolve relative to
    // this tsconfig, which is what the generated-component alias needs.
    expect(tsconfig.compilerOptions).toMatchObject({
      paths: { '@/*': ['./src/*'] },
    })
    expect(tsconfig.compilerOptions.baseUrl).toBeUndefined()
  })

  test('disables renderer motion when the operating system requests it', () => {
    // The shared base stylesheet owns the reduced-motion override; the app
    // imports it instead of keeping a second copy.
    const css = readFileSync(resolve(root, 'apps/web/src/shadcn.css'), 'utf8')
    const base = readFileSync(
      Bun.resolveSync('@adea-ai/ui/base.css', resolve(root, 'apps/web')),
      'utf8'
    )

    expect(css).toContain("@import '@adea-ai/ui/base.css';")
    expect(base).toContain('@media (prefers-reduced-motion: reduce)')
    expect(base).toContain('animation-duration: 0.01ms !important')
    expect(base).toContain('transition-duration: 0.01ms !important')
  })
})
