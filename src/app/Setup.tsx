import { useState } from 'react'
import { DateTime } from 'luxon'
import { Palmtree } from 'lucide-react'
import { client } from '../lib/supabase'
import { ErrorMessage, Field } from '../components/Feedback'
import { value } from '../lib/forms'
import type { Json } from '../lib/database.types'

function importRows(raw: string): { items: Json[]; tasks: Json[]; notes: Json[] } {
  const data: unknown = raw.trim() ? JSON.parse(raw) : {}
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The import must be a JSON object with optional items, tasks, and notes arrays.')
  const fields: Record<string, unknown> = data as Record<string, unknown>
  const rows = (name: string): Json[] => {
    const list = fields[name] ?? []
    if (!Array.isArray(list) || list.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error(`${name} must be an array of objects.`)
    return list as Json[]
  }
  return { items: rows('items'), tasks: rows('tasks'), notes: rows('notes') }
}
export function Setup({ onSaved }: { onSaved: () => void }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  return <main className="setup-page">
    <section className="panel setup-card">
      <Palmtree size={36} className="accent" /><p className="eyebrow">LET’S MAKE IT HAPPEN</p>
      <h1>Start our shared plan</h1>
      <p className="muted">Set the travel dates once. Everyone who logs in will see and edit this same trip.</p>
      <form onSubmit={async event => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        setPending(true); setError('')
        try {
          const start = value(fields, 'start_date'), end = value(fields, 'end_date'), zone = value(fields, 'timezone')
          if (end < start) throw new Error('The last travel day cannot be before the first.')
          if (!DateTime.now().setZone(zone).isValid) throw new Error('Enter a valid IANA time zone.')
          const imported = importRows(value(fields, 'import'))
          const { error } = await client().rpc('thailand_initialize_trip', {
            p_title: value(fields, 'title'), p_start_date: start, p_end_date: end, p_timezone: zone,
            p_items: imported.items, p_tasks: imported.tasks, p_notes: imported.notes,
          })
          if (error) throw new Error(error.message)
          onSaved()
        } catch (error) { setError(error instanceof Error ? error.message : 'Setup failed. Please retry.') }
        finally { setPending(false) }
      }}>
        <div className="form-grid">
          <Field label="Trip name" wide><input name="title" defaultValue="Thailand adventure" required maxLength={240} /></Field>
          <Field label="First travel day"><input name="start_date" type="date" required /></Field>
          <Field label="Last travel day"><input name="end_date" type="date" required /></Field>
          <Field label="Itinerary time zone" wide><input name="timezone" defaultValue="Asia/Bangkok" required /></Field>
        </div>
        <details className="import-section"><summary>Import a private initial itinerary (optional)</summary>
          <p className="small muted">Paste your private JSON containing items, tasks, and notes. It is sent only to your Supabase project, never included in the public site. Setup is idempotent and will not reset an existing trip.</p>
          <Field label="Initial data JSON"><textarea name="import" rows={8} spellCheck={false} placeholder={'{ "items": [], "tasks": [], "notes": [] }'} /></Field>
        </details>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <button className="primary full" disabled={pending || !navigator.onLine}>{pending ? 'Creating shared trip…' : 'Create shared trip'}</button>
      </form>
    </section>
  </main>
}
