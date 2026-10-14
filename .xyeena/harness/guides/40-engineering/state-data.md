# State & Data Flow Harness
Mode: TRIGGERED for state/data changes

Classify state:
- server state
- URL/navigation state
- persistent client state
- transient UI state
- derived state

Trace data:
source -> fetch -> transform -> cache -> state -> render.

Look for duplicate source of truth, stale derived state, races, and unnecessary global state.
