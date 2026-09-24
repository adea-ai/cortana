import { afterEach, expect, test } from 'bun:test'
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
              <SidebarMenuButton size="lg" tooltip="Knowledge">
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
  // The label is decorative: the row's own text names the control, and the
  // flyout carries no arrow element for a pointer to sit on.
  expect(hintFor()!.getAttribute('aria-hidden')).toBe('true')
  expect(hintFor()!.querySelector('svg')).toBeNull()
  expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull()

  fireEvent.mouseLeave(row)
  await waitFor(() => expect(hintFor()).toBeNull())
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
