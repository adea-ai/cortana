import { afterEach, describe, expect, test } from 'bun:test'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import tailwindcss from '@tailwindcss/vite'
import solid from 'vite-plugin-solid'
import { build as viteBuild, resolveConfig } from 'vite'

import {
  collectUiSourceFiles,
  formatUiSourceDirectives,
  missingRenderedUiSources,
  selectiveUiSourcePlugin,
} from './ui-tailwind-sources'

const require = createRequire(import.meta.url)
const webRoot = resolve(import.meta.dir, '..')

let fixtureRoot: string | undefined

afterEach(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true })
  fixtureRoot = undefined
})

function write(root: string, relativePath: string, content: string) {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return path
}

function resolveFile(path: string): string | undefined {
  const candidates = [
    path,
    ...['.ts', '.tsx', '.js', '.jsx'].map((extension) => `${path}${extension}`),
    ...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map((name) => join(path, name)),
  ]
  return candidates.find((candidate) => extname(candidate) && existsSync(candidate))
}

interface GraphFixture {
  root: string
  entrypoint: string
  uiRoot: string
  uiSourceRoot: string
  resolveId(specifier: string, importer: string): Promise<string | undefined>
}

// A minimal published-package layout resolved by hand, for graph-walk rules.
function makeGraphFixture(entrySource: string): GraphFixture {
  const root = mkdtempSync(join(tmpdir(), 'cortana-ui-sources-graph-'))
  fixtureRoot = root
  const uiRoot = join(root, 'shared-ui')
  const uiSourceRoot = join(uiRoot, 'src')
  const entrypoint = write(root, 'apps/web/src/main.tsx', entrySource)
  write(uiRoot, 'package.json', JSON.stringify({ name: '@adea-ai/ui' }))
  write(
    uiRoot,
    'src/index.ts',
    "export { Button } from './components/ui/button'\nexport { Input } from './components/ui/input'\n"
  )
  write(uiRoot, 'src/components/ui/button/index.ts', "export { Button } from './button'\n")
  write(
    uiRoot,
    'src/components/ui/button/button.tsx',
    `import { Label } from '@adea-ai/ui/components/ui/label'
import { controlSize } from '#lib/variants'
export function Button() { return <button class="bg-[#123456]" data-size={controlSize}><Label /></button> }
`
  )
  write(uiRoot, 'src/components/ui/label/index.ts', "export { Label } from './label'\n")
  write(
    uiRoot,
    'src/components/ui/label/label.tsx',
    'export function Label() { return <span class="text-[#135724]">Name</span> }\n'
  )
  write(uiRoot, 'src/components/ui/input/index.ts', "export { Input } from './input'\n")
  write(
    uiRoot,
    'src/components/ui/input/input.tsx',
    'export function Input() { return <input class="border-[#654321]" /> }\n'
  )
  write(uiRoot, 'src/lib/variants.ts', 'export const controlSize = "size-8"\n')

  async function resolveId(specifier: string, importer: string) {
    if (specifier === '@adea-ai/ui') return join(uiSourceRoot, 'index.ts')
    if (specifier.startsWith('@adea-ai/ui/'))
      return resolveFile(join(uiSourceRoot, specifier.slice('@adea-ai/ui/'.length)))
    if (specifier === '@vendor/engine')
      return resolveFile(join(root, 'node_modules/@vendor/engine/index.js'))
    if (specifier.startsWith('#lib/'))
      return resolveFile(join(uiSourceRoot, 'lib', specifier.slice(5)))
    if (specifier.startsWith('.')) return resolveFile(join(dirname(importer), specifier))
    return undefined
  }

  return { root, entrypoint, uiRoot, uiSourceRoot, resolveId }
}

function collect(fixture: GraphFixture) {
  return collectUiSourceFiles({
    entrypoint: fixture.entrypoint,
    repositoryRoot: fixture.root,
    uiPackageRoot: fixture.uiRoot,
    uiSourceRoot: fixture.uiSourceRoot,
    resolveId: fixture.resolveId,
  })
}

const includes = (files: string[], fragment: string) =>
  files.some((file) => file.replaceAll('\\', '/').includes(fragment))

