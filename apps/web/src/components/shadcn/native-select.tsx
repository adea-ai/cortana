import { ChevronDownIcon } from 'lucide-solid'
import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

function NativeSelect(props: ComponentProps<'select'>) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <span data-slot="native-select-wrapper" class="relative inline-flex min-w-0">
      <select
        data-slot="native-select"
        class={cn(
          'h-8 min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          local.class
        )}
        {...rest}
      >
        {local.children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  )
}

export { NativeSelect }
