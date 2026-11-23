import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, FileText, LogOut, MapPin, Palmtree, Plus, RefreshCw, Settings2, StickyNote, TriangleAlert, WifiOff } from 'lucide-react'
import { client } from '../lib/supabase'
import { fetchTrip, saveItem, saveTask } from '../lib/api'
import type { Item, ItemType, Note, Task, TripData, NewRecord } from '../lib/models'
import { dateLabel, itemDate, onDay, shiftDay, today } from '../lib/time'
import { itemWarnings, tripWarnings, type Warning } from '../lib/warnings'
import { ErrorMessage } from '../components/Feedback'
import { LoadBoundary } from '../components/LoadBoundary'
import { Setup } from './Setup'
import { ItemEditor } from '../features/itinerary/ItemEditor'
import { ItemDetail } from '../features/itinerary/ItemDetail'
import { DayTimeline, TypeIcon } from '../features/itinerary/DayTimeline'
import { TripEditor } from '../features/itinerary/TripEditor'
import { TaskEditor } from '../features/tasks/TaskEditor'
import { NoteEditor } from '../features/notes/NoteEditor'
import { Attachments } from '../features/attachments/Attachments'

const Calendar = lazy(() => import('../features/calendar/Calendar').then(module => ({ default: module.Calendar })))

