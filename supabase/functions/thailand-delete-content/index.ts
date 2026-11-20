import { createClient } from 'npm:@supabase/supabase-js@2.119.2'
import { corsHeaders, json, readBody, requiredEnv } from '../_shared/http.ts'

const url = requiredEnv('SUPABASE_URL')
const publicKey = requiredEnv('SUPABASE_ANON_KEY')
const service = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (request: Request) => {
  const headers = corsHeaders(request)
  if (!headers) return new Response(null, { status: 403 })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return json(headers, 405, { error: 'method_not_allowed', retryable: false })
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return json(headers, 401, { error: 'authentication_required', retryable: false })
  }
  const userClient = createClient(url, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json(headers, 401, { error: 'authentication_required', retryable: false })
  const body = await readBody(request)
  if (!body || Object.keys(body).some((key) => !['table', 'id', 'version'].includes(key))
    || typeof body.table !== 'string' || !['itinerary_items', 'attachments'].includes(body.table)
    || typeof body.id !== 'string' || !uuid.test(body.id)
    || !Number.isSafeInteger(body.version) || Number(body.version) < 1 || Number(body.version) > 2147483647) {
    return json(headers, 400, { error: 'invalid_deletion_request', retryable: false })
  }
  // The claim RPC runs as the authenticated user, rechecking ownership inside its
  // transaction. Durable receipts authorize retries even after the row is gone.
  const { data: claim, error: claimError } = await userClient.rpc('thailand_claim_content', {
    p_table: `thailand_${body.table}`, p_id: body.id, p_version: body.version,
  })
  if (claimError) {
    const errors: Record<string, [number, boolean]> = {
      '40001': [409, false],
      'P0002': [404, false],
      '55000': [409, true],
      '40P01': [409, true],
      '42501': [403, false],
      '22023': [400, false],
    }
    const [status, retryable] = errors[claimError.code] ?? [503, true]
    // Only expected database messages are part of the public protocol.
    const known = ['version_conflict', 'content_not_found', 'dependent_deletion_in_progress',
      'parent_deletion_in_progress', 'authentication_required', 'invalid_deletion_request']
    const error = known.includes(claimError.message) ? claimError.message : 'claim_failed'
    return json(headers, status, { error, retryable })
  }
  if (!claim || typeof claim.claim_id !== 'string' || !Array.isArray(claim.paths)
    || !claim.paths.every((path: unknown) => typeof path === 'string')) {
    return json(headers, 503, { error: 'invalid_claim_response', retryable: true })
  }
  // Repeat removal even for completed receipts; this also makes delayed upload
  // cleanup explicitly retryable. Missing objects are a successful Storage remove.
  for (let offset = 0; offset < claim.paths.length; offset += 100) {
    const { error } = await service.storage.from('thailand-documents').remove(claim.paths.slice(offset, offset + 100))
    if (error) {
      return json(headers, 503, { error: 'storage_delete_failed', retryable: true, claim_id: claim.claim_id })
    }
  }
  const { error: finalizeError } = await service.rpc('thailand_finalize_content_deletion', {
    p_claim_id: claim.claim_id, p_owner_id: user.id,
  })
  if (finalizeError) {
    return json(headers, 503, {
      error: finalizeError.message === 'storage_cleanup_required' ? 'storage_cleanup_required' : 'finalization_failed',
      retryable: true,
      claim_id: claim.claim_id,
    })
  }
  return json(headers, 200, { ok: true })
})
