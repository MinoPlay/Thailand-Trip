import { readFile } from 'node:fs/promises'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import { isIP } from 'node:net'
import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'

const { Request, Response, Headers, TextEncoder, TextDecoder, URL, crypto, console } = globalThis

// Evaluate the actual entrypoints with only the network-facing SDK replaced.
async function loadFunction(name, overrides = {}) {
  const calls = []
  let handler
  const env = {
    SUPABASE_URL: 'https://project.example.invalid',
    SUPABASE_ANON_KEY: 'public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'server-key',
    THAILAND_SHARED_ACCOUNT_EMAIL: 'shared@example.invalid',
    THAILAND_LOGIN_HMAC_SECRET: 'test-only-not-a-real-secret-32-characters',
    THAILAND_ALLOWED_ORIGINS: 'https://planner.example.invalid',
    ...overrides.env,
  }
  const rpc = async (client, fullMethod, args) => {
    assert.match(fullMethod, /^thailand_/)
    const method = fullMethod.slice('thailand_'.length)
    calls.push({ client, method, args })
    if (overrides.rpc) return overrides.rpc(client, method, args)
    if (method === 'shared_account_id') return {
      data: overrides.missingConfig ? null : (overrides.accountId ?? 'user-1'), error: null,
    }
    if (method === 'consume_shared_login_attempt') return { data: { allowed: true, retry_after: 0 }, error: null }
    if (method === 'claim_content') return {
      data: { claim_id: 'claim-1', paths: ['trip/attachment/file.pdf'], completed: false }, error: null,
    }
    return { data: { deleted: true }, error: null }
  }
  const createClient = (_url, key, options) => {
    const client = key === 'server-key' ? 'service' : 'user'
    calls.push({ client, method: 'createClient', options })
    return {
      rpc: (method, args) => rpc(client, method, args),
      auth: {
        getUser: async () => {
          calls.push({ client, method: 'getUser' })
          return overrides.authError
            ? { data: { user: null }, error: { message: 'private auth error' } }
            : { data: { user: { id: 'user-1' } }, error: null }
        },
        signInWithPassword: async (args) => {
          calls.push({ client, method: 'signInWithPassword', args })
          return overrides.passwordError
            ? { data: { session: null }, error: { message: 'private auth error' } }
            : { data: { user: { id: 'user-1' }, session: { access_token: 'access', refresh_token: 'refresh' } }, error: null }
        },
      },
      storage: {
        from: (bucket) => ({
          remove: async (paths) => {
            calls.push({ client, method: 'remove', bucket, paths })
            return { data: null, error: overrides.storageError ? { message: 'private storage error' } : null }
          },
        }),
      },
    }
  }
  const context = createContext({
    Request, Response, Headers, TextEncoder, TextDecoder, URL, crypto, console,
    Deno: { env: { get: (name) => env[name] }, serve: (value) => { handler = value } },
  })
  const sdk = new SyntheticModule(['createClient'], function () {
    this.setExport('createClient', createClient)
  }, { context })
  const net = new SyntheticModule(['isIP'], function () {
    this.setExport('isIP', isIP)
  }, { context })
  const httpSource = await readFile(new URL('../functions/_shared/http.ts', import.meta.url), 'utf8')
  const entrySource = await readFile(new URL(`../functions/thailand-${name}/index.ts`, import.meta.url), 'utf8')
  const transpile = (source) => ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText
  const http = new SourceTextModule(transpile(httpSource), { context })
  const entry = new SourceTextModule(transpile(entrySource), { context })
  await entry.link((specifier) => {
    if (specifier.startsWith('npm:@supabase/')) return sdk
    if (specifier === 'node:net') return net
    if (specifier === '../_shared/http.ts') return http
    throw new Error(`Unexpected dependency ${specifier}`)
  })
  await entry.evaluate()
  return {
    calls,
    invoke: (body, headers = {}, method = 'POST') => handler(new Request('https://edge.example.invalid', {
      method,
      headers: { origin: 'https://planner.example.invalid', 'content-type': 'application/json', ...headers },
      ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    })),
  }
}

const deletion = { table: 'itinerary_items', id: '20000000-0000-0000-0000-000000000001', version: 3 }
const authenticated = { authorization: 'Bearer session-token' }

test('shared login maps the server email and returns only session tokens', async () => {
  const app = await loadFunction('shared-login')
  const response = await app.invoke({ password: 'a-private-password' })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { access_token: 'access', refresh_token: 'refresh' })
  assert.deepEqual({ ...app.calls.find((call) => call.method === 'signInWithPassword').args }, {
    email: 'shared@example.invalid', password: 'a-private-password',
  })
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('untrusted forwarded IP headers do not affect the source key', async () => {
  const app = await loadFunction('shared-login')
  await app.invoke({ password: 'first' }, { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4' })
  await app.invoke({ password: 'second' }, { 'x-forwarded-for': '9.8.7.6', 'x-real-ip': '9.8.7.6' })
  const keys = app.calls.filter((call) => call.method === 'consume_shared_login_attempt').map((call) => call.args.p_ip_key)
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1])
  assert.match(keys[0], /^[a-f0-9]{64}$/)
})

test('explicit trusted source config hashes and canonicalizes IPv6', async () => {
  const app = await loadFunction('shared-login', { env: { THAILAND_LOGIN_TRUSTED_IP_HEADER: 'x-real-ip' } })
  await app.invoke({ password: 'first' }, { 'x-real-ip': '2001:0db8:0:0:0:0:0:1' })
  await app.invoke({ password: 'second' }, { 'x-real-ip': '2001:db8::1' })
  const keys = app.calls.filter((call) => call.method === 'consume_shared_login_attempt').map((call) => call.args.p_ip_key)
  assert.equal(keys[0], keys[1])
  assert.ok(!keys[0].includes('2001'))
})

test('persistent throttle denial fails closed before Auth', async () => {
  const app = await loadFunction('shared-login', {
    rpc: async () => ({ data: { allowed: false, retry_after: 90 }, error: null }),
  })
  const response = await app.invoke({ password: 'password' })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '90')
  assert.equal(app.calls.some((call) => call.method === 'signInWithPassword'), false)
})

