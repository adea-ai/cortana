import { Image as AvatarPrimitive } from '@kobalte/core/image'
import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

function Avatar(
  props: ComponentProps<typeof AvatarPrimitive> & {
    size?: 'default' | 'sm' | 'lg'
  }
) {
  const [local, rest] = splitProps(props, ['class', 'size'])
  return (
    <AvatarPrimitive
      data-slot="avatar"
      data-size={local.size ?? 'default'}
      class={cn(
        'group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten',
        local.class
      )}
      {...rest}
    />
  )
}

function AvatarImage(props: ComponentProps<typeof AvatarPrimitive.Img>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <AvatarPrimitive.Img
      data-slot="avatar-image"
      class={cn('aspect-square size-full rounded-full object-cover', local.class)}
      {...rest}
    />
  )
}

function AvatarFallback(props: ComponentProps<typeof AvatarPrimitive.Fallback>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      class={cn(
        'flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs',
        local.class
      )}
      {...rest}
    />
  )
}

function AvatarBadge(props: ComponentProps<'span'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <span
      data-slot="avatar-badge"
      class={cn(
        'absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none',
        'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        local.class
      )}
      {...rest}
    />
  )
}

function AvatarGroup(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="avatar-group"
      class={cn(
        'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
        local.class
      )}
      {...rest}
    />
  )
}

function AvatarGroupCount(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="avatar-group-count"
      class={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3',
        local.class
      )}
      {...rest}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge }
