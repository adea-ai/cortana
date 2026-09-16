import { Tabs as TabsPrimitive } from '@kobalte/core/tabs'
import { splitProps, type ComponentProps } from 'solid-js'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { tabsListVariants } from './tabs-variants'

function Tabs(props: ComponentProps<typeof TabsPrimitive>) {
  const [local, rest] = splitProps(props, ['class', 'orientation'])
  return (
    <TabsPrimitive
      data-slot="tabs"
      orientation={local.orientation ?? 'horizontal'}
      class={cn('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', local.class)}
      {...rest}
    />
  )
}

function TabsList(
  props: ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>
) {
  const [local, rest] = splitProps(props, ['class', 'variant'])
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={local.variant ?? 'default'}
      class={cn(tabsListVariants({ variant: local.variant }), local.class)}
      {...rest}
    />
  )
}

function TabsTrigger(props: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      class={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-[selected]:shadow-sm group-data-[variant=line]/tabs-list:data-[selected]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[selected]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[selected]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[selected]:bg-transparent',
        'data-[selected]:bg-background data-[selected]:text-foreground dark:data-[selected]:border-input dark:data-[selected]:bg-input/30 dark:data-[selected]:text-foreground',
        'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[selected]:after:opacity-100',
        local.class
      )}
      {...rest}
    />
  )
}

function TabsContent(props: ComponentProps<typeof TabsPrimitive.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      class={cn('flex-1 text-sm outline-none', local.class)}
      {...rest}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
