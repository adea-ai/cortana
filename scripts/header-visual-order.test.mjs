import { describe, expect, test } from 'bun:test'

import { visualOrder } from './header-visual-order.mjs'

// A control as headerControlOrders reads it from the page: viewport geometry only.
function control(name, top, height, left) {
  return { name, top, bottom: top + height, height, left }
}

const names = (controls) => visualOrder(controls).map((item) => item.name)

describe('header visual order', () => {
  test('(a) aligned controls whose tops differ by 1px stay on one row', () => {
    // The 320px / 100% header: Toggle navigation is centred in a 48px group (top 11), the others sit at top 10.
    const controls = [
      control('Toggle navigation', 11, 28, 12),
      control('Search and reflect', 10, 28, 208),
      control('System status', 10, 28, 244),
      control('Actions', 10, 28, 280),
    ]
    const ordered = visualOrder(controls)
    expect(ordered.map((item) => item.name)).toEqual([
      'Toggle navigation',
      'Search and reflect',
      'System status',
      'Actions',
    ])
    expect(new Set(ordered.map((item) => item.row)).size).toBe(1)
  })

  test('(b) a genuinely swapped horizontal order is reported as a different order', () => {
    // Both controls share one row. The first one in keyboard order is drawn to the right of the second.
    const keyboardOrder = ['Right control', 'Left control']
    const controls = [control('Right control', 10, 28, 200), control('Left control', 10, 28, 12)]
    expect(names(controls)).toEqual(['Left control', 'Right control'])
    expect(names(controls)).not.toEqual(keyboardOrder)
  })

  test('(c) genuinely separate wrapped rows are ordered row by row', () => {
    // Row 1 spans 8..36, row 2 spans 36..64: they touch at the edge but do not overlap, so they are two rows.
    const controls = [
      control('Row 2 right', 36, 28, 150),
      control('Row 1 right', 8, 28, 200),
      control('Row 2 left', 36, 28, 4),
      control('Row 1 left', 8, 28, 12),
    ]
    const ordered = visualOrder(controls)
    expect(ordered.map((item) => item.name)).toEqual([
      'Row 1 left',
      'Row 1 right',
      'Row 2 left',
      'Row 2 right',
    ])
    expect(ordered.map((item) => item.row)).toEqual([0, 0, 1, 1])
  })

  test('(c) a control on the second row is never read before one on the first, even when further left', () => {
    const controls = [control('Second row, far left', 60, 28, 0), control('First row, far right', 10, 28, 400)]
    expect(names(controls)).toEqual(['First row, far right', 'Second row, far left'])
  })
})
