/**
 * Model Selector — the composer's model list.
 *
 * The shell's composer has one model seat (`conversation.input.model`, a
 * `single` slot): the trigger that names the current model and opens the
 * provider-grouped list. This module occupies that seat at a shadowing priority
 * so the list can say what this plugin already knows — each vendor's remaining
 * credit, and whether each model can answer a turn right now — without adding
 * a second control beside it.
 *
 * What it does *not* own: the session's model directory. Selection state,
 * catalog loading and the Model/effort submission all ride the same
 * `ModelDirectory` the shell's own entries share, so a switch made here is a
 * switch made everywhere. This component is presentation over that store plus
 * one read of the shared verdict table.
 *
 * The verdicts themselves come from the shared store: the lane's own probes,
 * this plugin's cached sweeps, and anything the current sweep has landed. They
 * are shown, never enforced — hiding a model stays the cleanup switch's job,
 * and the picker must list what the Host would actually accept.
 *
 * @module client/src/picker.tsx
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ComposerModelPickerProps, ModelOption, ModelSelection } from './domain.ts'
import { pickerProbeKey } from './verdicts.ts'
import { laneCacheKeys } from './verdicts.ts'
import type { Verdict } from './verdicts.ts'
import { verdictLabel, verdictTone } from './verdict-copy.ts'
import type { VerdictTone } from './verdict-copy.ts'
import { useModelSelector } from './use-model-selector.ts'
import { isLaneRoute } from './data.ts'
import { targetFor } from './sweep.ts'

/** Format a vendor's unit label compactly for the picker group header. */
function shortUnit(unit: string): string {
  switch (unit) {
    case 'credits': return ' cr'
    case 'dollars': return '$'
    case 'tokens': return ' tk'
    case 'quota': return ''
    default: return ''
  }
}

interface Choice {
  readonly groupId: string
  readonly groupName: string
  readonly model: ModelOption
  readonly tone: VerdictTone
  readonly title: string
}

export type PickerChoice = Choice

function groupTitle(id: string, name: string, t: ComposerModelPickerProps['t']): string {
  return id === 'deepseek-account' ? t('picker.account') : name
}

/** The status dot: the whole of the verdict's presence in one row. */
function VerdictDot({ tone }: { tone: VerdictTone }): React.ReactElement {
  return <span className={`ms-picker-dot is-${tone}`} aria-hidden="true" />
}

/**
 * The verdict for one picker row, resolving the lane's two naming schemes.
 *
 * A lane model's answer is folded under its bare id by the store, but a page
 * that read the cache before the lane roster landed — or a roster that failed
 * to load — only has the prefixed keys. Both are tried, bare first, because
 * the bare key is the one the store publishes.
 *
 * @param verdicts - the folded table.
 * @param provider - the provider group's id.
 * @param model - the model's id inside the group.
 * @returns the verdict, or undefined when nothing answers for this row.
 */
function verdictFor(
  verdicts: Readonly<Record<string, Verdict>>,
  provider: string,
  model: string,
): Verdict | undefined {
  const key = pickerProbeKey(provider, model)
  const direct = verdicts[key]
  if (direct !== undefined) return direct
  if (!isLaneRoute(provider)) return undefined
  for (const candidate of laneCacheKeys(verdicts, model)) {
    const row = verdicts[candidate]
    if (row !== undefined) return row
  }
  return undefined
}

