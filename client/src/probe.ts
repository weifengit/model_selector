/**
 * Model Selector — asking the Host to probe models.
 *
 * The asking itself happens on the Host (`src/gateway.js`): a probe needs the
 * channel gateway's key, and a secret that can spend the user's credit has no
 * business in the page. What lives here is the browser's side of that — read
 * the gateway's port, hand the Host a plan, poll until it is done.
 *
 * The port comes from the free-model plugin's own status route, which is not a
 * secret; the key never crosses this boundary.
 *
 * @module client/src/probe.ts
 */

import { OFM_API, OWN_API } from './data.ts'

/** How often the sweep's progress is polled, in ms. */
export const SWEEP_POLL_MS = 1_500

/** One verdict as the Host's sweep reports it. */
export interface SweepVerdict {
  readonly state: string
  readonly detail: string
  readonly at: number
}

/** The sweep's status, as the Host answers it. */
export interface SweepStatus {
  readonly running: boolean
  readonly total: number
  readonly done: number
  readonly error: string
  readonly startedAt: number
  readonly results: Readonly<Record<string, SweepVerdict>>
}

/** The probe key paired with the gateway's own model id. */
export interface SweepTarget {
  readonly key: string
  readonly modelId: string
}

/**
 * The gateway's loopback port, as the free-model plugin reports it.
 *
 * @returns the port, or 0 when this host does not run one.
 */
export async function readGatewayPort(signal?: AbortSignal): Promise<number> {
  try {
    const response = await fetch(`${OFM_API}/chan-gateway`, {
      headers: { accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    })
    if (!response.ok) return 0
    const payload = await response.json() as { gateway?: { port?: number } }
    const port = Number(payload.gateway?.port ?? 0)
    return Number.isInteger(port) && port > 0 ? port : 0
  } catch {
    return 0
  }
}

/**
 * Hand the plan to the Host and follow it until it finishes.
 *
 * @param port - the gateway's port.
 * @param targets - what to ask, each with its cache key and gateway model id.
 * @param options - cancellation and the progress hook.
 * @returns the verdicts the sweep landed, keyed by probe key.
 */
export async function runSweep(
  port: number,
  targets: readonly SweepTarget[],
  { signal, onProgress }: {
    signal?: AbortSignal
    onProgress?: (status: SweepStatus) => void
  } = {},
): Promise<{ verdicts: Record<string, SweepVerdict>, error: string }> {
  const started = await postSweep({ port, targets }, signal)
  if (started === null) return { verdicts: {}, error: 'sweep-request-failed' }
  onProgress?.(started)
  if (started.error !== '') return { verdicts: {}, error: started.error }
  if (started.total === 0) return { verdicts: {}, error: '' }

  // Poll, not push: the sweep is a handful of minutes at worst, and a poll the
  // page can drop when it is hidden costs nothing it cannot make up later.
  let status = started
  while (status.running) {
    if (signal?.aborted === true) {
      await stopSweep(signal)
      break
    }
    await delay(SWEEP_POLL_MS, signal)
    const next = await getSweep(signal)
    if (next === null) break
    status = next
    onProgress?.(status)
  }
  return { verdicts: { ...status.results }, error: status.error }
}

/** Ask the Host to start a sweep. */
async function postSweep(plan: { port: number, targets: readonly SweepTarget[] }, signal?: AbortSignal) {
  return request('/sweep', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(plan),
    ...(signal === undefined ? {} : { signal }),
  })
}

/** Read the running sweep's progress. */
async function getSweep(signal?: AbortSignal) {
  return request('/sweep', {
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
}

/** Stop the sweep. A stop is a user action, so its abort is not a verdict. */
async function stopSweep(signal?: AbortSignal) {
  return request('/sweep/stop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
}

async function request(path: string, init: RequestInit): Promise<SweepStatus | null> {
  try {
    const response = await fetch(`${OWN_API}${path}`, init)
    if (!response.ok) return null
    const payload = await response.json() as Partial<SweepStatus>
    return {
      running: payload.running === true,
      total: Number(payload.total ?? 0),
      done: Number(payload.done ?? 0),
      error: String(payload.error ?? ''),
      startedAt: Number(payload.startedAt ?? 0),
      results: payload.results ?? {},
    }
  } catch {
    return null
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(done, ms)
    function done() {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      clearTimeout(timer)
      done()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
