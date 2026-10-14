---
name: xyeena-release
description: Use when implementation is verified and the user is preparing to merge, push, publish, deploy, release, or otherwise integrate the work.
---

# Release Gate

Re-run the verification appropriate to the tree being integrated. Inspect git/workspace state and unresolved findings. Prepare the concrete integration action and its consequences.

Push, merge, publish, deploy, production migration, destructive cleanup and comparable external actions remain human-owned unless explicitly authorized. Do not infer that "looks done" means "merge it".

If verification fails, keep the work recoverable and route back to diagnosis. Do not destroy branches/worktrees containing unique uncommitted data.
