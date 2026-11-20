/**
 * Model Selector — the channel gateway's door, and the probe that goes through it.
 *
 * Per-model availability is established by asking: one minimal turn against the
 * channels' own OpenAI-compatible gateway — the door the composer uses, so the
 * answer means "can I pick this model and get a turn out of it?" for lane
 * models and vendor models alike.
 *
 * This runs on the Host, not in the page. The gateway's key lives in a file
 * (`~/.dsh/openai-gateway/api-key`); a secret that can spend the user's credit
 * has no business crossing into the browser, so the key is read here, from a
 * path fixed in this file, and never leaves the process.
 *
 * @module src/gateway.js
 */

import fs from 'node:fs'
import path from 'node:path'
import { resolveDshHome } from './store.js'

/** Where openai-gateway keeps the key the loopback door authenticates with. */
export const GATEWAY_KEY_FILE = path.join('openai-gateway', 'api-key')

/** How long one probe may take before it counts as an answer-less request. */
export const PROBE_TIMEOUT_MS = 45_000

/** How many probes run at once. The lane answers a wide burst with 429. */
export const PROBE_CONCURRENCY = 3

/** The prompt every probe sends — the answer is the verdict, not the prose. */
const PING_PROMPT = 'Reply with exactly: OK'

/**
 * Read the gateway's key.
 *
 * @param {object} [options]
 * @param {string} [options.home] - the harness home; defaults to the resolved one.
 * @returns {string} the key, or '' when there is none to read.
 */
export function readGatewayKey({ home = resolveDshHome() } = {}) {
  const root = path.resolve(home)
  const file = path.resolve(root, GATEWAY_KEY_FILE)
  // The path is built from a constant, so this guards against a home that is
  // itself a symlink somewhere surprising, not against a caller.
  if (path.dirname(file) !== path.join(root, 'openai-gateway')) return ''
  try {
    const real = fs.realpathSync(file)
    if (!real.startsWith(fs.realpathSync(root) + path.sep)) return ''
    const key = fs.readFileSync(real, 'utf8').trim()
    // A key is a short opaque token; anything longer is not this file's purpose.
    return key.length > 0 && key.length <= 256 && !/[\r\n]/.test(key) ? key : ''
  } catch {
    return ''
  }
}

/**
 * Ask the gateway for one model, once.
 *
 * @param {object} options
 * @param {number} options.port - the gateway's loopback port.
 * @param {string} options.key - its API key.
 * @param {string} options.model - the gateway's model id.
 * @param {typeof globalThis.fetch} [options.fetchImpl]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{state: string, detail: string, latencyMs: number}>}
 */
export async function probeGatewayModel({ port, key, model, fetchImpl = globalThis.fetch, signal }) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const relay = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', relay, { once: true })
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: PING_PROMPT }],
        max_tokens: 64,
        stream: false,
      }),
      signal: controller.signal,
    })
    const detail = response.ok ? '' : await readError(response)
    return {
      state: response.ok ? 'available' : classifyRefusal(response.status, detail),
      detail: detail.slice(0, 200),
      latencyMs: Date.now() - started,
    }
  } catch (error) {
    // No answer at all — a timeout, a dead port, a cancelled sweep. That is not
    // a verdict about the model, and recording one would hide a model that
    // works.
    return {
      state: 'unknown',
      detail: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', relay)
  }
}

/**
 * Read a gateway refusal's words.
 *
 * Two refusals look alike and mean opposite things:
 *
 * - the **door** refusing the caller: `Missing or invalid API key` — a stale
 *   gateway key says nothing about any model, and acting on it would hide the
 *   whole picker;
 * - a **provider** refusing the request: `codearts: model request failed
 *   with HTTP 403` — the message names the provider, which proves the
 *   request reached it and the provider answered. For 401/403 (and the
 *   gateway's own AUTH code) that is the provider's credential: every model
 *   behind it fails the same way, so it is a vendor-level fault.
 *
 * Without that distinction a vendor whose login expired answers 403 for all
 * ten of its models, every answer is filed as `unknown` — and unknown is the
 * one state that is never hidden, so the vendor sits in the picker at
 * 「可用 0」forever.
 */
const PROVIDER_PREFIX = /^[a-z0-9][a-z0-9_-]*\s*:/

/**
 * Classify a gateway refusal into a verdict state.
 *
 * @param {number} status - the HTTP status.
 * @param {string} message - the upstream's own words.
 * @returns {string} the verdict state.
 */
