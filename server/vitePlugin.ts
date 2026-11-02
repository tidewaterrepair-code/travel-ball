import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import brandHandler from '../api/brand.js'
import { handleApi } from './api.js'

type Next = (err?: unknown) => void

/** Serves the API (sign-in, club data, brand lookup) from `npm run dev` and `npm run preview`. */
export function brandApi(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const path = (req.url ?? '').split('?')[0]
    if (path === '/api/brand') return void brandHandler(req, res)
    handleApi(req, res).then((handled) => !handled && next(), next)
  }
  return {
    name: 'dugout-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
