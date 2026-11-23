// PROTOTYPE ONLY: Variant C "Tropical bento" — dark, vibrant dashboard of tiles, Gantt-style trip overview, bottom tab bar.
import { useState } from 'react'
import { ArrowRight, BedDouble, CalendarDays, ClipboardList, FileText, Home, LockKeyhole, Plane, Plus, Sparkles, StickyNote, TrainFront, TriangleAlert } from 'lucide-react'
import type { Item } from '../lib/models'
import { itemWarnings } from '../lib/warnings'
import { onDay } from '../lib/time'
import { fixture } from './fixture'
import { clock, derive, fmt } from './derive'
import './variant-c.css'

function TypeIcon({ item, size }: { item: Item; size: number }) {
  return item.type === 'stay' ? <BedDouble size={size} /> : item.type === 'activity' ? <Sparkles size={size} /> : item.mode === 'Train' ? <TrainFront size={size} /> : <Plane size={size} />
}

export function BentoLogin() {
  return <div className="vc vc-login">
    <div className="vc-blob one" /><div className="vc-blob two" /><div className="vc-blob three" />
    <form className="vc-glass" onSubmit={event => event.preventDefault()}>
      <span className="vc-badge">✦ Shared trip</span>
      <h1>Sawasdee.</h1>
      <p>Everything for our Thailand adventure — stays, flights, plans and tickets.</p>
      <input type="password" placeholder="Trip password" aria-label="Trip password" />
      <button className="vc-cta">Let’s go <ArrowRight size={18} /></button>
      <small><LockKeyhole size={12} /> Private to people with the password</small>
    </form>
  </div>
}

export function BentoPlanner() {
  const data = fixture
  const { trip, items, tasks, attachments } = data
  const d = derive(data)
  const [tab, setTab] = useState('Home')
  const [day, setDay] = useState('2027-01-11')
  const plan = d.dayPlan(day)
  const progress = d.doneTasks / tasks.length
  const lanes: [string, Item['type']][] = [['Stays', 'stay'], ['Getting around', 'transfer'], ['Doing', 'activity']]
  return <div className="vc vc-app">
    <header className="vc-top">
      <div><span className="vc-badge">✦ {fmt(trip.start_date, 'd LLL')} – {fmt(trip.end_date, 'd LLL yyyy')}</span><h1>{trip.title}</h1></div>
      <nav className="vc-tabs">{[['Home', Home], ['Plan', CalendarDays], ['Prep', ClipboardList], ['Docs', FileText]].map(([name, Icon]) => {
        const I = Icon as typeof Home
        return <button key={name as string} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name as string)}><I size={18} /><span>{name as string}</span></button>
      })}</nav>
    </header>

    <main className="vc-bento">
      <section className="vc-tile vc-count"><small>Countdown</small><b>{d.daysToGo}</b><span>days until take-off</span><Plane className="vc-plane" size={64} /></section>

      <section className="vc-tile vc-route"><small>The route</small>
        <ol>{d.stops.map((stop, index) => <li key={stop.stay.id} style={{ flexGrow: stop.nights }}><i className={`c${index}`} /><b>{stop.place}</b><span>{stop.nights} nights · {fmt(stop.stay.check_in!, 'd LLL')}</span></li>)}</ol>
      </section>

      <section className="vc-tile vc-next"><small>Next up</small>{d.upcoming && (() => {
; return <>
        <div className="vc-next-icon"><TypeIcon item={d.upcoming} size={22} /></div><h2>{d.upcoming.title}</h2>
        <p>{fmt(d.upcoming.starts_at!, 'cccc d LLL')} · {clock(d.upcoming.starts_at!, d.upcoming.start_zone)}</p>
        <p className="vc-dim">{d.upcoming.origin} → {d.upcoming.destination}</p>{d.upcoming.booking_reference && <span className="vc-ref">{d.upcoming.booking_reference}</span>}</> })()}
      </section>

      <section className="vc-tile vc-prep"><small>Preparation</small>
        <div className="vc-ring" style={{ '--p': `${progress * 360}deg` } as React.CSSProperties}><b>{Math.round(progress * 100)}%</b></div>
        <ul>{tasks.filter(task => !task.done).slice(0, 3).map(task => <li key={task.id}><input type="checkbox" />{task.title}</li>)}</ul>
      </section>

      <section className="vc-tile vc-attn"><small><TriangleAlert size={13} /> {d.warnings.length} to review</small>
        <ul>{d.warnings.slice(0, 4).map(warning => <li key={warning.key}>{warning.message}{warning.date && <em>{fmt(warning.date, 'd LLL')}</em>}</li>)}</ul>
      </section>

      <section className="vc-tile vc-docs"><small>Tickets & docs</small><b>{attachments.length}</b>
        <ul>{attachments.slice(0, 3).map(file => <li key={file.id}><FileText size={14} /> {file.name}</li>)}</ul>
      </section>

      <section className="vc-tile vc-gantt"><small>Trip at a glance — tap a day</small>
        <div className="vc-gantt-grid" style={{ gridTemplateColumns: `110px repeat(${d.days.length}, minmax(34px,1fr))` }}>
          <span />{d.days.map(date => <button key={date} className={`vc-col ${date === day ? 'on' : ''}`} onClick={() => setDay(date)}><small>{fmt(date, 'ccccc')}</small>{fmt(date, 'd')}</button>)}
          {lanes.map(([label, type]) => <div className="vc-lane" key={type} style={{ display: 'contents' }}>
            <span className="vc-lane-label">{label}</span>
            {d.days.map(date => {
              const on = items.filter(item => item.type === type && onDay(item, date, trip.timezone) && !(type === 'stay' && item.check_out === date))
              const flagged = on.some(item => itemWarnings(item).length)
              return <span key={date} className={`vc-cell ${type} ${on.length ? 'filled' : ''} ${flagged ? 'flag' : ''} ${date === day ? 'on' : ''}`} title={on.map(item => item.title).join(', ')} />
            })}
          </div>)}
        </div>
      </section>

      <section className="vc-tile vc-day"><small>{fmt(day, 'cccc d LLLL')}</small>
        {plan.stays.length > 0 && <p className="vc-stay"><BedDouble size={15} /> {plan.stays.map(stay => stay.title).join(' → ')}</p>}
        <div className="vc-cards">{plan.schedule.length ? plan.schedule.map(item => {
          const warnings = itemWarnings(item)
          return <article key={item.id} className={`vc-card ${item.type}`}>
            <span className="vc-time">{item.starts_at ? clock(item.starts_at, item.start_zone) : 'Any time'}</span>
            <h3><TypeIcon item={item} size={16} /> {item.title}</h3>
            <p>{item.type === 'transfer' ? `${item.origin} → ${item.destination}` : item.location}</p>
            <div className="vc-tags"><span className={item.booking_status === 'booked' || item.booking_status === 'not_required' ? 'ok' : 'todo'}>{item.booking_status.replaceAll('_', ' ')}</span>{fixture.notes.some(note => note.item_id === item.id) && <span><StickyNote size={11} /> note</span>}{warnings.length > 0 && <span className="todo"><TriangleAlert size={11} /> {warnings.length}</span>}</div>
          </article>
        }) : <p className="vc-dim">Nothing planned — a beach day?</p>}</div>
      </section>
    </main>
    <button className="vc-fab" aria-label="Add"><Plus size={26} /></button>
  </div>
}
