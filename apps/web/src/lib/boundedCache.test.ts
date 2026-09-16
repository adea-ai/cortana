import { expect, test } from 'bun:test'

import { createBoundedCache } from './boundedCache'

test('bounded cache returns set values and reports size', () => {
  const cache = createBoundedCache<string, number>(3)
  expect(cache.get('a')).toBeUndefined()
  cache.set('a', 1)
  cache.set('b', 2)
  expect(cache.get('a')).toBe(1)
  expect(cache.get('b')).toBe(2)
  expect(cache.size).toBe(2)
})

test('bounded cache evicts the least recently used entry at capacity', () => {
  const cache = createBoundedCache<string, number>(2)
  cache.set('a', 1)
  cache.set('b', 2)
  // Touch 'a' so 'b' becomes the oldest entry.
  expect(cache.get('a')).toBe(1)
  cache.set('c', 3)
  expect(cache.get('b')).toBeUndefined()
  expect(cache.get('a')).toBe(1)
  expect(cache.get('c')).toBe(3)
  expect(cache.size).toBe(2)
})

test('bounded cache re-setting an existing key does not grow or reorder incorrectly', () => {
  const cache = createBoundedCache<string, number>(2)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('a', 10)
  cache.set('c', 3)
  // 'a' was refreshed, so 'b' is evicted.
  expect(cache.get('b')).toBeUndefined()
  expect(cache.get('a')).toBe(10)
  expect(cache.get('c')).toBe(3)
})

test('bounded cache delete and clear remove entries', () => {
  const cache = createBoundedCache<string, number>(4)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.delete('a')
  expect(cache.get('a')).toBeUndefined()
  expect(cache.size).toBe(1)
  cache.clear()
  expect(cache.get('b')).toBeUndefined()
  expect(cache.size).toBe(0)
})
