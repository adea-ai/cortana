import {
  UpdateChannelControl as SharedUpdateChannelControl,
  type UpdateChannel,
} from '@adea-ai/ui/components/composites/update-dialog'
import type { UpdateDialogProps } from '@adea-ai/ui/components/composites/update-dialog'
import { getDesktopUpdateChannel, saveDesktopUpdateChannel } from '../api'

type UpdateDialogChannelControls = Parameters<NonNullable<UpdateDialogProps['channelControl']>>[0]

/**
 * The shared release-channel row bound to cortana's desktop commands. The
 * dialog stays mounted after its first open, so `reloadOn` re-reads the stored
 * channel whenever it reopens and picks up changes made outside the dialog.
 */
export function UpdateChannelControl(props: {
  controls: UpdateDialogChannelControls
  reloadOn: () => unknown
}) {
  return (
    <SharedUpdateChannelControl
      controls={props.controls}
      read={getDesktopUpdateChannel}
      persist={async (value: UpdateChannel) => saveDesktopUpdateChannel(value)}
      reloadOn={props.reloadOn}
    />
  )
}
