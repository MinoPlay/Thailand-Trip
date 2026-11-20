import { DateTime } from 'luxon'
import { Modal } from '../../components/Modal'
import { Field } from '../../components/Feedback'
import { useVersionedForm, value } from '../../lib/forms'
import { saveTrip } from '../../lib/api'
import type { Trip } from '../../lib/models'

export function TripEditor({ trip, onSaved, onClose }: { trip: Trip; onSaved: () => void; onClose: () => void }) {
  const form = useVersionedForm('trips', trip, onSaved)
  const current = form.base!
  return <Modal title="Trip settings" onClose={onClose}>
    <form key={form.formKey} onSubmit={form.submit(async fields => {
      const start_date = value(fields, 'start_date')
      const end_date = value(fields, 'end_date')
      const timezone = value(fields, 'timezone')
      if (end_date < start_date) throw new Error('The end date must be on or after the start date.')
      if (!DateTime.now().setZone(timezone).isValid) throw new Error('Enter a valid IANA time zone.')
      await saveTrip({ title: value(fields, 'title'), start_date, end_date, timezone }, current)
    })}>
      <div className="form-grid">
        <Field label="Trip name" wide><input name="title" defaultValue={current.title} required /></Field>
        <Field label="First travel day"><input name="start_date" type="date" defaultValue={current.start_date} required /></Field>
        <Field label="Last travel day"><input name="end_date" type="date" defaultValue={current.end_date} required /></Field>
        <Field label="Itinerary time zone" wide><input name="timezone" defaultValue={current.timezone} required /></Field>
      </div>
      {form.feedback}
      <div className="form-actions"><button className="primary" disabled={form.blocked}>{form.pending ? 'Saving…' : 'Save trip'}</button></div>
    </form>
  </Modal>
}
