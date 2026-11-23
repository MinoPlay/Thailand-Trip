import { test, expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { makeData, makeItem } from '../src/lib/warnings.test-fixtures'

const userId = '00000000-0000-4000-8000-000000000001'
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const encoded = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url')
  return {
    access_token: `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: userId, exp, role: 'authenticated' })}.test`,
    refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'sample@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2030-01-01T00:00:00Z' },
  }
}
async function mockBackend(page: Page, loggedIn = true) {
  const data = makeData([makeItem({
    id: 'item-1', title: 'Sample ferry', type: 'transfer', date: '2030-01-02', starts_at: '2030-01-02T03:00:00.000Z',
    ends_at: '2030-01-02T05:00:00.000Z', start_zone: 'Asia/Bangkok', end_zone: 'Asia/Bangkok',
    origin: 'Pier A', destination: 'Pier B', mode: 'ferry', flight_number: 'F-123', journey_id: 'Outbound',
    overnight: true, location: 'Sample area', address: 'Sample address', map_url: 'https://maps.example.invalid/pier',
    operator: 'Sample operator', provider: 'Sample provider', booking_status: 'booked',
    booking_reference: 'REF-123', booking_url: 'https://booking.example.invalid/123', preparation: 'ready',
  })])
  data.tasks = [{ id: 'task-1', trip_id: 'trip-1', item_id: null, title: 'Reserve a room', details: '', due_date: null, done: false, position: 0, version: 1, created_at: '', updated_at: '' }]
  data.attachments = [
    { id: 'file-1', trip_id: 'trip-1', item_id: 'item-1', name: 'Ferry ticket.pdf', path: 'file-1', mime_type: 'application/pdf', size: 1200, status: 'ready', version: 1, created_at: '', updated_at: '' },
    { id: 'file-2', trip_id: 'trip-1', item_id: null, name: 'Hotel voucher.pdf', path: 'file-2', mime_type: 'application/pdf', size: 2400, status: 'ready', version: 1, created_at: '', updated_at: '' },
  ]
  if (loggedIn) await page.addInitScript(token => localStorage.setItem('sb-planner-test-auth-token', JSON.stringify(token)), session())
  let conflict = false
  let saveFailure = false
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } })
  await page.route('https://planner-test.supabase.co/**', async route => {
    const url = new URL(route.request().url()), method = route.request().method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } })
    if (url.pathname.endsWith('/functions/v1/thailand-shared-login')) return respond(route, session())
    if (url.pathname.endsWith('/auth/v1/user')) return respond(route, session().user)
    if (url.pathname.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204 })
    if (url.pathname.includes('/rest/v1/')) {
      const name = url.pathname.split('/').pop()
      if (name === 'thailand_trips') return respond(route, data.trip)
      if (name === 'thailand_itinerary_items') {
        if (method === 'POST' || method === 'PATCH') {
          if (saveFailure) return respond(route, { message: 'Save rejected by test backend', code: 'XX000' }, 500)
          if (conflict) { conflict = false; data.items[0].version += 1; data.items[0].title = 'Changed by another traveler'; return respond(route, null) }
          const fields = route.request().postDataJSON()
          const item = { ...makeItem(), ...fields, id: method === 'POST' ? 'new-item' : data.items[0].id, version: method === 'POST' ? 1 : data.items[0].version + 1 }
          if (method === 'POST') data.items.push(item)
          else data.items[0] = item
          return respond(route, item)
        }
        return respond(route, data.items)
      }
      if (name === 'thailand_tasks') {
        if (method === 'PATCH') { data.tasks[0] = { ...data.tasks[0], ...route.request().postDataJSON(), version: data.tasks[0].version + 1 }; return respond(route, data.tasks[0]) }
        return respond(route, data.tasks)
      }
      if (name === 'thailand_notes') return respond(route, [])
      if (name === 'thailand_attachments') return respond(route, data.attachments)
    }
    return respond(route, { message: 'Unexpected test request' }, 400)
  })
  await page.goto('/')
  return { data, conflict: () => { conflict = true }, fail: () => { saveFailure = true } }
}
async function openFerry(page: Page) {
  await page.getByRole('button', { name: 'day', exact: true }).click()
  await page.locator('.timeline-event', { hasText: 'Sample ferry' }).click()
}
test('password-only login opens the private plan and logout hides it', async ({ page }) => {
  await mockBackend(page, false)
  await expect(page.getByRole('heading', { name: 'Plan the trip, not the group chat.' })).toBeVisible()
  await expect(page.getByText('Sample trip', { exact: true })).not.toBeVisible()
  await page.getByLabel('Trip password').fill('test-password')
  await page.getByRole('button', { name: 'Open our trip' }).click()
  await expect(page.getByRole('heading', { name: 'Sample trip', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByLabel('Trip password')).toBeVisible()
})
test('calendar, agenda, checklist, and item creation work on both layouts', async ({ page }) => {
  const backend = await mockBackend(page)
  await openFerry(page)
  await expect(page.getByRole('heading', { name: 'Sample ferry' })).toBeVisible()
  await expect(page.locator('.item-detail').getByText('Pier A', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByRole('button', { name: 'week', exact: true }).click()
  await expect(page.locator('.fc-timeGridWeek-view')).toBeVisible()
  await page.getByRole('button', { name: 'month', exact: true }).click()
  await expect(page.locator('.fc-dayGridMonth-view')).toBeVisible()
  await page.getByRole('button', { name: 'Checklist', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Mark Reserve a room done' }).click()
  await expect(page.getByRole('checkbox', { name: 'Mark Reserve a room not done' })).toBeChecked()
  await page.getByRole('button', { name: 'Add to our plan' }).click()
  await page.getByRole('button', { name: 'Add activity', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Sample museum')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(backend.data.items.some(item => item.title === 'Sample museum')).toBe(true)
})
test('failed and conflicting saves preserve the draft and require explicit reapply', async ({ page }) => {
  const backend = await mockBackend(page)
  await openFerry(page)
  await page.getByRole('button', { name: 'Edit Sample ferry' }).click()
  await page.getByLabel('Title', { exact: true }).fill('My ferry draft')
  backend.conflict()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Latest saved version', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My ferry draft')
  await page.getByRole('button', { name: 'Keep draft, use latest version' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'Edit My ferry draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Unsaved ferry')
  backend.fail()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('alert')).toContainText('Save rejected')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved ferry')
})
test('offline editing is explicitly disabled', async ({ page, context }) => {
  await mockBackend(page)
  await expect(page.getByRole('heading', { name: 'Sample trip', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'day', exact: true }).click()
  await context.setOffline(true)
  await expect(page.getByText('You’re offline.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to our plan' })).toBeDisabled()
  await context.setOffline(false)
  await expect(page.getByRole('button', { name: 'Add to our plan' })).toBeEnabled()
})
test('a calendar loading failure preserves access to the loaded daily agenda', async ({ page }) => {
  await page.route('**/src/features/calendar/Calendar.tsx*', route => route.abort('failed'))
  await mockBackend(page)
  await page.getByRole('button', { name: 'week', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('This view could not load.')
  await openFerry(page)
  await expect(page.getByRole('heading', { name: 'Sample ferry' })).toBeVisible()
})
test('calendar navigation keeps the selected month when switching to the daily agenda', async ({ page }) => {
  await mockBackend(page)
  await page.getByRole('button', { name: 'month', exact: true }).click()
  await page.locator('.fc-next-button').click()
  await expect(page.locator('.fc-toolbar-title')).toHaveText('February 2030')
  await page.getByRole('button', { name: 'day', exact: true }).click()
  await expect(page.locator('.date-nav input')).toHaveValue('2030-02-01')
})
test('calendar event labels meet readable text contrast', async ({ page }) => {
  await mockBackend(page)
  await page.getByRole('button', { name: 'month', exact: true }).click()
  const colors = await page.locator('.fc-event').first().evaluate(element => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
  }))
  const luminance = (color: string) => {
    const [red, green, blue] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => value / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return red * 0.2126 + green * 0.7152 + blue * 0.0722
  }
  const [light, dark] = [luminance(colors.foreground), luminance(colors.background)].sort((a, b) => b - a)
  expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5)
})
test('the add menu closes on Escape and outside click', async ({ page }) => {
  await mockBackend(page)
  const trigger = page.getByRole('button', { name: 'Add to our plan' })
  await trigger.click()
  await expect(page.getByRole('group', { name: 'Choose what to add' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: 'Choose what to add' })).not.toBeVisible()
  await trigger.click()
  await page.getByRole('heading', { name: 'Sample trip', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Choose what to add' })).not.toBeVisible()
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Add stay', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toContainText('Add stay')
  await page.getByRole('button', { name: 'Close dialog' }).click()
})
test('the review summary opens the attention list from another section', async ({ page }) => {
  await mockBackend(page)
  await page.getByRole('button', { name: 'Notes', exact: true }).click()
  await page.getByRole('button', { name: /\d+ things to review/ }).click()
  await expect(page.locator('.attention-panel')).toBeFocused()
})
test('item document links filter files and offer a way back to all documents', async ({ page }) => {
  await mockBackend(page)
  await openFerry(page)
  await page.getByRole('button', { name: '1 document' }).click()
  await expect(page.getByRole('heading', { name: 'Documents for Sample ferry' })).toBeVisible()
  await expect(page.getByText('Ferry ticket.pdf')).toBeVisible()
  await expect(page.getByText('Hotel voucher.pdf')).not.toBeVisible()
  await page.getByRole('button', { name: 'View all documents' }).click()
  await expect(page.getByText('Hotel voucher.pdf')).toBeVisible()
})
test('collapsed optional fields remain intact when an item is saved', async ({ page }) => {
  const backend = await mockBackend(page)
  await openFerry(page)
  await page.getByRole('button', { name: 'Edit Sample ferry' }).click()
  await expect(page.getByText('Booking & preparation')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  expect(backend.data.items[0]).toMatchObject({
    operator: 'Sample operator', provider: 'Sample provider', booking_reference: 'REF-123',
    booking_url: 'https://booking.example.invalid/123', start_zone: 'Asia/Bangkok', end_zone: 'Asia/Bangkok',
    flight_number: 'F-123', journey_id: 'Outbound', overnight: true, location: 'Sample area', address: 'Sample address',
    map_url: 'https://maps.example.invalid/pier',
  })
})
test('invalid fields inside a collapsed section reveal that section', async ({ page }) => {
  await mockBackend(page)
  await page.getByRole('button', { name: 'Add to our plan' }).click()
  await page.getByRole('button', { name: 'Add activity', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Sample museum')
  const section = page.locator('details').filter({ hasText: 'Location & map' })
  await section.locator('summary').click()
  await page.getByLabel('Map link').fill('not a valid URL')
  await section.locator('summary').click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(section).toHaveAttribute('open', '')
  await expect(page.getByLabel('Map link')).toBeVisible()
})
test('closing a changed editor confirms before discarding the draft', async ({ page }) => {
  await mockBackend(page)
  await openFerry(page)
  await page.getByRole('button', { name: 'Edit Sample ferry' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Unsaved ferry draft')
  let confirmShown = false
  page.once('dialog', dialog => { confirmShown = true; void dialog.dismiss() })
  await page.getByRole('button', { name: 'Close dialog' }).click()
  expect(confirmShown).toBe(true)
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved ferry draft')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
test('mobile layout avoids page-level horizontal overflow at 320px', async ({ page }) => {
  await mockBackend(page)
  await page.setViewportSize({ width: 320, height: 780 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})
