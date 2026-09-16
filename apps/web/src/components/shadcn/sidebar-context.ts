import { createContext, useContext } from 'solid-js'

export type SidebarContextProps = {
  state: () => 'expanded' | 'collapsed'
  open: () => boolean
  setOpen: (open: boolean) => void
  openMobile: () => boolean
  setOpenMobile: (open: boolean) => void
  isMobile: () => boolean
  toggleSidebar: () => void
  mobileTriggerRef: { current: HTMLButtonElement | null }
  mobileFinalFocusRef: { current: HTMLElement | null }
}

export const SidebarContext = createContext<SidebarContextProps | null>(null)

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }

  return context
}
