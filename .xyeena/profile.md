# Project Profile Template

Keep this short and factual.

## Identity
- Project:
- Purpose:
- Repository type:
- Primary stack:
- Deployment provider:

## Protected branches
- `main`

## Domain invariants
Write only rules that must remain true across refactors.

## Shared surfaces
Map shared primitives to affected routes/screens when useful.

Example:

```text
PageShell
→ /
→ /search
→ /settings
```

## Critical paths
List directories/files that automatically increase verification risk.

## Public documentation constraints
List terminology or implementation details that must never appear publicly.

## Verification
Define project-native commands when universal auto-detection is insufficient.

## Deployment mode
Describe whether pushes create previews/production deployments and any budget constraints.

## Notes
Only durable project facts belong here.
