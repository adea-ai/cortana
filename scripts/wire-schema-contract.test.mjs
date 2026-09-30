import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const fixture = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/wire-schemas.json'), 'utf8'))
const typesSource = readFileSync(resolve(root, 'apps/web/src/types.ts'), 'utf8')

// Extract the property names of each `export type X = { ... }` block in the
// hand-mirror. Nested braces in template literals don't occur in this file;
// the blocks terminate at a line that is exactly `}`.
const typeFields = new Map()
for (const match of typesSource.matchAll(/^export type (\w+) = \{$/gm)) {
  const name = match[1]
  const start = match.index + match[0].length
  const end = typesSource.indexOf('\n}', start)
  const body = typesSource.slice(start, end === -1 ? undefined : end)
  const fields = new Set()
  for (const field of body.matchAll(/^\s{2}([a-zA-Z_]\w*)[??]?:/gm)) {
    fields.add(field[1])
  }
  typeFields.set(name, fields)
}

// The capture lane names the response objects the web actually consumes;
// every schema property must exist in its hand-mirrored type.
const schemaToHandMirror = {
  ContextBundle: 'ContextBundle',
  ReflectResponse: 'ReflectResponse',
  AnswerResponse: 'AnswerResponse',
  DerivedMemoryResponse: 'DerivedMemoryResponse',
  BrainStatus: 'BrainStatus',
  IngestionStatus: 'IngestionStatus',
}

for (const [schemaName, typeName] of Object.entries(schemaToHandMirror)) {
  test(`${schemaName} wire schema properties exist in the ${typeName} hand-mirror`, () => {
    const schema = fixture[schemaName]
    expect(schema).toBeDefined()
    const properties = Object.keys(schema.properties ?? {})
    expect(properties.length).toBeGreaterThan(0)
    const mirror = typeFields.get(typeName)
    expect(mirror).toBeDefined()
    for (const property of properties) {
      expect(mirror.has(property)).toBe(true)
    }
  })
}

test('wire schema fixture covers every audited wire type', () => {
  expect(Object.keys(fixture).toSorted()).toEqual(
    [
      'AnswerResponse',
      'BrainStatus',
      'ContextBundle',
      'DerivedMemoryResponse',
      'IngestionStatus',
      'ReflectResponse',
    ].toSorted()
  )
})
