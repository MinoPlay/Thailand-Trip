import type { PostgrestError } from '@supabase/supabase-js'
import { client } from './supabase'
import type { Item, Task, Note, Trip, NewRecord, TripData, BaseRecord, Attachment } from './models'

export class ConflictError extends Error {
  constructor() { super('Someone changed or deleted this record. Your draft has not been discarded. Reload the latest version before saving again.'); this.name = 'ConflictError' }
}
function result<T>(response: { data: T | null; error: PostgrestError | null }): NonNullable<T> {
  if (response.error) throw new Error(response.error.message)
  if (response.data == null) throw new ConflictError()
  return response.data
}
export async function fetchTrip(): Promise<TripData | null> {
  const db = client()
  const tripResponse = await db.from('thailand_trips').select('*').maybeSingle()
  if (tripResponse.error) throw new Error(tripResponse.error.message)
  const trip = tripResponse.data
  if (!trip) return null
  const [items, tasks, notes, attachments] = await Promise.all([
    db.from('thailand_itinerary_items').select('*').eq('trip_id', trip.id).order('created_at'),
    db.from('thailand_tasks').select('*').eq('trip_id', trip.id).order('position').order('created_at'),
    db.from('thailand_notes').select('*').eq('trip_id', trip.id).order('created_at'),
    db.from('thailand_attachments').select('*').eq('trip_id', trip.id).order('created_at'),
  ])
  return { trip, items: result(items), tasks: result(tasks), notes: result(notes), attachments: result(attachments) }
}
export async function saveItem(fields: NewRecord<Item>, original?: Item) {
  const query = original
    ? client().from('thailand_itinerary_items').update(fields).eq('id', original.id).eq('version', original.version)
    : client().from('thailand_itinerary_items').insert(fields)
  return result(await query.select().maybeSingle())
}
export async function saveTask(fields: NewRecord<Task>, original?: Task) {
  const query = original
    ? client().from('thailand_tasks').update(fields).eq('id', original.id).eq('version', original.version)
    : client().from('thailand_tasks').insert(fields)
  return result(await query.select().maybeSingle())
}
export async function saveNote(fields: NewRecord<Note>, original?: Note) {
  const query = original
    ? client().from('thailand_notes').update(fields).eq('id', original.id).eq('version', original.version)
    : client().from('thailand_notes').insert(fields)
  return result(await query.select().maybeSingle())
}
export async function saveTrip(fields: Pick<Trip, 'title' | 'start_date' | 'end_date' | 'timezone'>, original: Trip) {
  return result(await client().from('thailand_trips').update(fields).eq('id', original.id).eq('version', original.version).select().maybeSingle())
}
export async function deleteSimple(table: 'tasks' | 'notes', record: BaseRecord) {
  result(await client().from(table === 'tasks' ? 'thailand_tasks' : 'thailand_notes').delete().eq('id', record.id).eq('version', record.version).select().maybeSingle())
}
export async function deleteContent(table: 'itinerary_items' | 'attachments', record: BaseRecord) {
  const { data, error } = await client().functions.invoke('thailand-delete-content', { body: { table, id: record.id, version: record.version } })
  if (error) throw new Error(await functionError(error))
  if (!data?.ok) throw new Error(data?.error ?? 'Deletion was not confirmed. Retry or refresh the latest record.')
}
export async function functionError(error: Error & { context?: unknown }) {
  if (error.context instanceof Response) {
    const text = await error.context.text()
    try {
      const body: unknown = JSON.parse(text)
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error
    } catch { /* The original error remains visible when the response is not JSON. */ }
  }
  return error.message
}
export async function uploadFile(file: File, tripId: string, itemId: string | null) {
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a PDF, JPEG, PNG, or WebP file.')
  if (file.size > 10 * 1024 * 1024 || file.size === 0) throw new Error('Files must be nonempty and no larger than 10 MiB.')
  const id = crypto.randomUUID()
  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'document'
  const path = `${tripId}/${id}/${name}`
  const metadata = result(await client().from('thailand_attachments').insert({
    id, trip_id: tripId, item_id: itemId, name: file.name, path, mime_type: file.type, size: file.size, status: 'uploading',
  }).select().single<Attachment>())
  const upload = await client().storage.from('thailand-documents').upload(path, file, { upsert: false, contentType: file.type })
  if (upload.error) throw new Error(`Upload failed: ${upload.error.message}. The unfinished attachment can be removed and retried.`)
  const ready = await client().from('thailand_attachments').update({ status: 'ready' }).eq('id', metadata.id).eq('version', metadata.version).select().maybeSingle()
  result(ready)
}
export async function downloadFile(file: Attachment) {
  const { data, error } = await client().storage.from('thailand-documents').createSignedUrl(file.path, 60, { download: file.name })
  if (error) throw new Error(error.message)
  const anchor = document.createElement('a')
  anchor.href = data.signedUrl
  anchor.rel = 'noopener noreferrer'
  anchor.target = '_blank'
  anchor.click()
}
