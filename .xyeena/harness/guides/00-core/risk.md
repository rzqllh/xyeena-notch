# Change Risk Harness
Mode: CORE

Classify before implementation.

LOW:
- isolated copy/style adjustment
- local component with no shared contract

MEDIUM:
- shared UI primitive
- navigation behavior
- client state
- cross-page layout

HIGH:
- authentication/authorization
- shared data contract
- core routing
- caching/runtime boundary
- persistence/schema migration
- infrastructure/config

CRITICAL:
- destructive production data
- irreversible remote action
- security-control removal

Verification depth grows with risk.
