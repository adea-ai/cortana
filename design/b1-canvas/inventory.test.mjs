// Set-equality regression for the B1 composed canvas.
// The board identities declared in project/canvas.json must exactly match the
// .dc.html files in project/. Counts alone are not enough: a missing file and
// an unlisted file can cancel out.
// Run: node --test design/b1-canvas/inventory.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = join(dirname(fileURLToPath(import.meta.url)), 'project')
const canvas = JSON.parse(readFileSync(join(project, 'canvas.json'), 'utf8'))
const onDisk = new Set(readdirSync(project).filter((f) => f.endsWith('.dc.html')))

test('canvas order lists each board exactly once', () => {
  assert.equal(new Set(canvas.order).size, canvas.order.length, 'duplicate entries in order')
})

test('canvas boards and order declare the same identities', () => {
  const boards = new Set(Object.keys(canvas.boards))
  const order = new Set(canvas.order)
  assert.deepEqual([...boards].filter((b) => !order.has(b)), [], 'boards missing from order')
  assert.deepEqual([...order].filter((b) => !boards.has(b)), [], 'order entries missing from boards')
})

test('declared boards exactly equal the .dc.html files on disk', () => {
  const declared = new Set(canvas.order)
  assert.deepEqual([...declared].filter((b) => !onDisk.has(b)), [], 'declared but absent on disk')
  assert.deepEqual([...onDisk].filter((b) => !declared.has(b)), [], 'on disk but not declared')
})
