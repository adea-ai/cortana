import { Checkbox as CheckboxPrimitive } from '@kobalte/core/checkbox'
import { splitProps, type ComponentProps, type JSX } from 'solid-js'

import { cn } from '@/lib/utils'
import { CheckIcon } from 'lucide-solid'

function Checkbox(props: ComponentProps<typeof CheckboxPrimitive>) {
  const [local, rest] = splitProps(props, [
    'class',
    'children',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'aria-busy',
    'aria-invalid',
  ])
  return (
    <CheckboxPrimitive class="peer inline-flex items-center" {...rest}>
      <CheckboxPrimitive.Input
        class="sr-only"
        data-slot="checkbox"
        aria-checked={String(Boolean(props.checked)) as 'true' | 'false'}
        aria-label={local['aria-label']}
        aria-labelledby={local['aria-labelledby']}
        aria-describedby={local['aria-describedby']}
        aria-busy={local['aria-busy']}
        aria-invalid={local['aria-invalid']}
      />
      <CheckboxPrimitive.Control
        data-slot="checkbox"
        class={cn(
          'relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary',
          local.class
        )}
      >
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          class="grid place-content-center text-current transition-none [&>svg]:size-3.5"
        >
          <CheckIcon />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Control>
      {local.children as JSX.Element}
    </CheckboxPrimitive>
  )
}

export { Checkbox }
