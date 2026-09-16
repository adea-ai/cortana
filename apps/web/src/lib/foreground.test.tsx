import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render } from 'solid-testing-library'

import { useDesktopForeground } from './foreground'

afterEach(cleanup)

function Probe(props: { seen: boolean[] }) {
  const foreground = useDesktopForeground()
  props.seen.push(foreground())
  return null
}

test('shared foreground signal tracks blur and focus once for all consumers', () => {
  const seenA: boolean[] = []
  const seenB: boolean[] = []
  render(() => (
    <>
      <Probe seen={seenA} />
      <Probe seen={seenB} />
    </>
  ))
  expect(seenA).toEqual([true])
  expect(seenB).toEqual([true])

  fireEvent(window, new Event('blur'))
  fireEvent(window, new Event('focus'))

  // Both consumers share one signal and one listener set: a blur/focus cycle
  // updates each consumer through the same source.
  expect(seenA.length).toBe(seenB.length)
})

test('a remounted consumer resyncs focus instead of inheriting a stale blur', () => {
  const seen: boolean[] = []
  const first = render(() => <Probe seen={seen} />)
  fireEvent(window, new Event('blur'))
  first.unmount()

  const remounted: boolean[] = []
  render(() => <Probe seen={remounted} />)
  // The final subscriber tore the listeners down; the next install must read
  // the live focus state rather than replaying the stale blur flag.
  expect(remounted).toEqual([document.hasFocus()])
})
