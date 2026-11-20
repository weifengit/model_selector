/**
 * Model Selector — the platform modules the bundle expects.
 *
 * `react` and `react-dom` are *seeds*: the shell hands them to every client
 * bundle rather than letting each one ship its own copy (`build-client.mjs`
 * marks them external). The platform's own packages carry the types, but this
 * plugin is built standalone against the profile's `node_modules`, which has
 * no `@types/react-dom` — so the one function actually used is declared here
 * rather than pulling a whole package in for it.
 *
 * Declaring it locally is also the honest thing: the plugin depends on
 * `createPortal` existing, and stating that dependency in one place means a
 * missing one fails the type check instead of the page.
 */
declare module 'react-dom' {
  import type { ReactElement, ReactNode } from 'react'

  /**
   * Render a node into a different part of the document.
   *
   * @param children - what to render.
   * @param container - where to render it.
   * @returns the rendered node.
   */
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactElement
}