describe('selective shared UI Tailwind source discovery', () => {
  test('follows value imports, nested dependencies and literal lazy imports, skipping type-only imports', async () => {
    const fixture = makeGraphFixture(`import { Button } from '@adea-ai/ui'
import type { ButtonProps } from '@adea-ai/ui'
const loadInput = () => import('@adea-ai/ui/components/ui/input').then((module) => ({ default: module.Input }))
export const controls = [Button, loadInput]
`)
    write(
      fixture.uiRoot,
      'src/components/ui/type-only/type-only.tsx',
      'export interface ButtonProps {}\n'
    )
    const files = await collect(fixture)

    expect(includes(files, '/components/ui/button/button.tsx')).toBe(true)
    expect(includes(files, '/components/ui/label/label.tsx')).toBe(true)
    expect(includes(files, '/components/ui/input/input.tsx')).toBe(true)
    expect(includes(files, '/lib/variants.ts')).toBe(true)
    expect(includes(files, '/type-only/')).toBe(false)
  })

  test('preserves runtime imports reached through a side-effect-only module', async () => {
    const fixture = makeGraphFixture("import './registration'\n")
    write(
      fixture.root,
      'apps/web/src/registration.ts',
      "import { Button } from '@adea-ai/ui'\nglobalThis.__CORTANA_UI__ = Button\n"
    )
    expect(includes(await collect(fixture), '/components/ui/button/button.tsx')).toBe(true)
  })

  test('does not traverse vendor modules with opaque dynamic imports', async () => {
    const fixture = makeGraphFixture(`import { engine } from '@vendor/engine'
import { Button } from '@adea-ai/ui'
export const controls = [engine, Button]
`)
    write(
      fixture.root,
      'node_modules/@vendor/engine/index.js',
      'export function engine(specifier) { return import(specifier) }\n'
    )
    expect(includes(await collect(fixture), '/components/ui/button/button.tsx')).toBe(true)
  })

  test('fails closed on opaque dynamic imports in first-party source', async () => {
    const fixture = makeGraphFixture("import './registration'\n")
    write(
      fixture.root,
      'apps/web/src/registration.ts',
      'export function loadModule(specifier: string) { return import(specifier) }\n'
    )
    await expect(collect(fixture)).rejects.toThrow(/non-literal runtime import/)
  })

  test('fails closed when a runtime UI import cannot be resolved', async () => {
    const fixture = makeGraphFixture(
      "import { Missing } from '@adea-ai/ui/components/ui/missing'\nexport const control = Missing\n"
    )
    await expect(collect(fixture)).rejects.toThrow(
      /unable to resolve runtime import.*@adea-ai\/ui/i
    )
  })

  test('keeps static namespace use selective and treats opaque namespace use conservatively', async () => {
    const fixture = makeGraphFixture(
      "import * as UI from '@adea-ai/ui'\nexport const control = UI.Button\n"
    )
    const selective = await collect(fixture)
    expect(includes(selective, '/components/ui/button/button.tsx')).toBe(true)
    expect(includes(selective, '/components/ui/input/input.tsx')).toBe(false)

    writeFileSync(
      fixture.entrypoint,
      "import * as UI from '@adea-ai/ui'\nexport const all = Object.values(UI)\n"
    )
    expect(includes(await collect(fixture), '/components/ui/input/input.tsx')).toBe(true)
  })

  test('reports rendered shared UI modules the generated sources missed', async () => {
    const fixture = makeGraphFixture(
      "import { Button } from '@adea-ai/ui'\nexport const b = Button\n"
    )
    const files = await collect(fixture)
    const uiRoot = realpathSync(fixture.uiRoot)
    const rendered = [
      `${uiRoot}/src/components/ui/button/button.tsx?solid`,
      `${uiRoot}/src/components/ui/input/input.tsx`,
      fixture.entrypoint,
    ]
    expect(missingRenderedUiSources(rendered, files, uiRoot)).toEqual([
      'src/components/ui/input/input.tsx',
    ])
  })
})

// The marker of an unused primitive, composite and block: JS strings, Tailwind
// utilities (arbitrary colours no used module spells) and component-local CSS.
const unused = {
  primitive: { js: 'UNUSED_PRIMITIVE_JS_MARKER', utility: 'bg-[#c0ffee]', color: '#c0ffee' },
  composite: { js: 'UNUSED_COMPOSITE_JS_MARKER', utility: 'text-[#facade]', color: '#facade' },
  block: {
    js: 'UNUSED_BLOCK_JS_MARKER',
    utility: 'border-[#decade]',
    color: '#decade',
    css: 'unused-block-css-marker',
  },
}
// An unused file beside a reached one: Tailwind widens a file source to its
// directory, so this proves the sibling stays out too.
const unusedSibling = {
  js: 'UNUSED_SIBLING_JS_MARKER',
  utility: 'outline-[#beaded]',
  color: '#beaded',
}
const unusedMarkers = [
  unusedSibling.js,
  unusedSibling.color,
  ...Object.values(unused).flatMap((marker) =>
    'css' in marker ? [marker.js, marker.color, marker.css] : [marker.js, marker.color]
  ),
]

