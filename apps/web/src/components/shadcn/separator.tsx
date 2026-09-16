import { Separator as SeparatorPrimitive } from '@kobalte/core/separator'
import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

function Separator(props: ComponentProps<typeof SeparatorPrimitive>) {
  const [local, rest] = splitProps(props, ['class', 'orientation'])
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={local.orientation ?? 'horizontal'}
      class={cn(
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch',
        local.class
      )}
      {...rest}
    />
  )
}

export { Separator }
