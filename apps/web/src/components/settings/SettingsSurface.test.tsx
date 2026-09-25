import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, waitFor } from 'solid-testing-library'

import {
  SettingsAccordion,
  SettingsAccordionContent,
  SettingsAccordionItem,
  SettingsAccordionTrigger,
} from './SettingsSurface'

afterEach(cleanup)

test('settings disclosures close again when their trigger is activated twice', async () => {
  const { getByRole, queryByText } = render(() => (
    <SettingsAccordion>
      <SettingsAccordionItem value="details">
        <SettingsAccordionTrigger>Advanced details</SettingsAccordionTrigger>
        <SettingsAccordionContent>
          <p>Internal identifiers</p>
        </SettingsAccordionContent>
      </SettingsAccordionItem>
    </SettingsAccordion>
  ))
  const trigger = getByRole('button', { name: 'Advanced details' })
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(queryByText('Internal identifiers')).toBeNull()

  fireEvent.click(trigger)
  await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'))
  expect(queryByText('Internal identifiers')).not.toBeNull()

  // Kobalte's accordion is a single non-collapsible selection by default, which
  // is what left an opened section impossible to close.
  fireEvent.click(trigger)
  await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'))
  await waitFor(() => expect(queryByText('Internal identifiers')).toBeNull())
})