/** A line-art chevron, matching the composer's other glyphs. */
function Chevron({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      className={`ms-picker-chevron ${open ? 'is-open' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/** A tick for the selected row. */
function Check(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/**
 * The glyph the seat falls back to when the composer has no room for a name.
 * A chip reads as "which model" without reading as a word, which is what the
 * narrow row has space for.
 */
function ModelGlyph(): React.ReactElement {
  return (
    <svg
      className="ms-picker-trigger-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="7.5" y="7.5" width="9" height="9" rx="2" />
      <path d="M10 3.8v2.2M14 3.8v2.2M10 18v2.2M14 18v2.2M3.8 10h2.2M3.8 14h2.2M18 10h2.2M18 14h2.2" />
    </svg>
  )
}

/**
 * The probe glyph: a small crosshair, matching the composer's line-art chevrons.
 *
 * @param props.spinning - whether a probe for this row is in flight, which
 *   turns the glyph into a ring instead of an arrow. Motion here is the whole
 *   feedback: a probe costs a request and takes seconds, so the row has to say
 *   "working" without a second control appearing beside it.
 * @returns the glyph.
 */
function ProbeGlyph({ spinning }: { spinning?: boolean }): React.ReactElement {
  if (spinning === true) {
    return (
      <svg
        className="ms-picker-probe-icon is-spinning"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 4a8 8 0 1 0 8 8" />
      </svg>
    )
  }
  return (
    <svg
      className="ms-picker-probe-icon"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3.4M12 18.1v3.4M2.5 12h3.4M18.1 12h3.4" />
    </svg>
  )
}

/**
 * The composer model seat.
 *
 * @param props - the owner's lock flag, the injected directory face, and copy.
 * @returns the trigger and, while open, the list.
 */
export function ComposerModelPicker(props: ComposerModelPickerProps): React.ReactElement | null {
  const { locked, available, directory, load, select, t } = props
  const state = React.useSyncExternalStore(
    useCallback((fn: () => void) => directory.subscribe(fn), [directory]),
    useCallback(() => directory.getSnapshot(), [directory]),
  )
  const feature = useModelSelector()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuPos, setMenuPos] = useState<{ left: number, top: number } | null>(null)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const id = React.useId()

  const groups = state.groups
  const busy = state.pending !== null || state.status === 'selecting'
  const current = state.current
  const currentOption = useMemo(() => {
    if (current === null) return undefined
    for (const group of groups) {
      if (group.id !== current.provider) continue
      const hit = group.models.find(model => model.id === current.model)
      if (hit !== undefined) return { group, model: hit }
    }
    return undefined
  }, [groups, current])

  const currentReasoning = currentOption?.model.reasoning
  const currentEffort = current?.reasoningEffort ?? currentReasoning?.defaultEffort

  const choices = useMemo<Choice[]>(() => {
    const needle = query.trim().toLowerCase()
    const rows: Choice[] = []
    for (const group of groups) {
      for (const model of group.models) {
        if (needle !== '' && !model.name.toLowerCase().includes(needle)) continue
        const verdict = verdictFor(feature.verdicts, group.id, model.id)
        const state_ = verdict?.state
        rows.push({
          groupId: group.id,
          groupName: groupTitle(group.id, group.name, t),
          model,
          tone: verdictTone(state_),
          title: state_ === undefined || state_ === 'unknown'
            ? t('picker.untested')
            : verdict?.detail !== undefined && verdict.detail !== ''
              ? `${verdictLabel(state_, t)} · ${verdict.detail}`
              : verdictLabel(state_, t),
        })
      }
    }
    return rows
  }, [groups, feature.verdicts, query, t])

  const grouped = useMemo(() => {
    const order: string[] = []
    const byGroup = new Map<string, typeof choices>()
    for (const row of choices) {
      const bucket = byGroup.get(row.groupId)
      if (bucket === undefined) {
        order.push(row.groupId)
        byGroup.set(row.groupId, [row])
        continue
      }
      bucket.push(row)
    }
    return order.map(groupId => byGroup.get(groupId) as typeof choices)
  }, [choices])

  const showSearch = groups.reduce((sum, group) => sum + group.models.length, 0) > 4

  // Each vendor's remaining credit, keyed by the provider group id. A vendor
  // that could not be read stays absent — an unreadable balance is an unknown,
  // and showing it as 0 would be a lie the user would act on.
  const vendorBalance = useMemo<Map<string, { balance: number | null, unit: string }>>(
    () => new Map(feature.vendors.map(v => [v.vendor.id, { balance: v.balance, unit: v.vendor.unit }])),
    [feature.vendors],
  )

  // ── reading ──────────────────────────────────────────────────────────────
  // The catalog is advisory and shared: ask for it whenever the seat mounts or
  // opens, and let failures land on the store rather than here.
  useEffect(() => {
    if (available && state.status === 'idle') load()
  }, [available, state.status, load])

  // ── placement ────────────────────────────────────────────────────────────
  // The panel is portalled onto the body so the composer's overflow cannot clip
  // it; that means it is positioned against the trigger's viewport rect and has
  // to be re-placed whenever that rect can move.
  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      const width = menuRef.current?.offsetWidth ?? 0
      const height = menuRef.current?.offsetHeight ?? 0
      let left = rect.right - width
      let top = rect.top - 8 - height
      if (width > 0) left = Math.min(Math.max(left, 12), window.innerWidth - width - 12)
      if (height > 0) top = Math.min(Math.max(top, 12), window.innerHeight - height - 12)
      setMenuPos({ left, top })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, choices.length, state.status])

  // ── dismissal ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      if (menuRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [open])

  useEffect(() => {
    if (open && showSearch) searchRef.current?.focus()
  }, [open, showSearch])

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (!restoreFocus) return
    queueMicrotask(() => triggerRef.current?.focus())
  }, [])

  const submit = useCallback((selection: ModelSelection) => {
    setError('')
    void select(selection).then(result => {
      if (result === undefined) return
      if (result.ok) {
        close(true)
        return
      }
      const failure = result.error
      setError(failure === undefined
        ? t('picker.failed')
        : failure.code === 'session/writer-held'
          ? t('picker.sessionInUse')
          : `${failure.code}: ${failure.message}`)
    })
  }, [select, close, t])

  const choose = useCallback((groupId: string, model: ModelOption) => {
    if (current?.provider === groupId && current.model === model.id) {
      close(true)
      return
    }
    // A new model starts at the effort its own adapter declares: carrying the
    // previous model's level over would submit a level this one may not have.
    const effort = model.reasoning?.defaultEffort
    submit({
      provider: groupId,
      model: model.id,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    })
  }, [current, submit, close])

  const chooseEffort = useCallback((effort: string | undefined) => {
    if (current === null) return
    if (currentEffort === effort) {
      close(true)
      return
    }
    submit({
      provider: current.provider,
      model: current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    })
  }, [current, currentEffort, submit, close])

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    close(true)
  }, [open, close])

  if (!available) return null

  const waiting = current === null && state.status === 'loading'
  const label = waiting
    ? t('picker.loading')
    : currentOption?.model.name
      ?? (current === null ? t('picker.placeholder') : `${current.provider}/${current.model}`)
  const effortName = currentReasoning === undefined
    ? undefined
    : currentEffort === undefined
      ? t('picker.providerDefault')
      : currentReasoning.efforts.find(level => level.id === currentEffort)?.name ?? currentEffort
  const triggerTone = current === null
    ? verdictTone(undefined)
    : verdictTone(feature.verdicts[pickerProbeKey(current.provider, current.model)]?.state)

  return (
    <div className="ms-picker-root" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="ms-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={current === null ? t('picker.open') : `${label}${effortName === undefined ? '' : ` · ${effortName}`}`}
        disabled={locked}
        onClick={() => {
          if (open) {
            close(true)
            return
          }
          setError('')
          setOpen(true)
          load()
        }}
      >
        <VerdictDot tone={triggerTone} />
        <ModelGlyph />
        <span className="ms-picker-label">{label}</span>
        {effortName !== undefined && <span className="ms-picker-effort">{effortName}</span>}
        <Chevron open={open} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={`${id}-menu`}
          className="ms-picker-menu"
          style={menuPos ?? { visibility: 'hidden', left: 0, top: 0 }}
          role="dialog"
          aria-label={t('picker.menu')}
          // The panel is portalled, so Escape typed inside it never reaches
          // the root's handler — the two events are in different DOM trees.
          onKeyDown={onKeyDown}
        >
          {showSearch && (
            <input
              ref={searchRef}
              className="ms-picker-search"
              type="search"
              value={query}
              placeholder={t('picker.search')}
              aria-label={t('picker.search')}
              onChange={event => setQuery(event.target.value)}
            />
          )}

          {state.status === 'loading' && <div className="ms-picker-note">{t('picker.loading')}</div>}
          {state.error !== null && (
            <div className="ms-picker-note is-error">
              <span>{t('picker.groupFailed', { name: t('picker.menu'), message: state.error })}</span>
              <button type="button" className="ms-picker-retry" onClick={load}>
                {t('picker.retry')}
              </button>
            </div>
          )}
          {error !== '' && <div className="ms-picker-note is-error">{error}</div>}
          {feature.error !== '' && <div className="ms-picker-note is-warning">{feature.error}</div>}
          {state.failures.map(failure => (
            <div className="ms-picker-note is-warning" key={failure.id}>
              {t('picker.groupFailed', { name: groupTitle(failure.id, failure.name, t), message: failure.message })}
            </div>
          ))}

          <div className="ms-picker-list" role="listbox" aria-label={t('picker.menu')}>
            {grouped.map(rows => {
              const groupId = rows[0].groupId
              const balanceInfo = vendorBalance.get(groupId)
              const balanceText = balanceInfo === undefined || balanceInfo.balance === null
                ? ''
                : `${balanceInfo.balance}${shortUnit(balanceInfo.unit)}`
              return (
                <div className="ms-picker-group" key={groupId}>
                  <div className="ms-picker-group-name">
                    <span className="ms-picker-group-title">
                      {rows[0].groupName}
                      {balanceText !== '' && (
                        <span className="ms-picker-group-balance">{balanceText}</span>
                      )}
                    </span>
                    {(() => {
                      const groupProbing = feature.probingGroups.has(groupId)
                      const groupTone = rows.some(row => row.tone === 'refused')
                        ? 'refused'
                        : rows.some(row => row.tone === 'ok') ? 'ok' : 'unknown'
                      return (
                        <button
                          type="button"
                          className={`ms-picker-group-probe ${groupProbing ? 'is-probing' : ''}`}
                          disabled={groupProbing}
                          title={groupProbing ? t('probe.groupRunning') : t('probe.group')}
                          aria-label={t('probe.group')}
                          onClick={() => {
                            void feature.probeGroup(
                              groupId,
                              rows.map(row => ({ id: row.model.id, name: row.model.name })),
                              isLaneRoute(groupId),
                            )
                          }}
                        >
                          <ProbeGlyph spinning={groupProbing} />
                          <span className={`ms-picker-group-probe-dot is-${groupTone}`} aria-hidden="true" />
                        </button>
                      )
                    })()}
                  </div>
                  {rows.map(row => {
                    const selected = current?.provider === row.groupId && current?.model === row.model.id
                    return (
                      <div
                        key={row.model.id}
                        className={`ms-picker-row-wrap ${selected ? 'is-selected' : ''}`}
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`ms-picker-row ${selected ? 'is-selected' : ''}`}
                          title={row.title}
                          disabled={busy}
                          onClick={() => choose(row.groupId, row.model)}
                        >
                          <VerdictDot tone={row.tone} />
                          <span className="ms-picker-row-name">{row.model.name}</span>
                          <span className="ms-picker-row-check">{selected ? <Check /> : null}</span>
                        </button>
                        {(() => {
                          const key = pickerProbeKey(row.groupId, row.model.id)
                          const rowProbing = feature.probingKeys.has(key) || feature.probingGroups.has(row.groupId)
                          return (
                            <button
                              type="button"
                              className={`ms-picker-row-probe ${rowProbing ? 'is-probing' : ''}`}
                              disabled={rowProbing}
                              title={rowProbing ? t('probe.rowRunning') : t('probe.row')}
                              aria-label={t('probe.row')}
                              onClick={() => {
                                void feature.probeTargets([
                                  targetFor(row.groupId, row.model.id, row.model.name, isLaneRoute(row.groupId)),
                                ])
                              }}
                            >
                              <ProbeGlyph spinning={rowProbing} />
                            </button>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {state.status === 'ready' && grouped.length === 0 && (
              <div className="ms-picker-note">
                {groups.length === 0 ? t('picker.emptyModels') : t('picker.emptySearch')}
              </div>
            )}
          </div>
          {currentReasoning !== undefined && current !== null && (
            <div className="ms-picker-efforts">
              <div className="ms-picker-group-name">{t('picker.effort')}</div>
              <div className="ms-picker-effort-row">
                {currentReasoning.defaultEffort === undefined && (
                  <button
                    type="button"
                    className={`ms-picker-effort-chip ${currentEffort === undefined ? 'is-selected' : ''}`}
                    disabled={busy}
                    onClick={() => chooseEffort(undefined)}
                  >
                    {t('picker.providerDefault')}
                  </button>
                )}
                {currentReasoning.efforts.map(level => (
                  <button
                    key={level.id}
                    type="button"
                    className={`ms-picker-effort-chip ${currentEffort === level.id ? 'is-selected' : ''}`}
                    title={level.description ?? level.name}
                    disabled={busy}
                    onClick={() => chooseEffort(level.id)}
                  >
                    {level.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* The controls live at the bottom of the list, where the user
              actually is when they want to clean up or probe. */}
          <div className="ms-picker-footer">
            <button
              type="button"
              className={`ms-picker-footer-btn ${feature.switchOn ? 'is-on' : ''}`}
              disabled={feature.switchPending}
              onClick={() => { void feature.setSwitch(!feature.switchOn) }}
              title={feature.switchOn ? t('switch.off') : t('switch.on')}
            >
              {feature.switchOn ? t('picker.restore') : t('picker.clean')}
            </button>
            <button
              type="button"
              className="ms-picker-footer-btn"
              disabled={feature.loading}
              onClick={() => { feature.refresh() }}
              title={t('picker.refresh')}
            >
              {t('picker.refresh')}
            </button>
            <button
              type="button"
              className={`ms-picker-footer-btn ${feature.sweeping ? 'is-sweeping' : ''}`}
              disabled={feature.sweeping || feature.switchPending}
              onClick={feature.sweeping ? feature.stopSweep : () => { void feature.runSweep() }}
              title={feature.sweeping ? t('sweep.stop') : t('picker.probe')}
            >
              {feature.sweeping
                ? `${feature.sweepProgress.done}/${feature.sweepProgress.total}`
                : t('picker.probe')}
            </button>
          </div>
          {feature.sweepError !== '' && (
            <div className="ms-picker-note is-error">{t(`sweep.${feature.sweepError}`)}</div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
