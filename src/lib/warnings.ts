import type { Item, TripData } from './models'
import { shiftDay, today, zonedDate } from './time'

export interface Warning {
  key: string
  message: string
  itemId?: string
  taskId?: string
  date?: string
}
export function itemWarnings(item: Item): Warning[] {
  const messages: string[] = []
  if (item.attention) messages.push(item.attention)
  if (item.booking_status === 'not_booked' || item.booking_status === 'pending') messages.push('Booking is not confirmed')
  if (item.booking_status === 'booked') {
    if (!item.provider && !item.operator) messages.push('Add the booking provider or operator')
    if (!item.booking_reference && !item.booking_url) messages.push('Add a booking reference or confirmation link')
  }
  if (item.type === 'stay' && (!item.check_in || !item.check_out)) messages.push('Set check-in and check-out dates')
  if (item.type === 'transfer') {
    if (!item.origin || !item.destination) messages.push('Add the departure and arrival locations')
    if (!item.starts_at || !item.ends_at) messages.push('Set departure and arrival times')
    if (!item.provider && !item.operator) messages.push('Choose a transport provider or operator')
  }
  if (item.type === 'activity' && !item.starts_at) messages.push('Set an activity time')
  return [...new Set(messages)].map((message, index) => ({ key: `${item.id}-${index}`, message, itemId: item.id }))
}
export function tripWarnings(data: TripData): Warning[] {
  const { trip, items, tasks } = data
  const warnings = items.flatMap(itemWarnings)
  for (let date = trip.start_date; date < trip.end_date; date = shiftDay(date, 1)) {
    const stays = items.filter(item => item.type === 'stay' && item.check_in && item.check_out && item.check_in <= date && item.check_out > date)
    const inTransit = items.some(item => item.type === 'transfer' && item.overnight && item.starts_at && item.ends_at
      && zonedDate(item.starts_at, item.start_zone) <= date
      && zonedDate(item.ends_at, item.end_zone) > date)
    if (!stays.length && !inTransit) warnings.push({ key: `stay-${date}`, message: 'No overnight stay planned', date })
    if (stays.length > 1) warnings.push({ key: `overlap-stay-${date}`, message: 'Overlapping overnight stays — review bookings', date })
  }
  const timed = items.filter(item => item.type !== 'stay' && item.starts_at && item.ends_at)
    .sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!))
  for (let index = 0; index < timed.length; index++) {
    const item = timed[index]
    for (const other of timed.slice(index + 1)) {
      if (Date.parse(other.starts_at!) >= Date.parse(item.ends_at!)) break
      warnings.push({ key: `overlap-${item.id}-${other.id}`, message: `Overlaps with ${other.title}`, itemId: item.id, date: zonedDate(item.starts_at!, trip.timezone) })
    }
  }
  for (const task of tasks) {
    if (!task.done && task.due_date && task.due_date < today(trip.timezone)) {
      warnings.push({ key: `task-${task.id}`, message: `Overdue: ${task.title}`, taskId: task.id, date: task.due_date })
    }
  }
  const datedStays = items.filter(item => item.type === 'stay' && item.check_in && item.check_out && item.location)
    .sort((a, b) => a.check_in!.localeCompare(b.check_in!))
  for (let index = 1; index < datedStays.length; index++) {
    const previous = datedStays[index - 1], next = datedStays[index]
    if (previous.location.trim().toLowerCase() === next.location.trim().toLowerCase() || previous.check_out! > next.check_in!) continue
    const transfer = items.some(item => {
      if (item.type !== 'transfer') return false
      const departure = item.starts_at ? zonedDate(item.starts_at, item.start_zone) : item.date
      return departure && departure >= previous.check_out! && departure <= next.check_in!
    })
    if (!transfer) warnings.push({ key: `transport-${previous.id}-${next.id}`, message: `Review transport: ${previous.location} → ${next.location} (no transfer entered)`, itemId: next.id, date: next.check_in! })
  }
  return warnings
}
