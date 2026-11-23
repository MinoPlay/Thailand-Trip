import { DateTime } from 'luxon'
import type { Item } from './models'

export function today(zone = 'Asia/Bangkok') {
  return DateTime.now().setZone(zone).toISODate()!
}
export function shiftDay(date: string, days: number) {
  return DateTime.fromISO(date, { zone: 'UTC' }).plus({ days }).toISODate()!
}
export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return DateTime.fromISO(date, { zone: 'UTC' }).toLocaleString(options)
}
export function zonedDate(instant: string, zone: string) {
  return DateTime.fromISO(instant, { zone }).toISODate()!
}
export function localInput(instant: string | null, zone: string) {
  return instant ? DateTime.fromISO(instant, { zone }).toFormat("yyyy-MM-dd'T'HH:mm") : ''
}
export function toInstant(value: string, zone: string) {
  if (!DateTime.now().setZone(zone).isValid) throw new Error('Use a valid IANA time zone, such as Asia/Bangkok.')
  if (!value) return null
  const parsed = DateTime.fromISO(value, { zone })
  if (!parsed.isValid || parsed.toFormat("yyyy-MM-dd'T'HH:mm") !== value) {
    throw new Error('This local time does not exist in the selected time zone.')
  }
  if (parsed.getPossibleOffsets().length > 1) {
    throw new Error('This time is ambiguous because clocks change. Choose an unambiguous time.')
  }
  return parsed.toUTC().toISO()
}
export function timeLabel(instant: string, zone: string) {
  return DateTime.fromISO(instant, { zone }).toFormat('d LLL, HH:mm ZZZZ')
}
export function itemDate(item: Item, zone: string) {
  if (item.type === 'stay') return item.check_in
  return item.starts_at ? zonedDate(item.starts_at, zone) : item.date
}
export function onDay(item: Item, date: string, zone: string) {
  if (item.type === 'stay') {
    if (!item.check_in) return false
    return item.check_in <= date && (item.check_out ? item.check_out >= date : item.check_in === date)
  }
  let start = itemDate(item, zone)
  if (!start) return false
  let end = item.ends_at ? zonedDate(item.ends_at, zone) : start
  if (item.type === 'transfer' && item.starts_at) {
    start = [start, zonedDate(item.starts_at, item.start_zone)].sort()[0]
    if (item.ends_at) end = [end, zonedDate(item.ends_at, item.end_zone)].sort().at(-1)!
  }
  return start <= date && end >= date
}
export function safeUrl(value: string) {
  if (!value.trim()) return ''
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    // URL parsing errors are reported by the caller as field validation.
  }
  throw new Error('Links must be full http:// or https:// addresses.')
}
export function shortTime(instant: string, zone: string, date: string, tripZone: string) {
  const time = DateTime.fromISO(instant, { zone })
  return time.toFormat(zonedDate(instant, tripZone) === date ? 'HH:mm' : 'd LLL HH:mm') + (zone === tripZone ? '' : ` ${time.toFormat('ZZZZ')}`)
}
