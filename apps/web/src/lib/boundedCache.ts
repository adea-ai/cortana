/**
 * Small insertion-ordered LRU map used for stale-while-revalidate snapshots.
 * Lookups touch recency; once the limit is reached the oldest entry is
 * evicted so memory stays bounded across scope switches.
 */
export function createBoundedCache<K, V>(limit: number) {
  const entries = new Map<K, V>()
  return {
    get(key: K): V | undefined {
      const value = entries.get(key)
      if (value !== undefined) {
        entries.delete(key)
        entries.set(key, value)
      }
      return value
    },
    set(key: K, value: V): void {
      if (entries.has(key)) entries.delete(key)
      else if (entries.size >= limit) entries.delete(entries.keys().next().value as K)
      entries.set(key, value)
    },
    delete(key: K): void {
      entries.delete(key)
    },
    clear(): void {
      entries.clear()
    },
    get size(): number {
      return entries.size
    },
  }
}
