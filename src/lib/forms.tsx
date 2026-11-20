import { useState } from 'react'
import type { FormEvent } from 'react'
import { ErrorMessage } from '../components/Feedback'
import { ConflictError, fetchTrip } from './api'
import type { BaseRecord, Records, Table } from './models'

export function value(form: FormData, key: string) { return String(form.get(key) ?? '').trim() }
export function nullable(form: FormData, key: string) { return value(form, key) || null }

export function useVersionedForm<K extends Table>(table: K, original: Records[K] | undefined, onSaved: () => void) {
  const [base, setBase] = useState(original)
  const [formKey, setFormKey] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [latest, setLatest] = useState<BaseRecord | null | undefined>()
  async function run(operation: () => Promise<unknown>) {
    if (!navigator.onLine) { setError('You are offline. Reconnect before saving; your draft is still here.'); return }
    setPending(true)
    setError('')
    try { await operation(); onSaved() }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request failed. Please retry.')
      if (cause instanceof ConflictError && base) {
        try {
          const data = await fetchTrip()
          const rows = table === 'trips' ? (data ? [data.trip] : []) : table === 'itinerary_items' ? data?.items : table === 'tasks' ? data?.tasks : table === 'notes' ? data?.notes : data?.attachments
          setLatest(rows?.find(row => row.id === base.id) ?? null)
        } catch (refreshError) {
          setError(`${cause.message} Could not retrieve the latest version: ${refreshError instanceof Error ? refreshError.message : 'Network error'}`)
        }
      }
    } finally { setPending(false) }
  }
  function submit(operation: (form: FormData) => Promise<unknown>) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      void run(() => operation(form))
    }
  }
  const feedback = <>
    {error && <ErrorMessage>{error}</ErrorMessage>}
    {latest !== undefined && <div className="message warning">
      {latest === null ? <p>This record was deleted. Copy your draft before closing.</p> : <>
        <p><strong>Latest saved version</strong> — review before replacing or reapplying your draft.</p>
        <details><summary>Review current record</summary><pre>{JSON.stringify(latest, null, 2)}</pre></details>
        <div className="button-row">
          <button type="button" onClick={() => { setBase(latest as Records[K]); setFormKey(key => key + 1); setLatest(undefined); setError('') }}>Replace draft with latest</button>
          <button type="button" onClick={() => { setBase(latest as Records[K]); setLatest(undefined); setError('Draft kept. Save again to explicitly apply it to the latest version.') }}>Keep draft, use latest version</button>
        </div>
      </>}
    </div>}
  </>
  return { base, formKey, pending, feedback, submit, run, blocked: pending || latest !== undefined }
}
