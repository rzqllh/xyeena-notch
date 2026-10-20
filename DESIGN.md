# Xyeena Notch — Design System & Visual Identity

> Direction source: existing implementation + user statements; review required.

---

## 1. Design Philosophy

Xyeena Notch is engineered as a **quiet Windows desktop instrument panel** rather than a mobile port or a flashy web application. It lives anchored at the top of the primary monitor work area (Notch layout), offering calm, glanceable utility without distracting developer focus.

### Core Principles:
1. **Dark-First & Low-Chroma:** Restrained surfaces (`#0b0e14`, `#131720`, `#1a202c`) with minimal contrast borders (`rgba(255, 255, 255, 0.08)`). No blinding vibrant saturations.
2. **Restrained Ice-Blue Accent:** Primary accent is calm ice-blue (`#89b8ca`), never high-saturation primary blue or neon.
3. **No Nested Cards:** Surfaces are strictly single-level. No cards nested inside cards, preventing visual box-in-box clutter.
4. **Xyn Visually Dominant:** Xyn (`<xyeena-guardian>`) serves as the emotional and focal anchor of the island, reacting directly to system and agent events.
5. **Calm Density:** Compact Windows spacing scale (`4px`, `8px`, `12px`, `16px`, `20px`) suited for dense developer tools without cramped touch targets.
6. **Bilingual Copy (ID + EN):** Default interface copy is clear, concise English with authentic Indonesian localization support.

---

## 2. Design Tokens & Semantic Roles

### A. Surfaces (Opaque Policy)
The island surface is **opaque by default** (`#0b0e14`) to prevent background desktop text bleed-through during active developer tasks.

| Token | Semantic Role | Value (Dark) | Value (Light) | Purpose |
|---|---|---|---|---|
| `--surface-0` | Window Base | `#0b0e14` | `#f4f6f8` | Primary notch window background. |
| `--surface-1` | Panel Base | `#131720` | `#ffffff` | Standard card/panel background. |
| `--surface-2` | Elevated Surface | `#1a202c` | `#eef1f5` | Floating dialogs, popovers, dropdowns. |
| `--surface-hover`| Interaction Hover | `rgba(255, 255, 255, 0.05)` | `rgba(0, 0, 0, 0.04)` | Subtle hover state. |
| `--surface-active`| Interaction Active | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.07)` | Pressed button or selected tab. |

*Surface Policy Note: Translucency/blur is strictly prohibited across panels; only one element (the inactive notch glance pill) may utilize subtle backdrop blur.*

### B. Typography & Text Hierarchy
Windows Variable System Typography:
- Font Family: `"Segoe UI Variable Text", "Segoe UI Variable Display", "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
- Monospace Family: `"Cascadia Code", "Consolas", ui-monospace, monospace`

| Token | Role | Value (Dark) | Value (Light) | WCAG Contrast vs `--surface-0` |
|---|---|---|---|---|
| `--text-1` | Primary Text | `#f0f3f6` | `#111827` | **15.2:1** (AAA) |
| `--text-2` | Secondary / Subtitle | `#9ca6b3` | `#4b5563` | **6.1:1** (AA) |
| `--text-3` | Muted / Kicker | `#808c9c` | `#6b7280` | **4.7:1** (AA for normal text) |

### C. Lines & Borders
Minimal low-contrast division lines:
| Token | Role | Value | Purpose |
|---|---|---|---|
| `--line` | Default Border | `rgba(255, 255, 255, 0.08)` | Flat card dividers and panel outlines. |
| `--line-strong` | Strong Divider | `rgba(255, 255, 255, 0.14)` | Active tabs, focused boundaries. |

### D. Accents & Feedback States
| Token | Role | Value (Dark) | Purpose |
|---|---|---|---|
| `--accent` | Ice-Blue Accent | `#89b8ca` | Primary buttons, active pill indicator, focus ring. |
| `--accent-hover` | Accent Hover | `#9ec9da` | Hovered primary button. |
| `--accent-subtle`| Accent Tint | `rgba(137, 184, 202, 0.12)` | Active tab pill background. |
| `--accent-text` | Accent Foreground | `#080e14` | High-contrast text on solid `--accent`. |
| `--state-ok` | Success State | `#7ec89f` | Completed jobs, healthy connectivity, allowed permissions. |
| `--state-warn` | Warning State | `#dfb351` | Approvals requested, stalled tools, rate limits. |
| `--state-danger`| Destructive State | `#e26d6d` | Denied approvals, process crashes, fatal errors. |
| `--focus-ring` | Focus Indicator | `0 0 0 2px var(--surface-0), 0 0 0 4px var(--accent)` | High-visibility accessible focus ring. |

### E. Spacing Scale
Strict 4px/8px modular rhythm:
- `--space-1`: `4px`
- `--space-2`: `8px`
- `--space-3`: `12px`
- `--space-4`: `16px`
- `--space-5`: `20px`

### F. Radii Scale (Max 4 Values)
- `--radius-sm`: `4px` (buttons, badges, inputs)
- `--radius-md`: `6px` (cards, dialogs)
- `--radius-lg`: `10px` (panel containers)
- `--radius-full`: `9999px` (capsule pills, status dots)

### G. Elevation (Max 3 Levels)
1. `--elevation-0`: None (flat border `1px solid var(--line)`). Default for all standard panels.
2. `--elevation-1`: `0 4px 16px rgba(0, 0, 0, 0.35)` (popovers, tooltips, flyout menus).
3. `--elevation-2`: `0 8px 32px rgba(0, 0, 0, 0.50)` (root notch window shadow against desktop background).

### H. Motion & Transitions
Aligned with `core/motion.mjs`:
- Fast Transition: `120ms cubic-bezier(0.16, 1, 0.3, 1)` (hover, button click)
- Normal Transition: `240ms cubic-bezier(0.16, 1, 0.3, 1)` (tab switch, collapse)
- Window Spring: Response `0.44s`, Damping `0.78`
- Window Close Curve: `340ms cubic-bezier(0.45, 0, 0.2, 1)`
- Reduced Motion: Immediate jump (`0ms`), transitions and transforms disabled.

---

## 3. Component Hierarchy & Rules
1. **Single Scroll Owner:** `.page` containers remain `overflow: hidden`. Every scrolling view must designate a single `ScrollArea` (`.activity-scroll-body`, `.clip-list`, etc.) with `overflow-y: auto; min-height: 0;`.
2. **No Inline `style="`:** Dynamic native geometry is restricted to `apply_frame`. Progress meters use CSS variables (`style="--progress: 45%"`).
3. **No Unsanctioned Glyphs or Emojis:** All iconography is served strictly through the Phosphor icon registry (`Icon({ name, size, label? })`).
4. **Accessible Inputs:** Every `IconButton` must define an accessible `aria-label` or visible text. Inputs must maintain associated `<label>` elements or `aria-label`.
