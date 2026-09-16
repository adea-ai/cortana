import { createSignal, onCleanup, onMount } from 'solid-js'

// Keep the compact shell through the 768px tablet acceptance width. The
// desktop sidebar needs enough room to coexist with the bounded source and
// workspace panes, so it begins at 800px instead of switching at 768px.
const MOBILE_BREAKPOINT = 800

export function useIsMobile() {
  const [isMobile, setIsMobile] = createSignal(window.innerWidth < MOBILE_BREAKPOINT)

  onMount(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(mql.matches)
    }
    mql.addEventListener('change', onChange)
    onCleanup(() => mql.removeEventListener('change', onChange))
  })

  return isMobile
}
