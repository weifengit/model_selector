/**
 * Model Selector — the feature's state.
 *
 * The hook that owns everything the model list needs: the vendor readings, the
 * per-model verdicts, the probe sweep, and the cleanup switch.
 *
 * It lives apart from the view so the switch and the sweep have one source of
 * truth: the number the picker offers and the models that actually leave the
 * picker are read from the same rule.
 *
 * @module client/src/use-model-selector.ts
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  readSwitch, writeSwitch, setVendorModelsDisabled, readVendorModels, readVendors,
  readLaneModels,
} from './data.ts'
import type { ModelRow, SwitchState } from './data.ts'
import type { VendorRow } from './domain.ts'
import { doomedModelIds } from './verdicts.ts'
import type { Verdict } from './verdicts.ts'
import { readGatewayPort, runSweep as hostSweep } from './probe.ts'
import { MAX_SWEEP, planSweep, targetFor } from './sweep.ts'
import type { ProbeTarget, VendorModelEntry } from './sweep.ts'

import { getCache, getVerdicts, publishLaneModels, recordProbes, refreshReadings, useVerdicts } from './verdict-store.ts'

/** How often the readings are refreshed, in ms. */
export const POLL_MS = 90_000

/** What the model list exposes. */
export interface ModelSelectorState {
  /** The vendor rows from the latest reading. */
  readonly vendors: readonly VendorRow[]
  /** The lane's roster, as last read. */
  readonly laneModels: readonly ModelRow[]
  /** Whether a reading is in flight. */
  readonly loading: boolean
  /** The error of the last reading. */
  readonly error: string
  /** Whether the cleanup switch is on. */
  readonly switchOn: boolean
  /** Whether the switch is mid-flight. */
  readonly switchPending: boolean
  /** Ask for a fresh reading. */
  readonly refresh: () => void
  /** Turn the cleanup switch on or off. */
  readonly setSwitch: (on: boolean) => Promise<void>
  /** The per-model verdicts, keyed by probe key. */
  readonly verdicts: Readonly<Record<string, Verdict>>
  /** Whether a probe sweep is running. */
  readonly sweeping: boolean
  /** How far the running sweep has got. */
  readonly sweepProgress: { done: number, total: number }
  /** What the last sweep could not answer, for the picker's line. */
  readonly sweepError: string
  /** Probe every model still without a verdict. */
  readonly runSweep: () => Promise<void>
  /** Stop the running sweep. */
  readonly stopSweep: () => void
  /** Which probe targets are mid-flight, keyed by probe key. */
  readonly probingKeys: ReadonlySet<string>
  /** Which vendor ids are mid-flight, for the vendor header's own state. */
  readonly probingGroups: ReadonlySet<string>
  /** Probe exactly these picker rows, and nothing else. */
  readonly probeTargets: (targets: readonly ProbeTarget[]) => Promise<void>
  /** Probe every pickable model of one vendor group. */
  readonly probeGroup: (provider: string, models: readonly { id: string, name: string }[], lane: boolean) => Promise<void>
}

/**
 * The model list's state.
 *
 * @returns the state.
 */
