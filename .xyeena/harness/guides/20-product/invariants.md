# Domain Invariants Harness
Mode: TRIGGERED when a project has non-negotiable semantics

Invariants are statements that must remain true across refactors.

Before editing shared behavior:
1. Load relevant invariants.
2. Identify which could be affected.
3. Verify them after the change.

An invariant violation blocks completion even if tests/build pass.
