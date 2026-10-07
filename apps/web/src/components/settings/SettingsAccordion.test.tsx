import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, waitFor } from 'solid-testing-library'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@adea-ai/ui/components/ui/accordion'

afterEach(cleanup)

test('settings disclosures close again when their trigger is activated twice', async () => {
  const { getByRole, queryByText } = render(() => (
    <Accordion collapsible>
      <AccordionItem value="details">
        <AccordionTrigger>Advanced details</AccordionTrigger>
        <AccordionContent>
          <p>Internal identifiers</p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
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
