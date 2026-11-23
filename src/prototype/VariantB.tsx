// PROTOTYPE ONLY: Variant B "Workspace" — productivity app layout: sidebar nav, trip-wide day strip, hour timeline, item inspector.
import { useState } from 'react'
import { BedDouble, CalendarDays, Check, ChevronRight, ClipboardList, FileText, LockKeyhole, MapPin, Paperclip, Plane, Plus, Search, Sparkles, StickyNote, TrainFront, TriangleAlert } from 'lucide-react'
import type { Item } from '../lib/models'
import { itemWarnings } from '../lib/warnings'
import { zonedDate } from '../lib/time'
import { fixture } from './fixture'
import { clock, derive, fmt } from './derive'
import './variant-b.css'

function TypeIcon({ item, size }: { item: Item; size: number }) {
  return item.type === 'stay' ? <BedDouble size={size} /> : item.type === 'activity' ? <Sparkles size={size} /> : item.mode === 'Train' ? <TrainFront size={size} /> : <Plane size={size} />
}
const hourOf = (instant: string, zone: string) => { const [h, m] = clock(instant, zone).split(':').map(Number); return h + m / 60 }

export function WorkspaceLogin() {
  return <div className="vb vb-login">
    <aside className="vb-login-art">
      <div className="vb-logo"><span>T</span> Thailand Trip</div>
      <div>
        <h1>Plan the trip,<br />not the group chat.</h1>
        <ul><li><CalendarDays size={18} /> Every stay, transfer and activity on one timeline</li><li><TriangleAlert size={18} /> Gaps and missing bookings flagged automatically</li><li><FileText size={18} /> Tickets and confirmations, always at hand</li></ul>
      </div>
      <small>Synced live between everyone travelling</small>
    </aside>
    <main className="vb-login-form">
      <form onSubmit={event => event.preventDefault()}>
        <h2>Welcome back</h2>
        <p>Enter the shared trip password to continue.</p>
        <label>Password<input type="password" placeholder="••••••••••" /></label>
        <button className="vb-primary">Continue</button>
        <p className="vb-fine"><LockKeyhole size={13} /> Private · only people with the password can see the trip</p>
      </form>
    </main>
  </div>
}

