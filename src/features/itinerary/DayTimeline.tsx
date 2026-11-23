import { DateTime } from 'luxon'
import { BedDouble, CalendarDays, Plane, Plus, Sparkles, TrainFront, TriangleAlert, Bus, CarFront, Ship } from 'lucide-react'
import type { Item, ItemType } from '../../lib/models'
import { itemWarnings } from '../../lib/warnings'
import { shortTime } from '../../lib/time'

const HOUR = 56
const MIN_EVENT = 44

export function TypeIcon({ item, size }: { item: Item; size: number }) {
  if (item.type === 'stay') return <BedDouble size={size} />
  if (item.type === 'activity') return <Sparkles size={size} />
  const mode = item.mode.toLowerCase()
  if (mode.includes('train')) return <TrainFront size={size} />
  if (/ferry|boat|ship/.test(mode)) return <Ship size={size} />
  if (/bus|coach|van|minivan/.test(mode)) return <Bus size={size} />
  if (/car|taxi|grab|drive/.test(mode)) return <CarFront size={size} />
  return <Plane size={size} />
}

interface Placed { item: Item; start: number; end: number; lane: number; lanes: number }

function layout(items: Item[], date: string, zone: string): Placed[] {
  const dayStart = DateTime.fromISO(date, { zone }).startOf('day')
  const minutes = (instant: string) => Math.min(1440, Math.max(0, DateTime.fromISO(instant).diff(dayStart, 'minutes').minutes))
  const events = items.map(item => {
    const start = minutes(item.starts_at!)
    const end = item.ends_at ? minutes(item.ends_at) : Math.min(1440, start + 60)
    return { item, start, end: Math.max(end, start + 30), lane: 0, lanes: 1 }
  }).sort((a, b) => a.start - b.start || b.end - a.end)
  let cluster: Placed[] = []
  let clusterEnd = -1
  const laneEnds: number[] = []
  const close = () => { const lanes = Math.max(1, ...cluster.map(event => event.lane + 1)); cluster.forEach(event => { event.lanes = lanes }) }
  for (const event of events) {
    if (event.start >= clusterEnd) { close(); cluster = []; laneEnds.length = 0 }
    const free = laneEnds.findIndex(end => end <= event.start)
    event.lane = free === -1 ? laneEnds.length : free
    laneEnds[event.lane] = event.end
    cluster.push(event)
    clusterEnd = Math.max(clusterEnd, event.end)
  }
  close()
  return events
}

export function DayTimeline({ date, zone, stays, schedule, missingStay, online, selectedId, onSelect, onAdd }: {
  date: string; zone: string; stays: Item[]; schedule: Item[]; missingStay: boolean; online: boolean; selectedId: string | null
  onSelect: (item: Item) => void; onAdd: (type: ItemType) => void
}) {
  const timed = schedule.filter(item => item.starts_at)
  const anytime = schedule.filter(item => !item.starts_at)
  const placed = layout(timed, date, zone)
  const first = Math.min(7, ...placed.map(event => Math.floor(event.start / 60)))
  const last = Math.max(22, ...placed.map(event => Math.ceil(event.end / 60)))
  const hours = Array.from({ length: last - first }, (_, index) => first + index)
  return <section className="day-plan" aria-label="Day plan">
    <div className="day-row stay-row">
      <span className="row-label"><BedDouble size={15} /> Staying</span>
      {stays.length ? stays.map(stay => <button key={stay.id} className={`stay-chip ${selectedId === stay.id ? 'selected' : ''}`} onClick={() => onSelect(stay)}>
        <span>{stay.title}</span>
        {(date === stay.check_in || date === stay.check_out) && <small>{date === stay.check_out ? 'Check-out today' : 'Check-in today'}</small>}
        {itemWarnings(stay).length > 0 && <TriangleAlert size={13} className="warn-icon" aria-label="Needs attention" />}
      </button>) : <span className="empty-stay">{missingStay ? 'No overnight stay planned for this night.' : 'No accommodation entry for this day. Check overnight transfers or the trip boundary.'}
        <button className="text-button" disabled={!online} onClick={() => onAdd('stay')}><Plus size={14} /> Plan a stay</button></span>}
    </div>
    {anytime.length > 0 && <div className="day-row">
      <span className="row-label">Any time</span>
      {anytime.map(item => <button key={item.id} className={`anytime-chip ${item.type} ${selectedId === item.id ? 'selected' : ''}`} onClick={() => onSelect(item)}><TypeIcon item={item} size={14} />{item.title}<small>time not set</small></button>)}
    </div>}
    {placed.length ? <div className="timeline" style={{ height: hours.length * HOUR }}>
      {hours.map(hour => <div key={hour} className="timeline-hour" style={{ top: (hour - first) * HOUR }}><span>{String(hour).padStart(2, '0')}:00</span></div>)}
      <div className="timeline-events">{placed.map(({ item, start, end, lane, lanes }) => {
        const warnings = itemWarnings(item)
        return <button key={item.id} className={`timeline-event ${item.type} ${selectedId === item.id ? 'selected' : ''} ${item.preparation === 'done' ? 'done' : ''}`}
          style={{ top: (start / 60 - first) * HOUR + 2, height: Math.max(MIN_EVENT, (end - start) / 60 * HOUR - 4), left: `calc(${lane / lanes * 100}% + 2px)`, width: `calc(${100 / lanes}% - 6px)` }}
          onClick={() => onSelect(item)}>
          <span className="event-title"><TypeIcon item={item} size={14} />{item.title}</span>
          <span className="event-meta">{shortTime(item.starts_at!, item.start_zone, date, zone)}{item.ends_at && <>–{shortTime(item.ends_at, item.end_zone, date, zone)}</>}{(item.type === 'transfer' ? item.origin && `${item.origin} → ${item.destination}` : item.location) && <> · {item.type === 'transfer' ? `${item.origin} → ${item.destination}` : item.location}</>}</span>
          {warnings.length > 0 && <TriangleAlert size={14} className="warn-icon" aria-label={`${warnings.length} to review`} />}
        </button>
      })}</div>
    </div> : !anytime.length && <div className="empty-state"><CalendarDays size={28} /><h3>A little room for adventure</h3><p>No transfers or activities on this day yet.</p><button disabled={!online} onClick={() => onAdd('activity')}>Add an activity</button></div>}
  </section>
}
