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
  const data = makeData([makeItem({ id: 'item-1', title: 'Sample ferry', type: 'transfer', date: '2030-01-02', origin: 'Pier A', destination: 'Pier B', mode: 'ferry' })])
  data.tasks = [{ id: 'task-1', trip_id: 'trip-1', item_id: null, title: 'Reserve a room', details: '', due_date: null, done: false, position: 0, version: 1, created_at: '', updated_at: '' }]
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
      if (name === 'thailand_notes' || name === 'thailand_attachments') return respond(route, [])
    }
    return respond(route, { message: 'Unexpected test request' }, 400)
  })
  await page.goto('/')
  return { data, conflict: () => { conflict = true }, fail: () => { saveFailure = true } }
}
test('password-only login opens the private plan and logout hides it', async ({ page }) => {
  await mockBackend(page, false)
  await expect(page.getByRole('heading', { name: 'One trip. All the little details.' })).toBeVisible()
  await expect(page.getByText('Sample trip', { exact: true })).not.toBeVisible()
  await page.getByLabel('Trip password').fill('test-password')
  await page.getByRole('button', { name: 'Open our trip' }).click()
  await expect(page.getByRole('heading', { name: 'Sample trip', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByLabel('Trip password')).toBeVisible()
})
test('calendar, agenda, checklist, and item creation work on both layouts', async ({ page }) => {
  const backend = await mockBackend(page)
  await page.getByRole('button', { name: 'day', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sample ferry' })).toBeVisible()
  await expect(page.getByText('Pier A', { exact: false })).toBeVisible()
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
  await page.getByRole('button', { name: 'day', exact: true }).click()
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
  await context.setOffline(true)
  await expect(page.getByText('You’re offline.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to our plan' })).toBeDisabled()
  await context.setOffline(false)
  await expect(page.getByRole('button', { name: 'Add to our plan' })).toBeEnabled()
})
