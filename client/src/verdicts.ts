/**
 * Model Selector — per-model verdicts.
 *
 * The picker answers one question per model: *can this model answer a turn
 * right now?* Three readings contribute, and they are not equally strong:
 *
 * - the free lane's own verdict (`availability` on `/summary`) — a probe the
 *   lane already ran, or a listing that merely named the model;
 * - this plugin's cache (`~/.dsh/model-selector/verdicts.json`) — a probe the
 *   picker ran through the channel gateway, which the lane knows nothing
 *   about;
 * - nothing — an unknown, which is a question, not an answer.
 *
 * The rule the picker applies: a negative verdict hides the model, an unknown
 * is probed, and only a positive one earns a place in the picker. "Listing
 * named it" is not evidence of usability — the lane's own docs say a flat id
 * list discloses nothing about egress.
 *
 * @module client/src/verdicts.ts
 */

import { isLaneRoute } from './data.ts'
import type { CachedProbe } from './data.ts'

/** What is known about one model, at the granularity of a single model. */
export type VerdictState =
  | 'available'
  | 'region-blocked'
  | 'unavailable'
  | 'throttled'
  | 'no-credit'
  | 'no-credential'
  | 'unknown'

/** Where a verdict came from, for the picker's "why" tooltip. */
export type VerdictSource = 'lane-probe' | 'lane-manual' | 'gateway-probe' | 'listing' | 'none'

export interface Verdict {
  readonly state: VerdictState
  readonly source: VerdictSource
  readonly detail: string
  /** When the reading was taken; 0 when the source never timed it. */
  readonly at: number
}

/** The verdicts the picker can act on without a fresh probe. */
export const POSITIVE: VerdictState = 'available'

/** The verdicts that mean "this model cannot answer a turn". */
const NEGATIVE = new Set<VerdictState>([
  'region-blocked', 'unavailable', 'throttled', 'no-credit', 'no-credential',
])

/**
 * How long a stored verdict is trusted, by what it says.
 *
 * A lane verdict is the Host's own and never expires here (the lane re-probes
 * on its own cadence and on an egress change). A gateway probe is this
 * plugin's sample against a paid account: a refusal is cheap to keep — it
 * costs nothing to leave a model out and the reason rarely flips within an
 * hour — while a positive is the one that goes stale (a free tier refills, a
 * balance empties), so it is re-asked sooner.
 */
export function probeTtl(state: VerdictState): number {
  return state === 'available' ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000
}

/** Whether a verdict says the model works. */
export function isUsable(verdict: Verdict): boolean {
  return verdict.state === POSITIVE
}

/** Whether a verdict says the model does not work — and should not be shown. */
export function isRefused(verdict: Verdict): boolean {
  return NEGATIVE.has(verdict.state)
}

/**
 * Whether a verdict is a fact about the *vendor* rather than the model.
 *
 * "No credential configured" answers every model of that vendor the same way,
 * so a sweep that sees it once can stop spending requests on the rest.
 */
export function isVendorFault(state: VerdictState): boolean {
  return state === 'no-credential' || state === 'no-credit'
}

/** Whether the picker should spend a probe on this model. */
export function needsProbe(verdict: Verdict): boolean {
  return verdict.state === 'unknown'
}

/**
 * Fold the lane's own row into a verdict.
 *
 * `availabilitySource` distinguishes the two kinds of "the lane named it": a
 * probe/manual sample is an answer, a listing is not. A listing-sourced
 * `available` would be the lane saying it *advertises* the model, which is what
 * the picker already knew.
 */
export function laneVerdict(row: {
  availability?: string
  availabilitySource?: string
  detail?: string
  probedAt?: number
}): Verdict {
  const state = normalise(row.availability)
  const source = row.availabilitySource
  if (source === 'manual') return { state, source: 'lane-manual', detail: row.detail ?? '', at: row.probedAt ?? 0 }
  if (source === 'probe') return { state, source: 'lane-probe', detail: row.detail ?? '', at: row.probedAt ?? 0 }
  // A listing never answers: an unknown stays unknown, and a verdict the lane
  // reached by probing keeps its weight (the lane only probes what it can).
  if (state === 'unknown') return { state: 'unknown', source: 'listing', detail: row.detail ?? '', at: 0 }
  return { state, source: 'lane-probe', detail: row.detail ?? '', at: row.probedAt ?? 0 }
}

/**
 * Read a cached probe, honouring the TTL.
 *
 * @param cache - the Host's stored verdicts, keyed by probe id.
 * @param id - the probe id (a lane model id, or `provider/model` for a vendor model).
 * @param now - the clock, injectable for tests.
 */
export function cachedVerdict(
  cache: Readonly<Record<string, CachedProbe>>,
  id: string,
  now: number = Date.now(),
): Verdict | undefined {
  const row = cache[id]
  if (row === undefined) return undefined
  if (row.at <= 0 || now - row.at > probeTtl(row.state as VerdictState)) return undefined
  return { state: row.state as VerdictState, source: 'gateway-probe', detail: row.detail, at: row.at }
}

/**
 * The strongest verdict available for one model.
 *
 * A cache probe beats a listing (it is a real answer this plugin paid for), and
 * the freshest answer beats the staler one when both exist.
 */
