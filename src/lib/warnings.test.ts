import { describe, expect, it, vi } from 'vitest'
import { itemWarnings, tripWarnings } from './warnings'
import { makeData, makeItem } from './warnings.test-fixtures'

describe('planning warnings', () => {
  it('excludes checkout night and final trip boundary from stay coverage', () => {
    const data = makeData([makeItem({ type: 'stay', check_in: '2030-01-02', check_out: '2030-01-04' })])
    expect(tripWarnings(data).filter(w => w.key.startsWith('stay-')).map(w => w.date)).toEqual(['2030-01-04'])
  })
  it('exempts local overnight flight nights even if there is no Bangkok midnight in flight', () => {
    const data = makeData([makeItem({ type: 'transfer', overnight: true, start_zone: 'Europe/Vienna', end_zone: 'Asia/Bangkok', starts_at: '2030-01-02T22:25:00Z', ends_at: '2030-01-03T08:30:00Z' })])
    expect(tripWarnings(data).some(w => w.key === 'stay-2030-01-02')).toBe(false)
    expect(tripWarnings(data).some(w => w.key === 'stay-2030-01-03')).toBe(true)
  })
  it('does not let completion hide missing information', () => {
    const item = makeItem({ type: 'transfer', preparation: 'done', booking_status: 'booked' })
    const messages = itemWarnings(item).map(w => w.message).join(' ')
    expect(messages).toContain('departure and arrival')
    expect(messages).toContain('confirmation')
    expect(messages).toContain('provider')
  })
  it('detects all overlapping timed events, not accommodation spans', () => {
    const data = makeData([
      makeItem({ id: 'long', starts_at: '2030-01-02T01:00Z', ends_at: '2030-01-02T05:00Z' }),
      makeItem({ id: 'short', starts_at: '2030-01-02T02:00Z', ends_at: '2030-01-02T03:00Z' }),
      makeItem({ id: 'later', starts_at: '2030-01-02T04:00Z', ends_at: '2030-01-02T06:00Z' }),
    ])
    expect(tripWarnings(data).filter(w => w.key.startsWith('overlap-'))).toHaveLength(2)
  })
  it('warns about double-booked nights, not consecutive checkout/check-in', () => {
    const stay = makeItem({ type: 'stay', check_in: '2030-01-02', check_out: '2030-01-04' })
    const consecutive = makeItem({ id: 'next', type: 'stay', check_in: '2030-01-04', check_out: '2030-01-05' })
    expect(tripWarnings(makeData([stay, consecutive])).some(w => w.key.startsWith('overlap-stay'))).toBe(false)
    expect(tripWarnings(makeData([stay, { ...consecutive, check_in: '2030-01-03' }])).some(w => w.key === 'overlap-stay-2030-01-03')).toBe(true)
  })
  it('keeps potential transfer gaps reviewable and suppresses them when transport exists', () => {
    const items = [
      makeItem({ type: 'stay', location: 'Area A', check_in: '2030-01-02', check_out: '2030-01-03' }),
      makeItem({ id: 'next', type: 'stay', location: 'Area B', check_in: '2030-01-03', check_out: '2030-01-05' }),
    ]
    expect(tripWarnings(makeData(items)).some(w => w.key.startsWith('transport-'))).toBe(true)
    items.push(makeItem({ id: 'ride', type: 'transfer', date: '2030-01-03' }))
    expect(tripWarnings(makeData(items)).some(w => w.key.startsWith('transport-'))).toBe(false)
  })
  it('flags only incomplete overdue tasks using trip time', () => {
    vi.useFakeTimers().setSystemTime(new Date('2030-01-03T20:00:00Z'))
    const data = makeData()
    data.tasks = [{ id: 'task', trip_id: 'trip-1', item_id: null, title: 'Prepare', details: '', due_date: '2030-01-03', done: false, position: 0, version: 1, created_at: '', updated_at: '' }]
    expect(tripWarnings(data).some(w => w.taskId === 'task')).toBe(true)
    data.tasks[0].done = true
    expect(tripWarnings(data).some(w => w.taskId === 'task')).toBe(false)
    vi.useRealTimers()
  })
})