export function useModelSelector(): ModelSelectorState {
  const [vendors, setVendors] = useState<readonly VendorRow[]>([])
  const [laneModels, setLaneModels] = useState<readonly ModelRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [switchOn, setSwitchOn] = useState(false)
  const [switchPending, setSwitchPending] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  const [sweepProgress, setSweepProgress] = useState({ done: 0, total: 0 })
  const [sweepError, setSweepError] = useState('')
  const mounted = useRef(true)
  const vendorsRef = useRef<readonly VendorRow[]>([])
  const hiddenRef = useRef<string[]>([])
  const sweepRef = useRef<AbortController | null>(null)
  // The running probe's shape, kept in a ref as well as in state: an event
  // handler needs the current sets without waiting for a re-render.
  const probingRef = useRef<{ readonly keys: Set<string>, readonly groups: Map<string, number> }>({ keys: new Set(), groups: new Map() })
  const [probingKeys, setProbingKeys] = useState<ReadonlySet<string>>(probingRef.current.keys)
  const [probingGroups, setProbingGroups] = useState<ReadonlySet<string>>(new Set())

  // ── the verdict table ─────────────────────────────────────────────────────
  // The answers live in the shared store, so the picker's dots and the
  // switch's decisions cannot disagree. This hook publishes the roster it
  // reads and folds the sweep's landings in.
  const verdicts = useVerdicts()

  const refresh = useCallback(() => {
    setLoading(true)
    const controller = new AbortController()
    // The switch's own vendor set goes along, so a vendor it hid reads as
    // "hidden" rather than "turned off".
    void readVendors(controller.signal, new Set(hiddenRef.current))
      .then(async rows => {
        if (!mounted.current) return
        vendorsRef.current = rows
        setVendors(rows)
        setError('')
        // The roster is read once more here so the dots can be drawn from the
        // lane's own answers; the store folds it into the shared table.
        const roster = await readLaneModels(controller.signal)
        if (!mounted.current) return
        setLaneModels(roster)
        publishLaneModels(roster)
      })
      .catch((reason: unknown) => {
        if (!mounted.current) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (mounted.current) setLoading(false)
      })
  }, [])

  // ── the switch's workhorse ────────────────────────────────────────────────
  // Hide every picker model that a verdict (or a dead vendor) says cannot
  // answer a turn, and record exactly which ids were hidden so "off" restores
  // them and nothing the user closed by hand.
  const hideRefusedModels = useCallback(async (): Promise<Record<string, string[]>> => {
    const current = vendorsRef.current
    const table = getVerdicts()
    const hidden: Record<string, string[]> = {}
    const failures: string[] = []
    for (const row of current) {
      if (row.visibleModelCount === 0) continue
      try {
        const models = await readVendorModels(row.vendor.id)
        const doomed = doomedModelIds(row.vendor.id, models, table, isUnusable(row))
        if (doomed.length === 0) continue
        const result = await setVendorModelsDisabled(row.vendor.id, doomed, true)
        if (result.error !== '') { failures.push(`${row.vendor.name}：${result.error}`); continue }
        hidden[row.vendor.id] = doomed
      } catch (err) {
        failures.push(`${row.vendor.name}：${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (failures.length > 0 && Object.keys(hidden).length === 0) {
      throw new Error(failures.join('；'))
    }
    return hidden
  }, [])

  /**
   * Run one probe batch through the Host's sweep route.
   *
   * The full sweep, a vendor probe and a single-row probe differ only in how
   * they *choose* targets — the asking, the landing, the read-back and the
   * switch follow-up are identical. Sharing this keeps a per-row probe from
   * quietly skipping a rule the full sweep obeys (a no-credit vendor, a stale
   * cache, a switch that must hide what it just learned).
   *
   * @param targets - what to ask about; an empty plan is not an error.
   * @param options.sweeping - whether this batch drives the footer's progress
   *   (a full sweep does; a one-row probe reports through the probing sets).
   * @returns nothing; the verdicts land in the shared table either way.
   */
  const runProbeBatch = useCallback(async (
    targets: readonly ProbeTarget[],
    { sweeping }: { sweeping: boolean },
  ): Promise<void> => {
    const port = await readGatewayPort()
    if (port === 0) {
      setSweepError('no-gateway')
      return
    }
    if (targets.length === 0) {
      if (sweeping) setSweepError('')
      return
    }
    const controller = new AbortController()
    if (sweeping) sweepRef.current = controller
    if (sweeping) {
      setSweeping(true)
      setSweepProgress({ done: 0, total: targets.length })
    }
    setSweepError('')
    const queue = targets.map(target => ({ key: target.key, modelId: target.modelId }))
    try {
      const { error: sweepFailure } = await hostSweep(port, queue, {
        signal: controller.signal,
        onProgress: status => {
          if (sweeping) setSweepProgress({ done: status.done, total: status.total })
          // The Host persists each verdict as it lands; the store folds them in
          // as well, so the open picker stays honest mid-sweep.
          recordProbes(status.results)
        },
      })
      // Read the cache back: the Host owns the durable copy, and reading it is
      // what makes a verdict survive a reload.
      await refreshReadings(true)
      if (mounted.current && sweeping) setSweepError(sweepFailure)
    } finally {
      if (sweeping) sweepRef.current = null
    }
    if (mounted.current) refresh()
    // The switch is a standing decision, not a one-shot sweep: if it is on,
    // whatever this batch just refused has to leave the picker too. The truth
    // is read back from the Host, so a batch that finishes before the switch's
    // own read lands still honours it.
    if ((await readSwitch()).enabled) {
      try {
        const extra = await hideRefusedModels()
        if (Object.keys(extra).length > 0) {
          const state = await readSwitch()
          const merged: Record<string, string[]> = {}
          for (const [provider, ids] of Object.entries(state.hidden)) merged[provider] = [...ids]
          for (const [provider, ids] of Object.entries(extra)) {
            merged[provider] = [...new Set([...(merged[provider] ?? []), ...ids])]
          }
          await writeSwitch({ enabled: true, hidden: merged })
          if (mounted.current) refresh()
        }
      } catch {
        // A probe that learned new refusals must not fail because the
        // follow-up hide did; the verdicts are already on the Host.
      }
    }
  }, [refresh, hideRefusedModels])

  const runSweep = useCallback(async () => {
    if (sweepRef.current !== null) return
    const current = vendorsRef.current
    if (current.length === 0) return
    // The vendors' live model lists, read only for the vendors that still have
    // models in the picker — a vendor the switch emptied has nothing to ask.
    const vendorModels: Record<string, VendorModelEntry[]> = {}
    for (const row of current) {
      if (row.visibleModelCount === 0) continue
      try {
        const models = await readVendorModels(row.vendor.id)
        vendorModels[row.vendor.id] = models.map(model => ({
          id: model.id, name: model.name, disabled: model.disabled, dead: model.dead,
        }))
      } catch {
        // A vendor whose list cannot be read is a vendor with nothing to ask.
      }
    }
    // planSweep reads the published table: the lane's own answers have to be in
    // it, or a model the lane already probed would be paid for twice.
    const stored = getCache()
    const table: Record<string, Verdict> = { ...getVerdicts() }
    const targets = planSweep(
      laneModels.map(model => ({
        id: model.id, name: model.name, availability: model.availability,
        availabilitySource: model.availabilitySource, detail: model.detail,
        probedAt: model.probedAt, hiddenByUser: model.hiddenByUser,
      })),
      vendorModels,
      stored,
      table,
    )
    await runProbeBatch(targets, { sweeping: true })
  }, [laneModels, runProbeBatch])

  /**
   * Probe exactly the rows the user pointed at.
   *
   * A single-row probe is the "I want this answer now" path: it asks for one
   * model even when the full sweep would have skipped it as fresh, and it
   * never blocks the sweep button — a wide sweep and a narrow probe are
   * different questions, and both can be in flight.
   *
   * @param targets - the rows to ask about.
   */
  const probeTargets = useCallback(async (targets: readonly ProbeTarget[]) => {
    const unique = [...new Map(targets.map(target => [target.key, target])).values()]
    if (unique.length === 0) return
    // Refcount the groups: a vendor header shows "probing" while ANY of its
    // rows is in flight, and a per-row probe under the same vendor must not
    // clear the badge the header just earned.
    const claim = (add: boolean) => {
      const keys = new Set(probingRef.current.keys)
      const groups = new Map(probingRef.current.groups)
      for (const target of unique) {
        if (add) keys.add(target.key)
        else keys.delete(target.key)
        if (target.provider === '') continue
        const count = (groups.get(target.provider) ?? 0) + (add ? 1 : -1)
        if (count <= 0) groups.delete(target.provider)
        else groups.set(target.provider, count)
      }
      probingRef.current = { keys, groups }
      setProbingKeys(keys)
      setProbingGroups(new Set(groups.keys()))
    }
    claim(true)
    try {
      await runProbeBatch(unique, { sweeping: false })
    } finally {
      claim(false)
    }
  }, [runProbeBatch])

  /**
   * Probe one vendor's whole pickable list.
   *
   * The vendor header is where a user decides "this vendor" matters, so it
   * carries its own probe. Hidden and dead models stay out: the picker does not
   * show them, and asking about them spends a request on a question the user
   * already answered.
   *
   * @param provider - the picker group's id.
   * @param models - the rows under that group in the picker.
   * @param lane - whether this group is the free lane.
   */
  const probeGroup = useCallback(async (
    provider: string,
    models: readonly { id: string, name: string }[],
    lane: boolean,
  ) => {
    // probeTargets owns the in-flight bookkeeping, so a vendor probe is just a
    // batch of row probes over one group. The batch honours the same ceiling as
    // a full sweep: one button must not be able to post an unbounded request.
    await probeTargets(
      models.slice(0, MAX_SWEEP).map(model => targetFor(provider, model.id, model.name, lane)),
    )
  }, [probeTargets])

  const stopSweep = useCallback(() => {
    sweepRef.current?.abort()
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    // The verdict table is read as soon as the picker mounts, so the dots are
    // there on the first paint instead of appearing a moment later.
    void refreshReadings(true)
    // The switch's durable state lives on the Host, so it survives a restart:
    // the models it hid are still hidden, and the picker must show the switch
    // as on, not off.
    void readSwitch().then(state => {
      if (!mounted.current) return
      setSwitchOn(state.enabled)
      hiddenRef.current = Object.keys(state.hidden)
    })

    // A slow heartbeat keeps the numbers honest: balances move whenever a
    // model is used elsewhere, and a stale count reads as "I have more quota
    // than I do".
    const timer = window.setInterval(() => {
      if (document.hidden) return
      refresh()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      mounted.current = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      // A sweep that outlives the picker is a sweep nobody is watching; the
      // verdicts it already landed are on the Host, so nothing is lost.
      sweepRef.current?.abort()
    }
  }, [refresh])

  const setSwitch = useCallback(async (on: boolean) => {
    setSwitchPending(true)
    try {
      if (on) {
        const hidden = await hideRefusedModels()
        await writeSwitch({ enabled: true, hidden })
        setSwitchOn(true)
        hiddenRef.current = Object.keys(hidden)
      } else {
        // Restore exactly what the switch hid. A provider that has since been
        // retired cannot be restored, and must not block the rest.
        const state = await readSwitch()
        const remaining: Record<string, string[]> = {}
        for (const [provider, ids] of Object.entries(state.hidden)) {
          const result = await setVendorModelsDisabled(provider, ids, false)
          if (result.error === '') continue
          const retired = /retired|已移除|不支持此渠道/i.test(result.error)
          if (!retired) remaining[provider] = [...ids]
        }
        await writeSwitch({ enabled: false, hidden: remaining })
        setSwitchOn(false)
        hiddenRef.current = Object.keys(remaining)
      }
      refresh()
    } finally {
      setSwitchPending(false)
    }
  }, [refresh, hideRefusedModels])

  return {
    vendors,
    laneModels,
    loading,
    error,
    switchOn,
    switchPending,
    refresh,
    setSwitch,
    verdicts,
    sweeping,
    sweepProgress,
    sweepError,
    runSweep,
    stopSweep,
    probingKeys,
    probingGroups,
    probeTargets,
    probeGroup,
  }
}

/**
 * Is this vendor's model set worth hiding right now?
 *
 * "Unusable" means the models are in the picker but cannot answer a turn:
 *
 * - the vendor is not connected at all (switched off, not signed in, or no
 *   account) — its models are listed but every call would fail;
 * - the vendor is connected but its credit is spent (balance ≤ 0).
 *
 * A vendor whose balance could not be *read* is NOT unusable — that is an
 * unknown, and hiding on an unknown would take away models that work. The user
 * can still hide such a vendor by hand.
 */
function isUnusable(row: VendorRow): boolean {
  if (row.visibleModelCount === 0) return false
  if (row.state === 'closed' || row.state === 'idle' || row.state === 'unknown') return true
  if (row.balance === null) return false
  return row.balance <= 0
}

export type { SwitchState }
