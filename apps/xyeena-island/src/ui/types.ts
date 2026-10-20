/**
 * @file apps/xyeena-island/src/ui/types.ts
 * Core component lifecycle interface for Xyeena Island UI primitives.
 * Ref: docs/adr/0001-ui-component-model.md
 */

export interface ComponentInstance<P, E extends HTMLElement | SVGElement = HTMLElement> {
  /** The mounted root DOM element of the component instance */
  readonly element: E;
  /** Update component properties reactively */
  update(props: Partial<P>): void;
  /** Teardown event listeners, timers, and references */
  destroy(): void;
}