export function classifyRefusal(status, message) {
  const text = String(message ?? '')
  const lower = text.toLowerCase()
  if (/未配置凭据|请先登录|no credential|not logged in/.test(text)) return 'no-credential'
  if (status === 402 || /insufficient balance|no credit|quota exhausted/.test(lower)) return 'no-credit'
  if (/not available in your country|region/.test(lower)) return 'region-blocked'
  if (/free usage limit|rate limit|too many requests/.test(lower) || status === 429) return 'throttled'
  // A message naming the provider got through the door and was answered by
  // the provider itself, so its 401/403 is the provider's credential.
  const fromProvider = PROVIDER_PREFIX.test(text)
  if (fromProvider && status >= 400) {
    return 'no-credential'
  }
  // 502 is how this gateway wraps an upstream refusal — its words are the
  // answer, and 「no such model」 arrives inside one. 500/503/504 are the
  // gateway's own trouble, and 503 is spelled "Service Unavailable" by every
  // reverse proxy: reading that as the gateway naming this model would ban a
  // working model until the TTL ran out.
  const gatewayTrouble = status >= 500 && status !== 502
  if (!gatewayTrouble && /unavailable|not supported|no such model|unknown model|invalid model|does not exist/.test(lower)) return 'unavailable'
  // A door-level 401 (a stale key), 5xx, and anything unrecognised say
  // nothing about the model.
  return 'unknown'
}

/**
 * The sweep runner, one at a time.
 *
 * A second start returns the running sweep instead of spending a second round.
 * Verdicts land in the verdict store *as they come in*, so a sweep interrupted
 * by a reload or a stop keeps what it already paid for.
 *
 * @param {object} options
 * @param {{get: () => object, edit: (mutate: (value: unknown) => unknown) => unknown}} options.store
 * @param {(store: object, patch: object) => unknown} options.merge
 * @param {typeof globalThis.fetch} [options.fetchImpl]
 * @param {{warn?: (message: string) => void}} [options.logger]
 */
export function createProber({ store, merge, fetchImpl = globalThis.fetch, logger = console }) {
  let state = { running: false, total: 0, done: 0, error: '', startedAt: 0, results: {} }
  let controller = null

  /**
   * @param {object} plan
   * @param {number} plan.port - the gateway's loopback port, as its status route says.
   * @param {Array<{key: string, modelId: string}>} plan.targets
   * @returns the sweep's status, for the caller to poll.
   */
  function start({ port, targets }) {
    if (state.running) return status()
    const list = Array.isArray(targets) ? targets.filter(target =>
      typeof target?.key === 'string' && target.key !== ''
      && typeof target?.modelId === 'string' && target.modelId !== '') : []
    if (list.length === 0) return status()
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      state = { ...state, error: 'no-gateway' }
      return status()
    }
    const key = readGatewayKey()
    if (key === '') {
      state = { ...state, error: 'no-gateway-key' }
      return status()
    }
    controller = new AbortController()
    state = { running: true, total: list.length, done: 0, error: '', startedAt: Date.now(), results: {} }
    void run(port, key, list, controller.signal)
    return status()
  }

  async function run(port, key, targets, signal) {
    let cursor = 0
    // A vendor-level fault is the same answer for every model behind it, so
    // one probe per provider is enough: the rest are filled in from it rather
    // than each spending a request to learn what is already known.
    const faulted = new Map()
    const providerOf = (target) => {
      const slash = target.key.indexOf('/')
      return slash > 0 ? target.key.slice(0, slash) : ''
    }
    const workers = Array.from({ length: Math.max(1, Math.min(PROBE_CONCURRENCY, targets.length)) }, async () => {
      while (cursor < targets.length) {
        if (signal.aborted) return
        const index = cursor++
        const target = targets[index]
        const provider = providerOf(target)
        const carried = provider === '' ? undefined : faulted.get(provider)
        const verdict = carried === undefined
          ? await probeGatewayModel({ port, key, model: target.modelId, fetchImpl, signal })
          : { state: carried.state, detail: carried.detail, latencyMs: 0 }
        if (signal.aborted) return
        const at = Date.now()
        state = { ...state, done: state.done + 1 }
        if (provider !== '' && (verdict.state === 'no-credential' || verdict.state === 'no-credit')) {
          faulted.set(provider, verdict)
        }
        if (verdict.state !== 'unknown') {
          state = { ...state, results: { ...state.results, [target.key]: { ...verdict, at } } }
          try {
            merge(store, { [target.key]: { state: verdict.state, detail: verdict.detail, at } })
          } catch (error) {
            logger.warn?.(`model-selector: could not persist a probe verdict (${error?.message ?? error})`)
          }
        }
      }
    })
    await Promise.all(workers)
    state = { ...state, running: false }
    controller = null
  }

  function stop() {
    controller?.abort(new Error('sweep stopped'))
    state = { ...state, running: false }
    return status()
  }

  function status() {
    return {
      running: state.running, total: state.total, done: state.done,
      error: state.error, startedAt: state.startedAt, results: state.results,
    }
  }

  return { start, stop, status }
}

/** The gateway's own words for a refusal, which is where the verdict lives. */
async function readError(response) {
  try {
    const payload = await response.json()
    const message = payload?.error?.message ?? payload?.error?.code
    if (typeof message === 'string' && message !== '') return message
  } catch {
    // A non-JSON body still has a status worth reporting.
  }
  return `${response.status} ${response.statusText}`.trim()
}
