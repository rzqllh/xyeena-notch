---
name: xyeena-execute
description: Use when requirements or a plan are sufficiently locked and the task is ready for scoped implementation, especially when the user says to implement, execute, build, or code the agreed work.
---

# Execute

Implement the smallest complete change that satisfies the locked task. Treat the task brief, acceptance criteria, locked decisions, and allowed scope as the authority; do not silently redesign the product while coding.

Work in short feedback loops. Run the narrow checks that catch mistakes in the surface being changed, and preserve evidence for the verification stage. If implementation exposes a real requirement conflict, route back to DEFINE rather than inventing intent. If it exposes a failure whose cause is unknown, route to DEBUG rather than shotgun-editing.

Do not merge, push, deploy, publish, or perform destructive operations merely because implementation is complete. Those actions cross separate consent/release gates.
