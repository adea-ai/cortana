import { Accordion as AccordionPrimitive } from '@kobalte/core/accordion'
import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-solid'

function Accordion(props: ComponentProps<typeof AccordionPrimitive>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <AccordionPrimitive
      data-slot="accordion"
      class={cn('flex w-full flex-col', local.class)}
      {...rest}
    />
  )
}

function AccordionItem(props: ComponentProps<typeof AccordionPrimitive.Item>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      class={cn('not-last:border-b', local.class)}
      {...rest}
    />
  )
}

function AccordionTrigger(props: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <AccordionPrimitive.Header class="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        class={cn(
          'group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground',
          local.class
        )}
        {...rest}
      >
        {local.children}
        <ChevronDownIcon
          data-slot="accordion-trigger-icon"
          class="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
        />
        <ChevronUpIcon
          data-slot="accordion-trigger-icon"
          class="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent(props: ComponentProps<typeof AccordionPrimitive.Content>) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      class="overflow-hidden text-sm data-expanded:animate-accordion-down data-closed:animate-accordion-up"
      {...rest}
    >
      <div
        class={cn(
          'h-(--kb-accordion-content-height) pt-0 pb-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
          local.class
        )}
      >
        {local.children}
      </div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
