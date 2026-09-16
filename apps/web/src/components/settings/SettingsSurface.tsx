import {
  children as resolveChildren,
  createContext,
  createMemo,
  splitProps,
  useContext,
  type ComponentProps,
  type JSX,
} from 'solid-js'

import { cn } from '../../lib/utils'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../shadcn/accordion'
import { Alert } from '../shadcn/alert'
import { TooltipButton as Button } from '../cortana/TooltipButton'
import { Card } from '../shadcn/card'
import { Checkbox } from '../shadcn/checkbox'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '../shadcn/field'
import { Input } from '../shadcn/input'
import { RadioGroup, RadioGroupItem } from '../shadcn/radio-group'
import { Select, SelectContent, SelectTrigger, SelectValue } from '../shadcn/select'
import type { SelectOptionValue } from '../shadcn/select'
import { Switch } from '../shadcn/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../shadcn/tabs'
import { Textarea } from '../shadcn/textarea'

export function SettingsSurfaceProvider(props: { children: JSX.Element }) {
  return props.children as JSX.Element
}

/** Shared between Field and the settings controls it wraps: the first control
    inside a Field claims the generated control id plus describedby/invalid. */
export const FieldControlContext = createContext<{
  id: string
  describedBy: () => string | undefined
  invalid: () => boolean
  taken: boolean
  claim: () => boolean
} | null>(null)

function claimFieldControl() {
  const field = useContext(FieldControlContext)
  if (!field) return null
  return field.claim() ? field : null
}

type SettingsButtonProps = Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'icon' | 'compact'
}

export function SettingsButton(props: SettingsButtonProps) {
  const [local, rest] = splitProps(props, ['variant'])
  const variant = () => local.variant ?? 'secondary'
  return (
    <Button
      {...rest}
      variant={
        variant() === 'primary'
          ? 'default'
          : variant() === 'outline'
            ? 'outline'
            : variant() === 'danger'
              ? 'destructive'
              : variant() === 'ghost' || variant() === 'icon'
                ? 'ghost'
                : 'secondary'
      }
      size={variant() === 'icon' ? 'icon' : variant() === 'compact' ? 'sm' : 'default'}
    />
  )
}

export function SettingsInput(props: ComponentProps<'input'>) {
  const field = claimFieldControl()
  const [local, rest] = splitProps(props, ['id', 'aria-describedby', 'aria-invalid'])
  return (
    <Input
      id={local.id ?? field?.id}
      aria-describedby={local['aria-describedby'] ?? field?.describedBy()}
      aria-invalid={local['aria-invalid'] ?? (field?.invalid() || undefined)}
      {...rest}
    />
  )
}

export function SettingsTextarea(props: ComponentProps<'textarea'>) {
  const field = claimFieldControl()
  const [local, rest] = splitProps(props, ['id', 'aria-describedby', 'aria-invalid'])
  return (
    <Textarea
      id={local.id ?? field?.id}
      aria-describedby={local['aria-describedby'] ?? field?.describedBy()}
      aria-invalid={local['aria-invalid'] ?? (field?.invalid() || undefined)}
      {...rest}
    />
  )
}

export function SettingsCard(props: ComponentProps<'div'>) {
  return <Card {...props} />
}

export function SettingsAlert(
  props: ComponentProps<'div'> & { variant?: 'default' | 'destructive' }
) {
  const [local, rest] = splitProps(props, ['variant'])
  return <Alert variant={local.variant ?? 'default'} {...rest} />
}

export function SettingsField(props: ComponentProps<'div'>) {
  return <Field {...props} />
}

export function SettingsFieldGroup(props: ComponentProps<'div'>) {
  return <FieldGroup {...props} />
}

export function SettingsFieldSet(props: ComponentProps<'fieldset'>) {
  return <FieldSet {...props} />
}

export function SettingsFieldLegend(props: ComponentProps<'legend'>) {
  return <FieldLegend {...props} />
}

export function SettingsFieldLabel(props: ComponentProps<'label'>) {
  return <FieldLabel {...props} />
}

export function SettingsFieldDescription(props: ComponentProps<'p'>) {
  return <FieldDescription {...props} />
}

export function SettingsFieldError(props: ComponentProps<'div'>) {
  return <FieldError {...props} />
}

/** Minimal event shape settings callers read after a checked change. */
type CheckedChangeEvent = {
  target: { checked: boolean; value?: string }
  currentTarget: { checked: boolean; value?: string }
}

/** Minimal event shape settings callers read after a value change. */
type ValueChangeEvent = {
  target: { value: string }
  currentTarget: { value: string }
}

export function SettingsCheckbox(
  props: Omit<ComponentProps<'input'>, 'type' | 'onChange'> & {
    onChange?: (event: CheckedChangeEvent) => void
  }
) {
  const field = claimFieldControl()
  return (
    <Checkbox
      id={props.id ?? field?.id}
      name={props.name}
      checked={Boolean(props.checked)}
      disabled={props.disabled}
      required={props.required}
      aria-label={props['aria-label']}
      aria-describedby={props['aria-describedby'] ?? field?.describedBy()}
      aria-invalid={props['aria-invalid'] ?? (field?.invalid() || undefined)}
      title={props.title}
      onChange={(checked) => {
        props.onChange?.({
          target: { checked },
          currentTarget: { checked },
        })
      }}
    />
  )
}

