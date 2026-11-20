/**
 * Model Selector — the domain vocabulary.
 *
 * Everything the picker reads is described here, structurally, so the plugin
 * never depends on another package's private types: the composer seat's
 * contract is stated in one place, and a shifted face fails the type check
 * instead of the picker.
 *
 * @module client/src/domain.ts
 */

/** One provider/model/effort the Host accepts as a selection. */
export interface ModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** One reasoning level the selected model declares. */
export interface ModelEffort {
  readonly id: string
  readonly name: string
  readonly description?: string
}

/** One model inside one provider group. */
export interface ModelOption {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly reasoning?: {
    readonly efforts: readonly ModelEffort[]
    readonly defaultEffort?: string
  }
}

/** One provider group, as the Host's catalog groups models. */
export interface ModelGroup {
  readonly id: string
  readonly name: string
  readonly models: readonly ModelOption[]
}

/** A provider whose catalog failed to load; the loaded groups stay usable. */
export interface ModelGroupFailure {
  readonly id: string
  readonly name: string
  readonly message: string
}

/** The directory snapshot the /model popup and this seat both render. */
export interface ModelDirectorySnapshot {
  readonly current: ModelSelection | null
  readonly retainedEffort?: string
  readonly routable: boolean | null
  readonly groups: readonly ModelGroup[]
  readonly failures: readonly ModelGroupFailure[]
  readonly status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  readonly pending: ModelSelection | null
  readonly error: string | null
}

/** A Host refusal, as the directory reports it. */
export interface ModelSelectionFailure {
  readonly code: string
  readonly message: string
}

/** The Host's answer to one selection; `ok:false` carries the refusal. */
export interface ModelSelectionResult {
  readonly ok: boolean
  readonly error?: ModelSelectionFailure
}

/** The observable store face the seat reads (a `useSyncExternalStore` source). */
export interface ModelDirectoryStore {
  getSnapshot(): ModelDirectorySnapshot
  subscribe(fn: () => void): () => void
}

/** Everything the seat component is handed: owner share + injected face + copy. */
export interface ComposerModelPickerProps {
  /** The owner locks the seat while a turn is being submitted. */
  readonly locked: boolean
  /** Whether this session may inspect and select a model at all. */
  readonly available: boolean
  readonly directory: ModelDirectoryStore
  readonly load: () => void
  readonly select: (selection: ModelSelection) => Promise<ModelSelectionResult | undefined>
  readonly t: (key: string, vars?: Record<string, string | number>) => string
}

/**
 * How a vendor's balance is denominated, and decides how the number reads.
 *
 * The Channel Pack reports each vendor's balance in that vendor's own unit, and
 * the units are not interchangeable: 积分, credits, dollars, tokens and a
 * percentage-like quota are five different numbers that would be nonsense to
 * add together.
 */
export type BalanceUnit = 'credits' | 'dollars' | 'tokens' | 'quota'

/** One vendor of the free-model roster. */
export interface Vendor {
  readonly id: string
  readonly name: string
  readonly org: string
  readonly accent: string
  /** How this vendor's balance is denominated. */
  readonly unit: BalanceUnit
  /** Whether the pack can report a balance for this vendor at all. */
  readonly balance: boolean
}

/**
 * The vendors the Our Free Model plugin's 白嫖模型接入 page offers.
 *
 * The pack's `provider.status` reports models and accounts per vendor; the
 * picker needs the vendor *names* and their units, which live only in that
 * page — so the roster is mirrored here.
 */
export const VENDORS: readonly Vendor[] = [
  { id: 'codearts', name: 'CodeArts', org: '华为云', accent: '#C7000B', unit: 'credits', balance: true },
  { id: 'buddy', name: 'WorkBuddy 国内版', org: '腾讯 · copilot.tencent.com', accent: '#0A7AFF', unit: 'credits', balance: true },
  { id: 'workbuddy', name: 'WorkBuddy 国际版', org: '腾讯 · workbuddy.ai', accent: '#0B63CE', unit: 'credits', balance: false },
  { id: 'lobsterai', name: 'LobsterAI', org: '有道', accent: '#FF6A00', unit: 'credits', balance: true },
  { id: 'qoder', name: 'Qoder', org: '阿里系', accent: '#615CED', unit: 'credits', balance: true },
  { id: 'qodercn', name: 'Qoder 中国版', org: '阿里系', accent: '#7A6CF0', unit: 'credits', balance: true },
  { id: 'trae', name: 'TRAE', org: '字节', accent: '#00BFA6', unit: 'credits', balance: true },
  { id: 'cline', name: 'Cline', org: 'Cline', accent: '#5B5BD6', unit: 'dollars', balance: true },
  { id: 'loomy', name: 'Loomy', org: '讯飞', accent: '#2F6BFF', unit: 'credits', balance: true },
  { id: 'raccoon', name: 'Raccoon', org: '商汤', accent: '#00A6A6', unit: 'credits', balance: true },
  { id: 'minimax', name: 'MiniMax Code', org: 'MiniMax', accent: '#E4007F', unit: 'credits', balance: true },
  { id: 'zcode', name: 'ZCode', org: '智谱', accent: '#3B6EF6', unit: 'tokens', balance: true },
  { id: 'gemini', name: 'Gemini', org: 'Google Code Assist', accent: '#4285F4', unit: 'quota', balance: true },
]

/** How a vendor's models are reachable right now. */
export type VendorState =
  /** The vendor is switched off entirely (all its models disabled). */
  | 'closed'
  /** The vendor has accounts but none of them is enabled. */
  | 'idle'
  /** The vendor is live and serving models. */
  | 'on'
  /** This panel hid the vendor's models; they are not in the picker. */
  | 'hidden'
  /** The reading failed; the reason is carried alongside. */
  | 'unknown'

/** One vendor row of the table the picker renders. */
export interface VendorRow {
  readonly vendor: Vendor
  readonly state: VendorState
  /** How many models this vendor currently offers (including hidden ones). */
  readonly modelCount: number
  /** How many of those models are hidden from the model picker. */
  readonly disabledCount: number
  /** How many of this vendor's models are currently visible in the picker. */
  readonly visibleModelCount: number
  /** How many accounts this vendor has, and how many are enabled. */
  readonly accountCount: number
  readonly enabledAccountCount: number
  /** The summed remaining balance, in the vendor's own unit. `null` when unknown. */
  readonly balance: number | null
  /** Why the balance could not be read. */
  readonly error: string
  /** When this row's reading was taken. */
  readonly at: number
}

/** One model of a vendor, as the Channel Pack reports it. */
export interface VendorModel {
  readonly id: string
  readonly name: string
  /** Whether the model is currently hidden from the model picker. */
  readonly disabled: boolean
  /** Whether the upstream dropped the model (it is hidden either way). */
  readonly dead: boolean
}

/** The result of one hide/restore operation. */
export interface HideResult {
  /** How many models the operation actually changed. */
  readonly changed: number
  /** The error, when the operation failed. */
  readonly error: string
}
