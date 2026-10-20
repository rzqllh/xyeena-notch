# ADR 0001: UI Component Architecture & Primitives Model

- **Status:** Accepted
- **Date:** 2026-10-20
- **Author:** Xyeena Engineering
- **Deciders:** Hafizh Rizqullah, Xyeena Axazeela
- **Context:** Parity & UI Rebuild Pack v2, Phase 2 (UI Foundation & Primitives).

---

## 1. Context & Problem Statement

The initial desktop frontend implementation (`apps/xyeena-island/src/main.ts`) relied on a monolithic 3,840-line file that dynamically concatenated template string literals into `root.innerHTML` and attached global DOM listeners via `document.querySelector`.

This pattern resulted in several verified issues:
1. **Lack of Encapsulation & Typing:** Component instances could not be independently tested, typed, or reasoned about in isolation.
2. **Scroll Ownership Inconsistencies:** Because entire views were injected as monolithic HTML strings, child containers lacked dedicated scroll boundaries (e.g. L3 defect where `#page-activity` was clipped).
3. **A11y Gaps:** Icon buttons, badges, and status indicators lacked systematic accessible names, keyboard navigation contracts, and ARIA relationships.
4. **Injection Surface:** String interpolation inside `innerHTML` creates a potential DOM XSS vector if untrusted agent or network inputs ever bypass backend sanitization.

We must define a lightweight, high-performance component model that meets these constraints without introducing heavy external dependencies.

---

## 2. Decision Drivers

1. **Zero UI Framework Dependency (Constraint N8):** Adding React, Svelte, Vue, or Solid introduces extra runtime overhead, increases bundle size, and alters established project architecture.
2. **Token Cascading (Light DOM):** Components must inherit design system CSS custom properties seamlessly without Shadow DOM barrier overhead.
3. **Safe DOM Manipulation:** Elimination of `innerHTML` with interpolated untrusted data. Pure DOM APIs (`document.createElement`, `textContent`, `setAttribute`) and typed factory functions.
4. **Lifecycle & Teardown:** Every component must provide an explicit `{ element, update(props), destroy() }` lifecycle interface to prevent event listener and memory leaks.
5. **A11y Built-In:** Accessible names, roving tabindex, `aria-*` states, and `:focus-visible` must be verified at the primitive layer.

---

## 3. Evaluated Options

### Option A: External UI Framework (React / Svelte / Solid)
- **Trade-offs:** Introduces 40–120 KB of runtime bundle overhead, complex build tooling, and risks memory bloat in WebView2. Directly violates Master Contract N8.
- **Verdict:** **Rejected.**

### Option B: Autonomous Web Components (Custom Elements with Shadow DOM)
- **Trade-offs:** Shadow DOM encapsulates styles completely, preventing global design tokens (`var(--surface-0)`, `var(--text-1)`) from cascading without repeated CSS imports or `@property` workarounds. Higher memory footprint per element instance.
- **Verdict:** **Rejected.**

### Option C: Typed Vanilla Factory Functions (Light DOM) — **CHOSEN**
- **Architecture:** Pure TypeScript/JavaScript functions of the form:
  ```typescript
  export interface ComponentInstance<P> {
    element: HTMLElement;
    update(props: Partial<P>): void;
    destroy(): void;
  }

  export function createComponent<P>(props: P): ComponentInstance<P> {
    const element = document.createElement('...');
    // Setup initial DOM via typed APIs
    // Return update and destroy handlers
  }
  ```
- **Trade-offs:**
  - **Pros:** 0 bytes third-party runtime overhead; native DOM performance; full design token cascading; deterministic garbage collection via `destroy()`; 100% testable with Node's native test runner using standard DOM shims or happy-dom.
  - **Cons:** Requires explicit DOM construction rather than JSX syntactic sugar.

---

## 4. Architectural Invariants

1. **Light DOM Only:** Components mount directly into document flow or their parent container.
2. **No `innerHTML` with Dynamic Variables:** Dynamic text is assigned strictly via `textContent` or sanitized DOM node creation.
3. **Explicit Teardown:** Any component that binds window, document, or native Tauri listeners must remove them inside `destroy()`.
4. **Single Scroll Owner Contract:** No component except `ScrollArea` may declare `overflow-y: auto` or `overflow-y: scroll`.
5. **Mandatory Props & ARIA Validation:**
   - Every `IconButton` requires a mandatory `aria-label` or `label`.
   - Every `StatusDot` requires an accessible text label; status is never communicated via color alone.
   - `SecretField` clears input values from DOM memory after save; stored keys are never re-rendered.

---

## 5. Consequences

- **Positive:** UI components become modular, strictly typed, independently testable, and accessible by default.
- **Positive:** Zero added dependencies to `package.json`.
- **Negative:** Component templates require programmatic DOM element creation.