export function SettingsSwitch(
  props: Omit<ComponentProps<'input'>, 'type' | 'onChange'> & {
    onChange?: (event: CheckedChangeEvent) => void
  }
) {
  const field = claimFieldControl()
  return (
    <Switch
      id={props.id ?? field?.id}
      name={props.name}
      checked={Boolean(props.checked)}
      disabled={props.disabled}
      required={props.required}
      aria-label={props['aria-label']}
      aria-describedby={props['aria-describedby'] ?? field?.describedBy()}
      aria-invalid={props['aria-invalid'] ?? (field?.invalid() || undefined)}
      title={props.title}
      onChange={(checked) => {
        props.onChange?.({
          target: { checked },
          currentTarget: { checked },
        })
      }}
    />
  )
}

export function SettingsRadioGroup(
  props: ComponentProps<'div'> & {
    value: string
    onValueChange: (value: string) => void
  }
) {
  const [local, rest] = splitProps(props, ['value', 'onValueChange', 'children', 'onChange'])
  return (
    <RadioGroup value={local.value} onChange={local.onValueChange} {...rest}>
      {local.children}
    </RadioGroup>
  )
}

export function SettingsRadio(props: Omit<ComponentProps<'input'>, 'type'>) {
  const field = claimFieldControl()
  return (
    <RadioGroupItem
      value={String(props.value ?? '')}
      disabled={props.disabled}
      aria-label={props['aria-label']}
      aria-describedby={props['aria-describedby'] ?? field?.describedBy()}
    />
  )
}

export function SettingsTabs(
  props: ComponentProps<'div'> & { value: string; onValueChange: (value: string) => void }
) {
  const [local, rest] = splitProps(props, ['value', 'onValueChange', 'children', 'onChange'])
  return (
    <Tabs value={local.value} onChange={local.onValueChange} {...rest}>
      {local.children}
    </Tabs>
  )
}

export function SettingsTabsList(props: ComponentProps<'div'> & { variant?: 'default' | 'line' }) {
  const [local, rest] = splitProps(props, ['variant'])
  return <TabsList variant={local.variant} {...rest} />
}

export function SettingsTabsTrigger(
  props: Omit<ComponentProps<'button'>, 'type'> & { value: string }
) {
  const [local, rest] = splitProps(props, ['value'])
  return <TabsTrigger value={local.value} {...rest} />
}

export function SettingsTabsContent(props: ComponentProps<'div'> & { value: string }) {
  const [local, rest] = splitProps(props, ['value'])
  return <TabsContent value={local.value} {...rest} />
}

export function SettingsAccordion(props: { class?: string; children: JSX.Element }) {
  return <Accordion class={props.class}>{props.children}</Accordion>
}

export function SettingsAccordionItem(props: {
  value: string
  class?: string
  children: JSX.Element
}) {
  return (
    <AccordionItem value={props.value} class={props.class}>
      {props.children}
    </AccordionItem>
  )
}

export function SettingsAccordionTrigger(props: { class?: string; children: JSX.Element }) {
  return <AccordionTrigger class={props.class}>{props.children}</AccordionTrigger>
}

export function SettingsAccordionContent(props: { class?: string; children: JSX.Element }) {
  return <AccordionContent class={props.class}>{props.children}</AccordionContent>
}

function collectOptions(nodes: unknown[], out: SelectOptionValue[]) {
  for (const node of nodes) {
    if (Array.isArray(node)) {
      collectOptions(node, out)
    } else if (node instanceof HTMLOptionElement) {
      out.push({
        value: node.value,
        label: node.textContent ?? node.value,
        disabled: node.disabled,
      })
    } else if (node instanceof Element || node instanceof DocumentFragment) {
      collectOptions(Array.from(node.childNodes), out)
    }
  }
}

export function SettingsSelect(
  props: Omit<ComponentProps<'select'>, 'onChange'> & {
    onChange?: (event: ValueChangeEvent) => void
  }
) {
  const field = claimFieldControl()
  const [local] = splitProps(props, [
    'children',
    'onChange',
    'value',
    'disabled',
    'name',
    'required',
    'id',
    'class',
    'aria-label',
    'aria-describedby',
    'aria-invalid',
    'title',
    'style',
  ])

  const options = createMemo<SelectOptionValue[]>(() => {
    const out: SelectOptionValue[] = []
    collectOptions(resolveChildren(() => local.children).toArray(), out)
    return out
  })

  return (
    <Select<SelectOptionValue>
      options={options()}
      value={options().find((option) => String(option.value) === String(local.value ?? '')) ?? null}
      disabled={local.disabled}
      name={local.name}
      required={local.required}
      onChange={(option) => {
        // Kobalte re-emits selection when the collection rebuilds, including
        // transient null echoes; skip them and no-op repeats so updates do
        // not feed a render loop or blank the controlled value.
        if (option == null) return
        const next = String(option.value ?? '')
        if (next === String(local.value ?? '')) return
        local.onChange?.({
          target: { value: next },
          currentTarget: { value: next },
        })
      }}
    >
      <SelectTrigger
        id={local.id ?? field?.id}
        class={cn('w-full border-border bg-background shadow-xs', local.class)}
        aria-label={local['aria-label']}
        aria-describedby={local['aria-describedby'] ?? field?.describedBy()}
        aria-invalid={local['aria-invalid'] ?? (field?.invalid() || undefined)}
        title={local.title}
        style={local.style}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent />
    </Select>
  )
}