const includedSources = (directives: string) =>
  directives.split('\n').filter((line) => line.startsWith("@source '"))

interface BuildResult {
  files: { name: string; bytes: number; gzip: number; initial: boolean }[]
  js: string
  css: string
  sources: string
}

// A Cortana-shaped consumer: apps/web with the published package linked into
// its node_modules, resolved by Vite through the package's own exports.
function makeConsumerFixture() {
  const root = mkdtempSync(join(tmpdir(), 'cortana-ui-sources-build-'))
  fixtureRoot = root
  const app = join(root, 'apps/web')
  const uiRoot = join(root, 'shared-ui')
  mkdirSync(join(app, 'node_modules/@adea-ai'), { recursive: true })
  symlinkSync(uiRoot, join(app, 'node_modules/@adea-ai/ui'), 'dir')
  // Resolve through the module graph: the workspace may hoist tailwindcss.
  symlinkSync(
    dirname(require.resolve('tailwindcss/package.json')),
    join(app, 'node_modules/tailwindcss'),
    'dir'
  )
  const source = { solid: './src/components/*/index.ts', import: './src/components/*/index.ts' }
  write(
    uiRoot,
    'package.json',
    JSON.stringify({
      name: '@adea-ai/ui',
      type: 'module',
      sideEffects: ['**/*.css'],
      imports: { '#lib/*': './src/lib/*.ts' },
      exports: {
        '.': { solid: './src/index.ts', import: './src/index.ts' },
        './components/*': source,
        './lib/*': { solid: './src/lib/*.ts', import: './src/lib/*.ts' },
        './package.json': './package.json',
      },
    })
  )
  write(uiRoot, 'src/lib/utils.ts', "export const cn = (...names: string[]) => names.join(' ')\n")
  write(uiRoot, 'src/lib/variants.ts', 'export const controlSize = "h-8 px-3"\n')
  write(uiRoot, 'src/components/ui/button/index.ts', "export { Button } from './button'\n")
  write(
    uiRoot,
    'src/components/ui/button/button.tsx',
    `import { cn } from '#lib/utils'
import { controlSize } from '#lib/variants'
export function Button(props: { children?: unknown }) {
  return <button class={cn('bg-[#123456]', controlSize)}>{props.children}</button>
}
`
  )
  write(uiRoot, 'src/components/ui/tooltip/index.ts', "export { Tooltip } from './tooltip'\n")
  write(
    uiRoot,
    'src/components/ui/tooltip/tooltip.tsx',
    'export function Tooltip() { return <div role="tooltip" class="text-[#135724]">USED_LAZY_TOOLTIP</div> }\n'
  )
  write(
    uiRoot,
    'src/components/composites/action-row/index.ts',
    "export { ActionRow } from './action-row'\n"
  )
  write(
    uiRoot,
    'src/components/composites/action-row/action-row.tsx',
    `import { Button } from '@adea-ai/ui/components/ui/button'
export function ActionRow() { return <div class="gap-[7px]"><Button>Run</Button></div> }
`
  )
  write(
    uiRoot,
    'src/components/blocks/settings-block/index.ts',
    "export { SettingsBlock } from './settings-block'\n"
  )
  write(
    uiRoot,
    'src/components/blocks/settings-block/settings-block.tsx',
    `import { ActionRow } from '@adea-ai/ui/components/composites/action-row'
export function SettingsBlock() { return <section class="p-[9px]"><ActionRow /></section> }
`
  )
  const barrel = (extra = '') =>
    write(
      uiRoot,
      'src/index.ts',
      `export { Button } from './components/ui/button'
export { ActionRow } from './components/composites/action-row'
export { SettingsBlock } from './components/blocks/settings-block'
${extra}`
    )
  barrel()

  write(
    app,
    'src/shadcn.css',
    `@import 'tailwindcss';
@import '../node_modules/.cache/cortana-ui-tailwind-sources.css';
`
  )
  const consumer = (body: string) =>
    write(
      app,
      'src/main.tsx',
      `import './shadcn.css'
import { Button } from '@adea-ai/ui'
import { SettingsBlock } from '@adea-ai/ui/components/blocks/settings-block'
const loadTooltip = () => import('@adea-ai/ui/components/ui/tooltip').then((module) => module.Tooltip)
${body}
// An app build drops entry exports; publishing the surfaces keeps them live.
Object.assign(globalThis, { surfaces: [Button, SettingsBlock, loadTooltip] })
`
    )
  consumer('')

  const addUnusedExports = () => {
    write(
      uiRoot,
      'src/components/ui/button/split-button.tsx',
      `export function SplitButton() { return <div class="${unusedSibling.utility}">${unusedSibling.js}</div> }\n`
    )
    write(uiRoot, 'src/components/ui/calendar/index.ts', "export { Calendar } from './calendar'\n")
    write(
      uiRoot,
      'src/components/ui/calendar/calendar.tsx',
      `export function Calendar() { return <div class="${unused.primitive.utility}">${unused.primitive.js}</div> }\n`
    )
    write(
      uiRoot,
      'src/components/composites/date-card/index.ts',
      "export { DateCard } from './date-card'\n"
    )
    write(
      uiRoot,
      'src/components/composites/date-card/date-card.tsx',
      `import { Calendar } from '@adea-ai/ui/components/ui/calendar'
import { Button } from '@adea-ai/ui/components/ui/button'
export function DateCard() { return <div class="${unused.composite.utility}">${unused.composite.js}<Calendar /><Button /></div> }
`
    )
    write(
      uiRoot,
      'src/components/blocks/schedule-block/index.ts',
      "export { ScheduleBlock } from './schedule-block'\n"
    )
    write(
      uiRoot,
      'src/components/blocks/schedule-block/schedule-block.css',
      `.${unused.block.css} { outline: 1px solid; }\n`
    )
    write(
      uiRoot,
      'src/components/blocks/schedule-block/schedule-block.tsx',
      `import './schedule-block.css'
import { DateCard } from '@adea-ai/ui/components/composites/date-card'
export function ScheduleBlock() { return <section class="${unused.block.utility} ${unused.block.css}">${unused.block.js}<DateCard /></section> }
`
    )
    barrel(`export { Calendar } from './components/ui/calendar'
export { DateCard } from './components/composites/date-card'
export { ScheduleBlock } from './components/blocks/schedule-block'
`)
  }

  const build = async (): Promise<BuildResult> => {
    const output = await viteBuild({
      configFile: false,
      logLevel: 'silent',
      mode: 'production',
      root: app,
      plugins: [selectiveUiSourcePlugin(app), solid(), tailwindcss()],
      build: {
        write: false,
        minify: false,
        manifest: true,
        rollupOptions: {
          input: join(app, 'src/main.tsx'),
          external: [/^solid-js/],
        },
      },
    })
    if (!Array.isArray(output) && !('output' in output))
      throw new Error('Vite returned a watcher instead of a production build result')
    const chunks = (Array.isArray(output) ? output : [output]).flatMap((result) => result.output)
    const entry = chunks.find((chunk) => chunk.type === 'chunk' && chunk.isEntry)
    const initial = new Set<string>()
    const pending = entry ? [entry.fileName] : []
    while (pending.length) {
      const name = pending.pop()!
      if (initial.has(name)) continue
      initial.add(name)
      const chunk = chunks.find((candidate) => candidate.fileName === name)
      if (chunk?.type !== 'chunk') continue
      pending.push(...chunk.imports, ...(chunk.viteMetadata?.importedCss ?? []))
    }
    const files = chunks
      .filter((chunk) => !chunk.fileName.startsWith('.vite/'))
      .map((chunk) => {
        const text = chunk.type === 'chunk' ? chunk.code : chunk.source
        const buffer = typeof text === 'string' ? Buffer.from(text) : Buffer.from(text)
        return {
          name: chunk.fileName,
          bytes: buffer.length,
          gzip: gzipSync(buffer).length,
          initial: initial.has(chunk.fileName),
        }
      })
      .toSorted((left, right) => left.name.localeCompare(right.name))
    const text = (suffix: string) =>
      chunks
        .filter((chunk) => chunk.fileName.endsWith(suffix))
        .map((chunk) => (chunk.type === 'chunk' ? chunk.code : String(chunk.source)))
        .join('\n')
    return {
      files,
      js: text('.js'),
      css: text('.css'),
      sources: readFileSync(
        join(app, 'node_modules/.cache/cortana-ui-tailwind-sources.css'),
        'utf8'
      ),
    }
  }

  return { root, app, uiRoot, consumer, addUnusedExports, build }
}

