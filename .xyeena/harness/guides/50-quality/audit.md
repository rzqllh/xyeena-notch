# Audit Harness
Mode: TRIGGERED for audits/reviews

Process:
inventory -> recover contracts -> inspect -> classify findings -> identify root causes -> rank by impact/risk -> separate scope -> fix approved items -> re-audit.

Finding classes:
- confirmed defect
- contract inconsistency
- risk
- maintainability debt
- subjective preference

Do not mutate code while still pretending to perform a neutral audit unless implementation was requested.
