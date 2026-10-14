---
name: xyeena-orchestrate
description: Use when a task benefits from PM/controller orchestration, parallel independent specialists, executor/auditor separation, or multi-agent recovery.
---

# Orchestrate

Use a manager-controlled DAG, not an agent mesh. The governor owns topology, workflow state, task creation, joins, cancellation and consent. Workers may request another capability but do not spawn arbitrary worker networks.

Model work as immutable tasks with dependencies. Parallelize only ready independent tasks; serialize shared-write conflicts unless they are isolated in separate worktrees. Agent lifecycle and task lifecycle are separate: a worker can fail while the task returns to `READY` for reassignment.

Messages stay small and typed (`ASSIGN`, `QUESTION`, `RESULT`, `FINDING`, `CHALLENGE`, `RESPONSE`, `EVIDENCE`, `BLOCKED`, `FAILED`, `CANCEL`). Large results live as artifacts. Joins reconcile contradictions through evidence rather than concatenating reports or voting.

Independent auditors do not inherit executor rationale. Repeated review/fix loops trip a breaker and re-diagnose or escalate instead of recursing forever.
