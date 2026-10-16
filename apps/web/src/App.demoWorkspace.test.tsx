import { act } from './test/act'
import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'
import { demoStatus } from './demo'
import { firstDocumentsPage } from './test/fixtures'

// The demo's status call answers before its desktop settings have loaded, and
// the two list the workspaces in different orders (status: Personal first,
// desktop settings: Work first). The shell must wait for the desktop settings
// before it picks a workspace, however the two arrive. The status mock answers
// at once while the demo desktop module is still being imported, so the status
// order is the first one on offer.
const realApi = await import('./api')
mock.module('./api', () => ({
  ...realApi,
  isDesktopApp: false,
  isDemoMode: true,
  getStatus: () => Promise.resolve(demoStatus),
  getDocuments: () => Promise.resolve(firstDocumentsPage),
}))
const { App } = await import('./App')

afterEach(async () => {
  await act(async () => {
    cleanup()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})

test('demo mode selects the first workspace of its desktop settings even when status answers first', async () => {
  render(() => <App />)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Switch workspace' }))
  const work = await screen.findByRole('menuitemradio', { name: /Work/ })
  await waitFor(() => expect(work.getAttribute('aria-checked')).toBe('true'))
  expect(screen.getByRole('menuitemradio', { name: /Personal/ }).getAttribute('aria-checked')).toBe(
    'false'
  )
})
