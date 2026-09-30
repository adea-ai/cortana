import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  collectSharedClasses,
  collectWebUiContractFailures,
  normalizePathSeparators,
} from './check-web-ui-contract.mjs'

const temporaryRoots = []
const requiredUiRules = [
  'adea/no-raw-interactive-elements',
  'adea/no-primitive-library-imports',
  'adea/no-interactive-wrappers',
  'adea/no-inline-styles',
  'adea/no-class-list',
  'adea/require-action-button-tooltip',
  'shadcn/no-restyle',
  'shadcn/no-raw-colors',
  'shadcn/no-arbitrary-values',
  'shadcn/no-inline-styles',
  'shadcn/no-unknown-classes',
  'shadcn/require-static-classes',
]

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'cortana-web-ui-contract-'))
  temporaryRoots.push(root)
  mkdirSync(resolve(root, 'apps/web/src'), { recursive: true })
  mkdirSync(resolve(root, 'apps/web'), { recursive: true })
  mkdirSync(resolve(root, 'node_modules/@adea-ai/ui/src/styles'), { recursive: true })
  mkdirSync(resolve(root, 'node_modules/@adea-ai/ui/dist/lint'), { recursive: true })
  writeFileSync(
    resolve(root, 'node_modules/@adea-ai/ui/package.json'),
    JSON.stringify({ name: '@adea-ai/ui', exports: { './lint': './dist/lint/index.js' } })
  )
  writeFileSync(
    resolve(root, 'node_modules/@adea-ai/ui/dist/lint/index.js'),
    "export default { rules: { 'no-inline-styles': {} } };\n"
  )

  writeFileSync(
    resolve(root, 'apps/web/package.json'),
    JSON.stringify({
      name: '@cortana/web',
      dependencies: { '@adea-ai/themes': '0.8.1', '@adea-ai/ui': '^0.81.1' },
    })
  )
  writeFileSync(
    resolve(root, 'package.json'),
    JSON.stringify({ name: 'cortana-workspace', devDependencies: { '@adea-ai/ui': '^0.81.1' } })
  )
  writeFileSync(
    resolve(root, 'node_modules/@adea-ai/ui/src/styles/theme.css'),
    ':root { --background: #000; --primary: #fff; --foreground: red; }\n'
  )
  writeFileSync(resolve(root, 'apps/web/src/shadcn.css'), "@import '@adea-ai/ui/theme.css';\n")

  const rules = Object.fromEntries(requiredUiRules.map((rule) => [rule, 'error']))
  rules['shadcn/no-restyle'] = [
    'error',
    { deny: ['color', 'typography', 'shape', 'effects', 'motion'] },
  ]
  rules['shadcn/no-inline-styles'] = 'error'
  rules['shadcn/no-unknown-classes'] = 'error'
  writeFileSync(
    resolve(root, '.oxlintrc.json'),
    JSON.stringify(
      {
        plugins: ['jsx-a11y'],
        jsPlugins: ['@adea-ai/ui/lint', '@shadcn/lint'],
        settings: { shadcn: { ui: '@adea-ai/ui/components' } },
        rules,
        overrides: [],
      },
      null,
      2
    )
  )
  return root
}

function writeFixtureFile(root, relativePath, contents) {
  const path = resolve(root, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, contents)
  return path
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test('normalizes Windows source paths before applying UI contract rules', () => {
  expect(normalizePathSeparators('components\\shadcn\\textarea.tsx')).toBe(
    'components/shadcn/textarea.tsx'
  )
  expect(normalizePathSeparators('components\\Workspace.tsx')).toBe('components/Workspace.tsx')
})

test('accepts shared imports, token-based CSS, and shared layout classes without JSX styles', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/Example.tsx',
    `import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import { Card } from '@adea-ai/ui/components/ui/card'

export function Example() {
  return <Card class="layout-example"><Button tooltip="Open example" class="button-layout" /></Card>
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/example.css',
    '.layout-example { display: grid; gap: 1rem; }\n.button-layout { width: 100%; flex: 1; }\n'
  )

  expect(collectWebUiContractFailures(root)).toEqual([])
  expect(collectSharedClasses(root)).toContainEqual({
    className: 'layout-example',
    component: 'Card',
    sharedPrimitive: 'Card',
    file: 'components/Example.tsx',
    line: 5,
    classNames: ['layout-example'],
  })
})

test('rejects shared control sizing in direct, aliased, object, spread, and descendant-variant classes', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/ControlClassSizes.tsx',
    `import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { Card } from '@adea-ai/ui/components/ui/card'
import { Input } from '@adea-ai/ui/components/ui/input'
import { SheetContent } from '@adea-ai/ui/components/overlays/sheet'
import { ListRow } from '@adea-ai/ui/components/composites/list-row'

const aliasedClass = 'p-10'
const spreadProps = { class: 'h-24' }
const objectClasses = { 'py-8': true, 'w-full': true }

export function ControlClassSizes() {
  return <>
    <ActionButton tooltip="Open example" class="h-24 p-10 w-full flex-1 sm:grid">Open</ActionButton>
    <Input class={aliasedClass} />
    <Input classList={objectClasses} />
    <ActionButton tooltip="Open spread" {...spreadProps} />
    <Input {...{ className: 'max-h-20' }} />
    <Input class="grid block flex inline-flex" />
    <Input class="hidden" />
    <SheetContent class="[&>button]:h-24">Options</SheetContent>
    <SheetContent class="[&_[data-slot=button]]:p-10">More options</SheetContent>
    <SheetContent class="p-10 sm:p-12 hover:p-2 w-full flex flex-col">Layout</SheetContent>
    <ListRow as="button" tooltip="Open document" class="h-24 p-10">Document</ListRow>
    <Card class="p-10 w-full flex-1" />
  </>
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/restyles shared control geometry/g)).toHaveLength(9)
  expect(failures).toContain('h-24')
  expect(failures).toContain('p-10')
  expect(failures).toContain('py-8')
  expect(failures).toContain('max-h-20')
  expect(failures).toContain('[&>button]:h-24')
  expect(failures).toContain('[&_[data-slot=button]]:p-10')
  expect(failures).toContain('<ListRow>')
  expect(failures).toContain('sm:grid')
  for (const utility of ['grid', 'block', 'flex', 'inline-flex'])
    expect(failures).toContain(utility)
  expect(failures).not.toContain('Card')
  expect(failures).not.toContain('w-full')
  expect(failures).not.toContain('flex-1')
})

