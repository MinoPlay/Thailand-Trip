// PROTOTYPE ONLY: synthetic trip data for the UI redesign mockups. Not real bookings.
import type { Attachment, Item, Note, Task, TripData } from '../lib/models'
import { makeItem } from '../lib/warnings.test-fixtures'

const base = { trip_id: 'trip-1', version: 1, created_at: '', updated_at: '' }
const item = (fields: Partial<Item>) => makeItem({ ...base, ...fields })
const task = (id: string, title: string, fields: Partial<Task> = {}): Task => ({ ...base, id, title, item_id: null, details: '', due_date: null, done: false, position: 0, ...fields })
const note = (id: string, body: string, item_id: string | null = null): Note => ({ ...base, id, body, item_id })
const file = (id: string, name: string, item_id: string | null): Attachment => ({ ...base, id, name, item_id, path: '', mime_type: 'application/pdf', size: 120000, status: 'ready' })

export const fixture: TripData = {
  trip: { ...base, id: 'trip-1', owner_id: 'user-1', title: 'Thailand 2027', start_date: '2027-01-10', end_date: '2027-01-22', timezone: 'Asia/Bangkok', initialized: true },
  items: [
    item({ id: 'flight-out', type: 'transfer', title: 'Flight to Bangkok', mode: 'Flight', flight_number: 'TG951', origin: 'Copenhagen (CPH)', destination: 'Bangkok (BKK)', starts_at: '2027-01-09T12:45:00Z', ends_at: '2027-01-10T00:15:00Z', start_zone: 'Europe/Copenhagen', operator: 'Thai Airways', provider: 'Thai Airways', booking_status: 'booked', booking_reference: 'X7K2QP', overnight: true, preparation: 'ready' }),
    item({ id: 'stay-bkk', type: 'stay', title: 'Riverside hotel', check_in: '2027-01-10', check_out: '2027-01-13', location: 'Bangkok', address: 'Charoen Krung Rd', provider: 'Booking.com', booking_status: 'booked', booking_reference: '4482-119', map_url: 'https://maps.example.com', preparation: 'done' }),
    item({ id: 'palace', type: 'activity', title: 'Grand Palace & Wat Pho', starts_at: '2027-01-11T02:00:00Z', ends_at: '2027-01-11T06:00:00Z', location: 'Phra Nakhon', booking_status: 'not_required' }),
    item({ id: 'food-tour', type: 'activity', title: 'Chinatown street food tour', starts_at: '2027-01-11T11:30:00Z', ends_at: '2027-01-11T14:30:00Z', location: 'Yaowarat', provider: 'Bangkok Food Tours', booking_status: 'pending' }),
    item({ id: 'train', type: 'transfer', title: 'Night train to Chiang Mai', mode: 'Train', flight_number: 'SP9', origin: 'Krung Thep Aphiwat', destination: 'Chiang Mai', starts_at: '2027-01-13T11:30:00Z', ends_at: '2027-01-14T00:30:00Z', operator: 'SRT', provider: '12Go', booking_status: 'booked', booking_reference: 'SRT-55190', overnight: true }),
    item({ id: 'stay-cnx', type: 'stay', title: 'Old City guesthouse', check_in: '2027-01-14', check_out: '2027-01-17', location: 'Chiang Mai', provider: 'Airbnb', booking_status: 'booked', preparation: 'ready' }),
    item({ id: 'elephants', type: 'activity', title: 'Elephant nature park', starts_at: '2027-01-15T01:00:00Z', ends_at: '2027-01-15T09:00:00Z', location: 'Mae Taeng', booking_status: 'not_booked', attention: 'Ethical sanctuary only — confirm pickup' }),
    item({ id: 'flight-kbv', type: 'transfer', title: 'Flight to Krabi', mode: 'Flight', flight_number: 'FD3214', origin: 'Chiang Mai (CNX)', destination: 'Krabi (KBV)', starts_at: '2027-01-17T04:10:00Z', ends_at: '2027-01-17T06:20:00Z', operator: 'AirAsia', provider: 'AirAsia', booking_status: 'booked', booking_reference: 'B9QZ4L' }),
    item({ id: 'stay-kbv', type: 'stay', title: 'Railay beach bungalows', check_in: '2027-01-17', check_out: '2027-01-21', location: 'Krabi', provider: 'Agoda', booking_status: 'pending' }),
    item({ id: 'islands', type: 'activity', title: 'Four islands longtail trip', date: '2027-01-18', location: 'Ao Nang pier', booking_status: 'not_booked' }),
    item({ id: 'cooking', type: 'activity', title: 'Thai cooking class', location: 'Chiang Mai', booking_status: 'not_booked' }),
    item({ id: 'flight-home', type: 'transfer', title: 'Flight home', mode: 'Flight', flight_number: 'TG950', origin: 'Bangkok (BKK)', destination: 'Copenhagen (CPH)', starts_at: '2027-01-21T16:30:00Z', ends_at: '2027-01-22T05:40:00Z', end_zone: 'Europe/Copenhagen', operator: 'Thai Airways', provider: 'Thai Airways', booking_status: 'booked', booking_reference: 'X7K2QP', overnight: true }),
  ],
  tasks: [
    task('t1', 'Check passport validity (6 months)', { done: true }),
    task('t2', 'Buy travel insurance', { due_date: '2026-12-01' }),
    task('t3', 'Book elephant park', { due_date: '2026-12-15', item_id: 'elephants' }),
    task('t4', 'Order Thai baht', { details: 'Around 10,000 THB for markets' }),
    task('t5', 'Download offline maps', { done: true }),
    task('t6', 'Pack reef-safe sunscreen'),
  ],
  notes: [
    note('n1', 'Dress code at the Grand Palace: shoulders and knees covered.', 'palace'),
    note('n2', 'Grab works well in Bangkok and Chiang Mai — get the app before leaving.'),
    note('n3', 'Low tide in Railay around 10:00 on the 18th.', 'stay-kbv'),
  ],
  attachments: [
    file('f1', 'TG951-eticket.pdf', 'flight-out'),
    file('f2', 'Riverside-confirmation.pdf', 'stay-bkk'),
    file('f3', 'SP9-train-tickets.pdf', 'train'),
    file('f4', 'Travel-insurance.pdf', null),
  ],
}
