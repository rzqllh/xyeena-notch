# UI Architecture & Component Audit — Phase 0

Comprehensive audit of user interface structure, styles, accessibility, and visual defects. Serves as direct technical specification for Phase 2 (UI Foundation & Primitives) and Phase 3 (Panels Rebuild).

---

## 1. Scroll Ownership Table (Refuting/Confirming L3)

| Container / Panel | Selector | CSS Overflow Rule | Scroll Owner? | DPI Stability (100 / 125 / 150%) | L3 Verdict & Finding |
|---|---|---|---|---|---|
| **Root Shell** | `#island` | `overflow: hidden;` (`style.css:114`) | No (Shell boundary) | Fixed viewport | OK |
| **Page Base** | `.page` | `overflow: hidden;` (`style.css:760`) | No | Clamps child elements | Base container |
| **Now Panel** | `#page-now` | `overflow-y: auto;` (`style.css:818`) | **YES** | Safe at 100–150% | Properly owns vertical scroll |
| **Clips Panel** | `#page-clips` | Inherits `.page` (`overflow: hidden`) | Partial | Clamped to max 80px list | Only `.clips-list` scrolls; footer can clip |
| **Agents Panel** | `#page-activity` | Inherits `.page` (`overflow: hidden`) | **NO** | **CLIPPED AT ALL SCALES** | **L3 CONFIRMED**: `#page-activity` has no scroll owner; multi-session card and event history overflow the 180px body height and are truncated |
| **Chat Panel** | `#page-chat` | Inherits `.page` (`overflow: hidden`) | Partial | Chat messages scroll | `#chat-thread` has `overflow-y: auto` (`style.css:1714`); header and input bar are static |
| **Settings Panel** | `#page-settings` | Inherits `.page` (`overflow: hidden`) | Partial | Scroll owner is sub-element | `.settings-content` has `overflow-y: auto` (`style.css:2060`) |

---

## 2. Icon Inventory

### Phosphor Registry (`src/core/icons.mjs`)
The registry provides 24 curated icons:
`folder`, `play`, `pause`, `prev`, `next`, `chevron`, `collapse`, `pin`, `sliders`, `refresh`, `music`, `volume`, `mute`, `search`, `logo`, `shield`, `bell`, `activity`, `clock`, `alert`, `copy`, `headset`, `send`, `check`.

### Unsanctioned Glyphs in `main.ts` (To Be Migrated in Phase 2)
| Glyph / Element | Type | File : Line | Meaning | Proposed Phosphor Replacement |
|---|---|---|---|---|
| `🖼️` | Emoji | `main.ts:2120` | Image generation toggle | Phosphor `image` or `sparkle` |
| `💬` | Emoji | `main.ts:1653` | Chat tab indicator | Phosphor `chat-circle-dots` |
| `🎨` | Emoji | `main.ts:273` | Wardrobe / theme indicator | Phosphor `palette` |
| `⚠️` | Emoji | `main.ts:2288` | Warning / cost notice | Phosphor `warning` (already registered as `alert`) |
| `×` | Text glyph | `main.ts:149, 260, 2075` | Close / delete buttons | Phosphor `x` |

---

## 3. Inline Style Inventory (`style="`)

**Total Occurrences in `main.ts`:** **109** lines.

### Classification:
1. **Dynamic Native Geometry (28 occurrences):**
   - Coordinates (`left`, `top`, `width`, `height`) dynamically set for native window positioning during frame animation.
   - *Resolution:* Retain only at native window boundary (`apply_frame`); eliminate from internal DOM wrappers.
2. **Progress & Meter Widths (14 occurrences):**
   - Media playback scrub bars, volume levels, token usage percentages (`style="width: ${pct}%"`).
   - *Resolution:* Replace with CSS custom property bindings (`style="--progress: ${pct}%"`).
3. **Static Layout & Spacing Overrides (45 occurrences):**
   - Ad-hoc flex margins, display toggles, padding adjustments (`style="margin-top: 8px; display: flex;"`).
   - *Resolution:* Eliminate and replace with semantic component classes and utility tokens.
4. **Color & Opacity Overrides (22 occurrences):**
   - Inline badge colors, pill highlights, opacity bleeding.
   - *Resolution:* Migrate to design system semantic tokens (`--surface-hover`, `--text-sub`).

---

## 4. Repeated Pattern Inventory (Component Candidates)

To eliminate copy-pasted HTML strings in `main.ts`, Phase 2 will introduce typed, accessible component primitives:

