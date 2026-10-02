import { createSignal, onMount } from 'solid-js'
import { SettingsSection } from './SettingsLayout'
import { SettingsButton as Button, SettingsSelect } from './SettingsSurface'
import {
  getDesktopUpdateChannel,
  saveDesktopUpdateChannel,
  type DesktopUpdateChannel,
} from '../../api'

const CHANNEL_OPTIONS: ReadonlyArray<{ value: DesktopUpdateChannel; label: string }> = [
  { value: 'stable', label: 'Stable' },
  { value: 'pre-release', label: 'Pre-release' },
  { value: 'dev', label: 'Dev' },
]

const CHANNEL_DESCRIPTIONS: Record<DesktopUpdateChannel, string> = {
  stable:
    'Soaked releases only: a build ships here after its batch has spent about four days on the pre-release channel.',
  'pre-release':
    'Follows the daily pre-release builds as soon as they publish — new features early, rough edges included.',
  dev: 'Follows every build of main. Unqualified by definition; for development machines only.',
}

export function UpdatesSection(props: {
  currentVersion?: string
  onOpenUpdates: (opener?: HTMLButtonElement) => void
}) {
  const [channel, setChannel] = createSignal<DesktopUpdateChannel>('stable')
  const [channelState, setChannelState] = createSignal<'error' | 'idle' | 'saving'>('idle')
  const [channelError, setChannelError] = createSignal<string | null>(null)
  onMount(() => {
    void getDesktopUpdateChannel()
      .then((current) => setChannel(current))
      .catch(() => setChannelError('The current channel could not be read.'))
  })
  const saveChannel = async (value: string) => {
    if (channelState() === 'saving') return
    setChannelState('saving')
    setChannelError(null)
    try {
      setChannel(await saveDesktopUpdateChannel(value as DesktopUpdateChannel))
      setChannelState('idle')
    } catch (error) {
      setChannelState('error')
      setChannelError(error instanceof Error ? error.message : 'The channel could not be saved.')
    }
  }

  return (
    <SettingsSection
      bodyLayout="content"
      title="Updates"
      description="Review release notes and manage signed Cortana Desktop updates."
    >
      <div class="update-card">
        <div>
          <span class="eyebrow">Installed version</span>
          <strong>{props.currentVersion || 'Checking…'}</strong>
          <small>Check for updates and browse the complete release history.</small>
        </div>
        <div class="service-actions">
          <Button
            tooltip="Review release notes and update Cortana Desktop."
            variant="default"
            size="sm"
            type="button"
            onClick={(event) => props.onOpenUpdates(event.currentTarget)}
          >
            Open updates
          </Button>
        </div>
      </div>
      <div class="update-card">
        <div>
          <span class="eyebrow">Update channel</span>
          <strong>{CHANNEL_OPTIONS.find((option) => option.value === channel())?.label}</strong>
          <small>{CHANNEL_DESCRIPTIONS[channel()]}</small>
          {channelError() && <small role="alert">{channelError()}</small>}
        </div>
        <div class="service-actions">
          <SettingsSelect
            aria-label="Update channel"
            disabled={channelState() === 'saving'}
            value={channel()}
            onChange={(event) => void saveChannel(event.currentTarget.value)}
            options={[...CHANNEL_OPTIONS]}
          />
        </div>
      </div>
    </SettingsSection>
  )
}