test('resolves class aliases by lexical scope and respects shadowing parameters', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/ScopedControlClasses.tsx',
    `import { Input } from '@adea-ai/ui/components/ui/input'

const className = 'p-10'

function FirstControl() {
  const localClass = 'h-24'
  return <Input class={localClass} />
}

function SecondControl() {
  const localClass = 'p-10'
  return <Input class={localClass} />
}

function CallerControlled(className: string) {
  return <Input class={className} />
}

export function ScopedControlClasses() {
  return <>{FirstControl()}{SecondControl()}{CallerControlled('text-sm')}</>
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/restyles shared control geometry/g)).toHaveLength(2)
  expect(failures).toContain('h-24')
  expect(failures).toContain('p-10')
  expect(failures).not.toContain('CallerControlled')
})

test('follows class and spread alias chains that reuse a name across scopes', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/RepeatedAliasChain.tsx',
    `import { Input } from '@adea-ai/ui/components/ui/input'

const localClass = 'p-10'
const outerClass = localClass

function RepeatedAliasChain() {
  const localClass = outerClass
  const inputProps = { class: localClass }
  return <>
    <Input class={localClass} />
    <Input {...inputProps} />
  </>
}

export { RepeatedAliasChain }
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/restyles shared control geometry/g)).toHaveLength(2)
  expect(failures.match(/p-10/g)).toHaveLength(2)
})

test('resolves JSX, dynamic control, and DOM tag aliases by lexical scope', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/ScopedStaticAliases.tsx',
    `import { Dynamic } from 'solid-js/web'
import { ActionButton } from '@adea-ai/ui/components/composites/action-button'

function BadSpread() {
  const props = { style: { position: 'fixed' } }
  return <ActionButton tooltip="Open bad spread" {...props} />
}

function GoodSpread() {
  const props = { class: 'w-full' }
  return <ActionButton tooltip="Open good spread" {...props} />
}

function BadDynamicControl() {
  const tag = 'button'
  return <Dynamic component={tag} />
}

function GoodDynamicControl() {
  const tag = 'div'
  return <Dynamic component={tag} />
}

function BadMutableDynamicControl() {
  let tag = 'button'
  return <Dynamic component={tag} />
}

function BadCreatedControl() {
  const tag = 'button'
  return document.createElement(tag)
}

function GoodCreatedControl() {
  const tag = 'div'
  return document.createElement(tag)
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/JSX spread resolves to style/g)).toHaveLength(1)
  expect(failures.match(/dynamically renders a raw control through <Dynamic>/g)).toHaveLength(2)
  expect(failures.match(/creates raw <button> with document\.createElement/g)).toHaveLength(1)
})

test('does not confuse imperative aliases with same-named function parameters', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/ScopedImperativeAliases.tsx',
    `const create = document.createElement
const style = document.body.style

function CreateRawControl() {
  return create('button')
}

function CallOtherFunction(create: (tag: string) => unknown) {
  return create('button')
}

function MutateInlineStyle() {
  style.color = 'red'
}

function AssignText(style: string) {
  style = 'plain text'
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/creates raw <button> with document\.createElement/g)).toHaveLength(1)
  expect(failures.match(/mutates inline styles through a DOM style assignment/g)).toHaveLength(1)
})

test('rejects copied shared UI packages and direct primitive or cva imports', () => {
  const root = fixtureRoot()
  writeFixtureFile(root, 'packages/ui/package.json', '{"name":"@local/ui"}')
  writeFixtureFile(
    root,
    'apps/web/package.json',
    JSON.stringify({
      dependencies: {
        '@kobalte/core': '^0.13.0',
        'class-variance-authority': '^0.7.0',
        cva: '^1.0.0',
        clsx: '^2.0.0',
        'tailwind-merge': '^3.0.0',
        cn: '^0.4.0',
      },
    })
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/LocalButton.tsx',
    `import { Button as PrimitiveButton } from '@kobalte/core'
import { cva } from 'class-variance-authority'

export function LocalButton() {
  return <PrimitiveButton />
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/lib/utils.ts',
    `export function cn(...values: string[]) { return values.join(' ') }
export const cva = () => null
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('packages/ui exists')
  expect(failures).toContain('must declare @adea-ai/ui in dependencies')
  expect(failures).toContain('dependencies @kobalte/core')
  expect(failures).toContain('dependencies class-variance-authority')
  expect(failures).toContain('dependencies cva')
  expect(failures).toContain('dependencies clsx')
  expect(failures).toContain('dependencies tailwind-merge')
  expect(failures).toContain('dependencies cn')
  expect(failures).toContain('imports @kobalte/core')
  expect(failures).toContain('imports class-variance-authority')
  expect(failures).toContain('defines a local cn helper')
  expect(failures).toContain('defines a local cva helper')
})

test('requires shared UI and theme dependencies to use published registry semver versions', () => {
  for (const specifier of [
    'file:../../packages/ui',
    'workspace:*',
    'git+https://example.test/adea/ui.git',
    'github:adea-ai/ui',
    'https://example.test/adea-ui.tgz',
    'latest',
  ]) {
    const root = fixtureRoot()
    writeFixtureFile(
      root,
      'apps/web/package.json',
      JSON.stringify({
        dependencies: { '@adea-ai/themes': '0.8.1', '@adea-ai/ui': specifier },
      })
    )
    expect(collectWebUiContractFailures(root)).toContain(
      'apps/web/package.json dependencies @adea-ai/ui must use a published registry semver version'
    )
  }

  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'package.json',
    JSON.stringify({ devDependencies: { '@adea-ai/ui': 'file:/tmp/ui-candidate.tgz' } })
  )
  expect(collectWebUiContractFailures(root)).toContain(
    'package.json devDependencies @adea-ai/ui must use a published registry semver version'
  )
})

