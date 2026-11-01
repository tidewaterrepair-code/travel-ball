import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import handler from '../api/brand.js'

/** Serves /api/brand from `npm run dev` and `npm run preview`. */
export function brandApi(): Plugin {
  const mount = (mw: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => unknown }): void => {
    mw.use('/api/brand', (req, res) => void handler(req, res))
  }
  return {
    name: 'dugout-brand-api',
    configureServer(server) {
      mount(server.middlewares)
    },
    configurePreviewServer(server) {
      mount(server.middlewares)
    },
  }
}
