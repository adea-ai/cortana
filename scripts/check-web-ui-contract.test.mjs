import { expect, test } from 'bun:test'

import { missingSharedUiSources, normalizePathSeparators } from './check-web-ui-contract.mjs'

test('normalizes Windows source paths before applying UI contract rules', () => {
  expect(normalizePathSeparators('components\\shadcn\\textarea.tsx')).toBe(
    'components/shadcn/textarea.tsx'
  )
  expect(normalizePathSeparators('components\\Workspace.tsx')).toBe('components/Workspace.tsx')
})

test('shared controls imported by consumers have their Tailwind sources', () => {
  expect(
    missingSharedUiSources("@source '../node_modules/@adea-ai/ui/src/components/ui/button';", [
      "import { Button } from '@adea-ai/ui/components/ui/button'",
      "import { Select } from '@adea-ai/ui/components/ui/select'",
      "import type { SelectProps } from '@adea-ai/ui/components/ui/select'",
    ])
  ).toEqual(['select'])
  expect(
    missingSharedUiSources("@source '../node_modules/@adea-ai/ui/src/components/ui/select';", [
      "import { Select } from '@adea-ai/ui/components/ui/select'",
    ])
  ).toEqual([])
})

test('type-only imports and comments do not retain optional control styles', () => {
  expect(
    missingSharedUiSources('', [
      "import type { ChartProps } from '@adea-ai/ui/components/ui/chart'",
      "import { type CarouselProps } from '@adea-ai/ui/components/ui/carousel'",
      "// import { Chart } from '@adea-ai/ui/components/ui/chart'",
    ])
  ).toEqual([])
  expect(
    missingSharedUiSources('', ["const control = import('@adea-ai/ui/components/ui/select')"])
  ).toEqual(['select'])
})
