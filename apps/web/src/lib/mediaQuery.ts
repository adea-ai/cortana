import { createEffect, createSignal, onCleanup } from 'solid-js'

type SharedQuery = {
  mql: MediaQueryList
  subscribers: Set<(matches: boolean) => void>
}

// One MediaQueryList listener per query text, shared by every subscriber.
const sharedQueries = new Map<string, SharedQuery>()

function matchesNow(query: string): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
}

/**
 * Reactive `matchMedia`. Multiple components watching the same query share a
 * single MediaQueryList subscription instead of registering one listener
 * each. The query may itself be reactive; the subscription follows it.
 */
export function createMediaQuery(query: () => string): () => boolean {
  const [matches, setMatches] = createSignal(matchesNow(query()))
  createEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const text = query()
    let entry = sharedQueries.get(text)
    if (!entry) {
      const subscribers = new Set<(matches: boolean) => void>()
      const mql = window.matchMedia(text)
      mql.addEventListener('change', (event) => {
        subscribers.forEach((subscriber) => subscriber(event.matches))
      })
      entry = { mql, subscribers }
      sharedQueries.set(text, entry)
    }
    setMatches(entry.mql.matches)
    const subscriber = (value: boolean) => setMatches(value)
    entry.subscribers.add(subscriber)
    onCleanup(() => {
      entry.subscribers.delete(subscriber)
      if (entry.subscribers.size === 0) sharedQueries.delete(text)
    })
  })
  return matches
}
