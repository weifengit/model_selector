/**
 * Model Selector — the plugin's Host half.
 *
 * Two jobs, both small:
 *
 * 1. own the cleanup switch's durable state (a JSON file under the harness
 *    home) so the switch survives a DSH restart, and the same for the
 *    per-model verdicts — a probe is spent once and must not be paid for
 *    twice;
 * 2. serve that state over same-origin JSON routes the browser half reads
 *    and writes.
 *
 * The probe itself lives here too: it needs the channel gateway's key, and a
 * secret that can spend the user's credit has no business crossing into the
 * page. The browser half only ever sees verdicts.
 *
 * @module src/host.js
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  JsonStore, INITIAL_STATE, INITIAL_VERDICTS, STATE_FILE, VERDICT_FILE,
  DATA_DIR_NAME, normalizeState, normalizeVerdicts, mergeVerdicts, resolveDshHome,
} from './store.js'
import { createProber } from './gateway.js'

/** The plugin's name, as the harness knows it. */
export const name = 'model-selector'

/** The plugin's version, read from the installed manifest. */
export const version = readPackageVersion()

/**
 * The services this half needs.
 *
 * `webServer` is a *soft* requirement: the state file is the durable part, and
 * a composition without a web server simply has no way to reach the picker
 * either. Declaring it in `inject` would keep the whole fiber pending on a
 * service a headless composition may never mount, so it is reached through a
 * nested `ctx.inject` instead (see `apply`).
 */
export const inject = []

/** The route prefix the browser half calls. */
export const API_PREFIX = '/api/model-selector'

/** Read the installed package's version, once, at load. */
function readPackageVersion() {
  try {
    const manifest = new URL('../package.json', import.meta.url)
    return String(JSON.parse(fs.readFileSync(manifest, 'utf8')).version ?? '')
  } catch {
    return ''
  }
}

/**
 * Apply the plugin.
 *
 * @param {object} ctx - the Host context.
 * @param {Record<string, unknown>} _config - the plugin's config, unused.
 */
export function apply(ctx, _config = {}) {
  const logger = ctx.logger ?? console
  const home = resolveDshHome()
  const dataDir = path.resolve(home, DATA_DIR_NAME)
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })

  const store = new JsonStore(path.join(dataDir, STATE_FILE), INITIAL_STATE, {
    log: message => logger.warn?.(`model-selector: ${message}`),
  })
  const verdicts = new JsonStore(path.join(dataDir, VERDICT_FILE), INITIAL_VERDICTS, {
    log: message => logger.warn?.(`model-selector: ${message}`),
  })
  // The sweep runs here: the gateway key stays in this process and the page
  // only ever sees verdicts.
  const prober = createProber({ store: verdicts, merge: mergeVerdicts, logger })

  // The state is the durable part; the route is how the browser reaches it.
  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.replace(/^\/api\/model-selector/, '').replace(/\/+$/, '') || '/'
    const method = String(req.method ?? 'GET').toUpperCase()
    const send = (status, payload) => {
      const body = JSON.stringify(payload)
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(body)
    }
    try {
      if (method === 'GET' && route === '/switch') {
        return send(200, normalizeState(store.get()))
      }
      if (method === 'GET' && route === '/verdicts') {
        return send(200, normalizeVerdicts(verdicts.get()))
      }
      if (method === 'POST' && route === '/verdicts') {
        const body = await readJson(req)
        return send(200, mergeVerdicts(verdicts, body))
      }
      if (method === 'POST' && route === '/sweep') {
        const body = await readJson(req)
        const plan = body !== null && typeof body === 'object' ? body : {}
        return send(200, prober.start({
          port: Number(plan.port ?? 0),
          targets: Array.isArray(plan.targets) ? plan.targets : [],
        }))
      }
      if (method === 'GET' && route === '/sweep') {
        return send(200, prober.status())
      }
      if (method === 'POST' && route === '/sweep/stop') {
        return send(200, prober.stop())
      }
      if (method === 'POST' && route === '/switch') {
        const body = await readJson(req)
        const patch = body !== null && typeof body === 'object' ? body : {}
        const next = store.edit(current => {
          const value = current
          if (typeof patch.enabled === 'boolean') value.enabled = patch.enabled
          if (patch.hidden !== null && typeof patch.hidden === 'object') {
            const hidden = {}
            for (const [provider, ids] of Object.entries(patch.hidden)) {
              if (typeof provider !== 'string' || provider === '') continue
              if (!Array.isArray(ids)) continue
              const kept = ids.filter(id => typeof id === 'string' && id !== '')
              if (kept.length > 0) hidden[provider] = kept
            }
            value.hidden = hidden
          }
          value.updatedAt = Date.now()
          return value
        })
        return send(200, normalizeState(next))
      }
      return send(404, { error: 'not found' })
    } catch (error) {
      logger.warn?.(`model-selector: request failed (${error?.message ?? error})`)
      return send(500, { error: 'internal error' })
    }
  }

  // The route lives in its own fiber: a composition without a web server must
  // not keep this plugin's state from existing.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], scoped => {
      const server = scoped.webServer
      scoped.effect(
        () => server.register({ kind: 'prefix', path: API_PREFIX, handler }),
        'model-selector: state API',
      )
      logger.info?.('model-selector: state API mounted at /api/model-selector')
    })
  }

  // Persist whatever the last generation changed before the successor starts.
  ctx.effect(() => () => { store.dispose(); verdicts.dispose() }, 'model-selector: state stores')
}

/**
 * Read a JSON request body.
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>} the parsed body, or null when it is not JSON
 */
async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    // The body is a switch state: a provider id and a list of model ids. A
    // megabyte is far past any legitimate payload and stops a runaway body
    // from becoming a memory problem.
    if (size > 1_000_000) throw new Error('body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}
