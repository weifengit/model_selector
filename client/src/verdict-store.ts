/**
 * Model Selector — the one verdict table.
 *
 * The picker shows a per-model answer, and it must come from one table folded
 * by one rule, or two surfaces could disagree about the same model.
 *
 * The table is folded from three readings, strongest last:
 *
 * - the free lane's own roster (`/summary`) — a probe the lane ran, or a
 *   listing that merely named the model;
 * - this plugin's cache (`~/.dsh/model-selector/verdicts.json`) — a probe it
 *   paid a real request for, which a reload must not spend twice;
 * - a probe that landed during this page's lifetime, so the open picker
 *   updates mid-sweep without waiting for the cache write to be read back.
 *
 * Reading lives here rather than in the picker, so the picker owns no fetching
 * of its own and mounting order does not matter. Published identity only
 * changes when an answer does, so the picker's subscription is quiet between
 * polls.
 *
 * @module client/src/verdict-store.ts
 */

import { useSyncExternalStore } from 'react'
import { readLaneModels, readVerdictCache } from './data.ts'
import type { CachedProbe, ModelRow } from './data.ts'
import { bestVerdict, cachedLaneVerdict, cachedVerdict, freshestVerdict, laneVerdict, normalise } from './verdicts.ts'
import type { Verdict } from './verdicts.ts'

/** The published table until the first read lands. */
const EMPTY: Readonly<Record<string, Verdict>> = Object.freeze({})

/** How recent a read has to be before a second ask is not worth a request. */
const MIN_READ_GAP_MS = 5_000

/** The lane's roster, as last read. */
let laneRows: readonly ModelRow[] = []

/** This plugin's cached probes, keyed by probe id. */
let cache: Readonly<Record<string, CachedProbe>> = {}

/** Probes that landed in this page's lifetime, keyed by probe id. */
let probes: Readonly<Record<string, Verdict>> = {}

/** The folded table the picker renders. */
let snapshot: Readonly<Record<string, Verdict>> = EMPTY

const listeners = new Set<() => void>()

/** The read in flight, shared so two mounts cost one request. */
let inflight: Promise<void> | null = null

/** When the last read landed. */
let lastReadAt = 0

/**
 * Fold the three readings into one table.
 *
 * The order is the precedence: the lane names a model, the cache answers for
 * it, and a probe taken this session beats both — which is why a sweep's
 * verdict shows up while its write is still in flight.
 */
function fold(): Record<string, Verdict> {
  const table: Record<string, Verdict> = {}
  for (const row of laneRows) {
    // A lane model is addressed bare by the sweep but prefixed by the cache,
    // so every key that answers for it is considered, not just row.id. The
    // row's own id counts too: a picker row may carry the prefixed spelling,
    // and a per-row probe stores its answer under exactly that key — dropping
    // it here would make a hand-probed model read as untested again after a
    // reload, while the vendor rows (keyed only by the cache) kept theirs.
    const cached = freshestVerdict(cachedVerdict(cache, row.id), cachedLaneVerdict(cache, row.id))
    table[row.id] = bestVerdict(laneVerdict(row), cached)
  }
  // Vendor models live only in the cache: the lane's roster does not know them,
  // and the sweep's key for them is `provider/model`.
  for (const key of Object.keys(cache)) {
    if (table[key] !== undefined) continue
    const fresh = cachedVerdict(cache, key)
    if (fresh !== undefined) table[key] = fresh
  }
  for (const [key, verdict] of Object.entries(probes)) table[key] = verdict
  return table
}

/** Whether two tables say the same thing, so a publish can be skipped. */
function sameAnswers(a: Readonly<Record<string, Verdict>>, b: Readonly<Record<string, Verdict>>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  for (const key of keys) {
    const left = a[key]
    const right = b[key]
    if (right === undefined) return false
    if (left.state !== right.state || left.at !== right.at || left.detail !== right.detail) return false
  }
  return true
}

/**
 * Whether two rosters say the same thing, so a publish can be skipped.
 *
 * @param a - the roster being replaced.
 * @param b - the roster being published.
 * @returns whether they agree.
 */