type Editor = { kind: 'item'; type: ItemType; item?: Item } | { kind: 'task'; task?: Task } | { kind: 'note'; note?: Note; itemId?: string } | { kind: 'trip' }
type Page = 'itinerary' | 'checklist' | 'notes' | 'documents' | 'review'
type View = 'day' | 'week' | 'month'
const VIEW_KEY = 'thailand-planner:view'
function storedView(): View {
  try {
    const value = localStorage.getItem(VIEW_KEY)
    if (value === 'day' || value === 'week' || value === 'month') return value
  } catch { /* storage unavailable */ }
  return 'month'
}
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
  if (query.isPending) return <main className="loading-page"><p role="status">{online ? 'Loading the shared plan…' : 'You are offline. Reconnect to load the trip.'}</p></main>
  if (query.isError && !query.data) return <main className="loading-page"><div className="loading-card"><ErrorMessage>{query.error.message}</ErrorMessage><div className="button-row"><button className="primary" onClick={refresh}>Retry loading trip</button><button onClick={() => void client().auth.signOut({ scope: 'local' })}>Return to login</button></div></div></main>
  if (!query.data) return <Setup onSaved={refresh} />
  return <PlannerContent data={query.data} online={online} live={live} refreshing={query.isFetching} error={query.error?.message} onRefresh={() => { refresh(); setConnection(value => value + 1) }} onChanged={refresh} />
}
function PlannerContent({ data, online, live, refreshing, error, onRefresh, onChanged }: { data: TripData; online: boolean; live: string; refreshing: boolean; error?: string; onRefresh: () => void; onChanged: () => void }) {
  const { trip, items, tasks, notes, attachments } = data
  const [date, setDate] = useState(() => {
    const now = today(trip.timezone)
    return now >= trip.start_date && now <= trip.end_date ? now : trip.start_date
  })
  const [page, setPage] = useState<Page>('itinerary')
  const [view, setView] = useState<View>(storedView)
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view) } catch { /* storage unavailable */ }
  }, [view])
  const [editor, setEditor] = useState<Editor | null>(null)
  const [addMenu, setAddMenu] = useState(false)
  const [documentItemId, setDocumentItemId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [writeError, setWriteError] = useState('')
  const [saving, setSaving] = useState(false)
  const addContainer = useRef<HTMLDivElement>(null)
  const addTrigger = useRef<HTMLButtonElement>(null)
  const attentionPanel = useRef<HTMLElement>(null)
  const dayStrip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!addMenu) return
    const pointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !addContainer.current?.contains(event.target)) setAddMenu(false)
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setAddMenu(false); addTrigger.current?.focus() }
    }
    document.addEventListener('pointerdown', pointerDown)
    document.addEventListener('keydown', keyDown)
    return () => { document.removeEventListener('pointerdown', pointerDown); document.removeEventListener('keydown', keyDown) }
  }, [addMenu])
  useEffect(() => {
    dayStrip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [date, view, page])
  const warnings = tripWarnings(data)
  const doneTasks = tasks.filter(task => task.done).length
  const unscheduled = items.filter(item => !itemDate(item, trip.timezone))
  const stops = items.filter(item => item.type === 'stay' && item.check_in).sort((a, b) => a.check_in!.localeCompare(b.check_in!))
  const tripDays: string[] = []
  for (let day = trip.start_date; day <= trip.end_date && tripDays.length < 120; day = shiftDay(day, 1)) tripDays.push(day)
  const plan = (day: string) => {
    const on = items.filter(item => onDay(item, day, trip.timezone))
    return { stays: on.filter(item => item.type === 'stay'), schedule: on.filter(item => item.type !== 'stay').sort((a, b) => (a.starts_at ?? 'z').localeCompare(b.starts_at ?? 'z')) }
  }
  const { stays, schedule } = plan(date)
  const selected = items.find(item => item.id === selectedId)
  const saved = () => { setEditor(null); onChanged() }
  const editItem = (item: Item) => setEditor({ kind: 'item', type: item.type, item })
  function go(next: Page) {
    setPage(next)
    if (next === 'documents') setDocumentItemId(null)
  }
  function reviewWarnings() {
    setPage('review')
    requestAnimationFrame(() => attentionPanel.current?.focus())
  }
  function openWarning(warning: Warning) {
    if (warning.itemId && online) { const item = items.find(item => item.id === warning.itemId); if (item) editItem(item) }
    else if (warning.taskId && online) setEditor({ kind: 'task', task: tasks.find(task => task.id === warning.taskId) })
    else if (warning.date) { setDate(warning.date); setView('day'); setPage('itinerary') }
  }
  async function write(operation: () => Promise<unknown>) {
    if (!online) { setWriteError('You are offline. Reconnect before making changes.'); return }
    setSaving(true); setWriteError('')
    try { await operation() }
    catch (error) { setWriteError(error instanceof Error ? error.message : 'Changes could not be saved. Retry after refreshing.') }
    finally { setSaving(false); onChanged() }
  }
  const taskRow = (task: Task) => <div className={`task-row ${task.done ? 'completed' : ''}`} key={task.id}>
    <input type="checkbox" checked={task.done} disabled={!online || saving} aria-label={`Mark ${task.title} ${task.done ? 'not done' : 'done'}`}
      onChange={() => void write(() => saveTask({ ...fields(task), done: !task.done }, task))} />
    <button className="task-label" disabled={!online} onClick={() => setEditor({ kind: 'task', task })}><span>{task.title}</span>{task.details && <small>{task.details}</small>}{task.due_date && <small className={!task.done && task.due_date < today(trip.timezone) ? 'error-text' : ''}>Due {task.due_date}</small>}</button>
  </div>
  const warningButton = (warning: Warning) => <button key={warning.key} className="warning-item" onClick={() => openWarning(warning)}>
    <TriangleAlert size={15} /><span>{warning.message}{warning.date && <small>{dateLabel(warning.date, { weekday: 'short', day: 'numeric', month: 'short' })}</small>}</span><ChevronRight size={15} />
  </button>
  const status = saving ? 'Saving…' : !online ? 'Offline' : refreshing ? 'Refreshing…' : live === 'Live' ? 'Saved · Live' : live
  const sections = [
    ['itinerary', CalendarDays, 'Itinerary', undefined],
    ['checklist', ClipboardList, 'Checklist', tasks.length - doneTasks],
    ['notes', StickyNote, 'Notes', notes.length],
    ['documents', FileText, 'Documents', attachments.filter(file => file.status === 'ready').length],
  ] as const
  const heading = page === 'itinerary'
    ? view === 'day' ? dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Itinerary'
    : page === 'checklist' ? 'Checklist' : page === 'notes' ? 'Notes' : page === 'documents' ? 'Documents' : 'Things to review'
  const subheading = page === 'itinerary' && view === 'day'
    ? `${stays.map(stay => stay.title).join(' → ') || 'No stay planned'} · ${trip.timezone}`
    : page === 'checklist' ? `${doneTasks} of ${tasks.length} preparations done`
      : page === 'review' ? `${warnings.length} planning gaps and reminders` : `All times shown in ${trip.timezone} unless noted`
  const inspector = page === 'itinerary'
  return <div className={`app-shell ${inspector ? 'with-inspector' : ''}`}>
    <aside className="sidebar">
      <div className="sidebar-brand">
        <a className="brand-mark" href={import.meta.env.BASE_URL} aria-label="together / thailand home"><Palmtree size={18} /></a>
        <div className="trip-name"><h1>{trip.title}</h1><p>{dateLabel(trip.start_date, { day: 'numeric', month: 'short' })} – {dateLabel(trip.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
      </div>
      <div className="add-container" ref={addContainer}>
        <button ref={addTrigger} className="primary add-button" disabled={!online} aria-expanded={addMenu} aria-controls="add-menu" onClick={() => setAddMenu(!addMenu)}><Plus size={17} /><span className="add-label">Add to our plan</span></button>
        {addMenu && <div id="add-menu" className="add-menu" role="group" aria-label="Choose what to add">{(['stay', 'transfer', 'activity'] as const).map(type => <button key={type} onClick={() => { setEditor({ kind: 'item', type }); setAddMenu(false) }}>Add {type}</button>)}<button onClick={() => { setEditor({ kind: 'task' }); setAddMenu(false) }}>Add checklist task</button><button onClick={() => { setEditor({ kind: 'note' }); setAddMenu(false) }}>Add note</button></div>}
      </div>
      <nav className="page-tabs" aria-label="Trip sections">
        {sections.map(([id, Icon, label, count]) => <button key={id} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={17} /><span className="tab-label">{label}</span>{count !== undefined && <span className="tab-count" aria-hidden="true">{count}</span>}</button>)}
        <button aria-current={page === 'review' ? 'page' : undefined} aria-label={`${warnings.length} things to review`} onClick={reviewWarnings}><TriangleAlert size={17} /><span className="tab-label">Review</span><span className={`tab-count ${warnings.length ? 'alert' : ''}`} aria-hidden="true">{warnings.length}</span></button>
      </nav>
      {stops.length > 0 && <section className="stops"><h2 className="sidebar-heading">Stops</h2><ul>{stops.map(stay => <li key={stay.id}><button onClick={() => { setPage('itinerary'); setView('day'); setDate(stay.check_in!); setSelectedId(stay.id) }}><MapPin size={14} /><span>{stay.location || stay.title}</span><small>{dateLabel(stay.check_in!)}</small></button></li>)}</ul></section>}
      <button className="progress-card" onClick={() => go('checklist')}><span><span>Preparation</span><strong>{doneTasks}/{tasks.length}</strong></span><span className="progress-bar"><span style={{ width: `${tasks.length ? doneTasks / tasks.length * 100 : 0}%` }} /></span></button>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div className="topbar-title"><h2>{heading}</h2><p>{subheading}</p></div>
        <div className="header-actions">
          <span className={`sync-status ${!online || live !== 'Live' ? 'not-live' : ''}`} role="status"><span className="status-dot" />{status}</span>
          <button className="icon-button" aria-label="Refresh shared plan and reconnect" onClick={onRefresh}><RefreshCw size={17} /></button>
          <button className="icon-button" aria-label="Trip settings" disabled={!online} onClick={() => setEditor({ kind: 'trip' })}><Settings2 size={17} /></button>
          <button className="icon-button" aria-label="Log out" onClick={() => void write(async () => { const { error } = await client().auth.signOut({ scope: 'local' }); if (error) throw error })}><LogOut size={17} /></button>
        </div>
      </header>
      <div className="banners">
        {!online && <div className="message warning"><WifiOff size={17} /> You’re offline. The loaded plan is read-only. Reconnect to save; open drafts stay in memory.</div>}
        {online && live === 'Live updates unavailable' && <div className="message warning">Live updates are disconnected. Refresh to reconnect before relying on the latest plan.</div>}
        {(writeError || error) && <ErrorMessage>{writeError || `Could not refresh the shared plan: ${error}`}</ErrorMessage>}
      </div>

      {page === 'itinerary' && <section className="itinerary">
        <div className="view-bar">
          <div className="segmented" role="group" aria-label="Calendar view">{(['day', 'week', 'month'] as const).map(option => <button aria-pressed={view === option} key={option} onClick={() => setView(option)}>{option}</button>)}</div>
          {view === 'day' && <div className="date-nav"><button className="icon-button" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft size={18} /></button>
            <label><span className="sr-only">Selected day</span><input type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value) }} /></label>
            <button className="icon-button" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}><ChevronRight size={18} /></button><button className="text-button" onClick={() => setDate(today(trip.timezone))}>Today</button></div>}
        </div>
        {view !== 'day' ? <LoadBoundary><Suspense fallback={<p role="status">Loading calendar…</p>}><Calendar view={view} date={date} zone={trip.timezone} items={items} onDate={date => { setDate(date); setView('day') }} onNavigate={setDate} onItem={item => setSelectedId(item.id)} /></Suspense></LoadBoundary> : <>
          <div className="day-strip" ref={dayStrip} aria-label="Trip days">{tripDays.map(day => {
            const dayPlan = plan(day)
            const flagged = warnings.some(warning => warning.date === day) || dayPlan.schedule.some(item => itemWarnings(item).length > 0)
            return <button key={day} aria-pressed={date === day} aria-label={dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })} onClick={() => setDate(day)}>
              <small>{dateLabel(day, { weekday: 'short' })}</small><strong>{dateLabel(day, { day: 'numeric' })}</strong>
              <span className="day-dots" aria-hidden="true">{dayPlan.schedule.slice(0, 3).map(item => <i key={item.id} className={item.type} />)}{flagged && <i className="flag" />}</span>
            </button>
          })}</div>
          <DayTimeline date={date} zone={trip.timezone} stays={stays} schedule={schedule} online={online} selectedId={selectedId}
            missingStay={warnings.some(warning => warning.key === `stay-${date}`)} onSelect={item => setSelectedId(item.id)} onAdd={type => setEditor({ kind: 'item', type })} />
        </>}
      </section>}

      {page === 'checklist' && <section className="content-section"><div className="section-title"><p className="eyebrow">A little preparation goes a long way</p><button disabled={!online} onClick={() => setEditor({ kind: 'task' })}><Plus size={16} /> Add task</button></div><div className="panel checklist-panel">{tasks.length ? [...tasks].sort((a, b) => Number(a.done) - Number(b.done)).map(taskRow) : <div className="empty-state"><ClipboardList size={30} /><h3>Let’s get ready</h3><p>Add bookings, things to check, and reminders.</p></div>}</div></section>}
      {page === 'notes' && <section className="content-section"><div className="section-title"><p className="eyebrow">Good to remember</p><button disabled={!online} onClick={() => setEditor({ kind: 'note' })}><Plus size={16} /> Add note</button></div><div className="notes-grid">{notes.map(note => <button className="panel note-card" disabled={!online} key={note.id} onClick={() => setEditor({ kind: 'note', note })}><p>{note.body}</p><small><StickyNote size={13} /> {items.find(item => item.id === note.item_id)?.title ?? 'Whole trip'}</small></button>)}</div>{!notes.length && <div className="empty-state"><StickyNote size={28} /><h3>Save the little things</h3><p>Addresses, ideas, packing reminders — whatever helps.</p></div>}</section>}
      {page === 'documents' && <section className="content-section"><Attachments files={attachments} items={items} tripId={trip.id} online={online} selectedItemId={documentItemId ?? undefined} onShowAll={() => setDocumentItemId(null)} onChanged={onChanged} /></section>}
      {page === 'review' && <section className="content-section"><section className="panel attention-panel" ref={attentionPanel} tabIndex={-1} aria-labelledby="attention-heading">
        <h3 id="attention-heading" className="panel-heading"><TriangleAlert size={17} /> Needs a little attention</h3>
        {warnings.length ? <div className="warning-list">{warnings.map(warningButton)}</div> : <p className="small"><Check size={14} /> No planning gaps detected.</p>}
      </section></section>}
    </main>

    {inspector && <aside className="inspector" aria-label="Details">
      {selected && <>
        <button className="sheet-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setSelectedId(null)} />
        <ItemDetail key={selected.id} item={selected} date={date} notes={notes.filter(note => note.item_id === selected.id)} files={attachments.filter(file => file.item_id === selected.id)}
          online={online && !saving} onClose={() => setSelectedId(null)} onEdit={() => editItem(selected)}
          onNote={note => setEditor({ kind: 'note', note, itemId: selected.id })} onFiles={() => { setDocumentItemId(selected.id); setPage('documents') }}
          onComplete={() => void write(() => saveItem({ ...fields(selected), preparation: selected.preparation === 'done' ? 'to_prepare' : 'done' } satisfies NewRecord<Item>, selected))} />
      </>}
      <section className="panel side-panel"><div className="panel-title"><h3><ClipboardList size={16} /> Still to prepare</h3><button className="icon-button" aria-label="Add task" disabled={!online} onClick={() => setEditor({ kind: 'task' })}><Plus size={16} /></button></div>
        {tasks.filter(task => !task.done).slice(0, 5).map(taskRow)}{!tasks.some(task => !task.done) && <p className="muted small">{tasks.length ? 'All checked off. Nice work!' : 'Add your first planning task.'}</p>}<button className="text-button" onClick={() => go('checklist')}>View full checklist <ChevronRight size={14} /></button></section>
      <section className="panel side-panel warning-panel"><div className="panel-title"><h3><TriangleAlert size={16} /> Needs attention</h3><span className="count">{warnings.length}</span></div>
        {warnings.length ? <><div className="warning-list">{warnings.slice(0, 4).map(warningButton)}</div>{warnings.length > 4 && <button className="text-button" onClick={reviewWarnings}>Review all <ChevronRight size={14} /></button>}</> : <p className="small"><Check size={14} /> No planning gaps detected.</p>}</section>
      <section className="panel side-panel"><div className="panel-title"><h3>Not scheduled yet</h3><span className="count">{unscheduled.length}</span></div>{unscheduled.length ? unscheduled.map(item => <button className="unscheduled-item" key={item.id} onClick={() => setSelectedId(item.id)}><span className={`item-icon small ${item.type}`}><TypeIcon item={item} size={13} /></span><span>{item.title}<small>{item.type}</small></span><ChevronRight size={15} /></button>) : <p className="small muted">Ideas without a date will live here.</p>}</section>
    </aside>}

    {editor?.kind === 'item' && <ItemEditor key={editor.item?.id ?? editor.type} item={editor.item} type={editor.type} tripId={trip.id} zone={trip.timezone} date={date} onClose={() => setEditor(null)} onSaved={saved} />}
    {editor?.kind === 'task' && <TaskEditor task={editor.task} items={items} tripId={trip.id} onClose={() => setEditor(null)} onSaved={saved} />}
    {editor?.kind === 'note' && <NoteEditor note={editor.note} itemId={editor.itemId} items={items} tripId={trip.id} onClose={() => setEditor(null)} onSaved={saved} />}
    {editor?.kind === 'trip' && <TripEditor trip={trip} onClose={() => setEditor(null)} onSaved={saved} />}
  </div>
}
