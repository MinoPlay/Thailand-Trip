import { DateTime } from 'luxon'
import { Modal } from '../../components/Modal'
import { Field } from '../../components/Feedback'
import { nullable, useVersionedForm, value } from '../../lib/forms'
import { deleteContent, saveItem } from '../../lib/api'
import type { BookingStatus, Item, ItemType, Preparation } from '../../lib/models'
import { localInput, safeUrl, toInstant } from '../../lib/time'

const bookingValues: BookingStatus[] = ['not_booked', 'pending', 'booked', 'not_required']
const preparationValues: Preparation[] = ['to_prepare', 'ready', 'done']
function booking(value: string): BookingStatus {
  const result = bookingValues.find(option => option === value)
  if (!result) throw new Error('Choose a valid booking status.')
  return result
}
function preparation(value: string): Preparation {
  const result = preparationValues.find(option => option === value)
  if (!result) throw new Error('Choose a valid preparation status.')
  return result
}
export function ItemEditor({ item, type, tripId, zone, date, onClose, onSaved }: {
  item?: Item; type: ItemType; tripId: string; zone: string; date: string; onClose: () => void; onSaved: () => void
}) {
  const form = useVersionedForm('itinerary_items', item, onSaved)
  const current = form.base
  const startZone = current?.start_zone ?? zone
  const endZone = current?.end_zone ?? zone
  return <Modal title={`${item ? 'Edit' : 'Add'} ${type}`} onClose={onClose}>
    <form key={form.formKey} onSubmit={form.submit(async fields => {
      const start_zone = value(fields, 'start_zone') || zone
      const end_zone = value(fields, 'end_zone') || zone
      const starts_at = type === 'stay' ? null : toInstant(value(fields, 'starts_at'), start_zone)
      const ends_at = type === 'stay' ? null : toInstant(value(fields, 'ends_at'), end_zone)
      const check_in = type === 'stay' ? nullable(fields, 'check_in') : null
      const check_out = type === 'stay' ? nullable(fields, 'check_out') : null
      if (check_in && check_out && check_out <= check_in) throw new Error('Check-out must be after check-in.')
      if (starts_at && ends_at && DateTime.fromISO(ends_at) <= DateTime.fromISO(starts_at)) throw new Error('Arrival/end must be after departure/start, accounting for time zones.')
      await saveItem({
        trip_id: tripId, type, title: value(fields, 'title'), date: type === 'stay' ? null : nullable(fields, 'date'),
        starts_at, ends_at, start_zone, end_zone, check_in, check_out,
        location: value(fields, 'location'), address: value(fields, 'address'), map_url: safeUrl(value(fields, 'map_url')),
        origin: value(fields, 'origin'), destination: value(fields, 'destination'), mode: value(fields, 'mode'),
        operator: value(fields, 'operator'), provider: value(fields, 'provider'), flight_number: value(fields, 'flight_number'),
        booking_status: booking(value(fields, 'booking_status')), booking_reference: value(fields, 'booking_reference'),
        booking_url: safeUrl(value(fields, 'booking_url')), preparation: preparation(value(fields, 'preparation')),
        attention: value(fields, 'attention'), overnight: fields.has('overnight'), journey_id: value(fields, 'journey_id'),
      }, form.base)
    })}>
      <p className="muted small">Plan as you go. Unknown details can stay empty; warnings will remind you.</p>
      <div className="form-grid">
        <Field label="Title" wide><input name="title" defaultValue={current?.title} placeholder={type === 'stay' ? 'Where are we staying?' : type === 'transfer' ? 'How are we getting there?' : 'What are we doing?'} required maxLength={240} /></Field>
        {type === 'stay' ? <>
          <Field label="Check-in"><input type="date" name="check_in" defaultValue={current?.check_in ?? (item ? '' : date)} /></Field>
          <Field label="Check-out"><input type="date" name="check_out" defaultValue={current?.check_out ?? ''} /></Field>
        </> : <>
          <Field label="Planning date (if time is unknown)" wide><input type="date" name="date" defaultValue={current?.date ?? (item ? '' : date)} /></Field>
          <Field label={type === 'transfer' ? 'Departure (local time)' : 'Start (local time)'}><input type="datetime-local" name="starts_at" defaultValue={localInput(current?.starts_at ?? null, startZone)} /></Field>
          <Field label="Departure/start time zone"><input name="start_zone" defaultValue={startZone} list="zones" required /></Field>
          <Field label={type === 'transfer' ? 'Arrival (local time)' : 'End (local time)'}><input type="datetime-local" name="ends_at" defaultValue={localInput(current?.ends_at ?? null, endZone)} /></Field>
          <Field label="Arrival/end time zone"><input name="end_zone" defaultValue={endZone} list="zones" required /></Field>
        </>}
        {type === 'transfer' ? <>
          <Field label="From (include airport/station code)"><input name="origin" defaultValue={current?.origin} /></Field>
          <Field label="To (include airport/station code)"><input name="destination" defaultValue={current?.destination} /></Field>
          <Field label="Transport mode"><select name="mode" defaultValue={current?.mode || 'flight'}>{['flight', 'car', 'taxi', 'bus', 'train', 'ferry', 'walk', 'other'].map(mode => <option key={mode}>{mode}</option>)}</select></Field>
          <Field label="Flight / service number"><input name="flight_number" defaultValue={current?.flight_number} /></Field>
          <Field label="Journey label (links connecting legs)"><input name="journey_id" defaultValue={current?.journey_id} placeholder="e.g. Outbound" /></Field>
          <label className="check-field"><input type="checkbox" name="overnight" defaultChecked={current?.overnight} /> Overnight in transit</label>
        </> : <Field label="Place / area" wide><input name="location" defaultValue={current?.location} /></Field>}
        <Field label="Address" wide><input name="address" defaultValue={current?.address} /></Field>
        <Field label="Map link" wide><input name="map_url" type="url" defaultValue={current?.map_url} placeholder="https://maps.google.com/…" /></Field>
        <Field label="Operator / accommodation"><input name="operator" defaultValue={current?.operator} /></Field>
        <Field label="Booking agent / provider"><input name="provider" defaultValue={current?.provider} /></Field>
        <Field label="Booking"><select name="booking_status" defaultValue={current?.booking_status ?? 'not_booked'}>{bookingValues.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></Field>
        <Field label="Preparation"><select name="preparation" defaultValue={current?.preparation ?? 'to_prepare'}>{preparationValues.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></Field>
        <Field label="Booking reference"><input name="booking_reference" defaultValue={current?.booking_reference} /></Field>
        <Field label="Booking / confirmation link"><input name="booking_url" type="url" defaultValue={current?.booking_url} /></Field>
        <Field label="Needs attention / reminder" wide><textarea name="attention" defaultValue={current?.attention} rows={2} placeholder="Anything still missing or worth remembering" /></Field>
      </div>
      <datalist id="zones">{['Asia/Bangkok', 'Europe/Copenhagen', 'Europe/Vienna', 'Asia/Ho_Chi_Minh', 'UTC'].map(zone => <option key={zone}>{zone}</option>)}</datalist>
      {form.feedback}
      <div className="form-actions">
        {current && <button type="button" className="danger subtle" disabled={form.blocked} onClick={() => {
          if (confirm('Delete this item and its linked notes, tasks, and attachments? Failed file cleanup can be retried.')) void form.run(() => deleteContent('itinerary_items', current))
        }}>Delete item</button>}
        <button type="submit" className="primary" disabled={form.blocked}>{form.pending ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  </Modal>
}