test('rejects package manager overrides that replace shared packages with local aliases', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/package.json',
    JSON.stringify({
      dependencies: { '@adea-ai/themes': '0.8.1', '@adea-ai/ui': '^0.81.1' },
      overrides: { '@adea-ai/themes': '../packages/themes' },
    })
  )
  writeFixtureFile(
    root,
    'package.json',
    JSON.stringify({
      name: 'cortana-workspace',
      devDependencies: { '@adea-ai/ui': '^0.81.1' },
      overrides: {
        '@adea-ai/ui': 'file:../../packages/ui',
        parent: { '@adea-ai/themes': 'workspace:*' },
      },
      resolutions: { '**/@adea-ai/themes': 'npm:@adea-ai/themes@0.8.1' },
      pnpm: { overrides: { '@adea-ai/ui': '^0.81.1' } },
    })
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain(
    'apps/web/package.json overrides @adea-ai/themes must use a published registry semver version'
  )
  expect(failures).toContain(
    'package.json overrides @adea-ai/ui must use a published registry semver version'
  )
  expect(failures).toContain(
    'package.json overrides parent > @adea-ai/themes must use a published registry semver version'
  )
  expect(failures).toContain(
    'package.json resolutions **/@adea-ai/themes must use a published registry semver version'
  )
  expect(failures).not.toContain('pnpm.overrides @adea-ai/ui')
})

test('rejects importing or re-exporting the bare shared Button while allowing ActionButton aliases', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/BareButtonImport.tsx',
    `import { Button as PrimitiveButton } from '@adea-ai/ui/components/ui/button'

export function BareButtonImport() {
  return <PrimitiveButton />
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/BareButtonReexport.ts',
    `export { Button as LegacyButton } from '@adea-ai/ui/components/ui/button'
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/ActionButtonAlias.tsx',
    `import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'

export function ActionButtonAlias() {
  return <Button tooltip="Open item" />
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/bare Button from @adea-ai\/ui\/components\/ui\/button/g)).toHaveLength(2)
  expect(failures).toContain('imports bare Button')
  expect(failures).toContain('re-exports bare Button')
  expect(failures).not.toContain('ActionButtonAlias')
})

test('rejects Vite and TypeScript aliases that bypass the published shared packages', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/vite.config.ts',
    `export default { resolve: { alias: [{ find: /^@adea-ai\\/ui/, replacement: '../packages/ui/src' }] } }\n`
  )
  writeFixtureFile(
    root,
    'apps/web/tsconfig.json',
    `{
      // Shared packages must resolve from their registry installations.
      "compilerOptions": { "paths": { "@adea-ai/themes/*": ["../../packages/themes/src/*"] } }
    }\n`
  )
  const failures = collectWebUiContractFailures(root)
  expect(failures).toContain(
    'apps/web/vite.config.ts aliases a shared package; resolve @adea-ai/ui and @adea-ai/themes from published packages'
  )
  expect(failures).toContain(
    'apps/web/tsconfig.json aliases @adea-ai/themes/*; resolve @adea-ai/ui and @adea-ai/themes from published packages'
  )

  const objectAliasRoot = fixtureRoot()
  writeFixtureFile(
    objectAliasRoot,
    'apps/web/vite.config.ts',
    `export default { resolve: { alias: { '@adea-ai/themes': '../packages/themes/src' } } }\n`
  )
  expect(collectWebUiContractFailures(objectAliasRoot)).toContain(
    'apps/web/vite.config.ts aliases a shared package; resolve @adea-ai/ui and @adea-ai/themes from published packages'
  )

  const cleanRoot = fixtureRoot()
  writeFixtureFile(
    cleanRoot,
    'apps/web/vite.config.ts',
    `export default { resolve: { alias: [
      { '@': new URL('./src', import.meta.url).pathname },
      { find: /^(?!@adea-ai\\/(?:ui|themes)(?:\\/|$))/, replacement: '/not-a-shared-package' },
    ] } }\n`
  )
  writeFixtureFile(
    cleanRoot,
    'apps/web/tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } })
  )
  expect(collectWebUiContractFailures(cleanRoot)).toEqual([])
})

test('rejects raw JSX controls and controls selected through Solid Dynamic', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/RawControls.tsx',
    `const NativeControl = enabled ? 'button' : 'div'

export function RawControls() {
  return <section><button type="button">Save</button><Dynamic component={NativeControl} />
    <details><summary>More options</summary><p>Details</p></details>
    <fieldset><legend>Permissions</legend></fieldset>
    <kbd>Ctrl K</kbd><progress value="1" max="2" /><meter value="1" /><table><tbody /></table>
  </section>
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('contains raw <button>')
  expect(failures).toContain('contains raw <details>')
  expect(failures).toContain('contains raw <kbd>')
  expect(failures).toContain('contains raw <progress>')
  expect(failures).toContain('contains raw <meter>')
  expect(failures).toContain('contains raw <table>')
  expect(failures).toContain('contains raw <fieldset>')
  expect(failures).toContain('contains raw <legend>')
  expect(failures).toContain('contains raw <summary>')
  expect(failures).toContain('dynamically renders a raw control through <Dynamic>')
})

