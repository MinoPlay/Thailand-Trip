export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing server configuration: ${name}`)
  return value
}

export function corsHeaders(request: Request): Headers | null {
  const origins = requiredEnv('THAILAND_ALLOWED_ORIGINS').split(',').map((value) => value.trim())
  const origin = request.headers.get('origin')
  // Origin-less requests (CLI/native clients) still need authentication/password.
  if (origin && !origins.includes(origin)) return null
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  return headers
}

export function json(headers: Headers, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return null
  if (Number(request.headers.get('content-length')) > 32768) return null
  // Bound streamed bodies too; Content-Length is not trusted.
  const reader = request.body?.getReader()
  if (!reader) return null
  let bytes = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 32768) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const buffer = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(buffer))
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
