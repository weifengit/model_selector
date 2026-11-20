/**
 * Model Selector — matching the lane's roster to the picker's rows.
 *
 * The free lane's roster and the composer's model list name the same models
 * two different ways, and the difference is not cosmetic:
 *
 * - the roster names a model bare (`flint-40b-free`) — that is the id the
 *   lane's own probe used;
 * - the composer's list names it with the route the pack knows it by
 *   (`opencode/flint-40b-free`) — and the roster carries *both* spellings as
 *   separate rows, because the lane publishes one row per upstream it knows.
 *
 * So a picker row can have no roster row at all, one, or several — and when it
 * has several, they are not equally good answers: one may be a bare listing
 * (「the lane knows this name」) while the other is a real probe
 * (「the lane tried this and it was throttled」).
 *
 * The rule here picks the row that *answers* over the row that merely names,
 * because the picker draws an availability dot from the answer and an answer
 * is the whole point of the dot.
 *
 * @module client/src/roster.ts
 */

import type { ModelRow } from './data.ts'

/**
 * The roster rows that can answer for one picker model id.
 *
 * A row qualifies when its id is the picker id itself, or when the picker id
 * ends in `/` + the row id — the tail is what stays stable when the pack
 * changes its prefixes.
 *
 * @param roster - the lane's rows.
 * @param pickerId - the picker's model id.
 * @returns the qualifying rows.
 */
export function rosterCandidates(roster: readonly ModelRow[], pickerId: string): ModelRow[] {
  return roster.filter(row => row.id === pickerId || pickerId.endsWith(`/${row.id}`))
}

/**
 * How good a roster row is as an answer for one picker row.
 *
 * Lower is better. The order is deliberate:
 *
 * 1. a row that carries an answer beats one that only names a model — a
 *    listing is not evidence of usability;
 * 2. an exact id beats a suffix match — the exact row is the one the picker
 *    is actually showing;
 * 3. among suffix matches, the *shorter* id wins — it is the less decorated
 *    spelling, and the more specific one (a nested route like
 *    `cline/reflection/beam-free`) is a different provider's view of it.
 */
/**
 * How good a roster row is as an answer for one picker row.
 *
 * Lower is better. The order is deliberate:
 *
 * 1. a row that carries a definite answer beats one that merely names a
 *    model — a listing is not evidence of usability;
 * 2. an exact id beats a suffix match — the exact row is the one the picker
 *    is actually showing;
 * 3. among suffix matches, the *less decorated* spelling wins — it is the
 *    model itself, whereas a nested route (a different provider's view of the
 *    same model) is one step further from it.
 *
 * The answer test is the availability itself rather than its source: a lane
 * row that says 「throttled」 answers, however it learned it, and a row that
 * says 「unknown」 does not.
 */
function rank(row: ModelRow, pickerId: string): number {
  // Lower is better, so a row that answers scores 0 and one that does not
  // scores 1.
  const answers = row.availability === 'unknown' ? 1 : 0
  const exact = row.id === pickerId ? 0 : 1
  const nested = row.id.includes('/') ? 1 : 0
  return answers * 100 + exact * 10 + nested
}

/**
 * The roster row that answers for one picker model id.
 *
 * @param roster - the lane's rows.
 * @param pickerId - the picker's model id.
 * @returns the best row, or undefined when the roster says nothing about it.
 */
export function rosterVerdictRow(roster: readonly ModelRow[], pickerId: string): ModelRow | undefined {
  const candidates = rosterCandidates(roster, pickerId)
  if (candidates.length === 0) return undefined
  if (candidates.length === 1) return candidates[0]
  return [...candidates].sort((a, b) => rank(a, pickerId) - rank(b, pickerId))[0]
}

/**
 * The lane's roster keyed by the picker's model ids.
 *
 * @param roster - the lane's rows.
 * @param pickerIds - the model ids the picker's lane groups carry.
 * @returns a map from picker id to the roster row that answers for it.
 */
export function alignRoster(
  roster: readonly ModelRow[],
  pickerIds: readonly string[],
): Map<string, ModelRow> {
  const aligned = new Map<string, ModelRow>()
  for (const id of pickerIds) {
    const row = rosterVerdictRow(roster, id)
    if (row !== undefined) aligned.set(id, row)
  }
  return aligned
}
