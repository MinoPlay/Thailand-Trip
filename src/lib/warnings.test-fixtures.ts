import type { Item, TripData } from './models'

export function makeItem(fields: Partial<Item> = {}): Item {
  return {
    id: 'item-1', trip_id: 'trip-1', type: 'activity', title: 'Sample activity', date: null,
    starts_at: null, ends_at: null, start_zone: 'Asia/Bangkok', end_zone: 'Asia/Bangkok',
    check_in: null, check_out: null, location: '', address: '', map_url: '', origin: '', destination: '',
    mode: '', flight_number: '', operator: '', provider: '', booking_status: 'not_required',
    booking_reference: '', booking_url: '', preparation: 'to_prepare', attention: '', overnight: false,
    journey_id: '', version: 1, created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z', ...fields,
  }
}
export function makeData(items: Item[] = []): TripData {
  return {
    trip: { id: 'trip-1', owner_id: 'user-1', title: 'Sample trip', start_date: '2030-01-02', end_date: '2030-01-05', timezone: 'Asia/Bangkok', initialized: true, version: 1, created_at: '', updated_at: '' },
    items, tasks: [], notes: [], attachments: [],
  }
}
