import { Modal } from '../../components/Modal'
import { Field } from '../../components/Feedback'
import { nullable, useVersionedForm, value } from '../../lib/forms'
import { deleteSimple, saveNote } from '../../lib/api'
import type { Item, Note } from '../../lib/models'

export function NoteEditor({ note, items, tripId, itemId, onSaved, onClose }: { note?: Note; items: Item[]; tripId: string; itemId?: string; onSaved: () => void; onClose: () => void }) {
  const form = useVersionedForm('notes', note, onSaved)
  const current = form.base
  return <Modal title={note ? 'Edit note' : 'Add a note'} onClose={onClose}>
    <form key={form.formKey} onSubmit={form.submit(fields => saveNote({ trip_id: tripId, body: value(fields, 'body'), item_id: nullable(fields, 'item_id') }, form.base))}>
      <Field label="Things to remember"><textarea name="body" defaultValue={current?.body} rows={8} required maxLength={20000} autoFocus /></Field>
      <Field label="Attach to"><select name="item_id" defaultValue={current?.item_id ?? itemId ?? ''}><option value="">Whole trip</option>{items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      {form.feedback}
      <div className="form-actions">
        {current && <button className="danger subtle" type="button" disabled={form.blocked} onClick={() => { if (confirm('Delete this note?')) void form.run(() => deleteSimple('notes', current)) }}>Delete note</button>}
        <button className="primary" disabled={form.blocked}>{form.pending ? 'Saving…' : 'Save note'}</button>
      </div>
    </form>
  </Modal>
}