export function bestVerdict(lane: Verdict | undefined, cached: Verdict | undefined): Verdict {
  if (lane === undefined && cached === undefined) return { state: 'unknown', source: 'none', detail: '', at: 0 }
  if (lane === undefined) return cached as Verdict
  if (cached === undefined) return lane
  // The lane's own probe is a sample against the free gateway; a cache probe is
  // a sample against the vendor's. They answer different questions, so the
  // fresher wins, and a positive beats a negative at equal age.
  if (cached.at > lane.at) return cached
  if (lane.at > cached.at) return lane
  return isUsable(lane) ? lane : cached
}

/**
 * The fresher of two optional cached verdicts.
 *
 * A lane row can be answered by more than one cache key: the row's own id
 * (when the picker names a model by its prefixed spelling, which a per-row
 * probe stores under) and any `…/` + id key (the lane's own addressing). They
 * are two readings of the same model, so the fresher one is the answer.
 *
 * @param a - one candidate, or undefined.
 * @param b - the other candidate, or undefined.
 * @returns the fresher candidate, or undefined when neither exists.
 */
export function freshestVerdict(
  a: Verdict | undefined,
  b: Verdict | undefined,
): Verdict | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return b.at > a.at ? b : a
}

/** The id a vendor model is probed and cached under. */
export function probeKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`
}

/**
 * The probe key for one picker row.
 *
 * The picker groups models by provider route; the probe keys this plugin
 * stores are addressed differently per route, because the lane and the Channel
 * Pack learn about a model in two different ways:
 *
 * - the free lane publishes its own roster (`/summary`): a row's `id` is the
 *   key the lane's probe already uses, and the gateway forwards it under the
 *   provider route alone (`our-free-model/<id>`). The lane publishes two
 *   routes — the usable set and the region-gated one — and both carry the same
 *   ids;
 * - every other route is a Channel Pack vendor: its models are keyed
 *   `provider/model`, which is exactly what the sweep probes and the cache
 *   stores.
 *
 * A model this mapping cannot address is *unknown*, not available: an unknown
 * is a question the sweep can still answer, while a wrong key would read as
 * "no verdict" forever and quietly disguise a refusal.
 *
 * @param provider - the provider group's id.
 * @param model - the model's provider-owned id.
 * @returns the key the verdict table and the verdict cache use.
 */
export function pickerProbeKey(provider: string, model: string): string {
  return isLaneRoute(provider) ? model : probeKey(provider, model)
}

/**
 * The cache keys that answer for one lane model.
 *
 * The free lane's roster names a model bare (`flint-40b-free`), but the
 * availability cache stores it under the provider prefix the probing door knew
 * (`opencode/flint-40b-free`) — sometimes two levels deep
 * (`cline/reflection/beam-free`). Enumerating prefixes cannot work: they come
 * from the pack and change with it. What does hold is the tail, so a key
 * answers for this model when it ends in `/` + the id.
 *
 * @param cache - the stored probes.
 * @param modelId - the lane model's bare id.
 * @returns the answering keys, shortest prefix first.
 */
export function laneCacheKeys(
  cache: Readonly<Record<string, unknown>>,
  modelId: string,
): string[] {
  const suffix = `/${modelId}`
  return Object.keys(cache)
    .filter((key) => key !== modelId && key.endsWith(suffix))
    .sort((a, b) => a.length - b.length)
}

/**
 * The best stored answer for one lane model, across every key that addresses it.
 *
 * @param cache - the stored probes.
 * @param modelId - the lane model's bare id.
 * @param now - the clock, for the TTL rule.
 * @returns the freshest acceptable verdict, or undefined.
 */
export function cachedLaneVerdict(
  cache: Readonly<Record<string, CachedProbe>>,
  modelId: string,
  now: number = Date.now(),
): Verdict | undefined {
  for (const key of laneCacheKeys(cache, modelId)) {
    const verdict = cachedVerdict(cache, key, now)
    if (verdict !== undefined) return verdict
  }
  return undefined
}

/**
 * Which of a vendor's picker models must leave the picker.
 *
 * The rule the switch and the picker both read, so the number the user is
 * offered and the models that actually go are the same set:
 *
 * - a vendor that cannot serve at all (not connected, no credit) dooms every
 *   one of its models — that is a vendor-level fact, already read once;
 * - otherwise a model is doomed only by a verdict that refused it. An
 *   untested model stays: hiding on an unknown would take away models that
 *   work, and the whole point of the probe is that unknown is a question.
 */
export function doomedModelIds(
  provider: string,
  models: readonly { id: string, disabled: boolean, dead: boolean }[],
  verdicts: Readonly<Record<string, Verdict>>,
  vendorUnusable: boolean,
): string[] {
  const visible = models.filter(model => !model.disabled && !model.dead)
  if (vendorUnusable) return visible.map(model => model.id)
  return visible
    .filter(model => {
      const verdict = verdicts[probeKey(provider, model.id)]
      return verdict !== undefined && (isRefused(verdict) || isVendorFault(verdict.state))
    })
    .map(model => model.id)
}

/** Coerce anything the lane or the cache says into a known state. */
export function normalise(value: string | undefined): VerdictState {
  switch (value) {
    case 'available': return 'available'
    case 'region-blocked': return 'region-blocked'
    case 'unavailable': return 'unavailable'
    case 'throttled': return 'throttled'
    case 'no-credit': return 'no-credit'
    case 'no-credential': return 'no-credential'
    default: return 'unknown'
  }
}
