import { ToggleGroup as ToggleGroupPrimitive } from '@kobalte/core/toggle-group'
import { createContext, splitProps, useContext, type ComponentProps, type JSX } from 'solid-js'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { toggleVariants } from '@/components/shadcn/toggle-variants'

const ToggleGroupContext = createContext<VariantProps<typeof toggleVariants>>({
  size: 'default',
  variant: 'default',
})

function ToggleGroup(
  props: ComponentProps<typeof ToggleGroupPrimitive> &
    VariantProps<typeof toggleVariants> & {
      spacing?: number
      orientation?: 'horizontal' | 'vertical'
      children?: JSX.Element
    }
) {
  const [local, rest] = splitProps(props, [
    'class',
    'variant',
    'size',
    'spacing',
    'orientation',
    'children',
  ])
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={local.variant ?? 'default'}
      data-size={local.size ?? 'default'}
      data-spacing={local.spacing ?? 0}
      data-orientation={local.orientation ?? 'horizontal'}
      orientation={local.orientation ?? 'horizontal'}
      style={{ '--gap': local.spacing ?? 0 }}
      class={cn(
        'group/toggle-group flex w-fit flex-row items-center gap-(--spacing-sm,0) data-[variant=outline]:shadow-xs data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch',
        local.class
      )}
      {...rest}
    >
      <ToggleGroupContext.Provider
        value={{ variant: local.variant ?? 'default', size: local.size ?? 'default' }}
      >
        {local.children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}

function ToggleGroupItem(
  props: ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>
) {
  const context = useContext(ToggleGroupContext)
  const [local, rest] = splitProps(props, ['class', 'variant', 'size', 'children'])
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant ?? local.variant}
      data-size={context.size ?? local.size}
      data-spacing={0}
      class={cn(
        'w-auto shrink-0 rounded-md shadow-none focus:z-10 focus-visible:z-10 group-data-[orientation=horizontal]/toggle-group:px-2.5 group-data-[orientation=vertical]/toggle-group:w-full group-data-[orientation=vertical]/toggle-group:justify-start',
        toggleVariants({
          variant: context.variant ?? local.variant,
          size: context.size ?? local.size,
        }),
        local.class
      )}
      {...rest}
    >
      {local.children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
