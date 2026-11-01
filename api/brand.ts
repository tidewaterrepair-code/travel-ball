// Serverless endpoint (Vercel-style): GET /api/brand?url=club-site.com
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleBrandRequest } from '../server/brandLookup.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost').searchParams.get('url')
  const [status, body] = await handleBrandRequest(url)
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', status === 200 ? 'public, max-age=3600' : 'no-store')
  res.end(JSON.stringify(body))
}
