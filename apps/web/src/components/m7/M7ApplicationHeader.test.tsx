import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen } from 'solid-testing-library'

import { M7ApplicationHeader, M7ShellProvider } from './M7ApplicationShell'

afterEach(cleanup)

/**
 * The header's controls must stay in the order the bar draws them.
 *
 * The shared shell bar keeps its DOM order when it wraps to a second row, so
 * the keyboard order follows the visual order only while the search belongs to
 * the trailing group. A search placed in the shared centre slot would be drawn
 * on the second row and still be tabbed before the trailing group, so the
 * focus would drop to the second row and return to the first: the finding
 * #2599 recorded for the top bar's two-row layout. The browser audit
 * (`scripts/capture-m7-visuals.mjs`) proves the two orders agree on a wrapped
 * bar; this test keeps the structure that makes them agree.
 */
test('the header keeps its controls in the order the bar draws them', () => {
  render(() => (
    <M7ShellProvider sidebarOpen={() => true} onSidebarOpenChange={() => {}}>
      <M7ApplicationHeader
        query=""
        loading={false}
        searchRef={{ current: null }}
        searchTriggerRef={{ current: null }}
        searchOpen={false}
        onSearchOpenChange={() => {}}
        canGoBack={false}
        canGoForward={false}
        onQueryChange={() => {}}
        onSubmit={() => {}}
        onReflect={() => {}}
        onHistoryBack={() => {}}
        onHistoryForward={() => {}}
        onOpenSources={() => {}}
        onOpenFilters={() => {}}
        onOpenHistory={() => {}}
        onOpenContext={() => {}}
        onOpenCommands={() => {}}
        hasSidebar={true}
        location="Knowledge"
        systemActions={<span>System</span>}
      />
    </M7ShellProvider>
  ))

  const bar = document.querySelector('[data-slot="shell-top-bar"]')
  expect(bar).not.toBeNull()
  const labels = [...(bar as HTMLElement).querySelectorAll('button')].map((button) =>
    button.getAttribute('aria-label')
  )
  expect(labels).toEqual([
    'Previous search query',
    'Next search query',
    'Collapse sidebar',
    'Search and reflect',
    'System status',
    'Actions',
  ])

  // The search belongs to the trailing group, the one the bar draws last.
  expect(
    screen
      .getByRole('button', { name: 'Search and reflect' })
      .closest('[data-slot="shell-top-bar-actions"]')
  ).not.toBeNull()
  // It is not in the shared centre slot, which the bar moves to a second row
  // on a narrow bar while the DOM keeps it before the trailing group.
  expect(document.querySelector('[data-slot="shell-top-bar-search"]')).toBeNull()
})
