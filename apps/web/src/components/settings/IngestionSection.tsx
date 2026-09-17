import { AlertTriangle } from 'lucide-solid'

import type { DesktopSettings } from '../../types'
import { NumberField, SettingsSection, type SettingsSectionProps } from './SettingsLayout'
import { SettingsAlert, SettingsFieldGroup } from './SettingsSurface'

export function IngestionSection(incoming: SettingsSectionProps) {
  const props = incoming
  const setIngestion = (patch: Partial<DesktopSettings['ingestion']>) =>
    props.update((current) => ({
      ...current,
      ingestion: {
        ...current.ingestion,
        ...patch,
      },
    }))
  return (
    <SettingsSection
      title="Ingestion safety budgets"
      description="These hard limits protect the machine even when a connector returns more data than expected. Scheduled sync remains opt-in."
    >
      <SettingsFieldGroup class="form-grid compact">
        <NumberField
          label="Documents per source"
          value={props.settings.ingestion.max_documents_per_source}
          min={1}
          max={1000000}
          onChange={(max_documents_per_source) =>
            setIngestion({
              max_documents_per_source,
            })
          }
        />
        <NumberField
          label="Bytes per source"
          value={props.settings.ingestion.max_bytes_per_source}
          min={1024}
          max={1099511627776}
          onChange={(max_bytes_per_source) =>
            setIngestion({
              max_bytes_per_source,
            })
          }
        />
        <NumberField
          label="Duration seconds"
          value={props.settings.ingestion.max_duration_seconds}
          min={1}
          max={86400}
          onChange={(max_duration_seconds) =>
            setIngestion({
              max_duration_seconds,
            })
          }
        />
        <NumberField
          label="Document batch size"
          value={props.settings.ingestion.document_batch_size}
          min={1}
          max={2048}
          onChange={(document_batch_size) =>
            setIngestion({
              document_batch_size,
            })
          }
        />
        <NumberField
          label="Request concurrency"
          value={props.settings.ingestion.request_concurrency}
          min={1}
          max={32}
          onChange={(request_concurrency) =>
            setIngestion({
              request_concurrency,
            })
          }
        />
        <NumberField
          label="Sync freshness (hours)"
          hint="0 disables stale-sync warnings in the source health view"
          value={props.settings.ingestion.sync_freshness_hours}
          min={0}
          max={8760}
          onChange={(sync_freshness_hours) =>
            setIngestion({
              sync_freshness_hours,
            })
          }
        />
      </SettingsFieldGroup>
      <SettingsAlert class="safety-note">
        <AlertTriangle size={16} />
        <span>
          Saving these values does not start a sync. Source authorization and bounded sync controls
          are managed separately.
        </span>
      </SettingsAlert>
    </SettingsSection>
  )
}