test('rejects shared token redefinitions, legacy app tokens, and literal CSS colors', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/theme-overrides.css',
    `:root {
  --primary: var(--foreground);
  --theme-background: var(--background);
}
.notice { color: #fff; background: rgb(1 2 3); }
:root { --component-color: var(--primary); }
.orbit { --distance: 10px; }
.resizer { --source-width: 20rem; }
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('redefines shared token --primary')
  expect(failures).toContain('defines legacy app token --theme-background')
  expect(failures).toContain('uses a literal color in color')
  expect(failures).toContain('uses a literal color in background')
  expect(failures).toContain('defines app-owned CSS token --component-color')
  expect(failures).toContain('aliases a shared theme token in --component-color')
  expect(failures).toContain('defines app-owned CSS token --distance')
  expect(failures).toContain('defines app-owned CSS token --source-width')
})

test('rejects imperative inline styles and programmatic native or dynamic controls', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/dom-apis.ts',
    `export function bypassesSharedUI(props: { tag: string }) {
  document.documentElement.style.colorScheme = 'dark'
  const rootStyle = document.documentElement.style
  const styleAlias = rootStyle
  styleAlias.setProperty('--accent', 'red')
  const node = document.body
  const styleAttribute = 'style'
  node.setAttribute(styleAttribute, 'position: fixed')

  const createElement = document.createElement
  const textareaTag = 'textarea'
  createElement(textareaTag)
  document.createElement('button')
  document.createElement(props.tag)
  document.createElement('canvas')
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('mutates inline styles through a DOM style assignment')
  expect(failures).toContain('mutates inline styles through CSSStyleDeclaration')
  expect(failures).toContain('sets an inline style attribute through a DOM API')
  expect(failures).toContain('creates raw <textarea> with document.createElement')
  expect(failures).toContain('creates raw <button> with document.createElement')
  expect(failures).toContain('uses document.createElement with a dynamic tag')
  expect(failures).not.toContain('creates raw <canvas>')
})

test('rejects JSX spread aliases containing static styles or classList props', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/SpreadStyles.tsx',
    `import { Button } from '@adea-ai/ui/components/ui/button'

const styleObject = { width: '100%' }
const directStyles = { style: styleObject }
const copiedStyles = { ...directStyles }
const conditionalProps = true ? copiedStyles : { id: 'safe' }
const hiddenClasses = { classList: { 'custom-skin': true } }

export function SpreadStyles() {
  return <Button {...conditionalProps} {...hiddenClasses} />
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain(
    'JSX spread resolves to style through a local object alias; pass named shared props instead of hiding style'
  )
  expect(failures).toContain(
    'JSX spread resolves to classList through a local object alias; pass named shared props instead of hiding classList'
  )
})

test('finds visual CSS skins on shared components through local adapters and data-slot selectors', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/SettingsAdapters.tsx',
    `import { Input } from '@adea-ai/ui/components/ui/input'

export function SettingsInput(props: { children?: unknown }) {
  return <Input {...props} />
}

export { SettingsInput as FormInput }
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/UseSettingsInput.tsx',
    `import { Card } from '@adea-ai/ui/components/ui/card'
import { Button } from '@adea-ai/ui/components/ui/button'
import { FormInput } from './SettingsAdapters'

export function UseSettingsInput() {
  return <main class="shell"><FormInput class="settings-control" />
    <Card class="utility-card" />
    <Button class="status-link warning" />
    <Button class="domain-link warning" />
    <Button classList={{ 'class-list-skin': true }} />
  </main>
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/settings.css',
    `.settings-control { border: 1px solid var(--border); padding: 0.5rem; }
[data-slot='input'] { color: var(--foreground); height: 2rem; }
.utility-card h2 { color: var(--foreground); }
.shell [native-domain-element] { color: var(--foreground); }
.utility-card { background: var(--card); }
.utility-card [data-slot='input'] { border-color: var(--border); }
.domain-link.warning { color: var(--warning); }
.class-list-skin { color: var(--foreground); }
.source-health.warning { color: var(--warning); }
section > button { background: var(--primary); }
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('.settings-control')
  expect(failures).toContain('restyles shared UI: border')
  expect(failures).toContain('selector [data-slot]')
  expect(failures).toContain('restyles shared UI: color')
  expect(failures).toContain('.utility-card')
  expect(failures).toContain('.class-list-skin')
  expect(failures).toContain('<button>')
  expect(failures).not.toContain('.source-health.warning')
  expect(failures).not.toContain('.utility-card h2')
  expect(failures).not.toContain('.shell [native-domain-element]')
})

