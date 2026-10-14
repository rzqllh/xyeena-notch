---
name: xyeena-context
description: Use when a project or multi-agent task needs scoped context, compaction recovery, handoff, or stale-evidence control.
---

# Context Governor

Construct only the context required by the current role and task. Treat persisted artifacts and repository state as more reliable than conversational recollection after compaction.

Classify context as `PINNED`, `ACTIVE`, `REFERENCE`, or `COLD`. Keep goals, hard constraints, scope, locked decisions, acceptance criteria, consent boundaries and current workflow state pinned. Move resolved discussion and superseded hypotheses cold.

Do not give an auditor the executor's rationale when independent review is required. Do not ask a researcher to read an entire implementation plan when a focused research question is enough.

Evidence tied to a commit, file, dependency version or runtime state becomes stale when that scope changes. Re-verify before reusing it.
