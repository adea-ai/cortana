import { afterEach, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { cleanup, render, screen, waitFor } from 'solid-testing-library'

import { Field } from './SettingsLayout'
import { SettingsSelect } from './SettingsSurface'

afterEach(cleanup)

test('settings selects name the field and current option without reusing label ids', async () => {
  const [embeddingModel, setEmbeddingModel] = createSignal('local')

  render(() => (
    <>
      <Field label="Embedding model">
        <SettingsSelect value={embeddingModel()} onChange={() => undefined}>
          <option value="local">Local model</option>
          <option value="hosted">Hosted model</option>
        </SettingsSelect>
      </Field>
      <Field label="Query model">
        <SettingsSelect value="query" onChange={() => undefined}>
          <option value="query">Query model v2</option>
        </SettingsSelect>
      </Field>
    </>
  ))

  const embeddingLabel = screen.getByText('Embedding model', {
    selector: 'label',
  }) as HTMLLabelElement
  const queryLabel = screen.getByText('Query model', { selector: 'label' }) as HTMLLabelElement
  const embeddingTrigger = screen.getByRole('button', { name: 'Embedding model Local model' })
  const queryTrigger = screen.getByRole('button', { name: 'Query model Query model v2' })

  expect(embeddingLabel.id).not.toBe('')
  expect(queryLabel.id).not.toBe('')
  expect(embeddingLabel.id).not.toBe(queryLabel.id)
  expect(embeddingTrigger.id).toBe(embeddingLabel.htmlFor)
  expect(queryTrigger.id).toBe(queryLabel.htmlFor)
  expect(embeddingTrigger.getAttribute('aria-labelledby')?.split(' ')).toContain(embeddingLabel.id)
  expect(queryTrigger.getAttribute('aria-labelledby')?.split(' ')).toContain(queryLabel.id)

  setEmbeddingModel('hosted')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Embedding model Hosted model' })).toBeTruthy()
  )
})
