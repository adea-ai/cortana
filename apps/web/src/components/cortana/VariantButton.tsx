import { splitProps, type ComponentProps } from 'solid-js'

import { TooltipButton } from './TooltipButton'

export type VariantButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'danger'
  | 'ghost'
  | 'icon'
  | 'compact'

export type VariantButtonProps = Omit<ComponentProps<typeof TooltipButton>, 'variant' | 'size'> & {
  variant?: VariantButtonVariant
}

/**
 * Shared Cortana variant vocabulary over the shadcn button. Six near-identical
 * local wrappers were replaced by this one mapping so variant semantics stay
 * consistent across panels, settings, workspace, and memory surfaces.
 */
export function VariantButton(props: VariantButtonProps) {
  const [local, rest] = splitProps(props, ['variant'])
  const variant = () => local.variant ?? 'secondary'
  return (
    <TooltipButton
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
