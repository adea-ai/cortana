import { Combobox as ComboboxPrimitive, useComboboxContext } from '@kobalte/core/combobox'
import type { ComboboxRootProps, ComboboxRootItemComponentProps } from '@kobalte/core/combobox'
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
import { Show, splitProps, type ComponentProps, type JSX } from 'solid-js'

import { cn } from '@/lib/utils'
import { Button } from '@/components/shadcn/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/shadcn/input-group'
import { ChevronDownIcon, XIcon, CheckIcon } from 'lucide-solid'

type Side = 'top' | 'right' | 'bottom' | 'left'
type Align = 'start' | 'center' | 'end'

function toPlacement(side: Side, align: Align): Placement {
  return align === 'start' || align === 'end' ? `${side}-${align}` : side
}

/** Shape of a combobox option. `label` may be JSX; `value` is the option key. */
type ComboboxOptionValue = {
  value: string | number
  label?: JSX.Element
  disabled?: boolean
}

function optionLabel(option: unknown): JSX.Element {
  if (option && typeof option === 'object' && 'label' in option) {
    const label = (option as ComboboxOptionValue).label
    if (label !== undefined && label !== null) return label
  }
  if (option && typeof option === 'object' && 'value' in option) {
    return String((option as ComboboxOptionValue).value)
  }
  return String(option)
}

function optionText(option: unknown): string {
  if (option && typeof option === 'object' && 'label' in option) {
    const label = (option as ComboboxOptionValue).label
    if (typeof label === 'string' || typeof label === 'number') return String(label)
  }
  if (option && typeof option === 'object' && 'value' in option) {
    return String((option as ComboboxOptionValue).value)
  }
  return String(option)
}

function Combobox<Option extends object = ComboboxOptionValue>(
  props: ComboboxRootProps<Option> & { options: Array<Option>; children?: JSX.Element }
) {
  const [local, rest] = splitProps(props, [
    'options',
    'optionValue',
    'optionTextValue',
    'optionDisabled',
    'optionLabel',
    'itemComponent',
  ])
  const Root = ComboboxPrimitive<Option>
  return (
    <Root
      data-slot="combobox"
      options={local.options}
      optionValue={(local.optionValue ?? 'value') as keyof Exclude<Option, null>}
      optionTextValue={
        (local.optionTextValue as keyof Exclude<Option, null>) ??
        ((option: Exclude<Option, null>) => optionText(option))
      }
      optionDisabled={(local.optionDisabled ?? 'disabled') as keyof Exclude<Option, null>}
      optionLabel={
        (local.optionLabel ??
          ((option: Exclude<Option, null>) => String(optionLabel(option)))) as keyof Exclude<
          Option,
          null
        >
      }
      itemComponent={
        local.itemComponent ??
        ((itemProps: ComboboxRootItemComponentProps<Option>) => (
          <ComboboxItem item={itemProps.item}>{optionLabel(itemProps.item.rawValue)}</ComboboxItem>
        ))
      }
      {...rest}
    />
  )
}

function ComboboxValue(props: ComponentProps<'span'>) {
  return <span data-slot="combobox-value" {...props} />
}

function ComboboxTrigger(props: ComponentProps<typeof ComboboxPrimitive.Trigger>) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <ComboboxPrimitive.Trigger
      aria-label="Toggle options"
      data-slot="combobox-trigger"
      class={cn("[&_svg:not([class*='size-'])]:size-4", local.class)}
      {...rest}
    >
      {local.children}
      <ChevronDownIcon class="pointer-events-none size-4 text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxClear(props: ComponentProps<typeof Button>) {
  const [local, rest] = splitProps(props, ['class'])
  const context = useComboboxContext()
  return (
    <Button
      aria-label="Clear selection"
      data-slot="combobox-clear"
      variant="ghost"
      size="icon-xs"
      class={cn(local.class)}
      onClick={() => {
        context.listState().selectionManager().clearSelection()
        context
          .inputRef()
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      }}
      {...rest}
    >
      <XIcon class="pointer-events-none" />
    </Button>
  )
}

function ComboboxInput(
  props: ComponentProps<typeof ComboboxPrimitive.Input> & {
    showTrigger?: boolean
    showClear?: boolean
    children?: JSX.Element
  }
) {
  const [local, rest] = splitProps(props, [
    'class',
    'children',
    'disabled',
    'showTrigger',
    'showClear',
  ])
  return (
    <InputGroup class={cn('w-auto', local.class)}>
      <ComboboxPrimitive.Control class="contents">
        <ComboboxPrimitive.Input as={InputGroupInput} disabled={local.disabled} {...rest} />
        <InputGroupAddon align="inline-end">
          <Show when={local.showTrigger ?? true}>
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              as={ComboboxPrimitive.Trigger}
              data-slot="input-group-button"
              aria-label="Toggle options"
              class="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
              disabled={local.disabled}
            />
          </Show>
          <Show when={local.showClear}>
            <ComboboxClear disabled={local.disabled} />
          </Show>
        </InputGroupAddon>
        {local.children}
      </ComboboxPrimitive.Control>
    </InputGroup>
  )
}

function ComboboxContent(
  props: ComponentProps<typeof ComboboxPrimitive.Content> & {
    side?: Side
    align?: Align
    sideOffset?: number
    alignOffset?: number
    children?: JSX.Element
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
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Content
        data-slot="combobox-content"
        placement={toPlacement(local.side ?? 'bottom', local.align ?? 'start')}
        gutter={local.sideOffset ?? 6}
        shift={local.alignOffset ?? 0}
        class={cn(
          'group/combobox-content relative max-h-(--kb-popper-content-available-height) w-(--kb-popper-anchor-width) min-w-[calc(var(--kb-popper-anchor-width)+--spacing(7))] origin-(--kb-combobox-content-transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:shadow-none data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          local.class
        )}
        {...rest}
      >
        {local.children}
      </ComboboxPrimitive.Content>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList(props: ComponentProps<typeof ComboboxPrimitive.Listbox>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ComboboxPrimitive.Listbox
      data-slot="combobox-list"
      class={cn(
        'no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--kb-popper-content-available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none',
        local.class
      )}
      {...rest}
    />
  )
}

function ComboboxItem(props: ComponentProps<typeof ComboboxPrimitive.Item>) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      class={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      {local.children}
      <ComboboxPrimitive.ItemIndicator class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon class="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

function ComboboxGroup(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return <div data-slot="combobox-group" class={cn(local.class)} {...rest} />
}

function ComboboxLabel(props: ComponentProps<typeof ComboboxPrimitive.Label>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <ComboboxPrimitive.Label
      data-slot="combobox-label"
      class={cn('px-2 py-1.5 text-xs text-muted-foreground', local.class)}
      {...rest}
    />
  )
}

function ComboboxCollection(props: { children?: JSX.Element }) {
  return <>{props.children}</>
}

function ComboboxEmpty(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  const context = useComboboxContext()
  const isEmpty = () => context.listState().collection().getSize() === 0
  return (
    <Show when={isEmpty()}>
      <div
        data-slot="combobox-empty"
        class={cn(
          'flex w-full justify-center py-2 text-center text-sm text-muted-foreground',
          local.class
        )}
        {...rest}
      />
    </Show>
  )
}

function ComboboxSeparator(props: ComponentProps<'hr'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <hr
      data-slot="combobox-separator"
      class={cn('pointer-events-none -mx-1 my-1 h-px border-none bg-border', local.class)}
      {...rest}
    />
  )
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
}
export type { ComboboxOptionValue }
