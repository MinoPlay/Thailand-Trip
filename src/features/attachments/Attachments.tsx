import { useRef, useState } from 'react'
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react'
import { deleteContent, downloadFile, uploadFile } from '../../lib/api'
import type { Attachment, Item } from '../../lib/models'
import { ErrorMessage, Field } from '../../components/Feedback'
import { Modal } from '../../components/Modal'

export function Attachments({ files, items, tripId, online, selectedItemId, onShowAll, onChanged }: { files: Attachment[]; items: Item[]; tripId: string; online: boolean; selectedItemId?: string; onShowAll: () => void; onChanged: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const visibleFiles = files.filter(file => !selectedItemId || file.item_id === selectedItemId)
  const selectedItem = items.find(item => item.id === selectedItemId)
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError('')
    try { await operation() }
    catch (error) { setError(error instanceof Error ? error.message : 'File operation failed. Retry after refreshing the current attachment.') }
    finally { setBusy(false); onChanged() }
  }
  return <>
    <div className="section-title"><div><p className="eyebrow">KEEP IT HANDY</p><h2>{selectedItem ? `Documents for ${selectedItem.title}` : 'Tickets & documents'}</h2></div><button disabled={!online} onClick={() => setUploading(true)}><Paperclip size={16} /> Add file</button></div>
    <p className="muted small">Private PDFs and images, up to 10 MiB. Downloads use links that expire after 60 seconds.</p>
    {selectedItem && <div className="document-context"><p className="small muted">Only files attached to this itinerary item are shown.</p><button className="text-button" onClick={onShowAll}>View all documents</button></div>}
    {error && <ErrorMessage>{error}</ErrorMessage>}
    {!visibleFiles.length && <div className="empty-state"><FileText size={28} /><h3>{selectedItem ? 'No documents for this item yet' : 'Everything you’ll need, in one place'}</h3><p>Add tickets and booking confirmations so they’re easy to find.</p></div>}
    <div className="document-grid">{visibleFiles.map(file => <article className="panel document" key={file.id}>
      <FileText size={24} className="accent" /><div className="grow"><h3>{file.name}</h3><p className="small muted">{(file.size / 1024).toFixed(0)} KiB · {items.find(item => item.id === file.item_id)?.title ?? 'Whole trip'}</p><p className="small">{file.status === 'ready' ? 'Ready to download' : `${file.status} — remove and retry if interrupted`}</p></div>
      <button className="icon-button" disabled={busy || !online || file.status !== 'ready'} aria-label={`Download ${file.name}`} onClick={() => void run(() => downloadFile(file))}><Download size={18} /></button>
      <button className="icon-button danger" disabled={busy || !online} aria-label={`Delete ${file.name}`} onClick={() => { if (confirm(`Permanently remove ${file.name}?`)) void run(() => deleteContent('attachments', file)) }}><Trash2 size={18} /></button>
    </article>)}</div>
    {uploading && <Modal title="Add a private document" onClose={() => { if (!busy) setUploading(false) }}>
      <form onSubmit={event => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        const file = inputRef.current?.files?.[0]
        if (!file) return
        void run(async () => { await uploadFile(file, tripId, String(fields.get('item_id') || '') || null); setUploading(false) })
      }}>
        <Field label="File"><input name="file" ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required disabled={busy} /></Field>
        <Field label="Attach to"><select name="item_id" defaultValue={selectedItemId ?? ''} disabled={busy}><option value="">Whole trip</option>{items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <div className="form-actions"><button className="primary" disabled={busy || !online}>{busy ? 'Uploading…' : 'Upload file'}</button></div>
      </form>
    </Modal>}
  </>
}
