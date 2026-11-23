// PROTOTYPE ONLY: Variant A "Travel journal" — editorial, single reading column, the whole trip as one day-by-day story.
import { useState } from 'react'
import { ArrowRight, BedDouble, Check, FileText, LockKeyhole, MapPin, Paperclip, Plane, Plus, Sparkles, TrainFront, TriangleAlert } from 'lucide-react'
import type { Item } from '../lib/models'
import { itemWarnings } from '../lib/warnings'
import { fixture } from './fixture'
import { clock, derive, fmt } from './derive'
import './variant-a.css'

function TypeIcon({ item, size }: { item: Item; size: number }) {
  return item.type === 'stay' ? <BedDouble size={size} /> : item.type === 'activity' ? <Sparkles size={size} /> : item.mode === 'Train' ? <TrainFront size={size} /> : <Plane size={size} />
}

export function JournalLogin() {
  return <div className="va va-login">
    <div className="va-login-inner">
      <p className="va-kicker">Volume I · A shared travel journal</p>
      <h1>Thailand,<br /><em>together.</em></h1>
      <p className="va-lede">Where we sleep, how we get there, and everything we can’t wait to do — written down in one place.</p>
      <form onSubmit={event => event.preventDefault()}>
        <label>Trip password<input type="password" placeholder="Our shared password" /></label>
        <button className="va-primary">Open the journal <ArrowRight size={18} /></button>
      </form>
      <p className="va-fine"><LockKeyhole size={13} /> Private to everyone with the trip password</p>
    </div>
  </div>
}

export function JournalPlanner() {
  const data = fixture
  const { trip, tasks, notes, attachments } = data
  const d = derive(data)
  const [tab, setTab] = useState('Journey')
  const [done, setDone] = useState(() => new Set(tasks.filter(task => task.done).map(task => task.id)))
  const toggle = (id: string) => setDone(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  return <div className="va">
    <header className="va-bar">
      <span className="va-mark">together<span>/</span>thailand</span>
      <nav>{['Journey', 'Checklist', 'Notes', 'Documents'].map(name => <button key={name} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}>{name}</button>)}</nav>
      <span className="va-sync"><span /> Saved</span>
    </header>
    <main className="va-page">
      <section className="va-hero">
        <p className="va-kicker">{fmt(trip.start_date, 'd LLLL')} — {fmt(trip.end_date, 'd LLLL yyyy')} · {d.daysToGo} days to go</p>
        <h1>{trip.title}</h1>
        <ol className="va-route">{d.stops.map(stop => <li key={stop.stay.id}><strong>{stop.place}</strong><span>{stop.nights} nights</span></li>)}</ol>
      </section>

      {tab === 'Journey' && <>
        <section className="va-before">
          <div>
            <h2>Before we go</h2>
            <p className="va-meta">{done.size} of {tasks.length} preparations done</p>
            <ul className="va-checks">{tasks.filter(task => !done.has(task.id)).slice(0, 4).map(task => <li key={task.id}><button onClick={() => toggle(task.id)} aria-label={`Mark ${task.title} done`} />{task.title}{task.due_date && <small>by {fmt(task.due_date, 'd LLL')}</small>}</li>)}</ul>
          </div>
          <div className="va-margin">
            <h2><TriangleAlert size={16} /> Margin notes</h2>
            <p className="va-meta">{d.warnings.length} things to review</p>
            <ul>{d.warnings.slice(0, 4).map(warning => <li key={warning.key}>{warning.date && <small>{fmt(warning.date, 'd LLL')}</small>}{warning.message}</li>)}</ul>
          </div>
        </section>

        <ol className="va-days">{d.days.map((day, index) => {
          const plan = d.dayPlan(day)
          const sleeping = plan.stays.find(stay => stay.check_out !== day)
          return <li key={day} className="va-day">
            <div className="va-day-head"><span className="va-day-no">Day {index + 1}</span><h3>{fmt(day, 'cccc d LLLL')}</h3>{sleeping && <span className="va-sleep"><BedDouble size={14} /> {sleeping.title}</span>}</div>
            {plan.schedule.length ? <ul className="va-entries">{plan.schedule.map(item => {
              const warnings = itemWarnings(item)
              return <li key={item.id} className={`va-entry ${item.type}`}>
                <time>{item.starts_at ? clock(item.starts_at, item.start_zone) : '—'}</time>
                <div>
                  <h4><TypeIcon item={item} size={16} /> {item.title}</h4>
                  <p>{item.type === 'transfer' ? `${item.origin} → ${item.destination}` : item.location}{item.booking_reference && <> · Ref {item.booking_reference}</>}</p>
                  {notes.filter(note => note.item_id === item.id).map(note => <blockquote key={note.id}>{note.body}</blockquote>)}
                  {warnings.length > 0 && <p className="va-flag"><TriangleAlert size={13} /> {warnings[0].message}</p>}
                </div>
              </li>
            })}</ul> : <p className="va-free">A free day — nothing planned yet. <button><Plus size={14} /> Add something</button></p>}
          </li>
        })}</ol>

        {d.unscheduled.length > 0 && <section className="va-someday"><h2>Someday, somewhere</h2><p className="va-meta">Ideas without a date</p><ul>{d.unscheduled.map(item => <li key={item.id}><Sparkles size={14} /> {item.title} <small>{item.location}</small></li>)}</ul></section>}
      </>}

      {tab === 'Checklist' && <section className="va-section"><h2>Before we go</h2><ul className="va-checks big">{tasks.map(task => <li key={task.id} className={done.has(task.id) ? 'done' : ''}><button onClick={() => toggle(task.id)} aria-label="Toggle">{done.has(task.id) && <Check size={14} />}</button>{task.title}{task.details && <small>{task.details}</small>}</li>)}</ul></section>}
      {tab === 'Notes' && <section className="va-section"><h2>Notes</h2>{notes.map(note => <blockquote key={note.id} className="va-note">{note.body}<cite>{data.items.find(item => item.id === note.item_id)?.title ?? 'Whole trip'}</cite></blockquote>)}</section>}
      {tab === 'Documents' && <section className="va-section"><h2>Documents</h2><ul className="va-docs">{attachments.map(file => <li key={file.id}><FileText size={18} /><span>{file.name}<small>{data.items.find(item => item.id === file.item_id)?.title ?? 'Whole trip'}</small></span><Paperclip size={14} /></li>)}</ul></section>}

      <footer className="va-foot"><MapPin size={14} /> All times in local time of each place · {trip.timezone}</footer>
    </main>
    <button className="va-fab"><Plus size={20} /> Add to the journal</button>
  </div>
}
