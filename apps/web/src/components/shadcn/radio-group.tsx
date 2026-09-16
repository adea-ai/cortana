import { RadioGroup as RadioGroupPrimitive } from '@kobalte/core/radio-group'
import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

function RadioGroup(props: ComponentProps<typeof RadioGroupPrimitive>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      class={cn('grid w-full gap-2', local.class)}
      {...rest}
    />
  )
}

function RadioGroupItem(props: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <RadioGroupPrimitive.Item class="peer inline-flex items-center" {...rest}>
      <RadioGroupPrimitive.ItemInput class="sr-only" />
      <RadioGroupPrimitive.ItemControl
        data-slot="radio-group-item"
        class={cn(
          'group/radio-group-item relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary',
          local.class
        )}
      >
        <RadioGroupPrimitive.ItemIndicator
          data-slot="radio-group-indicator"
          class="flex size-4 items-center justify-center"
        >
          <span class="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
        </RadioGroupPrimitive.ItemIndicator>
      </RadioGroupPrimitive.ItemControl>
      {local.children}
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