test('finds shared component skins by role and data-slot without flagging native domain roles', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/role-skins.css',
    `[role='menu'] { visibility: hidden; pointer-events: none; }
[role="button"] { color: var(--foreground); cursor: pointer; }
[data-slot='button'] { background: var(--primary); }
.app-shell [role='region'] { color: var(--foreground); }
[role='list'] { border-color: var(--border); }
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('selector [role="menu"]')
  expect(failures).toContain('visibility, pointer-events')
  expect(failures).toContain('selector [role="button"]')
  expect(failures).toContain('selector [data-slot]')
  expect(failures).not.toContain('[role="region"]')
  expect(failures).not.toContain('[role="list"]')
})

test('rejects CSS sizing of shared controls through aliases, roles, and slots only', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/ControlSizes.tsx',
    `import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import { Card } from '@adea-ai/ui/components/ui/card'
import { Input } from '@adea-ai/ui/components/ui/input'

export function ControlSizes() {
  return <>
    <Button class="history-action" tooltip="Show history" />
    <Input class="search-control" />
    <Card class="utility-card" />
  </>
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/control-sizes.css',
    `.history-action { height: 34px; padding: 0 10px; width: 100%; flex: 1; }
.search-control { min-height: 2rem; padding-block: 0.5rem; }
.history-action::after { height: 2px; padding: 0; }
[data-slot='native-select'] { max-height: 36px; padding-inline: 1rem; }
[role='button'] { block-size: 2rem; padding-left: 1rem; }
.utility-card { min-height: 10rem; padding: 1rem; }
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/restyles shared UI/g)).toHaveLength(4)
  expect(failures).toContain('.history-action')
  expect(failures).toContain('height, padding')
  expect(failures).toContain('.search-control')
  expect(failures).toContain('min-height, padding-block')
  expect(failures).toContain('selector [data-slot]')
  expect(failures).toContain('max-height, padding-inline')
  expect(failures).toContain('selector [role="button"]')
  expect(failures).toContain('block-size, padding-left')
  expect(failures).not.toContain('.utility-card')
  expect(failures).not.toContain('width, flex')
})

test('rejects shared control root display overrides but allows layout, display:none, and Card layout', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/ControlLayout.tsx',
    `import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import { ListRow } from '@adea-ai/ui/components/composites/list-row'
import { Card } from '@adea-ai/ui/components/ui/card'
import { Input } from '@adea-ai/ui/components/ui/input'

export function ControlLayout() {
  return <>
    <Button class="action-root" tooltip="Open example" />
    <ListRow class="row-root" as="button" tooltip="Open row" />
    <Input class="input-root" />
    <Card class="layout-card" />
  </>
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/control-layout.css',
    `.action-root { display: grid; width: 100%; flex: 1; }
.row-root { display: block; }
.input-root { display: flex; }
[data-slot='button'] { display: inline-flex; }
[role='button'] { display: inline-grid; }
.layout-card { display: grid; gap: 1rem; }
@media (max-width: 700px) { .action-root { display: none; } }
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/restyles shared UI/g)).toHaveLength(5)
  expect(failures).toContain('.action-root')
  expect(failures).toContain('display')
  expect(failures).toContain('.row-root')
  expect(failures).toContain('.input-root')
  expect(failures).toContain('selector [data-slot]')
  expect(failures).toContain('selector [role="button"]')
  expect(failures).not.toContain('.layout-card')
  expect(failures).not.toContain('display: none')
  expect(failures).not.toContain('width, flex')
})

test('requires a shared legend or explicit accessible name for shared FieldSet aliases', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/SettingsSurface.tsx',
    `import { FieldSet, FieldLegend } from '@adea-ai/ui/components/ui/field'

export { FieldSet as SettingsFieldGroup, FieldLegend as SettingsFieldLegend }
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/SettingsForm.tsx',
    `import { SettingsFieldGroup, SettingsFieldLegend } from './SettingsSurface'
import { FieldSet } from '@adea-ai/ui/components/ui/field'

export function SettingsForm() {
  return <>
    <SettingsFieldGroup><div /></SettingsFieldGroup>
    <FieldSet aria-label="Workspace options"><div /></FieldSet>
    <span id="workspace-options">Workspace options</span>
    <FieldSet aria-labelledby="workspace-options"><div /></FieldSet>
    <FieldSet><SettingsFieldLegend>Workspace options</SettingsFieldLegend><div /></FieldSet>
    <FieldSet aria-label=""><div /></FieldSet>
    <FieldSet aria-labelledby={undefined}><div /></FieldSet>
    <FieldSet />
  </>
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(
    failures.match(/requires a shared FieldLegend child or explicit aria-label\/aria-labelledby/g)
  ).toHaveLength(4)
  expect(failures).toContain('<SettingsFieldGroup> requires a shared FieldLegend child')
  expect(failures).toContain('<FieldSet> requires a shared FieldLegend child')
  expect(failures).not.toContain('SettingsSurface.tsx:')
})

test('requires explicit help on shared ActionButton imports and pure local adapters', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/SettingsSurface.tsx',
    `export { ActionButton as SettingsButton } from '@adea-ai/ui/components/composites/action-button'
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/WorkspaceButton.tsx',
    `import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'

export function WorkspaceButton(props: { tooltip?: string }) {
  return <Button {...props} tooltip={props.tooltip} />
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/WorkspaceButtons.ts',
    `export { WorkspaceButton } from './WorkspaceButton'
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/DomainErrorBoundary.tsx',
    `import { ActionButton } from '@adea-ai/ui/components/composites/action-button'

export function DomainErrorBoundary() {
  return <section><h2>Something went wrong</h2><ActionButton tooltip="Retry" /></section>
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/ActionConsumers.tsx',
    `import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import { SettingsButton } from './SettingsSurface'
import { WorkspaceButton } from './WorkspaceButtons'
import { SideRail } from '@adea-ai/ui/components/layout/app-shell'
import { DomainErrorBoundary } from './DomainErrorBoundary'

export function ActionConsumers(props: { tooltip: string }) {
  return <>
    <Button tooltip="Save changes" />
    <SettingsButton tooltip={props.tooltip} />
    <WorkspaceButton tooltip={props.tooltip} />
    <SideRail />
    <DomainErrorBoundary />
  </>
}
`
  )

  expect(collectWebUiContractFailures(root)).toEqual([])
})

test('rejects missing or empty explicit help even when a spread may contain it', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/SettingsSurface.tsx',
    `export { ActionButton as SettingsButton } from '@adea-ai/ui/components/composites/action-button'
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/WorkspaceButtons.tsx',
    `import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'

export function WorkspaceButton(props: { tooltip?: string }) {
  return <Button {...props} tooltip={props.tooltip} />
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/ActionButtonRenderAs.tsx',
    `import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import { WorkspaceButton } from './WorkspaceButtons'

function Trigger(props: Record<string, unknown>) {
  return <div />
}

export function ActionButtonRenderAs(props: { useButton: boolean }) {
  return <><Trigger as={Button} /><Trigger as={WorkspaceButton} />
    <Trigger as={props.useButton ? Button : WorkspaceButton} />
    <Trigger as={WorkspaceButton} tooltip="Help" /></>
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/ActionConsumers.tsx',
    `import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import { SettingsButton } from './SettingsSurface'
import { WorkspaceButton } from './WorkspaceButtons'

export function ActionConsumers(props: Record<string, unknown>) {
  return <>
    <Button />
    <SettingsButton {...props} />
    <WorkspaceButton tooltip="  " />
    <WorkspaceButton tooltip={undefined} />
    <WorkspaceButton tooltip={false} />
    <WorkspaceButton tooltip={null} />
    <Button {...props} />
    <Button {...props} tooltip="Explicit help" />
    <Button tooltip="[ ]" />
  </>
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/requires a nonempty helpful explicit tooltip prop/g)).toHaveLength(11)
  expect(failures).toContain('<Button> requires a nonempty helpful explicit tooltip prop')
  expect(failures).toContain('<SettingsButton> requires a nonempty helpful explicit tooltip prop')
  expect(failures).toContain('<WorkspaceButton> requires a nonempty helpful explicit tooltip prop')
  expect(failures).toContain(
    '<Trigger> using an ActionButton in as requires a nonempty helpful explicit tooltip prop'
  )
  expect(failures).not.toContain('DomainErrorBoundary')
})

test('requires helpful tooltips on interactive ListRow aliases but not display rows', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/SharedRows.tsx',
    `export { ListRow as MemoryRow } from '@adea-ai/ui/components/composites/list-row'
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/components/MemoryRows.tsx',
    `import { MemoryRow as Row } from './SharedRows'

function RowAdapter(props: Record<string, unknown>) {
  return <Row {...props} />
}

export function MemoryRows(props: { onOpen: () => void; help: string }) {
  return <>
    <Row as="button" />
    <Row as="a" tooltip="[ ]" />
    <Row onClick={props.onOpen} />
    <RowAdapter as="button" />
    <Row as="button" tooltip="Open memory" />
    <Row as={'a'} tooltip={props.help} />
    <Row onClick={props.onOpen} tooltip={props.help} />
    <Row />
    <Row as="div" tooltip="[ ]" />
  </>
}
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(
    failures.match(/<(?:(?:Row|RowAdapter))> requires a nonempty helpful explicit tooltip prop/g)
  ).toHaveLength(4)
  expect(failures).toContain('<Row> requires a nonempty helpful explicit tooltip prop')
  expect(failures).toContain('<RowAdapter> requires a nonempty helpful explicit tooltip prop')
  expect(failures).not.toContain('<Row as="div">')
})

test('expands positive :is and :where alternatives without treating :not classes as positive', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/UtilityCards.tsx',
    `import { Card } from '@adea-ai/ui/components/ui/card'

export function UtilityCards() {
  return <>
    <Card class="utility-card" />
    <Card class="utility-metric" />
    <Card class="utility-list" />
    <Card class="excluded-card utility-list" />
  </>
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/utility-cards.css',
    `.view :is(.utility-list, .utility-metric, .utility-card) { color: var(--foreground); }
.view :where(.utility-list, .utility-metric, .utility-card) { border-color: var(--border); }
.utility-card:not(.utility-card) { background: var(--card); }
.utility-card:not(:is(.utility-card, .utility-list)) { background: var(--card); }
:not(.utility-card) { font-family: var(--font-sans); }
.excluded-card:not(.utility-list) { color: var(--foreground); }
`
  )

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/restyles shared UI/g)).toHaveLength(6)
  expect(failures).toContain('selector .utility-card')
  expect(failures).toContain('selector .utility-metric')
  expect(failures).toContain('selector .utility-list')
  expect(failures).not.toContain('excluded-card')
  expect(failures).not.toContain('font-family')
  expect(failures).not.toContain('background')
})

