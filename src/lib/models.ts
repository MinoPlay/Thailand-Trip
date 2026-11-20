export type ItemType = 'stay' | 'transfer' | 'activity'
export type BookingStatus = 'not_booked' | 'pending' | 'booked' | 'not_required'
export type Preparation = 'to_prepare' | 'ready' | 'done'
export interface BaseRecord {
  id: string
  version: number
  created_at: string
  updated_at: string
}
export interface Trip extends BaseRecord {
  owner_id: string
  title: string
  start_date: string
  end_date: string
  timezone: string
  initialized: boolean
}
export interface Item extends BaseRecord {
  trip_id: string
  type: ItemType
  title: string
  date: string | null
  starts_at: string | null
  ends_at: string | null
  start_zone: string
  end_zone: string
  check_in: string | null
  check_out: string | null
  location: string
  address: string
  map_url: string
  origin: string
  destination: string
  mode: string
  flight_number: string
  operator: string
  provider: string
  booking_status: BookingStatus
  booking_reference: string
  booking_url: string
  preparation: Preparation
  attention: string
  overnight: boolean
  journey_id: string
}
export interface Task extends BaseRecord {
  trip_id: string
  item_id: string | null
  title: string
  details: string
  due_date: string | null
  done: boolean
  position: number
}
export interface Note extends BaseRecord {
  trip_id: string
  item_id: string | null
  body: string
}
export interface Attachment extends BaseRecord {
  trip_id: string
  item_id: string | null
  name: string
  path: string
  mime_type: string
  size: number
  status: 'uploading' | 'ready' | 'deleting'
}
export interface TripData {
  trip: Trip
  items: Item[]
  tasks: Task[]
  notes: Note[]
  attachments: Attachment[]
}
export interface Records {
  trips: Trip
  itinerary_items: Item
  tasks: Task
  notes: Note
  attachments: Attachment
}
export type Table = keyof Records
export type NewRecord<T extends BaseRecord> = Omit<T, keyof BaseRecord>
