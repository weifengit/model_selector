/**
 * Model Selector — the availability sweep.
 *
 * Decides *what is worth asking*. A probe costs a real request, so the plan is
 * built from what is already known and only ever asks about a model that is
 * both in the picker and unanswered:
 *
 * - a model the user (or the switch) already hid is not shown, so it needs no
 *   verdict and gets no request;
 * - a model the lane already answered — by probe or by a manual sample — keeps
 *   that answer; the lane re-probes on its own cadence;
 * - a model this plugin probed within the cache's TTL keeps that answer too;
 * - a vendor whose credential is missing answers every one of its models the
 *   same way, so the sweep spends one request on it, not forty.
 *
 * The plan is a list of probe keys; the cache is keyed by the same strings, so
 * a lane model (`flint-40b-free`) and a vendor model (`trae/glm-5.3-flash`)
 * live in one table without pretending they are the same kind of thing.
 *
 * @module client/src/sweep.ts
 */

import { isVendorFault, probeKey, probeTtl } from './verdicts.ts'
import type { Verdict, VerdictState } from './verdicts.ts'
import type { CachedProbe } from './data.ts'

/** The lane's own catalog row, as far as the sweep reads it. */
export interface LaneRow {
  readonly id: string
  readonly name: string
  readonly availability: string
  readonly availabilitySource: string
  readonly detail: string
  readonly probedAt: number
  readonly hiddenByUser: boolean
}

/** One vendor's live models, as the pack reports them. */
export interface VendorModelEntry {
  readonly id: string
  readonly name: string
  readonly disabled: boolean
  readonly dead: boolean
}

/** A model the sweep wants an answer for. */
export interface ProbeTarget {
  /** The cache key: the lane id, or `provider/model` for a vendor's model. */
  readonly key: string
  /** The vendor id, or '' for a lane model. */
  readonly provider: string
  /** The name the picker shows beside the verdict. */
  readonly label: string
  /** The id the gateway addresses this model by. */
  readonly modelId: string
}

/** The lane's prefix on the channels' gateway. */
export const LANE_GATEWAY_PREFIX = 'our-free-model/'

/** How many probes one sweep may spend at most. */
export const MAX_SWEEP = 240

/**
 * The gateway model id for one probe key.
 *
 * A vendor model is addressed as `provider/model`; a lane model needs the
 * gateway's own prefix, because on the door the lane is one provider among the
 * pack's.
 */
export function gatewayModelId(key: string, provider: string): string {
  return provider === '' ? `${LANE_GATEWAY_PREFIX}${key}` : key
}

/**
 * The probe target for one picker row.
 *
 * The full sweep plans itself from the readings, but a per-row probe is
 * launched from a *picker row* — the place the user is pointing at — so the
 * mapping from (group id, model id) to a target has to live somewhere both
 * paths share. It sits beside {@link gatewayModelId} for exactly that reason:
 * the two paths must agree on the keys the verdict table stores, or a model
 * probed by hand would still read as untested and be asked again.
 *
 * @param provider - the picker group's id (a lane route or a vendor id).
 * @param modelId - the model's provider-owned id.
 * @param label - the name the picker shows beside the verdict.
 * @param lane - whether this row is a free-lane model.
 * @returns the target to probe.
 */
export function targetFor(
  provider: string,
  modelId: string,
  label: string,
  lane: boolean,
): ProbeTarget {
  const key = lane ? modelId : probeKey(provider, modelId)
  return {
    key,
    provider: lane ? '' : provider,
    label,
    modelId: gatewayModelId(key, lane ? '' : provider),
  }
}

/**
 * Build the sweep's plan.
 *
 * @param lane - the free lane's catalog.
 * @param vendorModels - each vendor's live model list, by vendor id.
 * @param cache - the Host's stored verdicts.
 * @param verdicts - the folded verdict per probe key, from the reading.
 * @param now - the clock, for the cache's TTL.
 * @returns the targets, in probe order: lane first (cheap, and the picker's
 *   own list), then vendors by id.
 */
export function planSweep(
  lane: readonly LaneRow[],
  vendorModels: Readonly<Record<string, readonly VendorModelEntry[]>>,
  cache: Readonly<Record<string, CachedProbe>>,
  verdicts: Readonly<Record<string, Verdict>>,
  now: number = Date.now(),
): ProbeTarget[] {
  const targets: ProbeTarget[] = []
  for (const row of lane) {
    if (row.hiddenByUser === true) continue
    if (!needsAsking(row.id, verdicts, cache, now)) continue
    targets.push({
      key: row.id,
      provider: '',
      label: row.name,
      modelId: gatewayModelId(row.id, ''),
    })
  }
  for (const [provider, models] of Object.entries(vendorModels)) {
    // A vendor whose credential is missing has already answered: every one of
    // its models is unusable for the same reason, and asking again costs credit
    // to learn nothing.
    if (vendorFaulted(provider, models, verdicts)) continue
    for (const model of models) {
      if (model.disabled === true || model.dead === true) continue
      const key = probeKey(provider, model.id)
      if (!needsAsking(key, verdicts, cache, now)) continue
      targets.push({
        key,
        provider,
        label: model.name,
        modelId: gatewayModelId(key, provider),
      })
    }
  }
  return targets.slice(0, MAX_SWEEP)
}

/** Whether the sweep still has to ask about this model. */
function needsAsking(
  key: string,
  verdicts: Readonly<Record<string, Verdict>>,
  cache: Readonly<Record<string, CachedProbe>>,
  now: number,
): boolean {
  const verdict = verdicts[key]
  if (verdict !== undefined && verdict.state !== 'unknown') return false
  const stored = cache[key]
  if (stored !== undefined && stored.at > 0 && now - stored.at <= probeTtl(stored.state as VerdictState)) return false
  return true
}

/** Whether every model of this vendor already carries the same vendor-level fault. */
function vendorFaulted(
  provider: string,
  models: readonly VendorModelEntry[],
  verdicts: Readonly<Record<string, Verdict>>,
): boolean {
  for (const model of models) {
    if (model.disabled === true || model.dead === true) continue
    const verdict = verdicts[probeKey(provider, model.id)]
    if (verdict !== undefined && isVendorFault(verdict.state)) return true
  }
  return false
}