describe('production build with selective shared UI sources', () => {
  // Two full Vite + Tailwind production builds of the same, unchanged consumer:
  // one before and one after the package gains an unused primitive, composite
  // and block. Nothing the consumer does not import may reach its output.
  test('adds no JS, CSS or files when unused primitives, composites and blocks are exported', async () => {
    const fixture = makeConsumerFixture()
    const before = await fixture.build()

    expect(before.sources).toContain('components/ui/tooltip/tooltip.tsx')
    expect(before.sources).toContain('components/blocks/settings-block/settings-block.tsx')
    expect(before.js).toContain('USED_LAZY_TOOLTIP')
    for (const used of ['#123456', '#135724', '7px', '9px', '.h-8', '.px-3'])
      expect(before.css).toContain(used)

    fixture.addUnusedExports()
    const after = await fixture.build()

    // The reached set is unchanged; the new files sit in a scanned tree (the
    // package-root barrel), so they are negated rather than scanned.
    expect(includedSources(after.sources)).toEqual(includedSources(before.sources))
    for (const file of [
      'components/ui/calendar/calendar.tsx',
      'components/composites/date-card/date-card.tsx',
      'components/blocks/schedule-block/schedule-block.tsx',
      'components/blocks/schedule-block/schedule-block.css',
      'components/ui/button/split-button.tsx',
    ])
      expect(after.sources).toContain(`@source not '../@adea-ai/ui/src/${file}';`)
    expect(after.files).toEqual(before.files)
    expect(after.js).toBe(before.js)
    expect(after.css).toBe(before.css)
    for (const marker of unusedMarkers) {
      expect(after.js).not.toContain(marker)
      expect(after.css).not.toContain(marker)
    }
  }, 60_000)

  test('retains the markers once the consumer imports the block (positive control)', async () => {
    const fixture = makeConsumerFixture()
    fixture.addUnusedExports()
    fixture.consumer(
      "import { ScheduleBlock } from '@adea-ai/ui'\nObject.assign(globalThis, { schedule: ScheduleBlock })\n"
    )
    const built = await fixture.build()
    for (const marker of Object.values(unused)) expect(built.js).toContain(marker.js)
    for (const marker of Object.values(unused)) expect(built.css).toContain(marker.color)
    expect(built.css).toContain(unused.block.css)
  }, 60_000)
})

