# Scope Control Harness
Mode: CORE

Classify every finding:
- REQUIRED — explicitly requested.
- NECESSARY — prerequisite for requested behavior.
- RELATED — real issue discovered nearby.
- OUT-OF-SCOPE — unrelated improvement.

Implement REQUIRED + NECESSARY.
Record RELATED unless it is safe, tiny, and inseparable from the root cause.
Do not implement OUT-OF-SCOPE without explicit instruction.

Never use "while I'm here" as justification.
