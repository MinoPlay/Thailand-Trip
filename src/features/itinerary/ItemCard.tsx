import { ArrowUpRight, BedDouble, Check, Clock, MapPin, Pencil, Plane, Sparkles, TriangleAlert, Paperclip } from 'lucide-react'
import type { Item, Note, Attachment } from '../../lib/models'
import { itemWarnings } from '../../lib/warnings'
import { timeLabel, safeUrl } from '../../lib/time'

function External({ url, children }: { url: string; children: React.ReactNode }) {
  let valid: string
  try { valid = safeUrl(url) } catch { return <span className="error-text">Invalid saved link</span> }
  return <a href={valid} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={14} /></a>
}
export function ItemCard({ item, date, notes, files, online, onEdit, onNote, onFiles, onComplete }: {
  item: Item; date?: string; notes: Note[]; files: Attachment[]; online: boolean;
  onEdit: () => void; onNote: (note?: Note) => void; onFiles: () => void; onComplete: () => void
}) {
  const warnings = itemWarnings(item)
  const Icon = item.type === 'stay' ? BedDouble : item.type === 'transfer' ? Plane : Sparkles
  const booked = item.booking_status === 'booked' || item.booking_status === 'not_required'
  return <article className={`item-card panel ${item.type}`}>
    <div className="item-top"><div className={`item-icon ${item.type}`}><Icon size={20} /></div><div className="grow">
      <p className="eyebrow">{item.type === 'transfer' ? `${item.mode || 'TRANSFER'} ${item.flight_number}` : item.type === 'stay' ? 'STAY' : 'ACTIVITY'}</p>
      <h3>{item.title}</h3>
    </div><button className="icon-button" disabled={!online} aria-label={`Edit ${item.title}`} onClick={onEdit}><Pencil size={17} /></button></div>
    {item.type === 'stay' && <p className="detail"><BedDouble size={16} />{item.check_in && item.check_out ? `${item.check_in} → ${item.check_out}` : 'Stay dates not set'}{date === item.check_out ? ' · Checking out today' : date === item.check_in ? ' · Checking in today' : ''}</p>}
    {item.type === 'transfer' && <p className="route">{item.origin || 'Departure to plan'} <span>→</span> {item.destination || 'Destination to plan'}</p>}
    {(item.starts_at || item.date) && <p className="detail"><Clock size={16} />{item.starts_at ? timeLabel(item.starts_at, item.start_zone) : `${item.date} · Time not set`}{item.ends_at && <> → {timeLabel(item.ends_at, item.end_zone)}</>}</p>}
    {item.overnight && <p className="small muted">Overnight in transit{item.journey_id ? ` · ${item.journey_id}` : ''}</p>}
    {(item.location || item.address) && <p className="detail"><MapPin size={16} />{[item.location, item.address].filter(Boolean).join(' · ')}</p>}
    {(item.operator || item.provider) && <p className="small muted">{[item.operator && `Operator: ${item.operator}`, item.provider && `Booked with: ${item.provider}`].filter(Boolean).join(' · ')}</p>}
    <div className="item-statuses">
      <span className={`badge ${booked ? 'success' : 'warning'}`}>{booked ? <Check size={13} /> : <Clock size={13} />}{item.booking_status.replaceAll('_', ' ')}</span>
      <button className={`badge status-toggle ${item.preparation === 'done' ? 'success' : ''}`} disabled={!online} onClick={onComplete} aria-label={`${item.title}: ${item.preparation === 'done' ? 'reopen preparation' : 'mark done'}`}><Check size={13} />{item.preparation.replaceAll('_', ' ')}</button>
      {item.booking_reference && <span className="small reference">Ref: {item.booking_reference}</span>}
    </div>
    <div className="item-links">{item.map_url && <External url={item.map_url}>Open map</External>}{item.booking_url && <External url={item.booking_url}>Booking details</External>}</div>
    {warnings.length > 0 && <div className="item-warnings">{warnings.map(warning => <p key={warning.key}><TriangleAlert size={14} />{warning.message}</p>)}</div>}
    {notes.map(note => <button className="inline-note" key={note.id} onClick={() => onNote(note)} disabled={!online}>{note.body}</button>)}
    <div className="button-row item-footer"><button className="text-button" disabled={!online} onClick={() => onNote()}>+ Add note</button>{files.length > 0 && <button className="text-button" onClick={onFiles}><Paperclip size={14} />{files.length} document{files.length === 1 ? '' : 's'}</button>}</div>
  </article>
}
