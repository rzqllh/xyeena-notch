# Anti-Slop Harness
Mode: CORE

## Goal
Prevent AI-shaped complexity, generic output, and low-signal changes.

## Block
- speculative abstraction
- wrapper/component creation with no clear reuse or ownership benefit
- unrelated refactors
- duplicate helpers
- dependency additions for trivial utilities
- decorative UI with no hierarchy/interaction purpose
- generic "enterprise" structure without a demonstrated need
- meaningless comments that restate code
- tests that only mirror implementation
- generic AI copy, repeated rhetorical formulas, or ornamental prose

## Decision rule
A change must answer at least one:
1. Which requirement does it satisfy?
2. Which verified defect does it fix?
3. Which measured risk/cost does it reduce?

If none applies, leave it out.