function sameRoster(a: readonly ModelRow[], b: readonly ModelRow[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (right === undefined) return false
    if (left.id !== right.id || left.availability !== right.availability) return false
    if (left.availabilitySource !== right.availabilitySource || left.probedAt !== right.probedAt) return false
    if (left.hiddenByUser !== right.hiddenByUser || left.detail !== right.detail) return false
  }
  return true
}

/** Refold and publish, unless nothing changed. */
function reflow(): void {
  const next = fold()
  if (sameAnswers(snapshot, next)) return
  snapshot = next
  for (const listener of listeners) listener()
}

/**
 * Take the lane roster from a caller that already read it.
 *
 * @param rows - the roster's per-model rows.
 */
export function publishLaneModels(rows: readonly ModelRow[]): void {
  // An empty roster is a failed read far more often than a lane with no models:
  // taking that as truth would wipe every lane row the picker draws its dots
  // from, which is what made them appear for a moment and then vanish.
  if (rows.length === 0 && laneRows.length > 0) return
  // Two callers publish this table — the picker's own read and any other
  // mounted surface — so an identical roster must not count as news.
  if (sameRoster(laneRows, rows)) return
  laneRows = rows
  reflow()
}

/** The table as it reads now, for code outside a render. */
export function getVerdicts(): Readonly<Record<string, Verdict>> {
  return snapshot
}

/** The cached probes as they read now, for the sweep's plan. */
export function getCache(): Readonly<Record<string, CachedProbe>> {
  return cache
}

/**
 * Read the roster and the cache, then publish.
 *
 * Only what is missing is read: a surface that published the roster already
 * means this asks for the cache alone, and a store with neither asks for both.
 *
 * @param force - read even when a read just landed. A sweep finishing uses
 *   this: its verdicts are on the Host by then, and the answer must not be
 *   served from the gap rule.
 * @returns the shared read.
 */
export function refreshReadings(force = false): Promise<void> {
  if (inflight !== null) return inflight
  if (!force && Date.now() - lastReadAt < MIN_READ_GAP_MS) return Promise.resolve()
  // Everything is re-read every time, not just what is missing.
  //
  // This used to skip the roster once it had arrived, and to replace the whole
  // cache with whatever the read returned. Both are wrong for the surfaces
  // that read this table: a roster that is never re-read cannot follow the lane
  // as it recovers, and a read that fails or comes back partial does not just
  // say "nothing new" — it deletes answers that were already there, so the
  // picker's dots flick on and then vanish.
  inflight = Promise.all([
    readLaneModels().catch((): ModelRow[] | undefined => undefined),
    readVerdictCache().catch((): Record<string, CachedProbe> | undefined => undefined),
  ])
    .then(([rows, stored]) => {
      // A failed roster read keeps the roster we already have.
      if (rows !== undefined && rows.length > 0) laneRows = rows
      // A failed or empty cache read keeps the probes we already have; a good
      // one merges, so a key the Host no longer reports does not silently
      // delete a verdict this page already showed.
      if (stored !== undefined && Object.keys(stored).length > 0) {
        cache = { ...cache, ...stored }
      }
      lastReadAt = Date.now()
      reflow()
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/**
 * Fold the verdicts of probes that just landed.
 *
 * The Host persists each one as it lands; folding them in here as well keeps
 * the open picker honest mid-sweep without a second read.
 *
 * @param landed - the sweep's answers, keyed by probe id.
 */
export function recordProbes(landed: Readonly<Record<string, { state: string, detail: string, at: number }>>): void {
  const next: Record<string, Verdict> = { ...probes }
  for (const [key, row] of Object.entries(landed)) {
    // An unknown is not an answer: recording it would overwrite a verdict a
    // later read could still supply.
    if (row.state === 'unknown') continue
    next[key] = { state: normalise(row.state), source: 'gateway-probe', detail: row.detail, at: row.at }
  }
  probes = next
  reflow()
}

/**
 * Subscribe to table changes.
 *
 * @param fn - the change callback.
 * @returns the unsubscribe.
 */
export function subscribeVerdicts(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** The published table, unchanged until an answer changes. */
export function verdictSnapshot(): Readonly<Record<string, Verdict>> {
  return snapshot
}

/**
 * The verdict table, as a React hook.
 *
 * @returns the table, keyed by probe id.
 */
export function useVerdicts(): Readonly<Record<string, Verdict>> {
  return useSyncExternalStore(subscribeVerdicts, verdictSnapshot)
}
