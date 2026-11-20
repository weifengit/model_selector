/**
 * Model Selector — the data layer.
 *
 * Three readings, joined into one vendor table:
 *
 * 1. **the free lane roster** — `GET /api/our-free-model/summary`, the JSON API
 *    the Our Free Model plugin already serves. It answers "which models exist
 *    right now, and is each one usable from this machine?" (`available`,
 *    `region-blocked`, `unavailable`, `throttled`, `unknown`). This is the same
 *    list the 设置 → Our Free Model → 白嫖模型接入 page renders.
 *
 * 2. **per-vendor credit** — the Channel Pack RPC `credits.balances`, reached
 *    over the shell's own `/api/channel-pack` endpoint. It answers "how much
 *    credit does this vendor's account still have?", per vendor, in the
 *    vendor's own unit (积分 / credits / USD / tokens).
 *
 * 3. **the per-vendor model blacklist** — the Channel Pack RPC `model.list`
 *    plus `model.setDisabledMany`. It answers "which of this vendor's models
 *    are currently hidden from the model picker?", and it is also the *write*
 *    path: hiding a vendor's models here removes them from the chat composer's
 *    model picker.
 *
 * The readings are joined by *vendor*, not by model: a vendor can expose many
 * models, and a model can be reachable through several vendors. The vendor
 * axis is the one the user actually asks about ("厂商哪些接入了，哪些还有额度").
 *
 * @module client/src/data.ts
 */

import { VENDORS } from './domain.ts'
import type { HideResult, Vendor, VendorModel, VendorRow, VendorState } from './domain.ts'

/** The Our Free Model plugin's own JSON API prefix, served by the same host. */
export const OFM_API = '/api/our-free-model'

/** The Channel Pack's management RPC endpoint, served by the same host. */
export const CHANNEL_PACK_API = '/api/channel-pack'

/** This plugin's own state API, served by its Host half. */
export const OWN_API = '/api/model-selector'

/** The free lane's provider routes — the two the adapter publishes. */
export const LANE_ROUTES: readonly string[] = ['our-free-model', 'our-free-model-region']

/** Whether a provider route is the free lane rather than a Channel Pack vendor. */
export function isLaneRoute(provider: string): boolean {
  return LANE_ROUTES.includes(provider)
}

/** The free-lane roster, as read from Our Free Model's `/summary`. */
export interface LaneSummary {
  /** Total models on the roster. */
  readonly total: number
  /** How many are usable right now. */
  readonly available: number
  /** How many are blocked by region. */
  readonly regionBlocked: number
  /** How many are unavailable (upstream refused). */
  readonly unavailable: number
  /** How many are throttled. */
  readonly throttled: number
  /** How many have no reading yet. */
  readonly unknown: number
  /** Whether the Channel Pack is mounted on this host. */
  readonly channelsReady: boolean
  /** Whether the pack failed to mount, and why. */
  readonly channelsError: string
  /** When the availability probe last ran. */
  readonly probedAt: number
}

/**
 * One model's availability, as reported by the probe.
 *
 * `hiddenByUser` is what the sweep skips: a model already out of the picker
 * needs no verdict, and asking for one would spend a request on a question
 * the user has already answered.
 */
export interface ModelRow {
  readonly id: string
  readonly name: string
  readonly availability: string
  readonly detail: string
  readonly route: string
  readonly availabilitySource: string
  readonly probedAt: number
  readonly hiddenByUser: boolean
}

/** A JSON error carrying the server's own message. */
class HttpError extends Error {}

/**
 * Fetch one JSON document, with the response's own error text when it fails.
 *
 * The Host serves these routes on the same origin as the page, so a plain
 * same-origin `fetch` is correct and needs no credential juggling.
 */
async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) {
    throw new HttpError(`${response.status} ${response.statusText}`.trim())
  }
  return response.json()
}

/**
 * Call one Channel Pack RPC method.
 *
 * The pack speaks the shell's connection envelope: a `client-request` frame in,
 * a `server-response` frame out. The result frame carries `ok: true` with a
 * `value`, or `ok: false` with a structured error — the latter is a *method*
 * failure (an unknown vendor, a refused quota endpoint), not a transport
 * failure, so it is returned rather than thrown.
 */
