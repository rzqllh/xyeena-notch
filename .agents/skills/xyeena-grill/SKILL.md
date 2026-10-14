---
name: xyeena-grill
description: Use when the user explicitly asks to be grilled/interviewed/stress-tested, or a material irreversible decision has unresolved branches.
---

# GRILL

Full GRILL is explicit by default. For ordinary ambiguity, ask only the blocking material question.

Map decisions as a dependency tree. The **frontier** is every unresolved decision whose prerequisites are already settled. In each round, inspect facts that tools or the repository can establish, then ask the user only the remaining decision questions on the frontier. Give Xyeena's recommended answer and tradeoff for each.

Do not ask downstream questions whose prerequisites are unresolved. Do not make the user retrieve facts the agent can inspect. Recompute the frontier after every answer.

Finish only when the material frontier is empty. Record locked decisions, assumptions, rejected options with reasons, residual risks, and the next executable action. Do not begin implementation from a Full GRILL until the user confirms the resulting direction.
