import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')

describe('Desktop shadcn renderer contract', () => {
  test('consumes the published shared UI instead of an app-local registry preset', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'apps/web/package.json'), 'utf8'))
    const css = readFileSync(resolve(root, 'apps/web/src/shadcn.css'), 'utf8')
    expect(manifest.dependencies['@adea-ai/ui']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(manifest.dependencies['@adea-ai/themes']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(css).toContain("@import '@adea-ai/ui/base.css'")
    expect(css).toContain("@import '@adea-ai/ui/theme.css'")
    expect(css).not.toContain("@import 'shadcn/tailwind.css'")
    expect(existsSync(resolve(root, 'apps/web/components.json'))).toBe(false)
  })

  test('keeps Tailwind and the Vite plugin in the web workspace', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'apps/web/package.json'), 'utf8'))

    expect(manifest.devDependencies).toMatchObject({
      '@tailwindcss/vite': expect.any(String),
      tailwindcss: expect.any(String),
    })
  })

  test('resolves application domain compositions through the checked-in source alias', () => {
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
