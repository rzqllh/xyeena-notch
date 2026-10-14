# Git Lifecycle Harness
Mode: TRIGGERED for repository mutation

Start:
status -> branch -> recent log -> divergence -> PR/CI if relevant.

Rules:
- no accidental work on protected main
- local commit per logical unit
- push per meaningful phase when deployment quota matters
- resolve conflicts by preserving both sides' intent, not blindly ours/theirs
- review conflict resolution before push
- avoid force push unless explicitly justified/authorized
- cleanup branches only after merge is confirmed
