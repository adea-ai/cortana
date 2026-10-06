import { SettingsRow } from '@adea-ai/ui/components/composites/settings'
import { NativeSelect } from '@adea-ai/ui/components/ui/native-select'
import { createSignal, onMount, Show } from 'solid-js'
import type { UpdateDialogProps } from '@adea-ai/ui/components/composites/update-dialog'
import {
  getDesktopUpdateChannel,
  saveDesktopUpdateChannel,
  type DesktopUpdateChannel,
} from '../api'

type UpdateDialogChannelControls = Parameters<NonNullable<UpdateDialogProps['channelControl']>>[0]

const CHANNEL_OPTIONS: ReadonlyArray<{ value: DesktopUpdateChannel; label: string }> = [
  { value: 'stable', label: 'Stable' },
  { value: 'pre-release', label: 'Pre-release' },
  { value: 'dev', label: 'Dev' },
]

const CHANNEL_DESCRIPTIONS: Record<DesktopUpdateChannel, string> = {
  stable: 'Tested releases after about four days in pre-release.',
  'pre-release': 'Daily pre-release builds arrive early, with rough edges included.',
  dev: 'Follows every dev build from main. Intended for development machines.',
}

export function UpdateChannelControl(props: { controls: UpdateDialogChannelControls }) {
  const [channel, setChannel] = createSignal<DesktopUpdateChannel>('stable')
  const [loaded, setLoaded] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  onMount(() => {
    void getDesktopUpdateChannel()
      .then(setChannel)
      .catch(() => setError('The current update channel could not be read.'))
      .finally(() => setLoaded(true))
  })

  const saveChannel = async (value: string) => {
    const next = value as DesktopUpdateChannel
    if (!loaded() || saving() || props.controls.disabled() || next === channel()) return
    const previous = channel()
    let persisted = false
    setChannel(next)
    setSaving(true)
    setError(null)

    try {
      await props.controls.recheck(async () => {
        try {
          const saved = await saveDesktopUpdateChannel(next)
          setChannel(saved)
          persisted = true
        } catch (caught) {
          setChannel(previous)
          setError(
            caught instanceof Error ? caught.message : 'The update channel could not be saved.'
          )
          throw caught
        }
      })
    } catch (caught) {
      if (!persisted) {
        setChannel(previous)
        setError(
          caught instanceof Error ? caught.message : 'The update channel could not be saved.'
        )
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="flex flex-col gap-2">
      <SettingsRow label="Update channel" description={CHANNEL_DESCRIPTIONS[channel()]}>
        <NativeSelect
          aria-label="Update channel"
          disabled={!loaded() || saving() || props.controls.disabled()}
          value={channel()}
          options={[...CHANNEL_OPTIONS]}
          onChange={(event) => void saveChannel(event.currentTarget.value)}
        />
      </SettingsRow>
      <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>
    </div>
  )
}