export function WorkspacePlanner() {
  const data = fixture
  const { trip, items, tasks, notes, attachments } = data
  const d = derive(data)
  const [day, setDay] = useState('2027-01-11')
  const [selected, setSelected] = useState<Item | undefined>(items.find(item => item.id === 'food-tour'))
  const plan = d.dayPlan(day)
  const timed = plan.schedule.filter(item => item.starts_at)
  const untimed = plan.schedule.filter(item => !item.starts_at)
  const hours = Array.from({ length: 18 }, (_, index) => index + 6)
  return <div className="vb vb-app">
    <aside className="vb-side">
      <div className="vb-logo"><span>T</span> {trip.title}</div>
      <button className="vb-primary vb-add"><Plus size={16} /> New</button>
      <nav>
        <a aria-current="page"><CalendarDays size={17} /> Itinerary</a>
        <a><ClipboardList size={17} /> Checklist <em>{tasks.length - d.doneTasks}</em></a>
        <a><StickyNote size={17} /> Notes <em>{notes.length}</em></a>
        <a><FileText size={17} /> Documents <em>{attachments.length}</em></a>
        <a><TriangleAlert size={17} /> Review <em className="warn">{d.warnings.length}</em></a>
      </nav>
      <h6>Stops</h6>
      <ul className="vb-stops">{d.stops.map(stop => <li key={stop.stay.id}><button onClick={() => setDay(stop.stay.check_in!)}><MapPin size={14} />{stop.place}<small>{fmt(stop.stay.check_in!, 'd LLL')} · {stop.nights}n</small></button></li>)}</ul>
      <div className="vb-progress"><div><span>Preparation</span><b>{d.doneTasks}/{tasks.length}</b></div><i><s style={{ width: `${d.doneTasks / tasks.length * 100}%` }} /></i></div>
    </aside>

    <main className="vb-main">
      <header className="vb-top">
        <div><h1>{fmt(day, 'cccc, d LLLL')}</h1><p>{plan.stays.map(stay => stay.title).join(' → ') || 'No stay'} · {trip.timezone}</p></div>
        <div className="vb-tools"><label className="vb-search"><Search size={15} /><input placeholder="Search trip…" /></label><span className="vb-live"><i /> Live</span></div>
      </header>
      <div className="vb-strip">{d.days.map(date => {
        const p = d.dayPlan(date)
        const flagged = d.warnings.some(warning => warning.date === date) || p.schedule.some(item => itemWarnings(item).length)
        return <button key={date} aria-pressed={date === day} onClick={() => setDay(date)}>
          <small>{fmt(date, 'ccc')}</small><b>{fmt(date, 'd')}</b>
          <span className="vb-dots">{p.schedule.map(item => <i key={item.id} className={item.type} />)}{flagged && <i className="flag" />}</span>
        </button>
      })}</div>

      <section className="vb-timeline">
        {untimed.length > 0 && <div className="vb-allday">{untimed.map(item => <button key={item.id} className={`vb-chip ${item.type}`} onClick={() => setSelected(item)}>{item.title} · time not set</button>)}</div>}
        <div className="vb-grid">
          {hours.map(hour => <div key={hour} className="vb-hour"><span>{String(hour).padStart(2, '0')}:00</span></div>)}
          {timed.map(item => {
            const start = Math.max(6, zonedDate(item.starts_at!, trip.timezone) < day ? 6 : hourOf(item.starts_at!, trip.timezone))
            const end = item.ends_at && zonedDate(item.ends_at, trip.timezone) <= day ? hourOf(item.ends_at, trip.timezone) : 24
            return <button key={item.id} className={`vb-event ${item.type} ${selected?.id === item.id ? 'on' : ''}`} style={{ top: (start - 6) * 48, height: Math.max(40, (end - start) * 48 - 4) }} onClick={() => setSelected(item)}>
              <b><TypeIcon item={item} size={14} /> {item.title}</b><small>{clock(item.starts_at!, item.start_zone)}{item.ends_at && `–${clock(item.ends_at, item.end_zone)}`} · {item.location || item.destination}</small>
              {itemWarnings(item).length > 0 && <TriangleAlert className="vb-warn" size={14} />}
            </button>
          })}
        </div>
      </section>
    </main>

    <aside className="vb-inspector">{selected ? <Inspector item={selected} /> : <p>Select an item</p>}
      <h6>Needs attention</h6>
      <ul className="vb-review">{d.warnings.slice(0, 5).map(warning => <li key={warning.key}><TriangleAlert size={14} /><span>{warning.message}{warning.date && <small>{fmt(warning.date, 'd LLL')}</small>}</span><ChevronRight size={14} /></li>)}</ul>
    </aside>
  </div>
}

function Inspector({ item }: { item: Item }) {
  const warnings = itemWarnings(item)
  const rows: [string, string][] = [
    ['When', item.starts_at ? `${fmt(item.starts_at, 'd LLL')} ${clock(item.starts_at, item.start_zone)}${item.ends_at ? ` – ${clock(item.ends_at, item.end_zone)}` : ''}` : item.check_in ? `${item.check_in} → ${item.check_out}` : 'Not set'],
    ['Where', item.type === 'transfer' ? `${item.origin} → ${item.destination}` : item.location || '—'],
    ['Provider', item.provider || item.operator || '—'],
    ['Booking', item.booking_status.replaceAll('_', ' ')],
    ['Reference', item.booking_reference || '—'],
  ]
  return <div className="vb-detail">
    <div className={`vb-detail-icon ${item.type}`}><TypeIcon item={item} size={20} /></div>
    <p className="vb-type">{item.type}</p>
    <h2>{item.title}</h2>
    <div className="vb-actions"><button className="vb-primary"><Check size={15} /> Mark done</button><button>Edit</button></div>
    {warnings.map(warning => <p key={warning.key} className="vb-alert"><TriangleAlert size={14} /> {warning.message}</p>)}
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <h6>Notes</h6>
    {fixture.notes.filter(note => note.item_id === item.id).map(note => <p key={note.id} className="vb-note">{note.body}</p>)}
    <button className="vb-ghost"><Plus size={14} /> Add note</button>
    <h6>Documents</h6>
    {fixture.attachments.filter(file => file.item_id === item.id).map(file => <p key={file.id} className="vb-file"><Paperclip size={14} /> {file.name}</p>)}
    <button className="vb-ghost"><Plus size={14} /> Upload</button>
  </div>
}
