import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from 'solid-testing-library'
import { canonicalDocument } from './test/fixtures'

afterEach(cleanup)

// The source-link alert only exists in the desktop shell, where a blocked
// native open reports back to the page instead of falling back to a window.
const realApi = await import('./api')
mock.module('./api', () => ({
  ...realApi,
  isDesktopApp: true,
  openDesktopUrl: () => Promise.reject(new Error('blocked by desktop URL policy')),
}))
const { Workspace } = await import('./components/Workspace')

const props = {
  query: 'release',
  answer: null,
  reflection: null,
  evidence: [],
  selected: 0,
  loading: false,
  error: '',
  document: null,
  documentLoading: false,
  graph: null,
  graphLoading: false,
  graphError: '',
  tab: 'document' as const,
  onTabChange: () => {},
  onSelect: () => {},
  onSelectDocument: () => {},
  onRetry: () => {},
}

// The Alert is full width, so its inset comes from a plain wrapper: margins on
// the Alert itself would push it past the right edge of the pane.
async function expectInsetSourceLinkAlert() {
  fireEvent.click(screen.getByRole('link', { name: 'Open original source' }))
  const alert = await waitFor(() => screen.getByRole('alert'))
  expect(alert.textContent).toContain('Cortana could not open the original source.')
  expect(alert.classList.contains('source-link-error')).toBe(false)
  expect(Array.from(alert.classList).some((name) => /^-?m[trblxy]?-/.test(name))).toBe(false)
  expect(alert.parentElement?.classList.contains('mx-7')).toBe(true)
  expect(alert.parentElement?.parentElement?.tagName).toBe('ARTICLE')
}

test('a blocked source link in the document tab keeps the alert inside the pane', async () => {
  render(() => (
    <Workspace {...props} document={{ ...canonicalDocument, uri: 'https://example.test/doc' }} />
  ))
  await expectInsetSourceLinkAlert()
})

test('a blocked source link in the evidence tab keeps the alert inside the pane', async () => {
  render(() => (
    <Workspace
      {...props}
      tab="sources"
      evidence={[
        {
          chunk_id: 'release-notes',
          source: 'work-code',
          source_id: 'release-1',
          title: 'Release notes',
          uri: 'https://example.test/evidence',
          content: 'Evidence excerpt',
          score: 0.9,
          semantic_rank: 1,
          lexical_rank: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]}
    />
  ))
  await expectInsetSourceLinkAlert()
})