| Component Primitive | Variants | Current Occurrences in `main.ts` | Target Props / Interface |
|---|---|---|---|
| **Button** | `primary`, `secondary`, `icon-only`, `ghost`, `danger` | 42 call sites | `{ variant, size, icon, disabled, label, onClick }` |
| **Pill / Badge** | `session`, `status`, `counter`, `model-tag` | 26 call sites | `{ label, variant, icon, active, closable, onSelect }` |
| **Card / Surface** | `section`, `panel`, `bordered` (no nesting per N12) | 18 call sites | `{ variant, title, actions, children }` |
| **Field / Input** | `text`, `secret` (with show/hide), `select` | 15 call sites | `{ type, value, placeholder, label, error, onChange }` |
| **Toggle** | `switch`, `checkbox` | 9 call sites | `{ checked, label, description, onChange }` |
| **Toast** | `info`, `success`, `warning`, `error` | 6 call sites | `{ type, title, message, timeout }` |
| **EmptyState** | `sessions`, `clips`, `diff` | 4 call sites | `{ icon, title, description, action }` |

---

## 5. Design Token Inventory (`style.css`)

### Color System:
- Backgrounds: `--bg: rgba(18, 19, 22, 0.96);`, `--surface: rgba(28, 30, 36, 0.75);`, `--surface-hover: rgba(42, 45, 54, 0.85);`
- Text: `--text: #f0f2f5;`, `--sub: #9ba1b0;`, `--muted: #656c7d;`
- Accent / Status: `--accent: #e5a93c;` (Xyeena Gold), `--danger: #e05252;`, `--success: #4ec994;`
- Borders: `--border: rgba(255, 255, 255, 0.08);`, `--border-focus: rgba(229, 169, 60, 0.6);`

### Geometry & Motion:
- Radii: `--radius-sm: 4px;`, `--radius-md: 8px;`, `--radius-lg: 12px;`, `--radius-full: 9999px;`
- Shadows: One subtle elevation marker: `--shadow-island: 0 8px 32px rgba(0, 0, 0, 0.45);` (no decorative glow).
- Transitions: Monotonic spring timing curve `cubic-bezier(0.16, 1, 0.3, 1)`.

---

## 6. Accessibility (A11y) Smoke Inventory

1. **Missing Accessible Names:** Icon-only playback buttons (`#btn-prev`, `#btn-play`, `#btn-next`) and close buttons lack `aria-label` when Phosphor inline SVGs are rendered.
2. **Keyboard Focus Ring:** Focus outline is obscured or suppressed on custom buttons in `.clips-list`. Requires consistent `:focus-visible` styling (`outline: 2px solid var(--accent); outline-offset: 2px;`).
3. **Contrast Verification:**
   - Formula: $CR = \frac{L_1 + 0.05}{L_2 + 0.05}$
   - Normal text (`#f0f2f5` on `--bg` `#121316`): Luminance ratio **14.8:1** (Passes WCAG AAA).
   - Secondary text (`--sub` `#9ba1b0` on `--surface` `#1c1e24`): Luminance ratio **5.2:1** (Passes WCAG AA).
   - Muted text (`--muted` `#656c7d` on `--surface` `#1c1e24`): Luminance ratio **2.8:1** (Fails WCAG AA for normal text; must be adjusted to $\ge$ 4.5:1).

---

## 7. Observed Screen Defects & Redo Plan

From user review and captured screenshots:
1. **Compact Mode:**
   - *Defect:* Residual text flicker during rapid collapse transitions.
   - *Resolution:* Lock native geometry as sole timeline; suppress DOM redraws until frame locks.
2. **Glance Mode:**
   - *Defect:* Track title truncation cuts off artist label abruptly without ellipsis.
   - *Resolution:* Apply bounded flex sizing with `text-overflow: ellipsis`.
3. **Expanded Now Panel:**
   - *Defect:* Shuffle and Repeat buttons overlap timeline scrub bar on 125% DPI scale; Play button is disabled during coding sessions without explanation.
   - *Resolution:* Unify media controls into flex row; provide clear tooltip explaining lack of active GSMTC media session.
4. **Expanded Agents Panel:**
   - *Defect:* Multi-session card and event history are cut off at the bottom.
   - *Resolution:* Designate `.sessions-container` as explicit vertical scroll owner with `scrollbar-width: thin`.
5. **Expanded Chat Panel:**
   - *Defect:* Chat header is cluttered (provider selector, model picker, image toggle crammed together); surface opacity is too low, letting desktop text bleed through.
   - *Resolution:* Modularize header into clean hierarchy; increase base surface opacity to `0.96` to eliminate bleed-through.
6. **Expanded Settings Panel:**
   - *Defect:* Flat unsegmented list with scattered inputs.
   - *Resolution:* Restructure into clean modular tabs/sections (AI Providers, System, Flow, About) within the single-window shell per D3.