test('throttle failure cannot fall through to password authentication', async () => {
  const app = await loadFunction('shared-login', { rpc: async () => ({ data: null, error: { message: 'internal' } }) })
  const response = await app.invoke({ password: 'password' })
  assert.equal(response.status, 503)
  assert.equal(app.calls.some((call) => call.method === 'signInWithPassword'), false)
  assert.ok(!(await response.text()).includes('internal'))
})

test('login rejects browser origins, email overrides, malformed JSON and oversize bodies', async () => {
  const app = await loadFunction('shared-login')
  assert.equal((await app.invoke({ password: 'x' }, { origin: 'https://evil.example.invalid' })).status, 403)
  assert.equal((await app.invoke({ password: 'x', email: 'override@example.invalid' })).status, 400)
  assert.equal((await app.invoke('{')).status, 400)
  assert.equal((await app.invoke({ password: 'x'.repeat(33000) })).status, 400)
  assert.equal(app.calls.some((call) => call.method === 'signInWithPassword'), false)
})

test('password errors do not reveal Auth internals or shared email', async () => {
  const app = await loadFunction('shared-login', { passwordError: true })
  const response = await app.invoke({ password: 'wrong' })
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Sign-in failed' })
})

test('missing dedicated-account allowlist fails closed before Auth', async () => {
  const app = await loadFunction('shared-login', { missingConfig: true })
  assert.equal((await app.invoke({ password: 'password' })).status, 503)
  assert.equal(app.calls.some((call) => call.method === 'signInWithPassword'), false)
})

test('secret email cannot sign into a user outside the dedicated allowlist', async () => {
  const app = await loadFunction('shared-login', { accountId: 'different-account' })
  const response = await app.invoke({ password: 'password' })
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Sign-in failed' })
})

test('delete validates getUser before claims and server storage access', async () => {
  const app = await loadFunction('delete-content', { authError: true })
  assert.equal((await app.invoke(deletion, authenticated)).status, 401)
  assert.equal(app.calls.some((call) => call.method === 'getUser'), true)
  assert.equal(app.calls.some((call) => call.method === 'claim_content' || call.method === 'remove'), false)
})

test('delete enforces its table/id/version request contract', async () => {
  const app = await loadFunction('delete-content')
  for (const body of [
    { ...deletion, table: 'trips' }, { ...deletion, version: 0 },
    { ...deletion, version: 1.5 }, { ...deletion, id: '../path' }, { ...deletion, owner_id: 'other' },
    { ...deletion, table: ['attachments'] },
  ]) assert.equal((await app.invoke(body, authenticated)).status, 400)
  assert.equal(app.calls.some((call) => call.method === 'claim_content'), false)
})

test('stale version never touches storage', async () => {
  const app = await loadFunction('delete-content', {
    rpc: async () => ({ data: null, error: { code: '40001', message: 'version_conflict' } }),
  })
  const response = await app.invoke(deletion, authenticated)
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'version_conflict', retryable: false })
  assert.equal(app.calls.some((call) => call.method === 'remove'), false)
})

test('storage failure keeps claim and rows retryable without finalization', async () => {
  const app = await loadFunction('delete-content', { storageError: true })
  const response = await app.invoke(deletion, authenticated)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'storage_delete_failed', retryable: true, claim_id: 'claim-1' })
  assert.equal(app.calls.some((call) => call.method === 'finalize_content_deletion'), false)
})

test('successful delete claims as user, removes as service, then finalizes as service', async () => {
  const app = await loadFunction('delete-content')
  const response = await app.invoke(deletion, authenticated)
  assert.deepEqual(await response.json(), { ok: true })
  const flow = app.calls.filter((call) => ['getUser', 'claim_content', 'remove', 'finalize_content_deletion'].includes(call.method))
  assert.deepEqual(flow.map(({ client, method }) => `${client}:${method}`), [
    'user:getUser', 'user:claim_content', 'service:remove', 'service:finalize_content_deletion',
  ])
  assert.equal(flow.find((call) => call.method === 'claim_content').args.p_table, 'thailand_itinerary_items')
  assert.equal(flow.find((call) => call.method === 'remove').bucket, 'thailand-documents')
})

test('completed receipts still repeat cleanup, then return success', async () => {
  const app = await loadFunction('delete-content', {
    rpc: async (_client, method) => ({
      data: method === 'claim_content'
        ? { claim_id: 'done', paths: ['trip/attachment/late.pdf'], completed: true }
        : { deleted: true }, error: null,
    }),
  })
  assert.deepEqual(await (await app.invoke(deletion, authenticated)).json(), { ok: true })
  assert.equal(app.calls.some((call) => call.method === 'remove'), true)
})

test('finalization failure is explicit and retains retry instructions', async () => {
  const app = await loadFunction('delete-content', {
    rpc: async (_client, method) => method === 'claim_content'
      ? { data: { claim_id: 'claim', paths: [] }, error: null }
      : { data: null, error: { message: 'storage_cleanup_required' } },
  })
  const response = await app.invoke(deletion, authenticated)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'storage_cleanup_required', retryable: true, claim_id: 'claim' })
})
