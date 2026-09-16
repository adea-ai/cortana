import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

// Kobalte does not ship a ScrollArea primitive; a native overflow container
// preserves the same layout contract (data-slot + class passthrough).
function ScrollArea(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <div data-slot="scroll-area" class={cn('relative', local.class)} {...rest}>
      <div
        data-slot="scroll-area-viewport"
        class="size-full overflow-x-auto overflow-y-auto overscroll-contain rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {local.children}
      </div>
    </div>
  )
}

function ScrollBar(props: ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  const [local, rest] = splitProps(props, ['orientation'])
  return (
    <div
      data-slot="scroll-area-scrollbar"
      data-orientation={local.orientation ?? 'vertical'}
      aria-hidden="true"
      {...rest}
    />
  )
}

export { ScrollArea, ScrollBar }
