import { Select as SelectPrimitive } from '@kobalte/core/select'
import type { SelectRootProps, SelectValueProps } from '@kobalte/core/select'
import { splitProps, type ComponentProps, type JSX } from 'solid-js'
import type { CollectionNode } from '@kobalte/core'
type Placement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end'
  | 'left-start'
  | 'left-end'
  | 'right-start'
  | 'right-end'

import { cn } from '@/lib/utils'
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from 'lucide-solid'

type Side = 'top' | 'right' | 'bottom' | 'left'
type Align = 'start' | 'center' | 'end'

function toPlacement(side: Side, align: Align): Placement {
  return align === 'start' || align === 'end' ? `${side}-${align}` : side
}

/** Shape of a select option. `label` may be JSX; `value` is the option key. */
type SelectOptionValue = {
  value: string | number
  label?: JSX.Element
  disabled?: boolean
}

function optionLabel(option: unknown): JSX.Element {
  if (option && typeof option === 'object' && 'label' in option) {
    const label = (option as SelectOptionValue).label
    if (label !== undefined && label !== null) return label
  }
  if (option && typeof option === 'object' && 'value' in option) {
    return String((option as SelectOptionValue).value)
  }
  return String(option)
}

function optionText(option: unknown): string {
  if (option && typeof option === 'object' && 'label' in option) {
    const label = (option as SelectOptionValue).label
    if (typeof label === 'string' || typeof label === 'number') return String(label)
  }
  if (option && typeof option === 'object' && 'value' in option) {
    return String((option as SelectOptionValue).value)
  }
  return String(option)
}

function Select<Option extends object = SelectOptionValue>(
  props: SelectRootProps<Option> & { options: Array<Option>; children?: JSX.Element }
) {
  const [local, rest] = splitProps(props, [
    'options',
    'optionValue',
    'optionTextValue',
    'optionDisabled',
    'itemComponent',
  ])
  const Root = SelectPrimitive<Option>
  return (
    <Root
      data-slot="select"
      options={local.options}
      optionValue={(local.optionValue ?? 'value') as keyof Exclude<Option, null>}
      optionTextValue={local.optionTextValue ?? ((option) => optionText(option))}
      optionDisabled={(local.optionDisabled ?? 'disabled') as keyof Exclude<Option, null>}
      itemComponent={
        local.itemComponent ??
        ((itemProps) => (
          <SelectItem item={itemProps.item}>{optionLabel(itemProps.item.rawValue)}</SelectItem>
        ))
      }
      {...rest}
    />
  )
}

function SelectGroup(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return <div data-slot="select-group" class={cn('scroll-my-1 p-1', local.class)} {...rest} />
}

function SelectValue<Option>(props: SelectValueProps<Option> & { class?: string }) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  const Value = SelectPrimitive.Value<Option>
  return (
    <Value data-slot="select-value" class={cn('flex flex-1 text-left', local.class)} {...rest}>
      {local.children ?? ((state) => optionLabel(state.selectedOption()))}
    </Value>
  )
}

function SelectTrigger(
  props: ComponentProps<typeof SelectPrimitive.Trigger> & {
    size?: 'sm' | 'default'
  }
) {
  const [local, rest] = splitProps(props, ['class', 'size', 'children'])
  return (
    <SelectPrimitive.Trigger
      // Kobalte renders a plain button; the React/Base UI contract this
      // replaces exposes select-only semantics via the combobox role.
      // Kobalte supplies aria-haspopup, aria-expanded, and aria-controls on
      // the underlying trigger element.
      // oxlint-disable-next-line jsx-a11y/role-has-required-aria-props
      role="combobox"
      as={SelectTriggerButton}
      data-slot="select-trigger"
      data-size={local.size ?? 'default'}
      class={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder-shown:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      {local.children}
      <SelectPrimitive.Icon>
        <ChevronDownIcon class="pointer-events-none size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

// Kobalte always labels the trigger by the selected value element. When a
// caller supplies an explicit aria-label, drop the composed labelledby so the
// accessible name stays the label (the React/Base UI contract), otherwise keep
// Kobalte's richer label + value announcement.
function SelectTriggerButton(props: ComponentProps<'button'>) {
  const [local, rest] = splitProps(props, ['aria-labelledby', 'aria-label'])
  return (
    <button
      type="button"
      {...rest}
      aria-label={local['aria-label']}
      aria-labelledby={local['aria-label'] ? undefined : local['aria-labelledby']}
    />
  )
}

function SelectContent(
  props: ComponentProps<typeof SelectPrimitive.Content> & {
    side?: Side
    align?: Align
    sideOffset?: number
    alignOffset?: number
  }
) {
  const [local, rest] = splitProps(props, [
    'class',
    'children',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
  ])
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        placement={toPlacement(local.side ?? 'bottom', local.align ?? 'center')}
        gutter={local.sideOffset ?? 4}
        shift={local.alignOffset ?? 0}
        class={cn(
          'relative isolate z-50 max-h-(--kb-popper-content-available-height) w-(--kb-popper-anchor-width) min-w-36 origin-(--kb-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Listbox class="outline-none">
          {local.children as never}
        </SelectPrimitive.Listbox>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel(props: ComponentProps<typeof SelectPrimitive.Label>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      class={cn('px-1.5 py-1 text-xs text-muted-foreground', local.class)}
      {...rest}
    />
  )
}

function SelectItem(
  props: { item: CollectionNode<unknown> } & ComponentProps<typeof SelectPrimitive.Item>
) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      class={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        local.class
      )}
      {...rest}
    >
      <SelectPrimitive.ItemLabel class="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {local.children}
      </SelectPrimitive.ItemLabel>
      <SelectPrimitive.ItemIndicator class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon class="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator(props: ComponentProps<'hr'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <hr
      data-slot="select-separator"
      class={cn('pointer-events-none -mx-1 my-1 h-px border-none bg-border', local.class)}
      {...rest}
    />
  )
}

function SelectScrollUpButton(props: ComponentProps<'span'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <span
      data-slot="select-scroll-up-button"
      class={cn(
        "top-0 z-10 hidden w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <ChevronUpIcon />
    </span>
  )
}

function SelectScrollDownButton(props: ComponentProps<'span'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <span
      data-slot="select-scroll-down-button"
      class={cn(
        "bottom-0 z-10 hidden w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <ChevronDownIcon />
    </span>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
export type { SelectOptionValue }
