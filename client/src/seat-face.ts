/**
 * Model Selector — the seat's directory face.
 *
 * The shell hands the composer model seat its directory through the slot's
 * `inject` factory. That factory runs once per session binding and its result
 * is cached for that binding's lifetime, so an exception there is not a
 * transient render hiccup: the slot boundary reports it, the shell *abdicates*
 * the entry, and the seat stays retired until the page reloads. Anything that
 * factory throws therefore erases the whole feature — balances, availability
 * dots, cleanup and probe controls — and no re-render brings it back.
 *
 * Resolving the per-session directory can legitimately fail while a session's
 * scope and binding are still being created, so this module defers that
 * resolution instead of performing it eagerly: the seat renders an empty
 * directory at once, retries quietly, and swaps in the real store when it
 * lands. A failure degrades the seat to "loading" rather than retiring it.
 *
 * @module client/src/seat-face.ts
 */

import type {
  ModelDirectorySnapshot,
  ModelDirectoryStore,
  ModelSelection,
  ModelSelectionResult,
} from './domain.ts'

/** What the seat renders before the real directory resolves. */
const PENDING: ModelDirectorySnapshot = Object.freeze({
  current: null,
  routable: null,
  groups: [],
  failures: [],
  status: 'loading',
  pending: null,
  error: null,
})

/** How long to wait between resolution attempts, in ms. */
export const RETRY_DELAY_MS = 400

/** How many resolution attempts the seat makes before it stops retrying. */
export const RETRY_ATTEMPTS = 25

/** The shell's directory, as the seat's factory resolves it. */
export interface ResolvedDirectory {
  readonly store: ModelDirectoryStore
  readonly load: () => Promise<unknown>
  readonly select: (selection: ModelSelection) => Promise<ModelSelectionResult | undefined>
}

/** The injected face the composer seat component receives. */
export interface SeatDirectoryFace {
  /** Whether this session may inspect and select a model at all. */
  readonly available: boolean
  readonly directory: ModelDirectoryStore
  readonly load: () => void
  readonly select: (selection: ModelSelection) => Promise<ModelSelectionResult | undefined>
  /** Release the retry and the adopted store's subscription. */
  readonly dispose: () => void
}

/** Inputs for {@link createSeatFace}. */
export interface SeatFaceOptions {
  /** Whether this session may inspect and select a model at all. */
  readonly available: boolean
  /** Resolve the shell's directory; may throw while the session is still binding. */
  readonly resolve: () => ResolvedDirectory
  /** Delay between attempts, in ms. */
  readonly retryDelayMs?: number
  /** Attempts before the seat settles on the pending face. */
  readonly retryAttempts?: number
  /** Timer used for the retry, injectable so the retry rule can be checked. */
  readonly schedule?: (run: () => void, delayMs: number) => unknown
}

/**
 * A store that starts empty and adopts the real directory when it resolves.
 *
 * Subscriptions live here rather than on the adopted store, so a component
 * that mounted during the pending window still hears the swap: React hands the
 * seat one `subscribe` per mount, and this keeps that surface stable while the
 * real store underneath changes.
 */
class DeferredDirectory implements ModelDirectoryStore {
  private real: ModelDirectoryStore | undefined
  private readonly listeners = new Set<() => void>()
  private detachReal: (() => void) | undefined

  /** Adopt the real store and re-notify everyone that mounted before it. */
  attach(real: ModelDirectoryStore): void {
    if (this.real !== undefined) return
    this.real = real
    this.detachReal = real.subscribe(() => this.notify())
    this.notify()
  }

  getSnapshot(): ModelDirectorySnapshot {
    return this.real?.getSnapshot() ?? PENDING
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Stop listening to the adopted store. */
  dispose(): void {
    this.detachReal?.()
    this.detachReal = undefined
    this.listeners.clear()
    this.real = undefined
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

/** The default retry timer: a window timeout, which is present in the shell. */
function windowSchedule(run: () => void, delayMs: number): unknown {
  return window.setTimeout(run, delayMs)
}

/** Cancel a handle the schedule produced, when the runtime has a timer to clear. */
function cancelSchedule(handle: unknown): void {
  if (handle === undefined || handle === null) return
  if (typeof window !== 'undefined') window.clearTimeout(handle as number)
}

/**
 * Build the seat's directory face, resolving the directory lazily.
 *
 * @param options - the availability flag, the resolver, and the retry rule.
 * @returns the face the composer seat component reads.
 */
export function createSeatFace(options: SeatFaceOptions): SeatDirectoryFace {
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS
  const retryAttempts = options.retryAttempts ?? RETRY_ATTEMPTS
  const schedule = options.schedule ?? windowSchedule
  const directory = new DeferredDirectory()
  let resolved: ResolvedDirectory | undefined
  let pendingLoad = false
  let disposed = false
  let attempts = 0
  let timer: unknown

  const attempt = (): void => {
    // A timer that fires after the seat unmounted must not resolve into a
    // disposed face.
    if (disposed || resolved !== undefined) return
    attempts += 1
    try {
      const next = options.resolve()
      resolved = next
      directory.attach(next.store)
      if (pendingLoad) {
        pendingLoad = false
        next.load().catch(() => {})
      }
      return
    } catch {
      // A session that is not bound yet is a timing fact, not a verdict about
      // the seat: keep the face and try again rather than retire the entry.
      resolved = undefined
    }
    if (attempts >= retryAttempts) return
    timer = schedule(attempt, retryDelayMs)
  }

  attempt()

  return {
    available: options.available,
    directory,
    load: () => {
      if (!options.available) return
      if (resolved === undefined) {
        pendingLoad = true
        return
      }
      resolved.load().catch(() => {})
    },
    select: (selection: ModelSelection) => {
      if (!options.available || resolved === undefined) return Promise.resolve(undefined)
      return resolved.select(selection)
    },
    // The seat unmounts with its session; the retry and the adopted store's
    // subscription both stop here so a retired binding leaves nothing running.
    dispose: () => {
      disposed = true
      cancelSchedule(timer)
      timer = undefined
      directory.dispose()
      resolved = undefined
    },
  }
}
