import { lazy, Suspense, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BedDouble, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, FileText, LogOut, Palmtree, Plus, RefreshCw, Settings2, StickyNote, TriangleAlert, WifiOff } from 'lucide-react'
import { client } from '../lib/supabase'
import { fetchTrip, saveItem, saveTask } from '../lib/api'
import type { Item, ItemType, Note, Task, TripData, NewRecord } from '../lib/models'
import { dateLabel, itemDate, onDay, shiftDay, today } from '../lib/time'
import { tripWarnings } from '../lib/warnings'
import { ErrorMessage } from '../components/Feedback'
import { Setup } from './Setup'
import { ItemEditor } from '../features/itinerary/ItemEditor'
import { ItemCard } from '../features/itinerary/ItemCard'
import { TripEditor } from '../features/itinerary/TripEditor'
import { TaskEditor } from '../features/tasks/TaskEditor'
import { NoteEditor } from '../features/notes/NoteEditor'
import { Attachments } from '../features/attachments/Attachments'

const Calendar = lazy(() => import('../features/calendar/Calendar').then(module => ({ default: module.Calendar })))

type Editor = { kind: 'item'; type: ItemType; item?: Item } | { kind: 'task'; task?: Task } | { kind: 'note'; note?: Note; itemId?: string } | { kind: 'trip' }
type Page = 'itinerary' | 'checklist' | 'notes' | 'documents'
function fields<T extends { id: string; version: number; created_at: string; updated_at: string }>(record: T): Omit<T, 'id' | 'version' | 'created_at' | 'updated_at'> {
  const { id, version, created_at, updated_at, ...rest } = record
  void id; void version; void created_at; void updated_at
  return rest
}
export function Planner({ userId }: { userId: string }) {
  const cache = useQueryClient()
  const [online, setOnline] = useState(navigator.onLine)
  const [live, setLive] = useState('Connecting')
  const [connection, setConnection] = useState(0)
  const query = useQuery({ queryKey: ['trip', userId], queryFn: fetchTrip })
  const refresh = () => { void cache.invalidateQueries({ queryKey: ['trip', userId] }) }
  useEffect(() => {
    const connected = () => { setOnline(true); void cache.invalidateQueries({ queryKey: ['trip', userId] }) }
    const disconnected = () => setOnline(false)
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected) }
  }, [cache, userId])
  useEffect(() => {
    const db = client()
    const channel = db.channel(`trip-${userId}-${connection}`)
    for (const table of ['thailand_trips', 'thailand_itinerary_items', 'thailand_tasks', 'thailand_notes', 'thailand_attachments']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => { void cache.invalidateQueries({ queryKey: ['trip', userId] }) })
    }
    channel.subscribe(status => {
        setLive(status === 'SUBSCRIBED' ? 'Live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? 'Live updates unavailable' : 'Connecting')
        if (status === 'SUBSCRIBED') void cache.invalidateQueries({ queryKey: ['trip', userId] })
      })
    return () => { void db.removeChannel(channel) }
  }, [cache, userId, connection])
  if (query.isPending) return <main className="auth-page"><p role="status">{online ? 'Loading the shared plan…' : 'You are offline. Reconnect to load the trip.'}</p></main>
  if (query.isError && !query.data) return <main className="setup-page"><ErrorMessage>{query.error.message}</ErrorMessage><button onClick={refresh}>Retry loading trip</button><button onClick={() => void client().auth.signOut({ scope: 'local' })}>Return to login</button></main>
  if (!query.data) return <Setup onSaved={refresh} />
  return <PlannerContent data={query.data} online={online} live={live} refreshing={query.isFetching} error={query.error?.message} onRefresh={() => { refresh(); setConnection(value => value + 1) }} onChanged={refresh} />
}
function PlannerContent({ data, online, live, refreshing, error, onRefresh, onChanged }: { data: TripData; online: boolean; live: string; refreshing: boolean; error?: string; onRefresh: () => void; onChanged: () => void }) {
  const { trip, items, tasks, notes, attachments } = data
  const [date, setDate] = useState(trip.start_date)
  const [page, setPage] = useState<Page>('itinerary')
  const [view, setView] = useState<'day' | 'week' | 'month'>(() => matchMedia('(max-width: 700px)').matches ? 'day' : 'month')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [addMenu, setAddMenu] = useState(false)
  const [writeError, setWriteError] = useState('')
  const [saving, setSaving] = useState(false)
  const warnings = tripWarnings(data)
  const doneTasks = tasks.filter(task => task.done).length
  const unscheduled = items.filter(item => !itemDate(item, trip.timezone))
  const dayItems = items.filter(item => onDay(item, date, trip.timezone))
  const stays = dayItems.filter(item => item.type === 'stay')
  const schedule = dayItems.filter(item => item.type !== 'stay').sort((a, b) => (a.starts_at ?? 'z').localeCompare(b.starts_at ?? 'z'))
  const saved = () => { setEditor(null); onChanged() }
  async function write(operation: () => Promise<unknown>) {
    if (!online) { setWriteError('You are offline. Reconnect before making changes.'); return }
    setSaving(true); setWriteError('')
    try { await operation() }
    catch (error) { setWriteError(error instanceof Error ? error.message : 'Changes could not be saved. Retry after refreshing.') }
    finally { setSaving(false); onChanged() }
  }
  const card = (item: Item) => <ItemCard key={item.id} item={item} date={date} notes={notes.filter(note => note.item_id === item.id)} files={attachments.filter(file => file.item_id === item.id)}
    online={online && !saving} onEdit={() => setEditor({ kind: 'item', type: item.type, item })}
    onNote={note => setEditor({ kind: 'note', note, itemId: item.id })} onFiles={() => setPage('documents')}
    onComplete={() => void write(() => saveItem({ ...fields(item), preparation: item.preparation === 'done' ? 'to_prepare' : 'done' } satisfies NewRecord<Item>, item))} />
  const taskRow = (task: Task) => <div className={`task-row ${task.done ? 'completed' : ''}`} key={task.id}>
    <input type="checkbox" checked={task.done} disabled={!online || saving} aria-label={`Mark ${task.title} ${task.done ? 'not done' : 'done'}`}
      onChange={() => void write(() => saveTask({ ...fields(task), done: !task.done }, task))} />
    <button className="task-label" disabled={!online} onClick={() => setEditor({ kind: 'task', task })}><span>{task.title}</span>{task.details && <small>{task.details}</small>}{task.due_date && <small className={!task.done && task.due_date < today(trip.timezone) ? 'error-text' : ''}>Due {task.due_date}</small>}</button>
  </div>
  return <div className="app-shell">
    <header className="app-header"><a className="brand" href={import.meta.env.BASE_URL}><Palmtree size={25} /> together / thailand</a>
      <div className="header-actions">
        <span className={`sync-status ${!online || live !== 'Live' ? 'not-live' : ''}`} role="status"><span className="status-dot" />{saving ? 'Saving…' : !online ? 'Offline' : refreshing ? 'Refreshing…' : live === 'Live' ? 'Saved · Live' : live}</span>
        <button className="icon-button" aria-label="Refresh shared plan and reconnect" onClick={onRefresh}><RefreshCw size={17} /></button>
        <button className="icon-button" aria-label="Trip settings" disabled={!online} onClick={() => setEditor({ kind: 'trip' })}><Settings2 size={18} /></button>
        <button className="icon-button" aria-label="Log out" onClick={() => void write(async () => { const { error } = await client().auth.signOut({ scope: 'local' }); if (error) throw error })}><LogOut size={18} /></button>
      </div>
    </header>
    <main className="main-content">
      {!online && <div className="message warning"><WifiOff size={17} /> You’re offline. The loaded plan is read-only. Reconnect to save; open drafts stay in memory.</div>}
      {online && live === 'Live updates unavailable' && <div className="message warning">Live updates are disconnected. Refresh to reconnect before relying on the latest plan.</div>}
      {(writeError || error) && <ErrorMessage>{writeError || `Could not refresh the shared plan: ${error}`}</ErrorMessage>}
      <section className="trip-hero">
        <div><p className="eyebrow">OUR NEXT CHAPTER</p><h1>{trip.title}</h1><p className="trip-dates"><CalendarDays size={16} /> {dateLabel(trip.start_date, { day: 'numeric', month: 'long' })} – {dateLabel(trip.end_date, { day: 'numeric', month: 'long', year: 'numeric' })}<span className="timezone">{trip.timezone}</span></p></div>
        <div className="add-container"><button className="primary" disabled={!online} aria-expanded={addMenu} onClick={() => setAddMenu(!addMenu)}><Plus size={18} /> Add to our plan</button>
          {addMenu && <div className="add-menu panel" role="group" aria-label="Choose what to add">{(['stay', 'transfer', 'activity'] as const).map(type => <button key={type} onClick={() => { setEditor({ kind: 'item', type }); setAddMenu(false) }}>Add {type}</button>)}<button onClick={() => { setEditor({ kind: 'task' }); setAddMenu(false) }}>Add checklist task</button><button onClick={() => { setEditor({ kind: 'note' }); setAddMenu(false) }}>Add note</button></div>}
        </div>
      </section>
      <div className="summary-grid">
        <button className="summary-card" onClick={() => setPage('checklist')}><span className="summary-icon"><ClipboardList size={20} /></span><span><strong>{doneTasks}<span className="muted"> / {tasks.length}</span></strong><small>preparations done</small></span><div className="mini-progress"><span style={{ width: `${tasks.length ? doneTasks / tasks.length * 100 : 0}%` }} /></div></button>
        <button className="summary-card" onClick={() => { setPage('itinerary'); setView('day') }}><span className="summary-icon amber"><TriangleAlert size={20} /></span><span><strong>{warnings.length}</strong><small>things to review</small></span></button>
        <button className="summary-card" onClick={() => setPage('documents')}><span className="summary-icon blue"><FileText size={20} /></span><span><strong>{attachments.filter(file => file.status === 'ready').length}</strong><small>tickets & documents</small></span></button>
      </div>
      <nav className="page-tabs" aria-label="Trip sections">{([
        ['itinerary', CalendarDays, 'Itinerary'], ['checklist', ClipboardList, 'Checklist'], ['notes', StickyNote, 'Notes'], ['documents', FileText, 'Documents'],
      ] as const).map(([id, Icon, label]) => <button key={id} aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}><Icon size={17} />{label}</button>)}</nav>
      {page === 'itinerary' && <div className="planner-grid">
        <section className="itinerary-main">
          <div className="section-title"><h2>Our itinerary</h2><div className="segmented" aria-label="Calendar view">{(['month', 'week', 'day'] as const).map(option => <button aria-pressed={view === option} key={option} onClick={() => setView(option)}>{option}</button>)}</div></div>
          {view !== 'day' ? <Suspense fallback={<p role="status">Loading calendar…</p>}><Calendar view={view} date={date} zone={trip.timezone} items={items} onDate={date => { setDate(date); setView('day') }} onItem={item => { if (online) setEditor({ kind: 'item', type: item.type, item }) }} /></Suspense> : <>
            <div className="date-nav"><button className="icon-button" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft size={20} /></button>
              <label><span className="sr-only">Selected day</span><input type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value) }} /></label>
              <button className="icon-button" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}><ChevronRight size={20} /></button><button className="text-button" onClick={() => setDate(today(trip.timezone))}>Today</button></div>
            <div className="day-strip">{Array.from({ length: 7 }, (_, index) => shiftDay(date, index - 3)).map(day => <button key={day} aria-pressed={date === day} onClick={() => setDate(day)}><small>{dateLabel(day, { weekday: 'short' })}</small><strong>{dateLabel(day, { day: 'numeric' })}</strong></button>)}</div>
            <h3 className="day-heading">{dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            <div className="day-stay"><h3><BedDouble size={18} /> Where we’re staying</h3>{stays.length ? stays.map(card) : <div className="empty-stay"><p>{warnings.some(warning => warning.key === `stay-${date}`) ? 'No overnight stay planned for this night.' : 'No accommodation entry for this day. Check overnight transfers or the trip boundary.'}</p><button className="text-button" disabled={!online} onClick={() => setEditor({ kind: 'item', type: 'stay' })}>+ Plan a stay</button></div>}</div>
            <h3 className="day-heading">The day ahead</h3>{schedule.length ? <div className="agenda">{schedule.map(card)}</div> : <div className="empty-state"><CalendarDays size={28} /><h3>A little room for adventure</h3><p>No transfers or activities on this day yet.</p><button disabled={!online} onClick={() => setEditor({ kind: 'item', type: 'activity' })}>Add an activity</button></div>}
          </>}
        </section>
        <aside className="planning-sidebar">
          <section className="panel sidebar-panel"><div className="section-title"><h2><ClipboardList size={18} /> Still to prepare</h2><button className="icon-button" aria-label="Add task" disabled={!online} onClick={() => setEditor({ kind: 'task' })}><Plus size={17} /></button></div>
            {tasks.filter(task => !task.done).slice(0, 5).map(taskRow)}{!tasks.some(task => !task.done) && <p className="muted small">{tasks.length ? 'All checked off. Nice work!' : 'Add your first planning task.'}</p>}<button className="text-button" onClick={() => setPage('checklist')}>View full checklist →</button></section>
          <section className="panel sidebar-panel warning-panel"><h2><TriangleAlert size={18} /> Needs a little attention</h2>{warnings.length ? <><div className="warning-list">{warnings.slice(0, 5).map(warning => <button key={warning.key} onClick={() => {
            if (warning.itemId && online) { const item = items.find(item => item.id === warning.itemId); if (item) setEditor({ kind: 'item', type: item.type, item }) }
            else if (warning.taskId && online) setEditor({ kind: 'task', task: tasks.find(task => task.id === warning.taskId) })
            else if (warning.date) { setDate(warning.date); setView('day') }
          }}>{warning.date && <small>{dateLabel(warning.date)}</small>}<span>{warning.message}</span></button>)}</div>{warnings.length > 5 && <details><summary>{warnings.length - 5} more things to review</summary><div className="warning-list">{warnings.slice(5).map(warning => <button key={warning.key} onClick={() => {
            if (warning.itemId && online) { const item = items.find(item => item.id === warning.itemId); if (item) setEditor({ kind: 'item', type: item.type, item }) }
            else if (warning.taskId && online) setEditor({ kind: 'task', task: tasks.find(task => task.id === warning.taskId) })
            else if (warning.date) { setDate(warning.date); setView('day') }
          }}>{warning.date && <small>{dateLabel(warning.date)}</small>}<span>{warning.message}</span></button>)}</div></details>}</> : <p className="small"><Check size={14} /> No planning gaps detected.</p>}</section>
          <section className="panel sidebar-panel"><div className="section-title"><h2>Not scheduled yet</h2><span className="count">{unscheduled.length}</span></div>{unscheduled.length ? unscheduled.map(item => <button className="unscheduled-item" key={item.id} disabled={!online} onClick={() => setEditor({ kind: 'item', type: item.type, item })}><span className={`type-dot ${item.type}`} /><span>{item.title}<small>{item.type}</small></span><ChevronRight size={15} /></button>) : <p className="small muted">Ideas without a date will live here.</p>}</section>
        </aside>
      </div>}
      {page === 'checklist' && <section className="content-section"><div className="section-title"><div><p className="eyebrow">A LITTLE PREPARATION GOES A LONG WAY</p><h2>Our checklist</h2></div><button disabled={!online} onClick={() => setEditor({ kind: 'task' })}><Plus size={16} /> Add task</button></div><div className="panel checklist-panel">{tasks.length ? [...tasks].sort((a, b) => Number(a.done) - Number(b.done)).map(taskRow) : <div className="empty-state"><ClipboardList size={30} /><h3>Let’s get ready</h3><p>Add bookings, things to check, and reminders.</p></div>}</div></section>}
      {page === 'notes' && <section className="content-section"><div className="section-title"><div><p className="eyebrow">GOOD TO REMEMBER</p><h2>Our notes</h2></div><button disabled={!online} onClick={() => setEditor({ kind: 'note' })}><Plus size={16} /> Add note</button></div><div className="notes-grid">{notes.map(note => <button className="panel note-card" disabled={!online} key={note.id} onClick={() => setEditor({ kind: 'note', note })}><StickyNote size={18} /><p>{note.body}</p><small>{items.find(item => item.id === note.item_id)?.title ?? 'Whole trip'}</small></button>)}</div>{!notes.length && <div className="empty-state"><StickyNote size={28} /><h3>Save the little things</h3><p>Addresses, ideas, packing reminders — whatever helps.</p></div>}</section>}
      {page === 'documents' && <section className="content-section"><Attachments files={attachments} items={items} tripId={trip.id} online={online} onChanged={onChanged} /></section>}
      <footer className="app-footer">Less planning in chat. More enjoying the trip.<span>All times shown with their itinerary time zone.</span></footer>
    </main>
    {editor?.kind === 'item' && <ItemEditor key={editor.item?.id ?? editor.type} item={editor.item} type={editor.type} tripId={trip.id} zone={trip.timezone} date={date} onClose={() => setEditor(null)} onSaved={saved} />}
    {editor?.kind === 'task' && <TaskEditor task={editor.task} items={items} tripId={trip.id} onClose={() => setEditor(null)} onSaved={saved} />}
    {editor?.kind === 'note' && <NoteEditor note={editor.note} itemId={editor.itemId} items={items} tripId={trip.id} onClose={() => setEditor(null)} onSaved={saved} />}
    {editor?.kind === 'trip' && <TripEditor trip={trip} onClose={() => setEditor(null)} onSaved={saved} />}
  </div>
}