describe("Cortana's own client graph", () => {
  test('reaches lazy surfaces and excludes components the app never imports', async () => {
    const config = await resolveConfig(
      { root: webRoot, configFile: false, logLevel: 'silent', plugins: [solid()] },
      'build'
    )
    const resolver = config.createResolver()
    const resolveId = (specifier: string, importer: string) =>
      resolver(specifier, importer, false, false)
    const entrypoint = resolve(webRoot, 'src/main.tsx')
    const manifest = await resolveId('@adea-ai/ui/package.json', entrypoint)
    if (!manifest) throw new Error('unable to resolve @adea-ai/ui/package.json')
    const uiRoot = realpathSync(dirname(manifest))
    const files = (
      await collectUiSourceFiles({
        entrypoint,
        repositoryRoot: resolve(webRoot, '../..'),
        uiPackageRoot: uiRoot,
        uiSourceRoot: resolve(uiRoot, 'src'),
        resolveId,
      })
    ).map((file) => relative(uiRoot, file).replaceAll('\\', '/'))

    for (const reached of [
      // Lazy-loaded composites and primitives (App.tsx, settings sections).
      'src/components/composites/about-dialog/about-dialog.tsx',
      'src/components/composites/update-dialog/update-dialog.tsx',
      'src/components/composites/help-center/help-center.tsx',
      'src/components/ui/combobox/combobox.tsx',
      // Overlays the shell and Settings open and close.
      'src/components/ui/dialog/dialog.tsx',
      'src/components/ui/tooltip/tooltip.tsx',
      'src/components/ui/dropdown-menu/dropdown-menu.tsx',
      'src/components/ui/popover/popover.tsx',
      'src/components/composites/settings/index.ts',
      // Shared helpers the components compose with.
      'src/lib/utils.ts',
      'src/lib/variants.ts',
      'src/lib/tooltip-focus-gate.ts',
    ])
      expect(files).toContain(reached)
    for (const unreached of [
      'src/components/ui/calendar/calendar.tsx',
      'src/components/ui/annotation-surface/annotation-surface.tsx',
      'src/components/composites/catalog-browser/catalog-browser.tsx',
      'src/components/conversation/index.ts',
    ])
      expect(files).not.toContain(unreached)

    // The directives point at the stable link, not a machine-specific store path.
    const directives = formatUiSourceDirectives({
      files: files.map((file) => resolve(uiRoot, file)),
      uiPackageRoot: uiRoot,
      stablePackagePath: resolve(webRoot, 'node_modules/@adea-ai/ui'),
      stylesheetPath: resolve(webRoot, 'node_modules/.cache/cortana-ui-tailwind-sources.css'),
    })
    expect(directives).toContain("@source '../@adea-ai/ui/src/lib/utils.ts';")
    expect(directives).not.toContain(uiRoot)
  }, 30_000)
})
