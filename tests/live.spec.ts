import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types'

test('real shared trip synchronizes between two browser sessions', async ({ browser, baseURL }) => {
  const sessionPath = process.env.TRIP_SMOKE_SESSION
  test.skip(!sessionPath, 'Requires an explicitly supplied private smoke-test session.')
  const session = JSON.parse(readFileSync(sessionPath!, 'utf8')) as Session
  const environment = Object.fromEntries(readFileSync('.env.local', 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)))
  const url = environment.VITE_SUPABASE_URL
  const db = createClient<Database>(url, environment.VITE_SUPABASE_PUBLISHABLE_KEY)
  const signedIn = await db.auth.setSession(session)
  if (signedIn.error) throw signedIn.error
  if (!signedIn.data.session) throw new Error('The live session could not be restored.')
  const restoredSession = signedIn.data.session
  const label = `Live sync check ${randomUUID()}`
  const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  const first = await browser.newContext()
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  let cleanupError: Error | null = null
  try {
    for (const context of [first, second]) {
      await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: JSON.stringify(restoredSession) })
    }
    const a = await first.newPage(), b = await second.newPage()
    await Promise.all([a.goto(baseURL!), b.goto(baseURL!)])
    await expect(a.getByRole('status')).toContainText('Live', { timeout: 20_000 })
    await expect(b.getByRole('status')).toContainText('Live', { timeout: 20_000 })
    await b.getByRole('button', { name: 'Checklist', exact: true }).click()
    await a.getByRole('button', { name: 'Add to our plan' }).click()
    await a.getByRole('button', { name: 'Add checklist task' }).click()
    await a.getByLabel('What needs doing?').fill(label)
    await a.getByRole('button', { name: 'Save task' }).click()
    await expect(a.getByRole('dialog')).not.toBeVisible()
    await expect(b.getByRole('button', { name: label, exact: true })).toBeVisible({ timeout: 15_000 })
    await b.getByRole('checkbox', { name: `Mark ${label} done` }).click()
    await a.getByRole('button', { name: 'Checklist', exact: true }).click()
    await expect(a.getByRole('checkbox', { name: `Mark ${label} not done` })).toBeChecked({ timeout: 15_000 })
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally {
    const removed = await db.from('thailand_tasks').delete().eq('title', label).select('id')
    await first.close()
    await second.close()
    await db.auth.stopAutoRefresh()
    if (removed.error) {
      cleanupError = new Error(removed.error.message)
      console.error('Live smoke cleanup failed:', removed.error.message)
    }
  }
  if (cleanupError) throw cleanupError
})
