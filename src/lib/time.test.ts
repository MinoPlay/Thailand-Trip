import { describe, expect, it } from 'vitest'
import { itemDate, localInput, onDay, safeUrl, shiftDay, toInstant, zonedDate } from './time'
import { makeItem } from './warnings.test-fixtures'

describe('itinerary dates', () => {
  it('uses the itinerary zone, never the device zone', () => {
    const instant = '2030-01-03T22:00:00Z'
    expect(zonedDate(instant, 'Asia/Bangkok')).toBe('2030-01-04')
    expect(localInput(instant, 'Asia/Bangkok')).toBe('2030-01-04T05:00')
    expect(toInstant('2030-01-04T05:00', 'Asia/Bangkok')).toBe('2030-01-03T22:00:00.000Z')
  })
  it('keeps unscheduled drafts unscheduled and checkout visible', () => {
    expect(itemDate(makeItem(), 'Asia/Bangkok')).toBeNull()
    const stay = makeItem({ type: 'stay', check_in: '2030-01-02', check_out: '2030-01-04' })
    expect(onDay(stay, '2030-01-04', 'Asia/Bangkok')).toBe(true)
    expect(onDay(stay, '2030-01-05', 'Asia/Bangkok')).toBe(false)
  })
  it('shows cross-midnight transfers on both days', () => {
    const transfer = makeItem({ type: 'transfer', starts_at: '2030-01-03T16:30:00Z', ends_at: '2030-01-03T18:00:00Z' })
    expect(onDay(transfer, '2030-01-03', 'Asia/Bangkok')).toBe(true)
    expect(onDay(transfer, '2030-01-04', 'Asia/Bangkok')).toBe(true)
  })
  it('keeps international local departure context visible on the travel day', () => {
    const transfer = makeItem({ type: 'transfer', start_zone: 'Europe/Vienna', ends_at: '2030-01-03T08:30:00Z', starts_at: '2030-01-02T22:25:00Z' })
    expect(onDay(transfer, '2030-01-02', 'Asia/Bangkok')).toBe(true)
    expect(onDay(transfer, '2030-01-03', 'Asia/Bangkok')).toBe(true)
  })
  it('rejects invalid and ambiguous local times instead of shifting them', () => {
    expect(() => toInstant('2030-03-31T02:30', 'Europe/Copenhagen')).toThrow('does not exist')
    expect(() => toInstant('2030-10-27T02:30', 'Europe/Copenhagen')).toThrow('ambiguous')
    expect(() => toInstant('', 'not/a/zone')).toThrow('time zone')
    expect(toInstant('', 'Asia/Bangkok')).toBeNull()
  })
  it('moves dates safely across month and year boundaries', () => {
    expect(shiftDay('2030-12-31', 1)).toBe('2031-01-01')
    expect(shiftDay('2032-03-01', -1)).toBe('2032-02-29')
  })
})
describe('external links', () => {
  it('allows only complete HTTP(S) links', () => {
    expect(safeUrl('https://example.com/ticket')).toBe('https://example.com/ticket')
    expect(safeUrl('')).toBe('')
    expect(() => safeUrl('javascript:alert(1)')).toThrow()
    expect(() => safeUrl('/local')).toThrow()
    expect(() => safeUrl('data:text/html,test')).toThrow()
  })
})
