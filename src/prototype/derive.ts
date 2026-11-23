// PROTOTYPE ONLY: derived views over TripData shared by the redesign variants.
import { DateTime } from 'luxon'
import type { Item, TripData } from '../lib/models'
import { itemDate, onDay, shiftDay, today } from '../lib/time'
import { tripWarnings } from '../lib/warnings'

export function derive(data: TripData) {
  const { trip, items, tasks } = data
  const days: string[] = []
  for (let day = trip.start_date; day <= trip.end_date; day = shiftDay(day, 1)) days.push(day)
  const stays = items.filter(item => item.type === 'stay' && item.check_in).sort((a, b) => a.check_in!.localeCompare(b.check_in!))
  const stops = stays.map(stay => ({ stay, place: stay.location || stay.title, nights: stay.check_out ? DateTime.fromISO(stay.check_out).diff(DateTime.fromISO(stay.check_in!), 'days').days : 0 }))
  const sortByStart = (a: Item, b: Item) => (a.starts_at ?? a.date ?? 'z').localeCompare(b.starts_at ?? b.date ?? 'z')
  const dayPlan = (day: string) => {
    const on = items.filter(item => onDay(item, day, trip.timezone))
    return { stays: on.filter(item => item.type === 'stay'), schedule: on.filter(item => item.type !== 'stay').sort(sortByStart) }
  }
  const now = today(trip.timezone)
  const daysToGo = Math.ceil(DateTime.fromISO(trip.start_date).diff(DateTime.fromISO(now), 'days').days)
  const upcoming = items.filter(item => item.type !== 'stay' && item.starts_at).sort(sortByStart).find(item => item.starts_at! > new Date().toISOString())
  return {
    days, stops, dayPlan, daysToGo, upcoming,
    warnings: tripWarnings(data),
    unscheduled: items.filter(item => !itemDate(item, trip.timezone)),
    doneTasks: tasks.filter(task => task.done).length,
  }
}
export const fmt = (date: string, format: string) => DateTime.fromISO(date).toFormat(format)
export const clock = (instant: string, zone: string) => DateTime.fromISO(instant, { zone }).toFormat('HH:mm')
