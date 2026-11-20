import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Palmtree, LockKeyhole } from 'lucide-react'
import { configured, client, supabase } from '../lib/supabase'
import { functionError } from '../lib/api'
import { ErrorMessage, Field } from '../components/Feedback'

const Planner = lazy(() => import('./Planner').then(module => ({ default: module.Planner })))

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(configured)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const cache = useQueryClient()
  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setError(`Could not restore your session: ${error.message}`)
      setSession(data.session)
      setLoading(false)
    }).catch((error: unknown) => {
      if (active) { setError(error instanceof Error ? error.message : 'Session restoration failed.'); setLoading(false) }
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      setLoading(false)
      if (!next) cache.clear()
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [cache])
  if (loading) return <main className="auth-page"><p role="status">Opening your trip…</p></main>
  if (session) return <Suspense fallback={<main className="auth-page"><p role="status">Opening the planner…</p></main>}><Planner userId={session.user.id} /></Suspense>
  return <main className="auth-page">
    <div className="auth-illustration" aria-hidden="true"><div className="sun" /><div className="island"><Palmtree size={160} strokeWidth={1} /></div><div className="travel-stamp">A LITTLE PLANNING.<br />A GREAT ADVENTURE.</div></div>
    <section className="auth-card">
      <div className="brand"><Palmtree size={24} /> together / thailand</div>
      <p className="eyebrow">LESS LOGISTICS, MORE ADVENTURE</p>
      <h1>One trip.<br />All the little details.</h1>
      <p className="intro">Our places to stay, ways to get there, and things we can’t wait to do. All in one shared plan.</p>
      {!configured ? <div className="message warning"><strong>Connect your trip</strong><p>This site needs its Supabase project URL and public publishable key. Follow the repository setup instructions, then rebuild the site. No trip data is available until setup is complete.</p></div> :
        <form onSubmit={async event => {
          event.preventDefault()
          const password = String(new FormData(event.currentTarget).get('password') ?? '')
          setPending(true); setError('')
          try {
            const { data, error } = await client().functions.invoke('thailand-shared-login', { body: { password } })
            if (error) throw new Error(await functionError(error))
            if (!data?.access_token || !data?.refresh_token) throw new Error('Login did not return a valid session.')
            const response = await client().auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
            if (response.error) throw new Error(response.error.message)
          } catch (error) { setError(error instanceof Error ? error.message : 'Unable to log in. Please retry.') }
          finally { setPending(false) }
        }}>
          <Field label="Trip password"><input name="password" type="password" autoComplete="current-password" required placeholder="Enter our shared password" maxLength={1024} /></Field>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button className="primary full" disabled={pending}>{pending ? 'Opening trip…' : <>Open our trip <ArrowRight size={18} /></>}</button>
        </form>}
      <p className="privacy"><LockKeyhole size={14} /> Private to everyone with our trip password</p>
    </section>
  </main>
}