test('prevents UI lint rules and CSS exemptions from being weakened globally or by overrides', () => {
  const root = fixtureRoot()
  const configPath = resolve(root, '.oxlintrc.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  config.rules['adea/no-raw-interactive-elements'] = 'off'
  config.rules['adea/no-inline-styles'] = 'off'
  config.rules['adea/no-class-list'] = 'off'
  config.rules['shadcn/no-inline-styles'] = ['error', { allow: ['*'] }]
  config.rules['shadcn/no-restyle'] = [
    'error',
    { allow: ['text-primary'], deny: ['layout'], contracts: [{ pattern: '.*', allow: ['*'] }] },
  ]
  config.rules['shadcn/no-raw-colors'] = ['error', { allow: ['text-red-*'] }]
  config.rules['shadcn/no-unknown-classes'] = [
    'error',
    { allow: ['custom-skin-*', 'status-warning'] },
  ]
  writeFixtureFile(
    root,
    'apps/web/src/components/SourcePanel.tsx',
    'export function SourcePanel() { return <main /> }\n'
  )
  config.ignorePatterns = ['**/SourcePanel.tsx']
  config.settings.shadcn.ignoreImports = ['.*']
  delete config.settings.shadcn.ui
  config.overrides = [
    {
      files: ['apps/web/src/**'],
      rules: {
        'shadcn/no-restyle': 'off',
        'adea/no-inline-styles': 'warn',
        'shadcn/no-inline-styles': ['error', { allow: ['transform'] }],
      },
    },
  ]
  writeFileSync(configPath, JSON.stringify(config, null, 2))

  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('must keep adea/no-raw-interactive-elements at error severity')
  expect(failures).toContain('must keep adea/no-inline-styles at error severity')
  expect(failures).toContain('must keep adea/no-class-list at error severity')
  expect(failures).toContain('must configure shadcn.ui to recognize @adea-ai/ui/components')
  expect(failures).toContain('shadcn/no-restyle setting 0 has component or class exemptions')
  expect(failures).toContain('shadcn/no-restyle setting 0 must deny color')
  expect(failures).toContain('shadcn/no-raw-colors setting 0 has exemptions')
  expect(failures).toContain('overrides[0] weakens shadcn/no-restyle')
  expect(failures).toContain('overrides[0] weakens adea/no-inline-styles')
  expect(failures).toContain('shadcn/no-inline-styles setting 0 has JSX style exemptions')
  expect(failures).toContain('shadcn/no-inline-styles setting 1 has JSX style exemptions')
  expect(failures).toContain('wildcard class allow custom-skin-*')
  expect(failures).toContain('class allow status-warning is a grandfathered exemption')
  expect(failures).toContain('ignores apps/web source')
  expect(failures).toContain('shadcn.ignoreImports excludes shared components')

  config.ignorePatterns = ['**/SourcePanel.test.tsx']
  writeFileSync(configPath, JSON.stringify(config, null, 2))
  writeFixtureFile(
    root,
    'apps/web/src/components/SourcePanel.test.tsx',
    'export function SourcePanelTest() { return <main /> }\n'
  )
  expect(collectWebUiContractFailures(root)).toContain(
    '.oxlintrc.json ignores apps/web source; shared UI lint must cover all application files'
  )
})

test('automatically requires every rule added by the installed shared UI plugin', () => {
  const root = fixtureRoot()
  writeFileSync(
    resolve(root, 'node_modules/@adea-ai/ui/dist/lint/index.js'),
    "export default { rules: { 'no-inline-styles': {}, 'future-contract': {} } };\n"
  )
  const path = resolve(root, '.oxlintrc.json')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  expect(collectWebUiContractFailures(root).join('\n')).toContain(
    'must keep adea/future-contract at error severity'
  )
  config.rules['adea/future-contract'] = 'error'
  config.overrides = [{ files: ['apps/web/src/**'], rules: { 'adea/future-contract': 'off' } }]
  writeFileSync(path, JSON.stringify(config))
  expect(collectWebUiContractFailures(root).join('\n')).toContain(
    'overrides[0] weakens adea/future-contract'
  )
  config.overrides = []
  writeFileSync(path, JSON.stringify(config))
  expect(collectWebUiContractFailures(root)).toEqual([])
})

test('rejects dangling FieldSet IDREFs and legends that cannot name the outer group', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/Groups.tsx',
    `import { FieldSet, FieldLegend } from '@adea-ai/ui/components/ui/field'
const labelId = 'dynamic-options'
export function Groups() {
  return <>
    <span id={labelId}>Dynamic options</span>
    <FieldSet aria-labelledby={labelId}><div /></FieldSet>
    <FieldSet><FieldLegend><span>Nested text is valid</span></FieldLegend></FieldSet>
    <span id="empty-options" />
    <FieldSet aria-labelledby="empty-options"><div /></FieldSet>
    <FieldSet aria-labelledby="missing"><div /></FieldSet>
    <FieldSet><FieldSet><FieldLegend>Inner options</FieldLegend></FieldSet></FieldSet>
    <FieldSet><div><FieldLegend>Wrapped options</FieldLegend></div></FieldSet>
    <FieldSet><FieldLegend /></FieldSet>
  </>
}`
  )
  const failures = collectWebUiContractFailures(root).join('\n')
  expect(
    failures.match(/requires a shared FieldLegend child or explicit aria-label\/aria-labelledby/g)
  ).toHaveLength(5)
})

