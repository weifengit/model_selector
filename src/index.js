/**
 * Model Selector — the package entry.
 *
 * The plugin is one package with two halves:
 *
 * - the **Host half** owns the state that has to outlive a restart (the
 *   cleanup switch and the probe verdicts) and runs the probe itself, so the
 *   channel gateway's key never crosses into the browser;
 * - the **browser half** occupies the shell's composer model seat and renders
 *   the vendor balances, the per-model availability dots, and the cleanup and
 *   probe controls right where the user picks a model.
 *
 * @module src/index.js
 */

export { name, version, inject, apply } from './host.js'

/** Re-exported for tests and for the host half's own use. */
export {
  JsonStore, INITIAL_STATE, INITIAL_VERDICTS, STATE_FILE, VERDICT_FILE,
  DATA_DIR_NAME, normalizeState, normalizeVerdicts, mergeVerdicts, resolveDshHome,
} from './store.js'
export { createProber, classifyRefusal, readGatewayKey } from './gateway.js'
