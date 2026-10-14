import { GlobalRegistrator } from '@happy-dom/global-registrator'

// Mocked browser environment for Solid component tests, registered before any
// test file (and therefore before solid-testing-library) evaluates.
GlobalRegistrator.register()

// Kobalte waits for subtree animations before measuring floating elements.
// happy-dom does not implement the Web Animations API yet, so expose the
// browser-compatible empty result used when no animations are active.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => []
}

// Kobalte's solid-presence treats a non-"none" animation-name as an active
// exit animation and waits for `animationend`. happy-dom reports the empty
// string for unset animation names, which would leave closed overlays
// mounted forever, so normalize it to the real browser default.
const nativeGetComputedStyle = globalThis.getComputedStyle
globalThis.getComputedStyle = ((element: Element, pseudoElt?: string | null) => {
  const styles = nativeGetComputedStyle(element, pseudoElt)
  if (styles.animationName !== '') return styles

  // Happy DOM v21 returns a CSSStyleDeclaration proxy that rejects
  // defineProperty. Expose the browser default without mutating that proxy.
  return new Proxy(styles, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === 'animationName' && value === '') return 'none'
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}) as typeof getComputedStyle

const { configure } = await import('@testing-library/dom')

// Cold Bun workers and the first happy-dom render can exceed Testing
// Library's one-second polling default on developer machines. Keep the test
// harness bounded, but leave enough time for a legitimate initial render when
// Code Foundry is running independent suites in parallel.
configure({ asyncUtilTimeout: 10_000 })
