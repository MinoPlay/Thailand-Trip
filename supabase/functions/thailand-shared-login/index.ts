import { createClient } from 'npm:@supabase/supabase-js@2.119.2'
import { isIP } from 'node:net'
import { corsHeaders, json, readBody, requiredEnv } from '../_shared/http.ts'

const url = requiredEnv('SUPABASE_URL')
const publicKey = requiredEnv('SUPABASE_ANON_KEY')
const service = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const email = requiredEnv('THAILAND_SHARED_ACCOUNT_EMAIL')
const ipHeader = Deno.env.get('THAILAND_LOGIN_TRUSTED_IP_HEADER') ?? ''
if (!['', 'cf-connecting-ip', 'x-real-ip'].includes(ipHeader)) {
  throw new Error('Invalid THAILAND_LOGIN_TRUSTED_IP_HEADER')
}
const hashSecret = requiredEnv('THAILAND_LOGIN_HMAC_SECRET')
if (hashSecret.length < 32) throw new Error('THAILAND_LOGIN_HMAC_SECRET must contain at least 32 characters')
const hmacKey = await crypto.subtle.importKey(
  'raw', new TextEncoder().encode(hashSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
)

async function sourceKey(request: Request): Promise<string> {
  let source = 'unattributed'
  if (ipHeader) {
    const ip = request.headers.get(ipHeader)?.trim()
    if (!ip || !isIP(ip) || ip.includes('%')) {
      source = 'unattributed'
    } else {
      // URL canonicalization coalesces equivalent IPv6 spellings.
      source = isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip
    }
  }
  const hash = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(source))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request: Request) => {
  const headers = corsHeaders(request)
  if (!headers) return new Response(null, { status: 403 })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return json(headers, 405, { error: 'Request failed' })

  const { data: limit, error: throttleError } = await service.rpc('thailand_consume_shared_login_attempt', {
    p_ip_key: await sourceKey(request),
  })
  if (throttleError || !limit || typeof limit.allowed !== 'boolean'
    || !Number.isInteger(limit.retry_after) || limit.retry_after < 0) {
    return json(headers, 503, { error: 'Sign-in unavailable' })
  }
  if (!limit.allowed) {
    headers.set('Retry-After', String(limit.retry_after))
    return json(headers, 429, { error: 'Sign-in unavailable' })
  }
  const body = await readBody(request)
  if (!body || Object.keys(body).some((key) => key !== 'password')
    || typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 1024) {
    return json(headers, 400, { error: 'Sign-in failed' })
  }
  const { data: accountId, error: configError } = await service.rpc('thailand_shared_account_id')
  if (configError || typeof accountId !== 'string') {
    return json(headers, 503, { error: 'Sign-in unavailable' })
  }
  // Never reuse a session-bearing auth client between requests.
  const client = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: body.password })
  if (error || !data.session || data.user?.id !== accountId) {
    return json(headers, 401, { error: 'Sign-in failed' })
  }
  return json(headers, 200, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
})
