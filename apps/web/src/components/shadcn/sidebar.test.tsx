import { afterEach, expect, test } from 'bun:test'
import { BookOpenText } from 'lucide-solid'
import { cleanup, fireEvent, render, waitFor } from 'solid-testing-library'

import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from './sidebar'

afterEach(() => {
  cleanup()
  // The label flyout is portalled to the body, outside the render container, so
  // a node whose fade-out timer is still pending outlives cleanup() in the test
  // harness and would be picked up by the next test's initial assertion.
  for (const node of document.querySelectorAll('[data-slot="sidebar-menu-hint"]')) node.remove()
})

function renderRail(props: { defaultOpen: boolean }) {
  return render(() => (
    <SidebarProvider defaultOpen={props.defaultOpen}>
      <Sidebar collapsible="icon">
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" icon={BookOpenText} tooltip="Knowledge">
                <span>Knowledge</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  ))
}

const hintFor = () => document.querySelector('[data-slot="sidebar-menu-hint"]')

test('a collapsed rail row reveals its label on hover without a tooltip arrow', async () => {
  const { getByRole } = renderRail({ defaultOpen: false })
  const row = getByRole('button', { name: 'Knowledge' })
  expect(hintFor()).toBeNull()

  fireEvent.mouseEnter(row)
  await waitFor(() => expect(hintFor()).not.toBeNull())
  expect(hintFor()!.textContent).toBe('Knowledge')
  // The label is the row unfolding in place: same box, same icon, no arrow.
  expect(hintFor()!.getAttribute('aria-hidden')).toBe('true')
  expect(hintFor()!.querySelector('svg')).not.toBeNull()
  expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull()

  fireEvent.mouseLeave(row)
  // Hiding flips the opacity synchronously; the node itself stays mounted for
  // the 150ms fade-out before it is dropped. The harness's act loop holds
  // pending timers, so the removal is polled directly rather than through
  // waitFor, which would never observe it.
  await waitFor(() => expect(hintFor()?.className).toContain('opacity-0'))
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(hintFor()).toBeNull()
})

test('a collapsed rail row reveals its label on keyboard focus', async () => {
  const { getByRole } = renderRail({ defaultOpen: false })
  const row = getByRole('button', { name: 'Knowledge' })
  fireEvent.focus(row)
  await waitFor(() => expect(hintFor()).not.toBeNull())
  expect(hintFor()!.textContent).toBe('Knowledge')
})

test('an expanded rail row shows no label flyout', async () => {
  const { getByRole } = renderRail({ defaultOpen: true })
  const row = getByRole('button', { name: 'Knowledge' })
  fireEvent.mouseEnter(row)
  expect(hintFor()).toBeNull()
})
