import { ArrowUpRight, Check, Paperclip, Pencil, Plus, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Item, Note, Attachment } from '../../lib/models'
import { itemWarnings } from '../../lib/warnings'
import { timeLabel, safeUrl } from '../../lib/time'
import { TypeIcon } from './DayTimeline'

function External({ url, children }: { url: string; children: ReactNode }) {
  let valid: string
  try { valid = safeUrl(url) } catch { return <span className="error-text">Invalid saved link</span> }
  return <a href={valid} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={14} /></a>
}
const label = (value: string) => value.replaceAll('_', ' ')

export function ItemDetail({ item, date, notes, files, online, onEdit, onNote, onFiles, onComplete, onClose }: {
  item: Item; date: string; notes: Note[]; files: Attachment[]; online: boolean
  onEdit: () => void; onNote: (note?: Note) => void; onFiles: () => void; onComplete: () => void; onClose: () => void
}) {
  const warnings = itemWarnings(item)
  const booked = item.booking_status === 'booked' || item.booking_status === 'not_required'
  const done = item.preparation === 'done'
  const when = item.type === 'stay'
    ? item.check_in && item.check_out ? `${item.check_in} → ${item.check_out}` : 'Stay dates not set'
    : item.starts_at ? `${timeLabel(item.starts_at, item.start_zone)}${item.ends_at ? ` → ${timeLabel(item.ends_at, item.end_zone)}` : ''}` : item.date ? `${item.date} · Time not set` : 'Not scheduled yet'
  const rows: [string, ReactNode][] = [
    ['When', <>{when}{item.type === 'stay' && (date === item.check_out ? ' · Checking out today' : date === item.check_in ? ' · Checking in today' : '')}</>],
    ...(item.type === 'transfer' ? [['Route', `${item.origin || 'Departure to plan'} → ${item.destination || 'Destination to plan'}`] as [string, ReactNode]] : []),
    ...(item.location || item.address ? [['Where', [item.location, item.address].filter(Boolean).join(' · ')] as [string, ReactNode]] : []),
    ...(item.operator ? [['Operator', item.operator] as [string, ReactNode]] : []),
    ...(item.provider ? [['Booked with', item.provider] as [string, ReactNode]] : []),
    ['Booking', <span className={`badge ${booked ? 'success' : 'warning'}`}>{label(item.booking_status)}</span>],
    ...(item.booking_reference ? [['Reference', <span className="reference">{item.booking_reference}</span>] as [string, ReactNode]] : []),
    ...(item.overnight || item.journey_id ? [['Journey', [item.overnight && 'Overnight in transit', item.journey_id].filter(Boolean).join(' · ')] as [string, ReactNode]] : []),
  ]
  return <section className="item-detail panel" aria-labelledby="item-detail-title">
    <div className="detail-head">
      <span className={`item-icon ${item.type}`}><TypeIcon item={item} size={20} /></span>
      <button className="icon-button" aria-label="Close details" onClick={onClose}><X size={18} /></button>
    </div>
    <p className="eyebrow">{item.type === 'transfer' ? [item.mode || 'transfer', item.flight_number].filter(Boolean).join(' · ') : item.type}</p>
    <h2 id="item-detail-title">{item.title}</h2>
    <div className="detail-actions">
      <button className={`status-toggle ${done ? 'done' : ''}`} disabled={!online} onClick={onComplete} aria-label={`${item.title}: ${done ? 'reopen preparation' : 'mark done'}`}><Check size={15} />{done ? 'Done' : 'Mark done'}</button>
      <button disabled={!online} aria-label={`Edit ${item.title}`} onClick={onEdit}><Pencil size={15} /> Edit</button>
    </div>
    {!done && item.preparation !== 'to_prepare' && <p className="small muted">Preparation: {label(item.preparation)}</p>}
    {warnings.length > 0 && <ul className="item-warnings">{warnings.map(warning => <li key={warning.key}><TriangleAlert size={14} />{warning.message}</li>)}</ul>}
    <dl className="detail-list">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    {(item.map_url || item.booking_url) && <div className="item-links">{item.map_url && <External url={item.map_url}>Open map</External>}{item.booking_url && <External url={item.booking_url}>Booking details</External>}</div>}
    <h3 className="detail-section">Notes</h3>
    {notes.map(note => <button className="inline-note" key={note.id} onClick={() => onNote(note)} disabled={!online}>{note.body}</button>)}
    <button className="text-button" disabled={!online} onClick={() => onNote()}><Plus size={14} /> Add note</button>
    <h3 className="detail-section">Documents</h3>
    {files.length > 0 ? <button className="text-button" onClick={onFiles}><Paperclip size={14} />{files.length} document{files.length === 1 ? '' : 's'}</button> : <p className="small muted">No documents attached.</p>}
  </section>
}