test('keeps the lint package version aligned with the web shared UI package', () => {
  const root = fixtureRoot()
  const path = resolve(root, 'package.json')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  config.devDependencies['@adea-ai/ui'] = '^0.82.0'
  writeFileSync(path, JSON.stringify(config))
  expect(collectWebUiContractFailures(root)).toContain(
    'package.json devDependencies @adea-ai/ui must match apps/web/package.json so lint and the renderer use the same shared library'
  )
})

test('requires canonical shared UI subpaths so root imports cannot bypass component contracts', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/RootImports.tsx',
    `import { Button } from '@adea-ai/ui'
import * as UI from '@adea-ai/ui'
export { ActionButton } from '@adea-ai/ui'
export function RootImports() { return <><Button /><UI.ActionButton /></> }
`
  )
  const failures = collectWebUiContractFailures(root).join('\n')
  expect(
    failures.match(/imports @adea-ai\/ui root; use canonical components or lib subpaths/g)
  ).toHaveLength(3)
})

test('rejects raw anchors and anchor creation while allowing shared links and downloads', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/Links.tsx',
    `import { TextLink } from '@adea-ai/ui/components/ui/text-link'
import { downloadBlob } from '@adea-ai/ui/lib/download'
const anchor = document.createElement('a')
export function Links() { return <><a href="https://example.test">Raw link</a><TextLink href="https://example.test">Shared link</TextLink></> }
export function save(blob: Blob) { downloadBlob(blob, 'events.json') }
`
  )
  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('contains raw <a>')
  expect(failures).toContain('creates raw <a>')
  expect(failures).not.toContain('<TextLink>')
})