export async function callChannelPack<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ ok: true, value: T } | { ok: false, error: string }> {
  const rpcId = `ms-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  const response = await fetch(CHANNEL_PACK_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: 'channel-pack',
      payload: { method, payload },
    }),
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new HttpError(`${response.status} ${response.statusText}`.trim())
  const frame = await response.json() as {
    result?: { ok?: boolean, value?: T, error?: { message?: string, code?: string } }
  }
  const result = frame.result
  if (result === undefined) throw new HttpError('malformed rpc envelope')
  if (result.ok === true) return { ok: true, value: result.value as T }
  const error = result.error
  return { ok: false, error: error?.message ?? error?.code ?? 'rpc failed' }
}

/** One account row as the pack reports it. */
interface RawAccount {
  accountId?: string
  nickname?: string
  balance?: { total?: number, packages?: unknown[] } | null
  error?: string
}

/** The `credits.balances` result. */
interface RawBalances {
  accounts?: RawAccount[]
}

/** The `provider.status` result. */
interface RawProviderStatus {
  statuses?: Record<string, {
    models?: { total?: number, disabled?: number }
    accounts?: { total?: number, enabled?: number }
    closed?: boolean
  }>
}

/** The Our Free Model `/summary` payload, as far as the picker reads it. */
interface RawSummary {
  catalog?: Array<{
    id?: string
    name?: string
    availability?: string
    availabilitySource?: string
    detail?: string
    probedAt?: number
    hiddenByUser?: boolean
    route?: string
  }>
  probedAt?: number
  channels?: { state?: string, error?: string }
}

/** The empty lane, used when the roster could not be read at all. */
const EMPTY_LANE: LaneSummary = {
  total: 0,
  available: 0,
  regionBlocked: 0,
  unavailable: 0,
  throttled: 0,
  unknown: 0,
  channelsReady: false,
  channelsError: '',
  probedAt: 0,
}

/**
 * Read the roster and fold it into counts plus a per-model list.
 */
async function readLane(signal?: AbortSignal): Promise<{
  lane: LaneSummary
  models: ModelRow[]
  error: string
}> {
  try {
    const payload = await getJson(`${OFM_API}/summary`, signal) as RawSummary
    const catalog = payload.catalog ?? []
    const models: ModelRow[] = catalog.map(entry => ({
      id: String(entry.id ?? ''),
      name: String(entry.name ?? entry.id ?? ''),
      availability: String(entry.availability ?? 'unknown'),
      detail: String(entry.detail ?? ''),
      route: String(entry.route ?? ''),
      availabilitySource: String(entry.availabilitySource ?? ''),
      probedAt: Number(entry.probedAt ?? 0),
      hiddenByUser: entry.hiddenByUser === true,
    }))
    const counts = { available: 0, regionBlocked: 0, unavailable: 0, throttled: 0, unknown: 0 }
    for (const entry of models) {
      switch (entry.availability) {
        case 'available': counts.available += 1; break
        case 'region-blocked': counts.regionBlocked += 1; break
        case 'unavailable': counts.unavailable += 1; break
        case 'throttled': counts.throttled += 1; break
        default: counts.unknown += 1; break
      }
    }
    const channels = payload.channels ?? {}
    return {
      lane: {
        total: models.length,
        ...counts,
        channelsReady: channels.state === 'ready',
        channelsError: String(channels.error ?? ''),
        probedAt: Number(payload.probedAt ?? 0),
      },
      models,
      error: '',
    }
  } catch (error) {
    return { lane: EMPTY_LANE, models: [], error: messageOf(error) }
  }
}

/**
 * Read only the free-lane roster's per-model rows.
 *
 * The composer's model list shows this plugin's verdicts for models the lane
 * owns, and it mounts whether or not the list is open — so it needs the roster
 * without paying for the whole vendor/balance read the table does.
 *
 * @param signal - aborts the read.
 * @returns the roster rows, or an empty list when the read failed.
 */
export async function readLaneModels(signal?: AbortSignal): Promise<ModelRow[]> {
  const { models } = await readLane(signal)
  return models
}

/**
 * Read every vendor's status and balance.
 *
 * @param signal - aborts the reads.
 * @param hiddenByPanel - the vendors the switch hid. A vendor the pack reports
 *   as "closed" is one of these when the switch took it out — the blacklist is
 *   why it reads as closed, not the vendor's own health.
 */
export async function readVendors(
  signal: AbortSignal | undefined,
  hiddenByPanel: ReadonlySet<string>,
): Promise<VendorRow[]> {
  // A transport failure (the pack is not mounted, the socket dropped) is not a
  // per-vendor fact: it would blank the whole table, so it is caught here and
  // every row reports the same reason.
  let statuses: RawProviderStatus['statuses'] = {}
  let statusError = ''
  try {
    const status = await callChannelPack<RawProviderStatus>(
      'provider.status',
      { providers: VENDORS.map(vendor => vendor.id) },
      signal,
    )
    if (status.ok) {
      statuses = status.value.statuses ?? {}
    } else {
      statusError = status.error
    }
  } catch (error) {
    statusError = messageOf(error)
  }

  // Balances are read per vendor: the pack has no "all vendors" balance
  // endpoint, and a vendor with no accounts answers with an empty list rather
  // than an error — so a vendor that is simply not logged in costs nothing.
  const rows = await Promise.all(VENDORS.map(async (vendor): Promise<VendorRow | null> => {
    const entry = statuses[vendor.id]
    const base: VendorRow = {
      vendor,
      state: 'unknown',
      modelCount: Number(entry?.models?.total ?? 0),
      disabledCount: Number(entry?.models?.disabled ?? 0),
      visibleModelCount: Math.max(0, Number(entry?.models?.total ?? 0) - Number(entry?.models?.disabled ?? 0)),
      accountCount: Number(entry?.accounts?.total ?? 0),
      enabledAccountCount: Number(entry?.accounts?.enabled ?? 0),
      balance: null,
      error: statusError,
      at: Date.now(),
    }
    // The pack did not report this vendor at all. That covers two cases, and
    // both mean the same thing to the picker: it does not serve this vendor.
    //
    //  - the vendor was *retired* by a plugin upgrade (its channels are gone
    //    and answer `provider-retired` on every call);
    //  - this build of the pack never knew the vendor.
    //
    // Either way there is nothing to show and nothing to hide, so the row is
    // dropped rather than listed as "unknown" — a retired vendor that stayed
    // in the list would be offered to the switch, whose first read of it
    // throws and takes the whole switch down with it.
    if (entry === undefined) return null
    // A vendor whose every model is hidden is reported as `closed` by the pack —
    // but that verdict is the *blacklist* talking, not the vendor's health. The
    // switch knows which vendors it hid, so the honest label is "hidden",
    // not "turned off": the vendor is still connected, its models are just not in
    // the picker.
    if (entry.closed === true) {
      const state: VendorState = hiddenByPanel.has(vendor.id) ? 'hidden' : 'closed'
      return { ...base, state }
    }
    if (!vendor.balance) {
      const state: VendorState = base.enabledAccountCount > 0 ? 'on' : base.accountCount > 0 ? 'idle' : 'unknown'
      return { ...base, state, error: '' }
    }

    // One vendor's failure must not take the whole table down: the read is
    // per-vendor, and a vendor whose upstream is down is a fact about that
    // vendor, not about the picker.
    let balances: Awaited<ReturnType<typeof callChannelPack<RawBalances>>>
    try {
      balances = await callChannelPack<RawBalances>('credits.balances', { provider: vendor.id }, signal)
    } catch (error) {
      balances = { ok: false, error: messageOf(error) }
    }
    if (!balances.ok) {
      // A vendor that reports "unsupported provider" simply has no balance
      // endpoint — that is a fact about the vendor, not a failure of the read.
      const unsupported = balances.error.includes('unsupported provider')
      return {
        ...base,
        state: (base.enabledAccountCount > 0 ? 'on' : base.accountCount > 0 ? 'idle' : 'unknown') as VendorState,
        error: unsupported ? '' : balances.error,
      }
    }
    const accounts = (balances.value.accounts ?? [])
    const known = accounts.filter(account => numeric(account.balance?.total) !== null)
    const failed = accounts.filter(account => account.error !== '')
    const balance = known.length === 0
      ? null
      : known.reduce((sum, account) => sum + (numeric(account.balance?.total) ?? 0), 0)
    const state: VendorState = base.enabledAccountCount > 0
      ? 'on'
      : base.accountCount > 0 ? 'idle' : 'unknown'
    return {
      ...base,
      state,
      balance,
      error: failed.length === 0 ? '' : failed[0]?.error ?? '',
    }
  }))
  return rows.filter((row): row is VendorRow => row !== null)
}

/**
 * Read one vendor's model list, with each model's hidden flag.
 *
 * The Channel Pack's `model.list` is the same directory the model picker
 * renders, including the models the user has hidden — so it is the only place
 * that can answer "which models are hidden?".
 */
export async function readVendorModels(provider: string): Promise<VendorModel[]> {
  const result = await callChannelPack<{ models?: Array<{ id?: string, name?: string, disabled?: boolean, dead?: boolean }> }>(
    'model.list',
    { provider },
  )
  if (!result.ok) throw new Error(result.error)
  return (result.value.models ?? []).map(model => ({
    id: String(model.id ?? ''),
    name: String(model.name ?? model.id ?? ''),
    disabled: model.disabled === true,
    dead: model.dead === true,
  }))
}

/**
 * Hide (or restore) a set of one vendor's models.
 *
 * The write goes through `model.setDisabledMany` rather than a loop of
 * `model.setDisabled`: the batch endpoint writes the document once and
 * broadcasts the catalog change once, so a 500-model vendor does not produce
 * 500 writes and 500 catalog refreshes.
 *
 * @param provider - the vendor id.
 * @param modelIds - the exact model ids to change.
 * @param disabled - true hides them, false restores them.
 */
export async function setVendorModelsDisabled(
  provider: string,
  modelIds: readonly string[],
  disabled: boolean,
): Promise<HideResult> {
  const ids = [...new Set(modelIds.filter(id => id !== ''))]
  if (ids.length === 0) return { changed: 0, error: '' }
  try {
    const result = await callChannelPack('model.setDisabledMany', {
      provider,
      modelIds: ids,
      disabled,
    })
    if (!result.ok) return { changed: 0, error: result.error }
    return { changed: ids.length, error: '' }
  } catch (error) {
    return { changed: 0, error: messageOf(error) }
  }
}

/** The persisted state of the cleanup switch. */
export interface SwitchState {
  /** Whether the switch is on: unusable models are hidden. */
  readonly enabled: boolean
  /** The models the switch hid, per vendor — so "off" restores exactly them. */
  readonly hidden: Readonly<Record<string, readonly string[]>>
}

/** The switch's state when it has never been touched: off. */
export const DEFAULT_SWITCH: SwitchState = { enabled: false, hidden: {} }

/**
 * Read the switch's durable state from the Host.
 *
 * The Host owns the truth: the switch's state has to outlive a DSH restart,
 * and the blacklist it mirrors lives on the Host too. A browser-local switch
 * would come back "off" after a restart with the models still hidden.
 */
export async function readSwitch(): Promise<SwitchState> {
  try {
    const response = await fetch(`${OWN_API}/switch`, { headers: { accept: 'application/json' } })
    if (!response.ok) return DEFAULT_SWITCH
    const payload = await response.json() as Partial<SwitchState>
    const hidden: Record<string, string[]> = {}
    for (const [provider, ids] of Object.entries(payload.hidden ?? {})) {
      if (Array.isArray(ids)) {
        hidden[provider] = ids.filter((id): id is string => typeof id === 'string')
      }
    }
    return { enabled: payload.enabled === true, hidden }
  } catch {
    return DEFAULT_SWITCH
  }
}

/** Write the switch's durable state to the Host. */
export async function writeSwitch(state: SwitchState): Promise<SwitchState> {
  const response = await fetch(`${OWN_API}/switch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: state.enabled, hidden: state.hidden }),
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
  const payload = await response.json() as Partial<SwitchState>
  return { enabled: payload.enabled === true, hidden: payload.hidden ?? {} }
}

