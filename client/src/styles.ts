/**
 * Model Selector — the stylesheet.
 *
 * The seat keeps the composer's own proportions: 28 px tall, 13 px label, no
 * chrome until hover. The list is portalled onto the body, so its own z-index
 * puts it above the composer seat without inheriting that seat's stacking
 * context.
 *
 * Every colour is a theme token: the plugin never hard-codes a palette, so it
 * follows the shell's light and dark themes without a second stylesheet.
 *
 * @module client/src/styles.ts
 */

export const CSS = `
/* ── the composer model list ── */
.ms-picker-root {
  position: relative;
  min-width: 0;
  max-width: min(360px, 45cqw);
}
.ms-picker-trigger {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
  height: 28px;
  padding: 0 4px 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: 0 0;
  outline: none;
  color: var(--dsw-alias-label-secondary, #667085);
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
  cursor: pointer;
}
.ms-picker-trigger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.ms-picker-trigger:disabled {
  color: var(--dsw-alias-label-dimmed, #98a2b3);
  cursor: default;
}
.ms-picker-label {
  display: var(--dsh-composer-model-text-display, block);
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/*
 * A narrow composer gives the model seat no room for a name. The shell's
 * control row measures itself and marks that moment with data-model-compact,
 * published as a pair of inherited custom properties; the native seat answers
 * it by trading the model name for a glyph. Honoring the same two properties
 * is what makes this seat collapse on exactly the same frame as the native
 * one, instead of pushing the whole row onto a second line.
 */
.ms-picker-effort {
  display: var(--dsh-composer-model-text-display, block);
  overflow: hidden;
  min-width: 0;
  color: var(--dsw-alias-label-caption, #98a2b3);
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1000;
}
.ms-picker-trigger-icon {
  display: var(--dsh-composer-model-icon-display, none);
  flex: none;
  color: var(--dsw-alias-label-tertiary, #98a2b3);
}
.ms-picker-chevron {
  flex: none;
  color: var(--dsw-alias-label-caption, #98a2b3);
  transition: transform 120ms;
}
.ms-picker-chevron.is-open {
  transform: rotate(180deg);
}
/*
 * The verdict dot. Its colour is the whole message at 6 px, and the hit area
 * around it is inert: the row is the button, not the dot.
 */
.ms-picker-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: currentColor;
}
.ms-picker-dot.is-ok {
  color: var(--dsw-alias-state-success-primary, #12b76a);
  background: var(--dsw-alias-state-success-primary, #12b76a);
}
.ms-picker-dot.is-refused {
  color: var(--dsw-alias-state-error-primary, #f04438);
  background: var(--dsw-alias-state-error-primary, #f04438);
}
.ms-picker-dot.is-unknown {
  color: var(--dsw-alias-label-caption, #98a2b3);
  background: var(--dsw-alias-label-caption, #98a2b3);
  opacity: 0.5;
}
.ms-picker-menu {
  position: fixed;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: max-content;
  min-width: min(260px, 100vw - 32px);
  max-width: min(440px, 100vw - 32px);
  max-height: min(440px, 60vh);
  padding: 6px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  box-shadow: var(--dsw-elevation-menu, 0 12px 32px rgba(0, 0, 0, 0.24));
  color: var(--dsw-alias-label-primary, #101828);
  font-size: 13px;
}
.ms-picker-search {
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.16));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: inherit;
  font: inherit;
  outline: none;
}
.ms-picker-list {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}
.ms-picker-row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: 0 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ms-picker-row:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.ms-picker-row:disabled {
  opacity: 0.6;
  cursor: default;
}
/* the wrapper owns the paint now; the row itself only draws its content */
.ms-picker-row-name {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-picker-row-check {
  display: flex;
  align-items: center;
  margin-left: auto;
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.ms-picker-note {
  padding: 6px 8px;
  color: var(--dsw-alias-label-caption, #98a2b3);
  font-size: 12px;
}
.ms-picker-note.is-error {
  display: flex;
  color: var(--dsw-alias-state-error-primary, #f04438);
  align-items: center;
  gap: 8px;
}
.ms-picker-note.is-warning {
  color: var(--dsw-alias-state-warning-primary, #f79009);
}
/*
 * Sticky group header: the vendor name stays pinned while its models scroll,
 * mirroring the native model list's section headers. The balance rides beside
 * it, so the user still knows whose credit they are looking at after scrolling
 * a few hundred rows.
 */
.ms-picker-group {
  position: relative;
}
.ms-picker-group-name {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 2px;
  color: var(--dsw-alias-label-caption, #98a2b3);
  font-size: 11px;
  font-weight: 600;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.1));
}
.ms-picker-group-balance {
  margin-left: 10px;
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary, #667085);
}
/*
 * The group's own probe control. It rides the sticky header so "ask this
 * vendor" is reachable wherever the user has scrolled to, and it doubles as
 * the vendor's status light: the dot mirrors the worst tone among the rows,
 * so a vendor whose models are all refused reads red without opening anyone's
 * tooltip.
 */
.ms-picker-group-title {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ms-picker-group-probe {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  margin-left: 8px;
  padding: 2px 5px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: 0 0;
  color: var(--dsw-alias-label-caption, #98a2b3);
  cursor: pointer;
}
.ms-picker-group-probe:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.16));
  color: var(--dsw-alias-label-secondary, #667085);
}
.ms-picker-group-probe:disabled {
  cursor: default;
  opacity: 0.75;
}
.ms-picker-group-probe-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.ms-picker-group-probe-dot.is-ok {
  color: var(--dsw-alias-state-success-primary, #12b76a);
}
.ms-picker-group-probe-dot.is-refused {
  color: var(--dsw-alias-state-error-primary, #f04438);
}
.ms-picker-group-probe-dot.is-unknown {
  color: var(--dsw-alias-label-caption, #98a2b3);
  opacity: 0.5;
}

/*
 * A row is now two sibling controls (choose / probe), not one: a button
 * inside a button is invalid, and the probe must not also switch the model.
 * The wrapper owns the hover and selection paint so the pair reads as one row.
 */
.ms-picker-row-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 8px;
}
.ms-picker-row-wrap:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.ms-picker-row-wrap.is-selected {
  background: var(--dsw-alias-interactive-bg-selected, rgba(77, 107, 254, 0.12));
}
.ms-picker-row-wrap.is-selected:hover {
  background: var(--dsw-alias-interactive-bg-selected, rgba(77, 107, 254, 0.12));
}
.ms-picker-row-probe {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 4px 6px;
  border: none;
  border-radius: 6px;
  background: 0 0;
  color: var(--dsw-alias-label-caption, #98a2b3);
  cursor: pointer;
  opacity: 0;
}
/*
 * The probe affordance stays invisible until the row is hovered or focused:
 * 57 rows each carrying a permanent button is a wall of glyphs, and the
 * feature's job is the verdict, not the control.
 */
.ms-picker-row-wrap:hover .ms-picker-row-probe,
.ms-picker-row-wrap:focus-within .ms-picker-row-probe,
.ms-picker-row-probe.is-probing {
  opacity: 1;
}
.ms-picker-row-probe:hover:not(:disabled) {
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.ms-picker-row-probe:disabled {
  cursor: default;
}
.ms-picker-probe-icon.is-spinning {
  animation: ms-picker-spin 700ms linear infinite;
}
@keyframes ms-picker-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
/*
 * Footer bar holding the cleanup switch, refresh and probe buttons, so the
 * picker is the single place where both the readings and the controls live.
 */
.ms-picker-footer {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.1));
  background: var(--dsw-alias-bg-layer-2, #ffffff);
}
.ms-picker-footer-btn {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.16));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #101828);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.ms-picker-footer-btn:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.28));
}
.ms-picker-footer-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.ms-picker-footer-btn.is-on {
  border-color: var(--dsw-alias-state-error-primary, #f04438);
  color: var(--dsw-alias-state-error-primary, #f04438);
}
.ms-picker-footer-btn.is-sweeping {
  border-color: var(--dsw-alias-state-warning-primary, #f79009);
  color: var(--dsw-alias-state-warning-primary, #f79009);
}
.ms-picker-retry {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: 0 0;
  color: inherit;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.ms-picker-efforts {
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.1));
  padding-top: 2px;
}
.ms-picker-effort-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 8px 6px;
}
.ms-picker-effort-chip {
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.16));
  border-radius: 999px;
  background: 0 0;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.ms-picker-effort-chip.is-selected {
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.ms-picker-effort-chip:disabled {
  opacity: 0.6;
  cursor: default;
}
`
