import { fireEvent, screen } from 'solid-testing-library'

const triggerName = 'Search and reflect'

/** The top bar button that opens the menu holding the search box and Reflect. */
export const searchMenuTrigger = () => screen.getByRole('button', { name: triggerName })

/**
 * The search box lives in the top bar's search menu, so it only exists while
 * the menu is open. Opens the menu when needed and returns the input.
 */
export function searchField() {
  const open = screen.queryByLabelText('Search your knowledge')
  if (open) return open as HTMLInputElement
  fireEvent.click(searchMenuTrigger())
  return screen.getByLabelText('Search your knowledge') as HTMLInputElement
}

/** Waits for the top bar to mount, then opens the menu and returns the input. */
export async function findSearchField() {
  await screen.findByRole('button', { name: triggerName })
  return searchField()
}

/** Types a query and submits it; the menu closes on submit, so each call reopens it. */
export function submitSearch(value: string) {
  const input = searchField()
  fireEvent.input(input, { target: { value } })
  fireEvent.submit(input.closest('form')!)
}
