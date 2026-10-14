---
name: xyeena-debug
description: Use when investigating a bug, error, crash, regression, failing test, performance anomaly, or behavior that differs from expectation.
---

# Debug

Establish expected behavior and reproduce the actual symptom before changing code when practical. Minimize the failing case, form a small number of hypotheses, and instrument or inspect evidence that discriminates between them.

Do not shotgun-edit several plausible causes at once. Treat logs, screenshots and error messages as leads until the causal link is demonstrated.

After the root cause is supported, implement the smallest adequate fix. Verify against the original symptom and add regression protection when it captures behavior rather than implementation trivia. If the evidence invalidates the requirement or architecture assumption, route back to discovery instead of forcing a patch.
