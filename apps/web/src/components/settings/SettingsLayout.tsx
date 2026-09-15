import { Children, cloneElement, isValidElement, type ReactNode, useId, useState } from 'react'

import { cn } from '@/lib/utils'

import type { DesktopSettings } from '../../types'
import {
  SettingsCard,
  SettingsCheckbox,
  SettingsFieldDescription,
  SettingsFieldError,
  SettingsFieldLegend,
  SettingsFieldLabel,
  SettingsField,
  SettingsFieldSet,
  SettingsInput as Input,
  SettingsRadio,
  SettingsSelect as Select,
  SettingsTextarea as Textarea,
} from './SettingsSurface'

export type SettingsSectionProps = {
  settings: DesktopSettings
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="settings-section">
      <SettingsCard className="settings-section-card">
        <h2>{title}</h2>
        <p>{description}</p>
        {children}
      </SettingsCard>
    </section>
  )
}

export function Field({
  label,
  hint,
  error,
  wide = false,
  group = false,
  controlId: providedControlId,
  children,
}: {
  label: string
  hint?: string
  error?: string
  wide?: boolean
  group?: boolean
  controlId?: string
  children: ReactNode
}) {
  const generatedControlId = useId()
  const controlId = providedControlId ?? generatedControlId
  const descriptionId = hint ? `${controlId}-description` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined
  const groupLabelId = `${controlId}-label`

  if (group) {
    return (
      <SettingsFieldSet className={cn('form-field', wide && 'wide')} aria-describedby={describedBy}>
        <SettingsFieldLegend className="form-field-label">{label}</SettingsFieldLegend>
        {children}
        {hint && <SettingsFieldDescription id={descriptionId}>{hint}</SettingsFieldDescription>}
        {error && <SettingsFieldError id={errorId}>{error}</SettingsFieldError>}
      </SettingsFieldSet>
    )
  }

  const assignControl = (nodes: ReactNode): { node: ReactNode; assigned: boolean } => {
    let assigned = false
    const mapped = Children.map(nodes, (node) => {
      if (
        !isValidElement<{
          id?: string
          'aria-describedby'?: string
          'aria-invalid'?: boolean
          children?: ReactNode
        }>(node)
      )
        return node
      if (
        !assigned &&
        ([Input, Select, Textarea, SettingsCheckbox, SettingsRadio] as unknown[]).includes(
          node.type
        )
      ) {
        assigned = true
        return cloneElement(node, {
          id: controlId,
          'aria-describedby': describedBy,
          'aria-invalid': Boolean(error),
        })
      }
      if (node.props.children) {
        const child = assignControl(node.props.children)
        assigned = assigned || child.assigned
        return cloneElement(node, { children: child.node })
      }
      return node
    })
    return { node: mapped, assigned }
  }

  const { node: assignedChildren, assigned: controlAssigned } = providedControlId
    ? { node: children, assigned: true }
    : assignControl(children)

  return (
    <SettingsField
      className={cn('form-field', wide && 'wide')}
      role={controlAssigned ? undefined : 'group'}
      aria-labelledby={controlAssigned ? undefined : groupLabelId}
      aria-describedby={controlAssigned ? undefined : describedBy}
    >
      {controlAssigned ? (
        <SettingsFieldLabel htmlFor={controlId} className="form-field-label">
          {label}
        </SettingsFieldLabel>
      ) : (
        <span id={groupLabelId} className="form-field-label">
          {label}
        </span>
      )}
      {assignedChildren}
      {hint && <SettingsFieldDescription id={descriptionId}>{hint}</SettingsFieldDescription>}
      {error && <SettingsFieldError id={errorId}>{error}</SettingsFieldError>}
    </SettingsField>
  )
}

export function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState('')
  const [previousValue, setPreviousValue] = useState(value)

  if (value !== previousValue) {
    setPreviousValue(value)
    setDraft(String(value))
    setError('')
  }

  const validate = (raw: string) => {
    if (!raw) return `${label} is required.`
    const next = Number(raw)
    if (!Number.isFinite(next) || !Number.isInteger(next)) {
      return `${label} must be a whole number.`
    }
    if (next < min || next > max) {
      return `${label} must be between ${min} and ${max}.`
    }
    return ''
  }

  return (
    <Field label={label} hint={hint} error={error}>
      <Input
        type="number"
        aria-label={label}
        value={draft}
        min={min}
        max={max}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          const nextError = validate(raw)
          setError(nextError)
          if (!nextError) onChange(Number(raw))
        }}
        onBlur={() => {
          const nextError = validate(draft)
          if (nextError) {
            setDraft(String(value))
            setError('')
          }
        }}
        required
      />
    </Field>
  )
}