test('rejects locally composed loading indicators through aliased imports and reexports', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/Loading.tsx',
    `import { LoaderCircle as Working, Search } from 'lucide-solid'
export { Loader2 as Busy } from 'lucide-solid'
import { Spinner } from '@adea-ai/ui/components/ui/spinner'
export function Loading() { return <Spinner label="Searching" size="md" /> }
`
  )
  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('imports LoaderCircle from lucide-solid; use shared Spinner')
  expect(failures).toContain('imports Loader2 from lucide-solid; use shared Spinner')
  expect(failures).not.toContain('imports Search from lucide-solid')
  expect(failures).not.toContain('<Spinner>')
})

test('requires helpful tooltips in every statically known action state', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/ConditionalHelp.tsx',
    `import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
export function ConditionalHelp(props: { ready: boolean }) {
  return <>
    <ActionButton tooltip={props.ready ? undefined : 'Wait for setup'} />
    <ActionButton tooltip={props.ready ? 'Save changes' : ''} />
    <ActionButton tooltip={props.ready && 'Save changes'} />
    <ActionButton tooltip={true} />
    <ActionButton tooltip={42} />
    <ActionButton tooltip={props.ready ? 'Save changes' : 'Wait for setup'} />
  </>
}
`
  )
  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures.match(/requires a nonempty helpful explicit tooltip prop/g)).toHaveLength(5)
})

test('shared keys, badges, loading and identity tiles retain library geometry', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/components/Geometry.tsx',
    `
import { Kbd } from '@adea-ai/ui/components/ui/kbd'
import { Badge } from '@adea-ai/ui/components/ui/badge'
import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import { EntityIcon } from '@adea-ai/ui/components/ui/entity-icon'
export function Geometry() {
  return <section><Kbd class="custom-key">Ctrl K</Kbd><Badge class="custom-badge">3</Badge>
    <Spinner class="custom-spinner" /><EntityIcon name="Work" class="custom-tile" /></section>
}
`
  )
  writeFixtureFile(
    root,
    'apps/web/src/geometry.css',
    `
.custom-key { padding: 12px; }
.custom-badge { height: 42px; }
.custom-spinner { display: grid; }
.custom-tile { min-height: 48px; }
`
  )
  const failures = collectWebUiContractFailures(root).join('\n')
  for (const name of ['custom-key', 'custom-badge', 'custom-spinner', 'custom-tile']) {
    expect(failures).toContain(name)
  }
})

test('rejects scoped plugin removal and import-specific tracking exclusions', () => {
  const root = fixtureRoot()
  const path = resolve(root, '.oxlintrc.json')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  config.overrides = [
    {
      files: ['apps/web/src/**'],
      jsPlugins: [],
      plugins: [],
      settings: { shadcn: { ui: 'local-ui', ignoreImports: ['@adea-ai/ui/components/ui/input'] } },
    },
  ]
  writeFileSync(path, JSON.stringify(config))
  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('removes shared UI lint plugins')
  expect(failures).toContain('removes accessibility lint')
  expect(failures).toContain('override must preserve the shared shadcn.ui source')
  expect(failures).toContain('shadcn.ignoreImports excludes shared components')
})

test('recognizes bracket, brace and basename exclusions in Oxlint globs', () => {
  const root = fixtureRoot()
  writeFixtureFile(root, 'apps/web/src/App.tsx', 'export const App = () => <main />')
  const path = resolve(root, '.oxlintrc.json')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  for (const pattern of ['apps/web/src/[A]pp.tsx', 'apps/web/src/{App,Other}.tsx', 'App.tsx']) {
    config.ignorePatterns = [pattern]
    writeFileSync(path, JSON.stringify(config))
    expect(collectWebUiContractFailures(root).join('\n')).toContain('ignores apps/web source')
  }
})

test('rejects UI and blanket lint suppressions while allowing unrelated rules and strings', () => {
  const root = fixtureRoot()
  writeFixtureFile(
    root,
    'apps/web/src/Suppressions.tsx',
    `
// oxlint-disable-next-line adea/no-class-list -- unsafe
export const First = () => <main />
/* eslint-disable shadcn/no-restyle */
export const Second = () => <section />
// oxlint-disable -- blanket
export const Third = () => <aside />
// oxlint-disable-next-line jsx-a11y/alt-text
export const Fourth = () => <article />
// oxlint-disable-next-line unicorn/no-array-sort -- unrelated
export const Allowed = ['b', 'a'].sort()
export const Documentation = '// oxlint-disable adea/no-class-list'
`
  )
  const failures = collectWebUiContractFailures(root).filter((failure) =>
    failure.includes('suppresses shared UI or accessibility lint')
  )
  expect(failures).toHaveLength(4)
  writeFixtureFile(root, 'apps/web/src/components/.oxlintrc.json', '{}')
  expect(collectWebUiContractFailures(root).join('\n')).toContain(
    'replaces the central web lint policy'
  )
})

test('protects the central policy against external inheritance and default ignore files', () => {
  const root = fixtureRoot()
  const path = resolve(root, '.oxlintrc.json')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  config.plugins = []
  config.extends = ['./weakened-policy.json']
  writeFileSync(path, JSON.stringify(config))
  writeFixtureFile(root, '.eslintignore', '# generated files\napps/web/src/[A]pp.tsx\n')
  const failures = collectWebUiContractFailures(root).join('\n')
  expect(failures).toContain('must keep accessibility lint enabled')
  expect(failures).toContain('must own the complete web lint policy')
  expect(failures).toContain('ignores apps/web source')
})
