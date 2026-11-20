import { Modal } from '../../components/Modal'
import { Field } from '../../components/Feedback'
import { nullable, useVersionedForm, value } from '../../lib/forms'
import { deleteSimple, saveTask } from '../../lib/api'
import type { Item, Task } from '../../lib/models'

export function TaskEditor({ task, items, tripId, onSaved, onClose }: { task?: Task; items: Item[]; tripId: string; onSaved: () => void; onClose: () => void }) {
  const form = useVersionedForm('tasks', task, onSaved)
  const current = form.base
  return <Modal title={task ? 'Edit checklist task' : 'Add checklist task'} onClose={onClose}>
    <form key={form.formKey} onSubmit={form.submit(fields => saveTask({
      trip_id: tripId, title: value(fields, 'title'), details: value(fields, 'details'), due_date: nullable(fields, 'due_date'),
      done: fields.has('done'), position: current?.position ?? 0, item_id: nullable(fields, 'item_id'),
    }, form.base))}>
      <div className="form-grid">
        <Field label="What needs doing?" wide><input name="title" defaultValue={current?.title} required maxLength={240} /></Field>
        <Field label="Details / reminders" wide><textarea name="details" defaultValue={current?.details} rows={4} /></Field>
        <Field label="Due date"><input name="due_date" type="date" defaultValue={current?.due_date ?? ''} /></Field>
        <Field label="Linked itinerary item"><select name="item_id" defaultValue={current?.item_id ?? ''}><option value="">Whole trip</option>{items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <label className="check-field"><input name="done" type="checkbox" defaultChecked={current?.done} /> Done</label>
      </div>
      {form.feedback}
      <div className="form-actions">
        {current && <button className="danger subtle" type="button" disabled={form.blocked} onClick={() => { if (confirm('Delete this checklist task?')) void form.run(() => deleteSimple('tasks', current)) }}>Delete task</button>}
        <button className="primary" disabled={form.blocked}>{form.pending ? 'Saving…' : 'Save task'}</button>
      </div>
    </form>
  </Modal>
}
