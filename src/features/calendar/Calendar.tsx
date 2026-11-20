import { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon3'
import type { Item } from '../../lib/models'
import { itemWarnings } from '../../lib/warnings'
import { shiftDay, zonedDate } from '../../lib/time'

export function Calendar({ items, zone, date, view, onDate, onNavigate, onItem }: { items: Item[]; zone: string; date: string; view: 'month' | 'week'; onDate: (date: string) => void; onNavigate: (date: string) => void; onItem: (item: Item) => void }) {
  const ref = useRef<FullCalendar>(null)
  const events = items.flatMap(item => {
    const start = item.type === 'stay' ? item.check_in : item.starts_at || item.date
    if (!start) return []
    const typeLabel = item.type === 'stay' ? 'Stay' : item.type === 'transfer' ? 'Transfer' : 'Activity'
    const needsAttention = itemWarnings(item).length > 0
    const main = {
      id: item.id,
      title: `${typeLabel}: ${item.title}${needsAttention ? ' · Needs attention' : ''}`,
      start,
      end: item.type === 'stay' ? (item.check_out || shiftDay(start, 1)) : item.ends_at || undefined,
      allDay: item.type === 'stay' || !item.starts_at,
      classNames: [`calendar-${item.type}`],
      extendedProps: { itemId: item.id },
    }
    const departureDate = item.type === 'transfer' && item.starts_at ? zonedDate(item.starts_at, item.start_zone) : null
    const context = departureDate && item.starts_at && departureDate !== zonedDate(item.starts_at, zone)
      ? [{ ...main, id: `${item.id}-departure`, title: `Local departure: ${item.title}`, start: departureDate, end: shiftDay(departureDate, 1), allDay: true }]
      : []
    return [main, ...context]
  })
  return <div className="calendar-panel panel">
    <FullCalendar key={`${view}-${date}`} ref={ref} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
      initialView={view === 'month' ? 'dayGridMonth' : 'timeGridWeek'}
      initialDate={date} timeZone={zone} firstDay={1}
      headerToolbar={{ left: 'prev,next', center: 'title', right: 'today' }}
      datesSet={info => {
        const currentDate = zonedDate(info.view.calendar.getDate().toISOString(), zone)
        if (currentDate !== date) onNavigate(currentDate)
      }}
      events={events} height="auto" dayMaxEvents={3} nowIndicator
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      dateClick={info => onDate(info.dateStr.slice(0, 10))}
      eventClick={info => { const item = items.find(item => item.id === info.event.extendedProps.itemId); if (item) onItem(item) }}
      eventDidMount={info => {
        info.el.setAttribute('tabindex', '0')
        info.el.setAttribute('role', 'button')
        info.el.setAttribute('aria-label', info.event.title)
        info.el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); info.el.click() } })
      }}
    />
  </div>
}