/**
 * Read the per-model verdict cache from the Host.
 *
 * The cache is this plugin's own probes — a verdict the picker paid for with a
 * real request, which a reload must not make it pay for twice.
 */
export async function readVerdictCache(signal?: AbortSignal): Promise<Record<string, CachedProbe>> {
  try {
    const response = await fetch(`${OWN_API}/verdicts`, {
      headers: { accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    })
    if (!response.ok) return {}
    const payload = await response.json() as { results?: Record<string, Partial<CachedProbe>> }
    const cache: Record<string, CachedProbe> = {}
    for (const [id, row] of Object.entries(payload.results ?? {})) {
      if (typeof row?.state !== 'string') continue
      cache[id] = {
        state: row.state as CachedProbe['state'],
        detail: typeof row.detail === 'string' ? row.detail : '',
        at: Number.isFinite(row.at) ? Number(row.at) : 0,
      }
    }
    return cache
  } catch {
    return {}
  }
}

/** A stored probe, as the Host's cache keeps it. */
export interface CachedProbe {
  readonly state: string
  readonly detail: string
  readonly at: number
}

/**
 * Record probe results on the Host, and return the whole cache as it now reads.
 *
 * The answer is the merged table rather than an echo: two sweeps finishing in
 * the same minute each see the other's verdicts, so neither writes the other
 * out.
 */
export async function writeVerdictCache(
  results: Readonly<Record<string, { state: string, detail?: string, at?: number }>>,
): Promise<Record<string, CachedProbe>> {
  const response = await fetch(`${OWN_API}/verdicts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ results }),
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
  const payload = await response.json() as { results?: Record<string, CachedProbe> }
  return payload.results ?? {}
}

/** Coerce a possibly-absent number into a number or null. */
function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Best-effort message for a thrown value. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Re-exported so the vendor roster has one home. */
export { VENDORS }
export type { Vendor }
