import { Collapsible as CollapsiblePrimitive } from '@kobalte/core/collapsible'
import type { ComponentProps } from 'solid-js'

function Collapsible(props: ComponentProps<typeof CollapsiblePrimitive>) {
  return <CollapsiblePrimitive data-slot="collapsible" {...props} />
}

function CollapsibleTrigger(props: ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
}

function CollapsibleContent(props: ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return <CollapsiblePrimitive.Content data-slot="collapsible-content" {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
