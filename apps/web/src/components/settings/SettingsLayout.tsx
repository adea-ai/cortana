import { createSignal, createUniqueId, splitProps, type JSX } from 'solid-js'

import { cn } from '@/lib/utils'

import type { DesktopSettings } from '../../types'
import {
  FieldControlContext,
  SettingsCard,
  SettingsFieldDescription,
  SettingsFieldError,
  SettingsFieldLegend,
  SettingsFieldLabel,
  SettingsField,
  SettingsFieldSet,
  SettingsInput as Input,
} from './SettingsSurface'

export type SettingsSectionProps = {
  settings: DesktopSettings
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
}

export function SettingsSection(props: {
  title: string
  description: string
  children: JSX.Element
}) {
  return (
    <section class="settings-section">
      <SettingsCard class="settings-section-card">
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        {props.children}
      </SettingsCard>
    </section>
  )
}

export function Field(props: {
  label: string
  hint?: string
  error?: string
  wide?: boolean
  group?: boolean
  controlId?: string
  children: JSX.Element
}) {
  const [local] = splitProps(props, [
    'label',
    'hint',
    'error',
    'wide',
    'group',
    'controlId',
    'children',
  ])
  const generatedControlId = createUniqueId()
  const controlId = () => local.controlId ?? generatedControlId
  const descriptionId = () => (local.hint ? `${controlId()}-description` : undefined)
  const errorId = () => (local.error ? `${controlId()}-error` : undefined)
  const describedBy = () => [descriptionId(), errorId()].filter(Boolean).join(' ') || undefined
  const groupLabelId = `${controlId()}-label`

  if (local.group) {
    return (
      <SettingsFieldSet
        class={cn('form-field', local.wide && 'wide')}
        aria-describedby={describedBy()}
      >
        <SettingsFieldLegend class="form-field-label">{local.label}</SettingsFieldLegend>
        {local.children}
        {local.hint && (
          <SettingsFieldDescription id={descriptionId()}>{local.hint}</SettingsFieldDescription>
        )}
        {local.error && <SettingsFieldError id={errorId()}>{local.error}</SettingsFieldError>}
      </SettingsFieldSet>
    )
  }

  // The first settings control inside the field claims the generated id/aria
  // wiring through context; the label then binds `for` instead of acting as a
  // group label.
  const [claimed, setClaimed] = createSignal(Boolean(local.controlId))
  const controlAssigned = () => Boolean(local.controlId) || claimed()
  const fieldControl = {
    id: controlId(),
    describedBy,
    invalid: () => Boolean(local.error),
    taken: false,
    claim() {
      if (this.taken) return false
      this.taken = true
      setClaimed(true)
      return true
    },
  }

  return (
    <FieldControlContext.Provider value={fieldControl}>
      <SettingsField
        class={cn('form-field', local.wide && 'wide')}
        role={controlAssigned() ? undefined : 'group'}
        aria-labelledby={controlAssigned() ? undefined : groupLabelId}
        aria-describedby={controlAssigned() ? undefined : describedBy()}
      >
        {controlAssigned() ? (
          <SettingsFieldLabel for={controlId()} class="form-field-label">
            {local.label}
          </SettingsFieldLabel>
        ) : (
          <span id={groupLabelId} class="form-field-label">
            {local.label}
          </span>
        )}
        {local.children}
        {local.hint && (
          <SettingsFieldDescription id={descriptionId()}>{local.hint}</SettingsFieldDescription>
        )}
        {local.error && <SettingsFieldError id={errorId()}>{local.error}</SettingsFieldError>}
      </SettingsField>
    </FieldControlContext.Provider>
  )
}

export function NumberField(props: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = createSignal(String(props.value))
  const [error, setError] = createSignal('')

  const validate = (raw: string) => {
    if (!raw) return `${props.label} is required.`
    const next = Number(raw)
    if (!Number.isFinite(next) || !Number.isInteger(next)) {
      return `${props.label} must be a whole number.`
    }
    if (next < props.min || next > props.max) {
      return `${props.label} must be between ${props.min} and ${props.max}.`
    }
    return ''
  }

  return (
    <Field label={props.label} hint={props.hint} error={error()}>
      <Input
        type="number"
        aria-label={props.label}
        value={draft()}
        min={props.min}
        max={props.max}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          const nextError = validate(raw)
          setError(nextError)
          if (!nextError) props.onChange(Number(raw))
        }}
        onBlur={() => {
          const nextError = validate(draft())
          if (nextError) {
            setDraft(String(props.value))
            setError('')
          }
        }}
        required
      />
    </Field>
  )
}
